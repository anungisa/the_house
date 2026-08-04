/**
 * PostgreSQL {@link JurisdictionStore} (integration).
 *
 * Every governed jurisdiction command mutates the head (catalog row or assignment edge), appends
 * the append-only event (`organization_registry.jurisdiction_event` /
 * `organization_registry.organization_jurisdiction_event`), writes a `governance.audit_event`, and
 * enqueues a transactional outbox message — ALL inside ONE tenant-scoped transaction (they commit
 * together or not at all). Every table is under FORCE RLS keyed on `app.tenant_id`, set by
 * {@link withTenantTransaction} before any access; a non-superuser, non-BYPASSRLS runtime role is
 * therefore tenant isolated — a row owned by another tenant simply does not resolve, and the
 * tenant-consistent composite FKs make a cross-tenant reference structurally impossible.
 *
 * Per-command idempotency is enforced two ways: a fast in-transaction replay lookup on the event
 * table `(tenant, idempotency_key)`, and the `(tenant_id, idempotency_key)` partial unique indexes
 * as a concurrency backstop (a raced duplicate collapses to `replayed`). The one-active-primary
 * invariant is enforced by the `organization_jurisdiction_one_active_primary_idx` partial unique
 * index AND serialized per (tenant, organization) with a transaction-scoped advisory lock.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { selectForUpdate, withTenantTransaction, type QueryClient } from '../../db/pool.js';
import type { OutboxEnqueueInput } from '../../governance/outbox/OutboxStore.js';
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
  type JurisdictionCommandMeta,
  type JurisdictionMutationOutcome,
  type JurisdictionStore,
  type PublishJurisdictionCommand,
  type ReplacePrimaryJurisdictionCommand,
  type RetireJurisdictionCommand,
  type RevokeJurisdictionAssignmentCommand,
  type ReviseJurisdictionDraftCommand,
} from './JurisdictionStore.js';
import type {
  JurisdictionAssignmentEventType,
  JurisdictionAssignmentRecord,
  JurisdictionEventType,
  JurisdictionInheritanceMode,
  JurisdictionLevel,
  JurisdictionRecord,
  JurisdictionStatus,
} from './JurisdictionTypes.js';

/** Retry ceiling for jurisdiction outbox messages (parity with the other registries). */
export const JURISDICTION_OUTBOX_MAX_RETRIES = 10;

type JurisdictionRow = {
  id: string;
  tenant_id: string;
  code: string;
  jurisdiction_level: string;
  country_code: string | null;
  subdivision_code: string | null;
  label_en: string;
  label_fr: string;
  parent_jurisdiction_id: string | null;
  status: string;
  version: number;
  source_reference: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type AssignmentRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  jurisdiction_id: string;
  assignment_type: string;
  inheritance_mode: string;
  status: string;
  valid_from: string;
  valid_until: string | null;
  version: number;
  source_reference: string | null;
  idempotency_key: string | null;
  assigned_by: string | null;
  assigned_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

const JURISDICTION_SELECT = `
  id, tenant_id, code, jurisdiction_level, country_code, subdivision_code,
  label_en, label_fr, parent_jurisdiction_id, status, version,
  source_reference, idempotency_key, created_by, updated_by,
  created_at::text AS created_at, updated_at::text AS updated_at`;

const ASSIGNMENT_SELECT = `
  id, tenant_id, organization_id, jurisdiction_id, assignment_type, inheritance_mode, status,
  valid_from::text AS valid_from, valid_until::text AS valid_until, version,
  source_reference, idempotency_key, assigned_by,
  assigned_at::text AS assigned_at, revoked_by, revoked_at::text AS revoked_at,
  created_at::text AS created_at, updated_at::text AS updated_at`;

function toJurisdictionRecord(row: JurisdictionRow): JurisdictionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    level: row.jurisdiction_level as JurisdictionLevel,
    labelEn: row.label_en,
    labelFr: row.label_fr,
    status: row.status as JurisdictionStatus,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.parent_jurisdiction_id !== null
      ? { parentJurisdictionId: row.parent_jurisdiction_id }
      : {}),
    ...(row.country_code !== null ? { countryCode: row.country_code } : {}),
    ...(row.subdivision_code !== null ? { subdivisionCode: row.subdivision_code } : {}),
    ...(row.source_reference !== null ? { sourceReference: row.source_reference } : {}),
    ...(row.idempotency_key !== null ? { idempotencyKey: row.idempotency_key } : {}),
    ...(row.created_by !== null ? { createdBy: row.created_by } : {}),
    ...(row.updated_by !== null ? { updatedBy: row.updated_by } : {}),
  };
}

