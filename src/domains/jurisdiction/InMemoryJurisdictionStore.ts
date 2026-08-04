/**
 * In-memory {@link JurisdictionStore} — deterministic test/demo double (NOT for production).
 *
 * It mirrors the Pg store's OUTCOME semantics (idempotent replay, code-uniqueness conflict,
 * one-active-primary conflict, version/state guards) so the service and resolver can be unit-tested
 * without a database. It also exposes `seedJurisdiction` / `seedAssignment` so resolver tests can
 * construct hierarchy + ambiguity scenarios directly (including the DB-forbidden "two active
 * assignments on one organization" case, to prove the resolver fails closed on ambiguity).
 */

import { randomUUID } from 'node:crypto';
import {
  jurisdictionDedupeKey,
  JURISDICTION_ASSIGNED_MESSAGE_TYPE,
  JURISDICTION_ASSIGNMENT_REPLACED_MESSAGE_TYPE,
  JURISDICTION_ASSIGNMENT_REVOKED_MESSAGE_TYPE,
  JURISDICTION_CREATED_MESSAGE_TYPE,
  JURISDICTION_PUBLISHED_MESSAGE_TYPE,
  JURISDICTION_RETIRED_MESSAGE_TYPE,
  JURISDICTION_REVISED_MESSAGE_TYPE,
  type AssignPrimaryJurisdictionCommand,
  type CreateJurisdictionDraftCommand,
  type CreateJurisdictionDraftOutcome,
  type JurisdictionAssignmentOutcome,
  type JurisdictionMutationOutcome,
  type JurisdictionStore,
  type PublishJurisdictionCommand,
  type ReplacePrimaryJurisdictionCommand,
  type RetireJurisdictionCommand,
  type RevokeJurisdictionAssignmentCommand,
  type ReviseJurisdictionDraftCommand,
} from './JurisdictionStore.js';
import type {
  JurisdictionAssignmentRecord,
  JurisdictionRecord,
  JurisdictionStatus,
} from './JurisdictionTypes.js';

export interface CapturedOutboxMessage {
  readonly tenantId: string;
  readonly messageType: string;
  readonly dedupeKey: string;
}

