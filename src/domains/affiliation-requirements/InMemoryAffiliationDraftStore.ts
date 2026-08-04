/**
 * In-memory {@link AffiliationDraftStore} for unit tests and local development.
 *
 * Mirrors the Pg store's semantics: idempotent initiation by subject, optimistic-concurrency
 * version checks, append-only change events, and evidence associations that never touch governed
 * state. Not tenant-isolated by RLS (there is no database) — every method filters by tenantId, so
 * cross-tenant reads/writes return not-found exactly like RLS would.
 */

import { uuidGenerator, type IdGenerator } from '../../shared/uuid/id.js';
import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { InMemoryRenewalLinkRegistry } from '../affiliation-standing/InMemoryRenewalApplicationLink.js';
import {
  STANDING_RENEWAL_APPLICATION_INITIATED_MESSAGE_TYPE,
  renewalApplicationInitiatedDedupeKey,
} from './PgAffiliationDraftStore.js';
import type {
  AddEvidenceLinkInput,
  AddEvidenceLinkResult,
  AffiliationDraftStore,
  BoundRequirementRow,
  DraftApplicationHead,
  DraftHead,
  DraftMutationResult,
  DraftSnapshot,
  InitiateApplicationInput,
  RemoveEvidenceLinkInput,
  RemoveEvidenceLinkResult,
  SaveDraftInput,
  StoredEvidenceLinkRow,
  StoredResponseRow,
} from './AffiliationDraftStore.js';

interface Record_ {
  head: DraftApplicationHead;
  draft: { version: number; lastSavedAt: string; lastSavingActor?: string };
  bindings: BoundRequirementRow[];
  responses: Map<string, Record<string, unknown>>;
  evidence: StoredEvidenceLinkRow[];
  changeEvents: Array<{ actor: string; eventType: string; detail: unknown; occurredAt: string }>;
}

export interface InMemoryAffiliationDraftStoreDeps {
  readonly generateId?: IdGenerator;
  readonly now?: () => Date;
  /**
   * Optional shared renewal-link registry. When provided, a `renewal`-pathway initiation attributes
   * the new application to its standing here (mirroring the Pg store's renewal_application_link),
   * and captures the audit event + outbox message it would enqueue.
   */
  readonly renewalLinks?: InMemoryRenewalLinkRegistry;
}

/** A captured governance side effect (audit / outbox) for in-memory renewal assertions. */
export interface CapturedRenewalAudit {
  readonly entityType: 'AffiliationStanding';
  readonly entityId: string;
  readonly action: 'renewal_application_initiated';
  readonly actor: string;
  readonly payload: Record<string, unknown>;
}

export interface CapturedRenewalOutbox {
  readonly messageType: string;
  readonly dedupeKey: string;
  readonly payload: Record<string, unknown>;
  readonly correlationId?: string;
  readonly causationId?: string;
}

export class InMemoryAffiliationDraftStore implements AffiliationDraftStore {
  private readonly records = new Map<string, Record_>();
  private readonly generateId: IdGenerator;
  private readonly now: () => Date;
  private readonly renewalLinks: InMemoryRenewalLinkRegistry | undefined;
  /** Captured renewal audit events (test-only observability). */
  readonly renewalAuditEvents: CapturedRenewalAudit[] = [];
  /** Captured renewal outbox messages (test-only observability). */
  readonly renewalOutboxMessages: CapturedRenewalOutbox[] = [];