function toAssignmentRecord(row: AssignmentRow): JurisdictionAssignmentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    jurisdictionId: row.jurisdiction_id,
    assignmentType: 'primary',
    inheritanceMode: row.inheritance_mode as JurisdictionInheritanceMode,
    status: row.status as JurisdictionAssignmentRecord['status'],
    validFrom: row.valid_from,
    version: row.version,
    assignedAt: row.assigned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.valid_until !== null ? { validUntil: row.valid_until } : {}),
    ...(row.source_reference !== null ? { sourceReference: row.source_reference } : {}),
    ...(row.idempotency_key !== null ? { idempotencyKey: row.idempotency_key } : {}),
    ...(row.assigned_by !== null ? { assignedBy: row.assigned_by } : {}),
    ...(row.revoked_by !== null ? { revokedBy: row.revoked_by } : {}),
    ...(row.revoked_at !== null ? { revokedAt: row.revoked_at } : {}),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23503'
  );
}

async function enqueueOutbox(client: QueryClient, outbox: OutboxEnqueueInput): Promise<void> {
  await client.query(
    `INSERT INTO governance.outbox_message
       (tenant_id, message_type, payload, status, max_retries, dedupe_key, correlation_id, causation_id)
     VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)
     ON CONFLICT (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL
     DO UPDATE SET tenant_id = governance.outbox_message.tenant_id`,
    [
      outbox.tenantId,
      outbox.messageType,
      JSON.stringify(outbox.payload),
      outbox.maxRetries,
      outbox.dedupeKey,
      outbox.correlationId ?? null,
      outbox.causationId ?? null,
    ],
  );
}

async function appendAuditEvent(
  client: QueryClient,
  input: {
    tenantId: string;
    entityType: 'Jurisdiction' | 'OrganizationJurisdiction';
    entityId: string;
    action: string;
    fromState: string | null;
    toState: string;
    actorUserId?: string;
    correlationId?: string;
    causationId?: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO governance.audit_event
       (tenant_id, entity_type, entity_id, action, trigger, from_state, to_state,
        actor_user_id, correlation_id, causation_id, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      input.tenantId,
      input.entityType,
      input.entityId,
      input.action,
      input.action,
      input.fromState,
      input.toState,
      input.actorUserId ?? null,
      input.correlationId ?? null,
      input.causationId ?? null,
      JSON.stringify(input.payload),
    ],
  );
}

export class PgJurisdictionStore implements JurisdictionStore {
  constructor(private readonly pool?: pg.Pool) {}

  // ---- Reads ---------------------------------------------------------------------------------