export class InMemoryJurisdictionStore implements JurisdictionStore {
  private readonly jurisdictions: JurisdictionRecord[] = [];
  private readonly assignments: JurisdictionAssignmentRecord[] = [];
  private readonly seenIdempotency = new Set<string>();
  readonly outbox: CapturedOutboxMessage[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Directly seed a catalog head (test setup). */
  seedJurisdiction(record: JurisdictionRecord): void {
    this.jurisdictions.push(record);
  }

  /** Directly seed an assignment head (test setup). */
  seedAssignment(record: JurisdictionAssignmentRecord): void {
    this.assignments.push(record);
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private idemSeen(tenantId: string, key: string): boolean {
    return this.seenIdempotency.has(`${tenantId}:${key}`);
  }

  private markIdem(tenantId: string, key: string): void {
    this.seenIdempotency.add(`${tenantId}:${key}`);
  }

  private capture(tenantId: string, messageType: string, idempotencyKey: string): void {
    this.outbox.push({
      tenantId,
      messageType,
      dedupeKey: jurisdictionDedupeKey(messageType, idempotencyKey),
    });
  }

  private findJurisdiction(tenantId: string, code: string): JurisdictionRecord | undefined {
    return this.jurisdictions.find((j) => j.tenantId === tenantId && j.code === code);
  }

  private replaceJurisdiction(next: JurisdictionRecord): void {
    const idx = this.jurisdictions.findIndex(
      (j) => j.tenantId === next.tenantId && j.id === next.id,
    );
    if (idx >= 0) this.jurisdictions[idx] = next;
  }

  private replaceAssignment(next: JurisdictionAssignmentRecord): void {
    const idx = this.assignments.findIndex((a) => a.tenantId === next.tenantId && a.id === next.id);
    if (idx >= 0) this.assignments[idx] = next;
  }

  private activePrimary(
    tenantId: string,
    organizationId: string,
  ): JurisdictionAssignmentRecord | undefined {
    return this.assignments.find(
      (a) =>
        a.tenantId === tenantId &&
        a.organizationId === organizationId &&
        a.status === 'active' &&
        a.assignmentType === 'primary',
    );
  }

  // ---- Catalog commands ----------------------------------------------------------------------

  async createDraft(command: CreateJurisdictionDraftCommand): Promise<CreateJurisdictionDraftOutcome> {
    if (this.idemSeen(command.tenantId, command.idempotencyKey)) {
      const existing = this.findJurisdiction(command.tenantId, command.code);
      if (existing !== undefined) return { outcome: 'replayed', record: existing };
    }
    const conflict = this.findJurisdiction(command.tenantId, command.code);
    if (conflict !== undefined) return { outcome: 'conflict', record: conflict };
    let parentJurisdictionId: string | undefined;
    if (command.parentJurisdictionCode !== undefined) {
      const parent = this.findJurisdiction(command.tenantId, command.parentJurisdictionCode);
      if (parent === undefined) return { outcome: 'parent_not_found' };
      parentJurisdictionId = parent.id;
    }
    const iso = this.nowIso();
    const record: JurisdictionRecord = {
      id: randomUUID(),
      tenantId: command.tenantId,
      code: command.code,
      level: command.level,
      labelEn: command.labelEn,
      labelFr: command.labelFr,
      status: 'draft',
      version: 1,
      createdAt: iso,
      updatedAt: iso,
      ...(parentJurisdictionId !== undefined ? { parentJurisdictionId } : {}),
      ...(command.countryCode !== undefined ? { countryCode: command.countryCode } : {}),
      ...(command.subdivisionCode !== undefined ? { subdivisionCode: command.subdivisionCode } : {}),
      ...(command.sourceReference !== undefined ? { sourceReference: command.sourceReference } : {}),
      idempotencyKey: command.idempotencyKey,
      ...(command.createdBy !== undefined ? { createdBy: command.createdBy } : {}),
      ...(command.createdBy !== undefined ? { updatedBy: command.createdBy } : {}),
    };
    this.jurisdictions.push(record);
    this.markIdem(command.tenantId, command.idempotencyKey);
    this.capture(command.tenantId, JURISDICTION_CREATED_MESSAGE_TYPE, command.idempotencyKey);
    return { outcome: 'created', record };
  }

  async reviseDraft(command: ReviseJurisdictionDraftCommand): Promise<JurisdictionMutationOutcome> {
    const head = this.findJurisdiction(command.tenantId, command.code);
    if (head === undefined) return { outcome: 'not_found' };
    if (this.idemSeen(command.tenantId, command.idempotencyKey)) {
      return { outcome: 'replayed', record: head };
    }
    if (command.expectedVersion !== undefined && head.version !== command.expectedVersion) {
      return { outcome: 'version_conflict', record: head };
    }
    if (head.status !== 'draft') return { outcome: 'invalid_state', record: head };
    let parentJurisdictionId = head.parentJurisdictionId;
    if (command.parentJurisdictionCode === null) {
      parentJurisdictionId = undefined;
    } else if (command.parentJurisdictionCode !== undefined) {
      const parent = this.findJurisdiction(command.tenantId, command.parentJurisdictionCode);
      if (parent === undefined) return { outcome: 'parent_not_found', record: head };
      parentJurisdictionId = parent.id;
    }
    const next: JurisdictionRecord = {
      ...head,
      ...(command.labelEn !== undefined ? { labelEn: command.labelEn } : {}),
      ...(command.labelFr !== undefined ? { labelFr: command.labelFr } : {}),
      ...(command.level !== undefined ? { level: command.level } : {}),
      ...(command.countryCode !== undefined ? { countryCode: command.countryCode } : {}),
      ...(command.subdivisionCode !== undefined ? { subdivisionCode: command.subdivisionCode } : {}),
      ...(parentJurisdictionId !== undefined
        ? { parentJurisdictionId }
        : { parentJurisdictionId: undefined }),
      ...(command.updatedBy !== undefined ? { updatedBy: command.updatedBy } : {}),
      version: head.version + 1,
      updatedAt: this.nowIso(),
    };
    this.replaceJurisdiction(next);
    this.markIdem(command.tenantId, command.idempotencyKey);
    this.capture(command.tenantId, JURISDICTION_REVISED_MESSAGE_TYPE, command.idempotencyKey);
    return { outcome: 'applied', record: next };
  }

  async publish(command: PublishJurisdictionCommand): Promise<JurisdictionMutationOutcome> {
    return this.transitionCatalog(
      command,
      ['draft'],
      'published',
      JURISDICTION_PUBLISHED_MESSAGE_TYPE,
    );
  }

  async retire(command: RetireJurisdictionCommand): Promise<JurisdictionMutationOutcome> {
    return this.transitionCatalog(
      command,
      ['draft', 'published'],
      'retired',
      JURISDICTION_RETIRED_MESSAGE_TYPE,
    );
  }

  private transitionCatalog(
    command: { tenantId: string; code: string; idempotencyKey: string; expectedVersion?: number },
    allowed: readonly JurisdictionStatus[],
    to: JurisdictionStatus,
    messageType: string,
  ): JurisdictionMutationOutcome {
    const head = this.findJurisdiction(command.tenantId, command.code);
    if (head === undefined) return { outcome: 'not_found' };
    if (this.idemSeen(command.tenantId, command.idempotencyKey)) {
      return { outcome: 'replayed', record: head };
    }
    if (command.expectedVersion !== undefined && head.version !== command.expectedVersion) {
      return { outcome: 'version_conflict', record: head };
    }
    if (!allowed.includes(head.status)) return { outcome: 'invalid_state', record: head };
    const next: JurisdictionRecord = {
      ...head,
      status: to,
      version: head.version + 1,
      updatedAt: this.nowIso(),
    };
    this.replaceJurisdiction(next);
    this.markIdem(command.tenantId, command.idempotencyKey);
    this.capture(command.tenantId, messageType, command.idempotencyKey);
    return { outcome: 'applied', record: next };
  }

  // ---- Assignment commands -------------------------------------------------------------------

  async assignPrimary(
    command: AssignPrimaryJurisdictionCommand,
  ): Promise<JurisdictionAssignmentOutcome> {
    if (this.idemSeen(command.tenantId, command.idempotencyKey)) {
      const existing = this.assignments.find(
        (a) => a.tenantId === command.tenantId && a.idempotencyKey === command.idempotencyKey,
      );
      if (existing !== undefined) return { outcome: 'replayed', record: existing };
    }
    const jurisdiction = this.findJurisdiction(command.tenantId, command.jurisdictionCode);
    if (jurisdiction === undefined || jurisdiction.status !== 'published') {
      return { outcome: 'jurisdiction_unavailable' };
    }
    const active = this.activePrimary(command.tenantId, command.organizationId);
    if (active !== undefined) return { outcome: 'conflict', record: active };
    const record = this.insertAssignment(command, jurisdiction.id);
    this.markIdem(command.tenantId, command.idempotencyKey);
    this.capture(command.tenantId, JURISDICTION_ASSIGNED_MESSAGE_TYPE, command.idempotencyKey);
    return { outcome: 'assigned', record };
  }

  async replacePrimary(
    command: ReplacePrimaryJurisdictionCommand,
  ): Promise<JurisdictionAssignmentOutcome> {
    if (this.idemSeen(command.tenantId, command.idempotencyKey)) {
      const existing = this.assignments.find(
        (a) => a.tenantId === command.tenantId && a.idempotencyKey === command.idempotencyKey,
      );
      if (existing !== undefined) return { outcome: 'replayed', record: existing };
    }
    const jurisdiction = this.findJurisdiction(command.tenantId, command.jurisdictionCode);
    if (jurisdiction === undefined || jurisdiction.status !== 'published') {
      return { outcome: 'jurisdiction_unavailable' };
    }
    const active = this.activePrimary(command.tenantId, command.organizationId);
    if (active === undefined) return { outcome: 'not_found' };
    if (command.expectedVersion !== undefined && active.version !== command.expectedVersion) {
      return { outcome: 'conflict', record: active };
    }
    this.revokeRecord(active, command.actedBy, command.reasonCode);
    const record = this.insertAssignment(command, jurisdiction.id);
    this.markIdem(command.tenantId, command.idempotencyKey);
    this.capture(
      command.tenantId,
      JURISDICTION_ASSIGNMENT_REPLACED_MESSAGE_TYPE,
      command.idempotencyKey,
    );
    return { outcome: 'replaced', record };
  }

  async revoke(
    command: RevokeJurisdictionAssignmentCommand,
  ): Promise<JurisdictionAssignmentOutcome> {
    const active = this.activePrimary(command.tenantId, command.organizationId);
    if (active === undefined) {
      if (this.idemSeen(command.tenantId, command.idempotencyKey)) {
        const existing = this.assignments.find(
          (a) => a.tenantId === command.tenantId && a.idempotencyKey === command.idempotencyKey,
        );
        if (existing !== undefined) return { outcome: 'replayed', record: existing };
      }
      return { outcome: 'not_found' };
    }
    if (this.idemSeen(command.tenantId, command.idempotencyKey)) {
      return { outcome: 'replayed', record: active };
    }
    if (command.expectedVersion !== undefined && active.version !== command.expectedVersion) {
      return { outcome: 'conflict', record: active };
    }
    const next = this.revokeRecord(active, command.actedBy, command.reasonCode);
    this.markIdem(command.tenantId, command.idempotencyKey);
    this.capture(
      command.tenantId,
      JURISDICTION_ASSIGNMENT_REVOKED_MESSAGE_TYPE,
      command.idempotencyKey,
    );
    return { outcome: 'revoked', record: next };
  }

  private insertAssignment(
    command: {
      tenantId: string;
      organizationId: string;
      inheritanceMode: JurisdictionAssignmentRecord['inheritanceMode'];
      validFrom?: string;
      validUntil?: string;
      sourceReference?: string;
      idempotencyKey: string;
      assignedBy?: string;
    },
    jurisdictionId: string,
  ): JurisdictionAssignmentRecord {
    const iso = this.nowIso();
    const record: JurisdictionAssignmentRecord = {
      id: randomUUID(),
      tenantId: command.tenantId,
      organizationId: command.organizationId,
      jurisdictionId,
      assignmentType: 'primary',
      inheritanceMode: command.inheritanceMode,
      status: 'active',
      validFrom: command.validFrom ?? iso,
      version: 1,
      assignedAt: iso,
      createdAt: iso,
      updatedAt: iso,
      ...(command.validUntil !== undefined ? { validUntil: command.validUntil } : {}),
      ...(command.sourceReference !== undefined ? { sourceReference: command.sourceReference } : {}),
      idempotencyKey: command.idempotencyKey,
      ...(command.assignedBy !== undefined ? { assignedBy: command.assignedBy } : {}),
    };
    this.assignments.push(record);
    return record;
  }

  private revokeRecord(
    active: JurisdictionAssignmentRecord,
    actedBy?: string,
    _reasonCode?: string,
  ): JurisdictionAssignmentRecord {
    const iso = this.nowIso();
    const next: JurisdictionAssignmentRecord = {
      ...active,
      status: 'revoked',
      version: active.version + 1,
      revokedAt: iso,
      updatedAt: iso,
      ...(actedBy !== undefined ? { revokedBy: actedBy } : {}),
    };
    this.replaceAssignment(next);
    return next;
  }

  // ---- Reads ---------------------------------------------------------------------------------

  async listPublishedForTenant(tenantId: string): Promise<readonly JurisdictionRecord[]> {
    return this.jurisdictions.filter((j) => j.tenantId === tenantId && j.status === 'published');
  }

  async getByCode(tenantId: string, code: string): Promise<JurisdictionRecord | undefined> {
    return this.findJurisdiction(tenantId, code);
  }

  async getJurisdictionById(tenantId: string, id: string): Promise<JurisdictionRecord | undefined> {
    return this.jurisdictions.find((j) => j.tenantId === tenantId && j.id === id);
  }

  async activeAssignmentsForOrganization(
    tenantId: string,
    organizationId: string,
  ): Promise<readonly JurisdictionAssignmentRecord[]> {
    return this.assignments.filter(
      (a) =>
        a.tenantId === tenantId && a.organizationId === organizationId && a.status === 'active',
    );
  }
}