  constructor(deps: InMemoryAffiliationDraftStoreDeps = {}) {
    this.generateId = deps.generateId ?? uuidGenerator;
    this.now = deps.now ?? (() => new Date());
    this.renewalLinks = deps.renewalLinks;
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private get(tenantId: string, applicationId: string): Record_ | undefined {
    const rec = this.records.get(applicationId);
    if (rec === undefined || rec.head.tenantId !== tenantId) return undefined;
    return rec;
  }

  async findApplicationBySubject(
    tenantId: string,
    organizationId: string,
    seasonId: string,
    pathway: string,
  ): Promise<DraftApplicationHead | undefined> {
    for (const rec of this.records.values()) {
      const h = rec.head;
      if (
        h.tenantId === tenantId &&
        h.organizationId === organizationId &&
        h.seasonId === seasonId &&
        h.pathway === pathway
      ) {
        return h;
      }
    }
    return undefined;
  }

  async initiateApplication(
    input: InitiateApplicationInput,
  ): Promise<{ head: DraftApplicationHead; created: boolean }> {
    // Store invariant (fails closed), mirroring the Pg store.
    if (input.pathway === 'renewal' && input.renewal === undefined) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'A renewal application requires a governed renewal context.',
      );
    }
    if (input.pathway !== 'renewal' && input.renewal !== undefined) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'A renewal context is only valid for the renewal pathway.',
      );
    }
    if (input.renewal !== undefined && input.renewal.targetSeasonId !== input.seasonId) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'The renewal target season must match the application season.',
      );
    }

    const existing = await this.findApplicationBySubject(
      input.tenantId,
      input.organizationId,
      input.seasonId,
      input.pathway,
    );
    if (existing !== undefined) return { head: existing, created: false };

    const applicationId = this.generateId.newId();
    const head: DraftApplicationHead = {
      applicationId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      seasonId: input.seasonId,
      pathway: input.pathway,
      applicantUserId: input.actor,
    };
    const nowIso = this.nowIso();
    this.records.set(applicationId, {
      head,
      draft: { version: 1, lastSavedAt: nowIso, lastSavingActor: input.actor },
      bindings: input.bindings.map((b) => ({ ...b })),
      responses: new Map(),
      evidence: [],
      changeEvents: [
        { actor: input.actor, eventType: 'application_initiated', detail: {}, occurredAt: nowIso },
      ],
    });

    if (input.renewal !== undefined) {
      this.attributeRenewal(applicationId, input.organizationId, input.actor, input.renewal, nowIso);
    }

    return { head, created: true };
  }

  private attributeRenewal(
    renewalApplicationId: string,
    organizationId: string,
    actor: string,
    renewal: NonNullable<InitiateApplicationInput['renewal']>,
    nowIso: string,
  ): void {
    const registry = this.renewalLinks;
    if (registry === undefined) return;
    const { created } = registry.insert({
      tenantId: this.recordTenant(renewalApplicationId),
      renewalApplicationId,
      standingId: renewal.standingId,
      sourceStandingVersion: renewal.sourceStandingVersion,
      sourceSeasonId: renewal.sourceSeasonId,
      targetSeasonId: renewal.targetSeasonId,
      initiatedBy: actor,
      idempotencyKey: renewal.idempotencyKey,
      initiatedAt: nowIso,
      ...(renewal.correlationId !== undefined ? { correlationId: renewal.correlationId } : {}),
      ...(renewal.causationId !== undefined ? { causationId: renewal.causationId } : {}),
    });
    if (!created) return;

    const payload = {
      standingId: renewal.standingId,
      renewalApplicationId,
      organizationId,
      sourceStandingVersion: renewal.sourceStandingVersion,
      sourceSeasonId: renewal.sourceSeasonId,
      targetSeasonId: renewal.targetSeasonId,
    };
    this.renewalAuditEvents.push({
      entityType: 'AffiliationStanding',
      entityId: renewal.standingId,
      action: 'renewal_application_initiated',
      actor,
      payload,
    });
    this.renewalOutboxMessages.push({
      messageType: STANDING_RENEWAL_APPLICATION_INITIATED_MESSAGE_TYPE,
      dedupeKey: renewalApplicationInitiatedDedupeKey(
        this.recordTenant(renewalApplicationId),
        renewal.standingId,
        renewal.targetSeasonId,
      ),
      payload,
      ...(renewal.correlationId !== undefined ? { correlationId: renewal.correlationId } : {}),
      ...(renewal.causationId !== undefined ? { causationId: renewal.causationId } : {}),
    });
  }

  private recordTenant(applicationId: string): string {
    return this.records.get(applicationId)?.head.tenantId ?? '';
  }

  async getSnapshot(tenantId: string, applicationId: string): Promise<DraftSnapshot | undefined> {
    const rec = this.get(tenantId, applicationId);
    if (rec === undefined) return undefined;
    const draft: DraftHead = {
      applicationId,
      version: rec.draft.version,
      lastSavedAt: rec.draft.lastSavedAt,
      ...(rec.draft.lastSavingActor !== undefined
        ? { lastSavingActor: rec.draft.lastSavingActor }
        : {}),
    };
    const responses: StoredResponseRow[] = [...rec.responses.entries()].map(
      ([requirementCode, value]) => ({ requirementCode, value }),
    );
    return {
      head: rec.head,
      draft,
      bindings: rec.bindings.map((b) => ({ ...b })),
      responses,
      evidence: rec.evidence.map((e) => ({ ...e })),
    };
  }

  async saveDraft(input: SaveDraftInput): Promise<DraftMutationResult> {
    const rec = this.get(input.tenantId, input.applicationId);
    if (rec === undefined) return { ok: false, reason: 'not_found' };
    if (rec.draft.version !== input.expectedVersion) {
      return { ok: false, reason: 'version_conflict', currentVersion: rec.draft.version };
    }
    const validCodes = new Set(rec.bindings.map((b) => b.requirementCode));
    for (const r of input.responses) {
      if (!validCodes.has(r.requirementCode)) continue; // ignore non-applicable codes
      rec.responses.set(r.requirementCode, { ...r.value });
    }
    const nowIso = this.nowIso();
    rec.draft.version += 1;
    rec.draft.lastSavedAt = nowIso;
    rec.draft.lastSavingActor = input.actor;
    rec.changeEvents.push({
      actor: input.actor,
      eventType: 'draft_saved',
      detail: { codes: input.responses.map((r) => r.requirementCode) },
      occurredAt: nowIso,
    });
    return { ok: true, newVersion: rec.draft.version, lastSavedAt: nowIso };
  }

  async addEvidenceLink(input: AddEvidenceLinkInput): Promise<AddEvidenceLinkResult> {
    const rec = this.get(input.tenantId, input.applicationId);
    if (rec === undefined) return { ok: false, reason: 'not_found' };
    const validCodes = new Set(rec.bindings.map((b) => b.requirementCode));
    if (!validCodes.has(input.requirementCode)) {
      return { ok: false, reason: 'unknown_requirement' };
    }
    const nowIso = this.nowIso();
    let link = rec.evidence.find(
      (e) =>
        e.requirementCode === input.requirementCode &&
        e.evidenceObjectId === input.evidenceObjectId,
    );
    if (link === undefined) {
      link = {
        linkId: this.generateId.newId(),
        requirementCode: input.requirementCode,
        evidenceObjectId: input.evidenceObjectId,
        contentHash: input.contentHash,
        contentType: input.contentType,
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        associatedAt: nowIso,
      };
      rec.evidence.push(link);
    }
    rec.draft.version += 1;
    rec.draft.lastSavedAt = nowIso;
    rec.draft.lastSavingActor = input.actor;
    rec.changeEvents.push({
      actor: input.actor,
      eventType: 'evidence_associated',
      detail: { requirementCode: input.requirementCode },
      occurredAt: nowIso,
    });
    return { ok: true, link, newVersion: rec.draft.version };
  }

  async removeEvidenceLink(input: RemoveEvidenceLinkInput): Promise<RemoveEvidenceLinkResult> {
    const rec = this.get(input.tenantId, input.applicationId);
    if (rec === undefined) return { ok: false, reason: 'not_found' };
    const idx = rec.evidence.findIndex((e) => e.linkId === input.linkId);
    if (idx === -1) return { ok: false, reason: 'not_found' };
    rec.evidence.splice(idx, 1);
    const nowIso = this.nowIso();
    rec.draft.version += 1;
    rec.draft.lastSavedAt = nowIso;
    rec.draft.lastSavingActor = input.actor;
    rec.changeEvents.push({
      actor: input.actor,
      eventType: 'evidence_unlinked',
      detail: { linkId: input.linkId },
      occurredAt: nowIso,
    });
    return { ok: true, newVersion: rec.draft.version };
  }
}
