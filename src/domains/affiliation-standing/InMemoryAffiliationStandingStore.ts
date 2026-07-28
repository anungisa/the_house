/**
 * In-memory {@link AffiliationStandingStore} — the hermetic backing for unit/domain tests and the
 * counterpart the {@link InMemoryAffiliationStandingEffect} writes into.
 *
 * It mirrors the affiliation_standing schema (migration 0014) closely enough to exercise the
 * governed flows without a database: a standing HEAD (current effective period + pathway +
 * monotonically increasing version) plus an append-only period history and an append-only lifecycle
 * event log. Reads are tenant-scoped and fail CLOSED (undefined) when the standing is missing,
 * matching the Pg store. Writes are used ONLY by the in-memory domain effect (the runtime path
 * never mutates through this class directly).
 *
 * Tenant isolation is modeled by keying every record on `tenantId` and filtering reads by it, so a
 * cross-tenant read returns nothing (mirroring RLS).
 */

import type {
  AffiliationStandingHead,
  AffiliationStandingStore,
} from './AffiliationStandingStore.js';

type StandingEventKind = 'renewal' | 'expiry' | 'suspension' | 'reinstatement' | 'termination';

interface StandingRecord {
  id: string;
  tenantId: string;
  affiliationApplicationId: string;
  subjectId: string;
  season: string;
  standingVersion: number;
  effectiveFrom: string;
  effectiveUntil: string;
  pathway: string;
  establishedBy: string;
}

interface PeriodRecord {
  tenantId: string;
  standingId: string;
  version: number;
  effectiveFrom: string;
  effectiveUntil: string;
  pathway: string;
  reason?: string;
  recordedBy: string;
}

interface EventRecord {
  tenantId: string;
  standingId: string;
  eventKind: StandingEventKind;
  reason?: string;
  recordedBy: string;
  seq: number;
}

/** A conflict raised when an append-only unique constraint would be violated (mirrors the DB). */
export class InMemoryStandingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InMemoryStandingConflictError';
  }
}

export class InMemoryAffiliationStandingStore implements AffiliationStandingStore {
  private readonly standings = new Map<string, StandingRecord>();
  private readonly periods: PeriodRecord[] = [];
  private readonly events: EventRecord[] = [];
  private seq = 0;

  // --- Read port (tenant-scoped, fail closed) --------------------------------------------

  getStanding(
    tenantId: string,
    standingId: string,
  ): Promise<AffiliationStandingHead | undefined> {
    const rec = this.standings.get(standingId);
    if (rec === undefined || rec.tenantId !== tenantId) return Promise.resolve(undefined);
    return Promise.resolve(this.toHead(rec));
  }

  // --- Write surface (used ONLY by the in-memory domain effect) ---------------------------

  insertStandingWithInitialPeriod(input: {
    readonly id: string;
    readonly tenantId: string;
    readonly affiliationApplicationId: string;
    readonly subjectId: string;
    readonly season: string;
    readonly pathway: string;
    readonly effectiveFrom: string;
    readonly effectiveUntil: string;
    readonly establishedBy: string;
  }): void {
    if (this.standings.has(input.id)) {
      throw new InMemoryStandingConflictError(`Standing already exists: ${input.id}`);
    }
    this.standings.set(input.id, {
      id: input.id,
      tenantId: input.tenantId,
      affiliationApplicationId: input.affiliationApplicationId,
      subjectId: input.subjectId,
      season: input.season,
      standingVersion: 1,
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil,
      pathway: input.pathway,
      establishedBy: input.establishedBy,
    });
    this.periods.push({
      tenantId: input.tenantId,
      standingId: input.id,
      version: 1,
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil,
      pathway: input.pathway,
      recordedBy: input.establishedBy,
    });
  }

  /** Append a new effective period (renewal): bump the head version + effective dates, add a row. */
  appendRenewalPeriod(input: {
    readonly tenantId: string;
    readonly standingId: string;
    readonly pathway: string;
    readonly effectiveFrom: string;
    readonly effectiveUntil: string;
    readonly reason?: string;
    readonly recordedBy: string;
  }): number {
    const rec = this.require(input.tenantId, input.standingId);
    const version = rec.standingVersion + 1;
    if (
      this.periods.some(
        (p) =>
          p.tenantId === input.tenantId &&
          p.standingId === input.standingId &&
          p.version === version,
      )
    ) {
      throw new InMemoryStandingConflictError(
        `Standing period already exists: ${input.standingId} v${version}`,
      );
    }
    this.periods.push({
      tenantId: input.tenantId,
      standingId: input.standingId,
      version,
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil,
      pathway: input.pathway,
      recordedBy: input.recordedBy,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
    rec.standingVersion = version;
    rec.effectiveFrom = input.effectiveFrom;
    rec.effectiveUntil = input.effectiveUntil;
    rec.pathway = input.pathway;
    return version;
  }

  /** Append an immutable lifecycle event (expiry / suspension / reinstatement / termination). */
  insertEvent(input: {
    readonly tenantId: string;
    readonly standingId: string;
    readonly eventKind: StandingEventKind;
    readonly reason?: string;
    readonly recordedBy: string;
  }): void {
    this.require(input.tenantId, input.standingId);
    this.events.push({
      tenantId: input.tenantId,
      standingId: input.standingId,
      eventKind: input.eventKind,
      recordedBy: input.recordedBy,
      seq: ++this.seq,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
  }

  // --- Test introspection helpers ---------------------------------------------------------

  /** Number of persisted effective periods for a standing (v1 + each renewal). */
  periodCount(tenantId: string, standingId: string): number {
    return this.periods.filter((p) => p.tenantId === tenantId && p.standingId === standingId).length;
  }

  /** Number of persisted lifecycle events of an optional kind for a standing. */
  eventCount(tenantId: string, standingId: string, kind?: StandingEventKind): number {
    return this.events.filter(
      (e) =>
        e.tenantId === tenantId &&
        e.standingId === standingId &&
        (kind === undefined || e.eventKind === kind),
    ).length;
  }

  // --- Internals --------------------------------------------------------------------------

  private require(tenantId: string, standingId: string): StandingRecord {
    const rec = this.standings.get(standingId);
    if (rec === undefined || rec.tenantId !== tenantId) {
      throw new InMemoryStandingConflictError(`Standing not found: ${standingId}`);
    }
    return rec;
  }

  private toHead(rec: StandingRecord): AffiliationStandingHead {
    return {
      id: rec.id,
      tenantId: rec.tenantId,
      affiliationApplicationId: rec.affiliationApplicationId,
      subjectId: rec.subjectId,
      season: rec.season,
      standingVersion: rec.standingVersion,
      effectiveFrom: rec.effectiveFrom,
      effectiveUntil: rec.effectiveUntil,
      pathway: rec.pathway,
      establishedBy: rec.establishedBy,
    };
  }
}