  async listPublishedForTenant(tenantId: string): Promise<readonly JurisdictionRecord[]> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<JurisdictionRow>(
          `SELECT ${JURISDICTION_SELECT} FROM organization_registry.jurisdiction
             WHERE tenant_id = $1 AND status = 'published'
             ORDER BY jurisdiction_level, code`,
          [tenantId],
        );
        return rows.map(toJurisdictionRecord);
      },
      this.pool,
    );
  }

  async getByCode(tenantId: string, code: string): Promise<JurisdictionRecord | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const row = await this.selectHeadByCode(client, tenantId, code);
        return row === undefined ? undefined : toJurisdictionRecord(row);
      },
      this.pool,
    );
  }

  async getJurisdictionById(
    tenantId: string,
    id: string,
  ): Promise<JurisdictionRecord | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<JurisdictionRow>(
          `SELECT ${JURISDICTION_SELECT} FROM organization_registry.jurisdiction
             WHERE tenant_id = $1 AND id = $2`,
          [tenantId, id],
        );
        return rows.length === 0 ? undefined : toJurisdictionRecord(rows[0]!);
      },
      this.pool,
    );
  }

  async activeAssignmentsForOrganization(
    tenantId: string,
    organizationId: string,
  ): Promise<readonly JurisdictionAssignmentRecord[]> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<AssignmentRow>(
          `SELECT ${ASSIGNMENT_SELECT} FROM organization_registry.organization_jurisdiction
             WHERE tenant_id = $1 AND organization_id = $2 AND status = 'active'
             ORDER BY assigned_at DESC`,
          [tenantId, organizationId],
        );
        return rows.map(toAssignmentRecord);
      },
      this.pool,
    );
  }

  // ---- Catalog: create -----------------------------------------------------------------------

  async createDraft(
    command: CreateJurisdictionDraftCommand,
  ): Promise<CreateJurisdictionDraftOutcome> {
    const meta = command.meta ?? {};
    try {
      return await withTenantTransaction(
        command.tenantId,
        async (client) => {
          const replayed = await this.replayHeadByCode(client, command);
          if (replayed !== undefined) return { outcome: 'replayed', record: replayed };
          const existing = await this.selectHeadByCode(client, command.tenantId, command.code);
          if (existing !== undefined) {
            return { outcome: 'conflict', record: toJurisdictionRecord(existing) };
          }
          let parentId: string | null = null;
          if (command.parentJurisdictionCode !== undefined) {
            const parent = await this.selectHeadByCode(
              client,
              command.tenantId,
              command.parentJurisdictionCode,
            );
            if (parent === undefined) return { outcome: 'parent_not_found' };
            parentId = parent.id;
          }
          const rows = await client.query<JurisdictionRow>(
            `INSERT INTO organization_registry.jurisdiction
               (id, tenant_id, code, jurisdiction_level, country_code, subdivision_code,
                label_en, label_fr, parent_jurisdiction_id, status, version,
                source_reference, idempotency_key, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',1,$10,$11,$12,$12)
             RETURNING ${JURISDICTION_SELECT}`,
            [
              randomUUID(),
              command.tenantId,
              command.code,
              command.level,
              command.countryCode ?? null,
              command.subdivisionCode ?? null,
              command.labelEn,
              command.labelFr,
              parentId,
              command.sourceReference ?? null,
              command.idempotencyKey,
              command.createdBy ?? null,
            ],
          );
          const after = rows[0]!;
          await this.recordCatalogEvents(client, {
            command,
            meta,
            jurisdictionRowId: after.id,
            eventType: 'created',
            messageType: JURISDICTION_CREATED_MESSAGE_TYPE,
            fromState: null,
            toState: 'draft',
            payload: { code: after.code, status: 'draft' },
          });
          return { outcome: 'created', record: toJurisdictionRecord(after) };
        },
        this.pool,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        const head = await this.getByCode(command.tenantId, command.code);
        if (head !== undefined) {
          return head.idempotencyKey === command.idempotencyKey
            ? { outcome: 'replayed', record: head }
            : { outcome: 'conflict', record: head };
        }
      }
      throw error;
    }
  }

  // ---- Catalog: lifecycle --------------------------------------------------------------------

  async reviseDraft(command: ReviseJurisdictionDraftCommand): Promise<JurisdictionMutationOutcome> {
    return this.runCatalogTransition(command, {
      eventType: 'revised',
      messageType: JURISDICTION_REVISED_MESSAGE_TYPE,
      allowedStates: ['draft'],
      resolveParent: true,
      apply: async (client, before, meta, parentId) => {
        const rows = await client.query<JurisdictionRow>(
          `UPDATE organization_registry.jurisdiction SET
             label_en = COALESCE($3, label_en),
             label_fr = COALESCE($4, label_fr),
             jurisdiction_level = COALESCE($5, jurisdiction_level),
             country_code = COALESCE($6, country_code),
             subdivision_code = COALESCE($7, subdivision_code),
             parent_jurisdiction_id = $8,
             updated_by = $9, version = version + 1, updated_at = now()
           WHERE tenant_id = $1 AND id = $2
           RETURNING ${JURISDICTION_SELECT}`,
          [
            command.tenantId,
            before.id,
            command.labelEn ?? null,
            command.labelFr ?? null,
            command.level ?? null,
            command.countryCode ?? null,
            command.subdivisionCode ?? null,
            parentId,
            meta.actorUserId ?? command.updatedBy ?? null,
          ],
        );
        return rows[0]!;
      },
      payload: (_before, after) => ({ code: after.code, status: after.status }),
    });
  }

  async publish(command: PublishJurisdictionCommand): Promise<JurisdictionMutationOutcome> {
    return this.runCatalogTransition(command, {
      eventType: 'published',
      messageType: JURISDICTION_PUBLISHED_MESSAGE_TYPE,
      allowedStates: ['draft'],
      apply: async (client, before, meta) => {
        const rows = await client.query<JurisdictionRow>(
          `UPDATE organization_registry.jurisdiction SET
             status = 'published', updated_by = $3, version = version + 1, updated_at = now()
           WHERE tenant_id = $1 AND id = $2
           RETURNING ${JURISDICTION_SELECT}`,
          [command.tenantId, before.id, meta.actorUserId ?? command.publishedBy ?? null],
        );
        return rows[0]!;
      },
      payload: (_before, after) => ({ code: after.code, status: 'published' }),
    });
  }

  async retire(command: RetireJurisdictionCommand): Promise<JurisdictionMutationOutcome> {
    return this.runCatalogTransition(command, {
      eventType: 'retired',
      messageType: JURISDICTION_RETIRED_MESSAGE_TYPE,
      allowedStates: ['draft', 'published'],
      ...(command.reasonCode !== undefined ? { reasonCode: command.reasonCode } : {}),
      apply: async (client, before, meta) => {
        const rows = await client.query<JurisdictionRow>(
          `UPDATE organization_registry.jurisdiction SET
             status = 'retired', updated_by = $3, version = version + 1, updated_at = now()
           WHERE tenant_id = $1 AND id = $2
           RETURNING ${JURISDICTION_SELECT}`,
          [command.tenantId, before.id, meta.actorUserId ?? command.actedBy ?? null],
        );
        return rows[0]!;
      },
      payload: (_before, after) => ({
        code: after.code,
        status: 'retired',
        ...(command.reasonCode !== undefined ? { reasonCode: command.reasonCode } : {}),
      }),
    });
  }

  // ---- Assignment commands -------------------------------------------------------------------

  async assignPrimary(
    command: AssignPrimaryJurisdictionCommand,
  ): Promise<JurisdictionAssignmentOutcome> {
    const meta = command.meta ?? {};
    try {
      return await withTenantTransaction(
        command.tenantId,
        async (client) => {
          await this.lockOrganizationAssignment(client, command.tenantId, command.organizationId);
          const replayed = await this.replayAssignment(client, command);
          if (replayed !== undefined) return { outcome: 'replayed', record: replayed };

          const jurisdiction = await this.selectPublishedJurisdiction(
            client,
            command.tenantId,
            command.jurisdictionCode,
          );
          if (jurisdiction === undefined) return { outcome: 'jurisdiction_unavailable' };

          const active = await this.selectActivePrimary(
            client,
            command.tenantId,
            command.organizationId,
          );
          if (active !== undefined) {
            return { outcome: 'conflict', record: toAssignmentRecord(active) };
          }
          const inserted = await this.insertAssignment(client, command, jurisdiction.id);
          await this.recordAssignmentEvents(client, {
            command,
            meta,
            assignmentRowId: inserted.id,
            eventType: 'assigned',
            messageType: JURISDICTION_ASSIGNED_MESSAGE_TYPE,
            fromStatus: null,
            toStatus: 'active',
            payload: {
              organizationId: inserted.organization_id,
              jurisdictionCode: command.jurisdictionCode,
              inheritanceMode: inserted.inheritance_mode,
            },
          });
          return { outcome: 'assigned', record: toAssignmentRecord(inserted) };
        },
        this.pool,
      );
    } catch (error) {
      return this.recoverAssignmentInsert(command, error);
    }
  }

  async replacePrimary(
    command: ReplacePrimaryJurisdictionCommand,
  ): Promise<JurisdictionAssignmentOutcome> {
    const meta = command.meta ?? {};
    try {
      return await withTenantTransaction(
        command.tenantId,
        async (client) => {
          await this.lockOrganizationAssignment(client, command.tenantId, command.organizationId);
          const replayed = await this.replayAssignment(client, command);
          if (replayed !== undefined) return { outcome: 'replayed', record: replayed };

          const jurisdiction = await this.selectPublishedJurisdiction(
            client,
            command.tenantId,
            command.jurisdictionCode,
          );
          if (jurisdiction === undefined) return { outcome: 'jurisdiction_unavailable' };

          const active = await this.selectActivePrimaryForUpdate(
            client,
            command.tenantId,
            command.organizationId,
          );
          if (active === undefined) return { outcome: 'not_found' };
          if (command.expectedVersion !== undefined && active.version !== command.expectedVersion) {
            return { outcome: 'conflict', record: toAssignmentRecord(active) };
          }
          const revoked = await this.revokeAssignmentRow(client, command.tenantId, active.id, {
            actedBy: meta.actorUserId ?? command.actedBy,
          });
          await this.recordAssignmentEvents(client, {
            command: { tenantId: command.tenantId, idempotencyKey: `${command.idempotencyKey}:revoke` },
            meta,
            assignmentRowId: revoked.id,
            eventType: 'revoked',
            messageType: JURISDICTION_ASSIGNMENT_REVOKED_MESSAGE_TYPE,
            fromStatus: 'active',
            toStatus: 'revoked',
            ...(command.reasonCode !== undefined ? { reasonCode: command.reasonCode } : {}),
            payload: {
              organizationId: revoked.organization_id,
              replacedBy: command.jurisdictionCode,
            },
          });
          const inserted = await this.insertAssignment(client, command, jurisdiction.id);
          await this.recordAssignmentEvents(client, {
            command,
            meta,
            assignmentRowId: inserted.id,
            eventType: 'replaced',
            messageType: JURISDICTION_ASSIGNMENT_REPLACED_MESSAGE_TYPE,
            fromStatus: null,
            toStatus: 'active',
            payload: {
              organizationId: inserted.organization_id,
              jurisdictionCode: command.jurisdictionCode,
              inheritanceMode: inserted.inheritance_mode,
            },
          });
          return { outcome: 'replaced', record: toAssignmentRecord(inserted) };
        },
        this.pool,
      );
    } catch (error) {
      return this.recoverAssignmentInsert(command, error);
    }
  }

  async revoke(
    command: RevokeJurisdictionAssignmentCommand,
  ): Promise<JurisdictionAssignmentOutcome> {
    const meta = command.meta ?? {};
    return withTenantTransaction(
      command.tenantId,
      async (client) => {
        await this.lockOrganizationAssignment(client, command.tenantId, command.organizationId);
        const replayed = await this.replayAssignment(client, command);
        if (replayed !== undefined) return { outcome: 'replayed', record: replayed };

        const active = await this.selectActivePrimaryForUpdate(
          client,
          command.tenantId,
          command.organizationId,
        );
        if (active === undefined) return { outcome: 'not_found' };
        if (command.expectedVersion !== undefined && active.version !== command.expectedVersion) {
          return { outcome: 'conflict', record: toAssignmentRecord(active) };
        }
        const revoked = await this.revokeAssignmentRow(client, command.tenantId, active.id, {
          actedBy: meta.actorUserId ?? command.actedBy,
        });
        await this.recordAssignmentEvents(client, {
          command,
          meta,
          assignmentRowId: revoked.id,
          eventType: 'revoked',
          messageType: JURISDICTION_ASSIGNMENT_REVOKED_MESSAGE_TYPE,
          fromStatus: 'active',
          toStatus: 'revoked',
          ...(command.reasonCode !== undefined ? { reasonCode: command.reasonCode } : {}),
          payload: { organizationId: revoked.organization_id },
        });
        return { outcome: 'revoked', record: toAssignmentRecord(revoked) };
      },
      this.pool,
    );
  }

  // ---- Shared machinery ----------------------------------------------------------------------

  private async selectHeadByCode(
    client: QueryClient,
    tenantId: string,
    code: string,
  ): Promise<JurisdictionRow | undefined> {
    const rows = await client.query<JurisdictionRow>(
      `SELECT ${JURISDICTION_SELECT} FROM organization_registry.jurisdiction
         WHERE tenant_id = $1 AND code = $2`,
      [tenantId, code],
    );
    return rows[0];
  }

  private async selectPublishedJurisdiction(
    client: QueryClient,
    tenantId: string,
    code: string,
  ): Promise<JurisdictionRow | undefined> {
    const head = await this.selectHeadByCode(client, tenantId, code);
    return head !== undefined && head.status === 'published' ? head : undefined;
  }

  private async selectActivePrimary(
    client: QueryClient,
    tenantId: string,
    organizationId: string,
  ): Promise<AssignmentRow | undefined> {
    const rows = await client.query<AssignmentRow>(
      `SELECT ${ASSIGNMENT_SELECT} FROM organization_registry.organization_jurisdiction
         WHERE tenant_id = $1 AND organization_id = $2
           AND status = 'active' AND assignment_type = 'primary'`,
      [tenantId, organizationId],
    );
    return rows[0];
  }

  private async selectActivePrimaryForUpdate(
    client: QueryClient,
    tenantId: string,
    organizationId: string,
  ): Promise<AssignmentRow | undefined> {
    const rows = await selectForUpdate<AssignmentRow>(
      client,
      `SELECT ${ASSIGNMENT_SELECT} FROM organization_registry.organization_jurisdiction
         WHERE tenant_id = $1 AND organization_id = $2
           AND status = 'active' AND assignment_type = 'primary'`,
      [tenantId, organizationId],
    );
    return rows[0];
  }

  /** Serialize concurrent assignment commands per (tenant, organization). */
  private async lockOrganizationAssignment(
    client: QueryClient,
    tenantId: string,
    organizationId: string,
  ): Promise<void> {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [
      `${tenantId}:jurisdiction-assignment:${organizationId}`,
    ]);
  }

  private async insertAssignment(
    client: QueryClient,
    command: {
      tenantId: string;
      organizationId: string;
      jurisdictionCode: string;
      inheritanceMode: JurisdictionInheritanceMode;
      validFrom?: string;
      validUntil?: string;
      sourceReference?: string;
      idempotencyKey: string;
      assignedBy?: string;
      meta?: JurisdictionCommandMeta;
    },
    jurisdictionId: string,
  ): Promise<AssignmentRow> {
    const meta = command.meta ?? {};
    const rows = await client.query<AssignmentRow>(
      `INSERT INTO organization_registry.organization_jurisdiction
         (id, tenant_id, organization_id, jurisdiction_id, assignment_type, inheritance_mode,
          status, valid_from, valid_until, version, source_reference, idempotency_key, assigned_by)
       VALUES ($1,$2,$3,$4,'primary',$5,'active',
               COALESCE($6::timestamptz, now()),$7::timestamptz,1,$8,$9,$10)
       RETURNING ${ASSIGNMENT_SELECT}`,
      [
        randomUUID(),
        command.tenantId,
        command.organizationId,
        jurisdictionId,
        command.inheritanceMode,
        command.validFrom ?? null,
        command.validUntil ?? null,
        command.sourceReference ?? null,
        command.idempotencyKey,
        meta.actorUserId ?? command.assignedBy ?? null,
      ],
    );
    return rows[0]!;
  }

  private async revokeAssignmentRow(
    client: QueryClient,
    tenantId: string,
    assignmentId: string,
    opts: { actedBy?: string },
  ): Promise<AssignmentRow> {
    const rows = await client.query<AssignmentRow>(
      `UPDATE organization_registry.organization_jurisdiction SET
         status = 'revoked', revoked_by = $3, revoked_at = now(),
         version = version + 1, updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING ${ASSIGNMENT_SELECT}`,
      [tenantId, assignmentId, opts.actedBy ?? null],
    );
    return rows[0]!;
  }

  private async replayHeadByCode(
    client: QueryClient,
    command: { tenantId: string; code: string; idempotencyKey: string },
  ): Promise<JurisdictionRecord | undefined> {
    const seen = await client.query<{ id: string }>(
      `SELECT id FROM organization_registry.jurisdiction_event
         WHERE tenant_id = $1 AND idempotency_key = $2`,
      [command.tenantId, command.idempotencyKey],
    );
    if (seen.length === 0) return undefined;
    const head = await this.selectHeadByCode(client, command.tenantId, command.code);
    return head === undefined ? undefined : toJurisdictionRecord(head);
  }

  /** Fast assignment replay: an identical command key already committed → return its head row. */
  private async replayAssignment(
    client: QueryClient,
    command: { tenantId: string; idempotencyKey: string },
  ): Promise<JurisdictionAssignmentRecord | undefined> {
    const seen = await client.query<{ assignment_row_id: string }>(
      `SELECT assignment_row_id FROM organization_registry.organization_jurisdiction_event
         WHERE tenant_id = $1 AND idempotency_key = $2
         ORDER BY occurred_at DESC LIMIT 1`,
      [command.tenantId, command.idempotencyKey],
    );
    if (seen.length === 0) return undefined;
    const rows = await client.query<AssignmentRow>(
      `SELECT ${ASSIGNMENT_SELECT} FROM organization_registry.organization_jurisdiction
         WHERE tenant_id = $1 AND id = $2`,
      [command.tenantId, seen[0]!.assignment_row_id],
    );
    return rows.length === 0 ? undefined : toAssignmentRecord(rows[0]!);
  }

  private async recoverAssignmentInsert(
    command: { tenantId: string; organizationId: string; idempotencyKey: string },
    error: unknown,
  ): Promise<JurisdictionAssignmentOutcome> {
    if (isForeignKeyViolation(error)) {
      // A missing organization (or jurisdiction) — the composite FK fired. Fail closed.
      return { outcome: 'not_found' };
    }
    if (isUniqueViolation(error)) {
      // A raced identical command or a lost one-active-primary race collapses to a replay/conflict.
      const active = await this.activeAssignmentsForOrganization(
        command.tenantId,
        command.organizationId,
      );
      const replay = active.find((a) => a.idempotencyKey === command.idempotencyKey);
      if (replay !== undefined) return { outcome: 'replayed', record: replay };
      if (active.length > 0) return { outcome: 'conflict', record: active[0] };
    }
    throw error;
  }

  private async runCatalogTransition(
    command: {
      tenantId: string;
      code: string;
      idempotencyKey: string;
      expectedVersion?: number;
      parentJurisdictionCode?: string | null;
      meta?: JurisdictionCommandMeta;
    },
    spec: {
      eventType: JurisdictionEventType;
      messageType: string;
      allowedStates: readonly JurisdictionStatus[];
      reasonCode?: string;
      resolveParent?: boolean;
      apply(
        client: QueryClient,
        before: JurisdictionRow,
        meta: JurisdictionCommandMeta,
        parentId: string | null,
      ): Promise<JurisdictionRow>;
      payload(before: JurisdictionRow, after: JurisdictionRow): Record<string, unknown>;
    },
  ): Promise<JurisdictionMutationOutcome> {
    const meta = command.meta ?? {};
    try {
      return await withTenantTransaction(
        command.tenantId,
        async (client) => {
          const replayed = await this.replayHeadByCode(client, command);
          if (replayed !== undefined) return { outcome: 'replayed', record: replayed };

          const locked = await selectForUpdate<JurisdictionRow>(
            client,
            `SELECT ${JURISDICTION_SELECT} FROM organization_registry.jurisdiction
               WHERE tenant_id = $1 AND code = $2`,
            [command.tenantId, command.code],
          );
          if (locked.length === 0) return { outcome: 'not_found' };
          const before = locked[0]!;
          if (command.expectedVersion !== undefined && before.version !== command.expectedVersion) {
            return { outcome: 'version_conflict', record: toJurisdictionRecord(before) };
          }
          if (!spec.allowedStates.includes(before.status as JurisdictionStatus)) {
            return { outcome: 'invalid_state', record: toJurisdictionRecord(before) };
          }
          // Resolve a revise's parent code (null = clear, undefined = keep, string = set).
          let parentId: string | null = before.parent_jurisdiction_id;
          if (spec.resolveParent === true) {
            if (command.parentJurisdictionCode === null) {
              parentId = null;
            } else if (command.parentJurisdictionCode !== undefined) {
              const parent = await this.selectHeadByCode(
                client,
                command.tenantId,
                command.parentJurisdictionCode,
              );
              if (parent === undefined) {
                return { outcome: 'parent_not_found', record: toJurisdictionRecord(before) };
              }
              parentId = parent.id;
            }
          }
          const after = await spec.apply(client, before, meta, parentId);
          await this.recordCatalogEvents(client, {
            command,
            meta,
            jurisdictionRowId: before.id,
            eventType: spec.eventType,
            messageType: spec.messageType,
            fromState: before.status,
            toState: after.status,
            ...(spec.reasonCode !== undefined ? { reasonCode: spec.reasonCode } : {}),
            payload: spec.payload(before, after),
          });
          return { outcome: 'applied', record: toJurisdictionRecord(after) };
        },
        this.pool,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        const replayed = await this.getByCode(command.tenantId, command.code);
        if (replayed !== undefined) return { outcome: 'replayed', record: replayed };
      }
      throw error;
    }
  }

  private async recordCatalogEvents(
    client: QueryClient,
    input: {
      command: { tenantId: string; idempotencyKey: string };
      meta: JurisdictionCommandMeta;
      jurisdictionRowId: string;
      eventType: JurisdictionEventType;
      messageType: string;
      fromState: string | null;
      toState: string;
      reasonCode?: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    const { command, meta } = input;
    await client.query(
      `INSERT INTO organization_registry.jurisdiction_event
         (id, tenant_id, jurisdiction_row_id, event_type, from_state, to_state,
          actor_user_id, reason_code, correlation_id, causation_id, idempotency_key, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        randomUUID(),
        command.tenantId,
        input.jurisdictionRowId,
        input.eventType,
        input.fromState,
        input.toState,
        meta.actorUserId ?? null,
        input.reasonCode ?? null,
        meta.correlationId ?? null,
        meta.causationId ?? null,
        command.idempotencyKey,
        JSON.stringify(input.payload),
      ],
    );
    await appendAuditEvent(client, {
      tenantId: command.tenantId,
      entityType: 'Jurisdiction',
      entityId: input.jurisdictionRowId,
      action: input.eventType,
      fromState: input.fromState,
      toState: input.toState,
      ...(meta.actorUserId !== undefined ? { actorUserId: meta.actorUserId } : {}),
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
      ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
      payload: input.payload,
    });
    await enqueueOutbox(client, {
      tenantId: command.tenantId,
      messageType: input.messageType,
      payload: input.payload,
      dedupeKey: jurisdictionDedupeKey(input.messageType, command.idempotencyKey),
      maxRetries: JURISDICTION_OUTBOX_MAX_RETRIES,
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
      ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
    });
  }

  private async recordAssignmentEvents(
    client: QueryClient,
    input: {
      command: { tenantId: string; idempotencyKey: string };
      meta: JurisdictionCommandMeta;
      assignmentRowId: string;
      eventType: JurisdictionAssignmentEventType;
      messageType: string;
      fromStatus: string | null;
      toStatus: string;
      reasonCode?: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    const { command, meta } = input;
    await client.query(
      `INSERT INTO organization_registry.organization_jurisdiction_event
         (id, tenant_id, assignment_row_id, event_type, from_status, to_status,
          actor_user_id, reason_code, correlation_id, causation_id, idempotency_key, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        randomUUID(),
        command.tenantId,
        input.assignmentRowId,
        input.eventType,
        input.fromStatus,
        input.toStatus,
        meta.actorUserId ?? null,
        input.reasonCode ?? null,
        meta.correlationId ?? null,
        meta.causationId ?? null,
        command.idempotencyKey,
        JSON.stringify(input.payload),
      ],
    );
    await appendAuditEvent(client, {
      tenantId: command.tenantId,
      entityType: 'OrganizationJurisdiction',
      entityId: input.assignmentRowId,
      action: input.eventType,
      fromState: input.fromStatus,
      toState: input.toStatus,
      ...(meta.actorUserId !== undefined ? { actorUserId: meta.actorUserId } : {}),
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
      ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
      payload: input.payload,
    });
    await enqueueOutbox(client, {
      tenantId: command.tenantId,
      messageType: input.messageType,
      payload: input.payload,
      dedupeKey: jurisdictionDedupeKey(input.messageType, command.idempotencyKey),
      maxRetries: JURISDICTION_OUTBOX_MAX_RETRIES,
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
      ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
    });
  }
}
