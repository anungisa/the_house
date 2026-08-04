/**
 * In-memory renewal link registry + reader (TEST/COMPOSITION doubles).
 *
 * Mirrors the physical guarantees of `affiliation_standing.renewal_application_link` (migration
 * 0024) so unit and in-memory HTTP tests exercise the same attribution semantics the database
 * enforces: one link per renewal application, one link per (standing, target season), and
 * idempotent insertion per idempotency key. Writes are performed by the in-memory draft store; the
 * {@link InMemoryRenewalApplicationLinkReader} reads the SAME registry.
 */

import type {
  RenewalApplicationLink,
  RenewalApplicationLinkReader,
} from './RenewalApplicationLinkStore.js';

/** A full link row plus the tenant + idempotency/lineage bookkeeping the DB stores. */
export interface RenewalLinkRecord extends RenewalApplicationLink {
  readonly tenantId: string;
  readonly initiatedBy: string;
  readonly idempotencyKey: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

/** Input to insert a link (mirrors the columns written in the initiation transaction). */
export interface InsertRenewalLinkInput {
  readonly tenantId: string;
  readonly renewalApplicationId: string;
  readonly standingId: string;
  readonly sourceStandingVersion: number;
  readonly sourceSeasonId: string;
  readonly targetSeasonId: string;
  readonly initiatedBy: string;
  readonly idempotencyKey: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly initiatedAt?: string;
}

/**
 * Shared in-memory store for renewal links. Fail-closed uniqueness mirrors the DB constraints; a
 * conflicting insert (same standing+target, same renewal application, or same idempotency key)
 * returns `created: false` with the pre-existing row (idempotent), never a duplicate.
 */
export class InMemoryRenewalLinkRegistry {
  private readonly rows: RenewalLinkRecord[] = [];

  insert(input: InsertRenewalLinkInput): { record: RenewalLinkRecord; created: boolean } {
    const existing = this.rows.find(
      (r) =>
        r.tenantId === input.tenantId &&
        (r.idempotencyKey === input.idempotencyKey ||
          r.renewalApplicationId === input.renewalApplicationId ||
          (r.standingId === input.standingId && r.targetSeasonId === input.targetSeasonId)),
    );
    if (existing !== undefined) return { record: existing, created: false };

    const record: RenewalLinkRecord = {
      tenantId: input.tenantId,
      renewalApplicationId: input.renewalApplicationId,
      standingId: input.standingId,
      sourceStandingVersion: input.sourceStandingVersion,
      sourceSeasonId: input.sourceSeasonId,
      targetSeasonId: input.targetSeasonId,
      initiatedBy: input.initiatedBy,
      idempotencyKey: input.idempotencyKey,
      initiatedAt: input.initiatedAt ?? new Date().toISOString(),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
      ...(input.causationId !== undefined ? { causationId: input.causationId } : {}),
    };
    this.rows.push(record);
    return { record, created: true };
  }

  forStanding(tenantId: string, standingId: string): readonly RenewalLinkRecord[] {
    return this.rows
      .filter((r) => r.tenantId === tenantId && r.standingId === standingId)
      .slice()
      .sort((a, b) => (a.initiatedAt < b.initiatedAt ? 1 : a.initiatedAt > b.initiatedAt ? -1 : 0));
  }

  forStandingAndTarget(
    tenantId: string,
    standingId: string,
    targetSeasonId: string,
  ): RenewalLinkRecord | undefined {
    return this.rows.find(
      (r) =>
        r.tenantId === tenantId &&
        r.standingId === standingId &&
        r.targetSeasonId === targetSeasonId,
    );
  }

  forIdempotencyKey(tenantId: string, idempotencyKey: string): RenewalLinkRecord | undefined {
    return this.rows.find((r) => r.tenantId === tenantId && r.idempotencyKey === idempotencyKey);
  }
}

function project(record: RenewalLinkRecord): RenewalApplicationLink {
  return {
    renewalApplicationId: record.renewalApplicationId,
    standingId: record.standingId,
    sourceStandingVersion: record.sourceStandingVersion,
    sourceSeasonId: record.sourceSeasonId,
    targetSeasonId: record.targetSeasonId,
    initiatedAt: record.initiatedAt,
  };
}

/** In-memory {@link RenewalApplicationLinkReader} over a shared {@link InMemoryRenewalLinkRegistry}. */
export class InMemoryRenewalApplicationLinkReader implements RenewalApplicationLinkReader {
  constructor(private readonly registry: InMemoryRenewalLinkRegistry) {}

  findByStanding(
    tenantId: string,
    standingId: string,
  ): Promise<readonly RenewalApplicationLink[]> {
    return Promise.resolve(this.registry.forStanding(tenantId, standingId).map(project));
  }

  findByStandingAndTargetSeason(
    tenantId: string,
    standingId: string,
    targetSeasonId: string,
  ): Promise<RenewalApplicationLink | undefined> {
    const row = this.registry.forStandingAndTarget(tenantId, standingId, targetSeasonId);
    return Promise.resolve(row === undefined ? undefined : project(row));
  }

  findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<RenewalApplicationLink | undefined> {
    const row = this.registry.forIdempotencyKey(tenantId, idempotencyKey);
    return Promise.resolve(row === undefined ? undefined : project(row));
  }
}
