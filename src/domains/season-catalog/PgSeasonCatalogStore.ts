/**
 * PostgreSQL {@link SeasonCatalogStore} (integration).
 *
 * Every governed season command mutates the season head, appends the append-only
 * `affiliation.season_event`, writes a `governance.audit_event`, and enqueues a transactional
 * outbox message in ONE tenant-scoped transaction (they commit together or not at all). Every table
 * is under FORCE RLS keyed on `app.tenant_id`, set by {@link withTenantTransaction} before any
 * season access; a non-superuser, non-BYPASSRLS runtime role is therefore tenant isolated — a
 * season owned by another tenant simply does not resolve.
 *
 * Per-command idempotency is enforced two ways: a fast in-transaction replay lookup on
 * `season_event (tenant, idempotency_key)`, and the `(tenant_id, idempotency_key)` partial unique
 * index as a concurrency backstop (a raced duplicate collapses to `replayed`).
 *
 * The single-current invariant is enforced by the `season_one_current_idx` partial unique index AND
 * serialized per tenant with a transaction-scoped advisory lock, so concurrent current-switches
 * converge deterministically instead of racing the index.
 *
 * A season's PHASE and whether it is ACCEPTING APPLICATIONS are NEVER stored — they are derived at
 * read time from the persisted window (see effectiveSeason.ts). This store only persists facts.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { selectForUpdate, withTenantTransaction, type QueryClient } from '../../db/pool.js';
import type { OutboxEnqueueInput } from '../../governance/outbox/OutboxStore.js';
import {
  SEASON_APPLICATIONS_CLOSED_MESSAGE_TYPE,
  SEASON_APPLICATIONS_OPENED_MESSAGE_TYPE,
  SEASON_CREATED_MESSAGE_TYPE,
  SEASON_MADE_CURRENT_MESSAGE_TYPE,
  SEASON_PUBLISHED_MESSAGE_TYPE,
  SEASON_RETIRED_MESSAGE_TYPE,
  SEASON_REVISED_MESSAGE_TYPE,
  seasonDedupeKey,
  type CreateSeasonDraftCommand,
  type CreateSeasonDraftOutcome,
  type CloseSeasonWindowCommand,
  type MakeSeasonCurrentCommand,
  type OpenSeasonWindowCommand,
  type PublishSeasonCommand,
  type RetireSeasonCommand,
  type ReviseSeasonDraftCommand,
  type SeasonCatalogStore,
  type SeasonCommandMeta,
  type SeasonMutationOutcome,
} from './SeasonCatalogStore.js';
import type { SeasonEventType, SeasonRecord, SeasonStatus } from './SeasonCatalogTypes.js';

/** Retry ceiling for season outbox messages (parity with the other registries). */
export const SEASON_OUTBOX_MAX_RETRIES = 10;

type SeasonRow = {
  id: string;
  tenant_id: string;
  season_id: string;
  is_current: boolean;
  status: string;
  version: number;
  label: string | null;
  label_en: string | null;
  label_fr: string | null;
  season_start_date: string | null;
  season_end_date: string | null;
  application_opens_at: string | null;
  application_closes_at: string | null;
  source_reference: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

// All temporal columns are cast to text so node-pg returns stable ISO strings (DATE columns would
// otherwise deserialize to a local-midnight JS Date and risk a timezone day-shift).
const SEASON_SELECT = `
  id, tenant_id, season_id, is_current, status, version,
  label, label_en, label_fr,
  season_start_date::text AS season_start_date,
  season_end_date::text AS season_end_date,
  application_opens_at::text AS application_opens_at,
  application_closes_at::text AS application_closes_at,
  source_reference, idempotency_key, created_by, updated_by,
  created_at::text AS created_at, updated_at::text AS updated_at`;

function toSeasonRecord(row: SeasonRow): SeasonRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    seasonId: row.season_id,
    isCurrent: row.is_current,
    status: row.status as SeasonStatus,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.label_en !== null ? { labelEn: row.label_en } : {}),
    ...(row.label_fr !== null ? { labelFr: row.label_fr } : {}),
    ...(row.label !== null ? { legacyLabel: row.label } : {}),
    ...(row.season_start_date !== null ? { seasonStartDate: row.season_start_date } : {}),
    ...(row.season_end_date !== null ? { seasonEndDate: row.season_end_date } : {}),
    ...(row.application_opens_at !== null ? { applicationOpensAt: row.application_opens_at } : {}),
    ...(row.application_closes_at !== null
      ? { applicationClosesAt: row.application_closes_at }
      : {}),
    ...(row.source_reference !== null ? { sourceReference: row.source_reference } : {}),
    ...(row.idempotency_key !== null ? { idempotencyKey: row.idempotency_key } : {}),
    ...(row.created_by !== null ? { createdBy: row.created_by } : {}),
    ...(row.updated_by !== null ? { updatedBy: row.updated_by } : {}),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

function constraintName(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    return (error as { constraint?: string }).constraint;
  }
  return undefined;
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

async function appendSeasonEvent(
  client: QueryClient,
  input: {
    tenantId: string;
    seasonRowId: string;
    eventType: SeasonEventType;
    fromState: string | null;
    toState: string;
    idempotencyKey: string;
    actorUserId?: string;
    reasonCode?: string;
    correlationId?: string;
    causationId?: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO affiliation.season_event
       (id, tenant_id, season_row_id, event_type, from_state, to_state,
        actor_user_id, reason_code, correlation_id, causation_id, idempotency_key, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      randomUUID(),
      input.tenantId,
      input.seasonRowId,
      input.eventType,
      input.fromState,
      input.toState,
      input.actorUserId ?? null,
      input.reasonCode ?? null,
      input.correlationId ?? null,
      input.causationId ?? null,
      input.idempotencyKey,
      JSON.stringify(input.payload),
    ],
  );
}

async function appendAuditEvent(
  client: QueryClient,
  input: {
    tenantId: string;
    seasonRowId: string;
    action: SeasonEventType;
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
     VALUES ($1,'Season',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      input.tenantId,
      input.seasonRowId,
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

/** Spec passed to the shared single-head transition runner. */
interface HeadTransitionSpec {
  readonly eventType: SeasonEventType;
  readonly messageType: string;
  readonly allowedStates: readonly SeasonStatus[];
  readonly reasonCode?: string;
  /** Apply the head UPDATE (also bumps version/updated_at) and return the new row. */
  apply(client: QueryClient, before: SeasonRow, meta: SeasonCommandMeta): Promise<SeasonRow>;
  payload(before: SeasonRow, after: SeasonRow): Record<string, unknown>;
}

export class PgSeasonCatalogStore implements SeasonCatalogStore {
  constructor(private readonly pool?: pg.Pool) {}

  // ---- Reads ---------------------------------------------------------------------------------

  async listPublishedForTenant(tenantId: string): Promise<readonly SeasonRecord[]> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<SeasonRow>(
          `SELECT ${SEASON_SELECT} FROM affiliation.season
             WHERE tenant_id = $1 AND status = 'published'
             ORDER BY season_start_date DESC NULLS LAST, season_id DESC`,
          [tenantId],
        );
        return rows.map(toSeasonRecord);
      },
      this.pool,
    );
  }

  async getBySeasonId(tenantId: string, seasonId: string): Promise<SeasonRecord | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const row = await this.selectHead(client, tenantId, seasonId);
        return row === undefined ? undefined : toSeasonRecord(row);
      },
      this.pool,
    );
  }

  async getById(tenantId: string, id: string): Promise<SeasonRecord | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<SeasonRow>(
          `SELECT ${SEASON_SELECT} FROM affiliation.season WHERE tenant_id = $1 AND id = $2`,
          [tenantId, id],
        );
        return rows.length === 0 ? undefined : toSeasonRecord(rows[0]!);
      },
      this.pool,
    );
  }

  // ---- Create --------------------------------------------------------------------------------

  async createDraft(command: CreateSeasonDraftCommand): Promise<CreateSeasonDraftOutcome> {
    const meta = command.meta ?? {};
    try {
      return await withTenantTransaction(
        command.tenantId,
        async (client) => {
          // Fast idempotent replay: an identical create key already committed.
          const replayed = await this.replayHead(client, command);
          if (replayed !== undefined) {
            return { outcome: 'replayed', record: replayed };
          }
          // Fail closed if the season key already exists (any status).
          const existing = await this.selectHead(client, command.tenantId, command.seasonId);
          if (existing !== undefined) {
            return { outcome: 'conflict', record: toSeasonRecord(existing) };
          }

          const rows = await client.query<SeasonRow>(
            `INSERT INTO affiliation.season
               (id, tenant_id, season_id, is_current, status, version,
                label_en, label_fr, season_start_date, season_end_date,
                application_opens_at, application_closes_at, source_reference,
                idempotency_key, created_by, updated_by)
             VALUES ($1,$2,$3,false,'draft',1,
                     $4,$5,$6::date,$7::date,$8::timestamptz,$9::timestamptz,$10,$11,$12,$12)
             RETURNING ${SEASON_SELECT}`,
            [
              randomUUID(),
              command.tenantId,
              command.seasonId,
              command.labelEn,
              command.labelFr,
              command.seasonStartDate ?? null,
              command.seasonEndDate ?? null,
              command.applicationOpensAt ?? null,
              command.applicationClosesAt ?? null,
              command.sourceReference ?? null,
              command.idempotencyKey,
              command.createdBy ?? null,
            ],
          );
          const after = rows[0]!;
          const payload = { seasonId: after.season_id, status: 'draft' };
          await this.recordEvents(client, {
            command,
            meta,
            seasonRowId: after.id,
            eventType: 'created',
            messageType: SEASON_CREATED_MESSAGE_TYPE,
            fromState: null,
            toState: 'draft',
            payload,
          });
          return { outcome: 'created', record: toSeasonRecord(after) };
        },
        this.pool,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.replayOutcomeForCreate(command);
        if (raced !== undefined) {
          return raced;
        }
      }
      throw error;
    }
  }

  // ---- Lifecycle transitions -----------------------------------------------------------------

  async reviseDraft(command: ReviseSeasonDraftCommand): Promise<SeasonMutationOutcome> {
    return this.runHeadTransition(command, {
      eventType: 'revised',
      messageType: SEASON_REVISED_MESSAGE_TYPE,
      allowedStates: ['draft'],
      apply: async (client, before, meta) => {
        const rows = await client.query<SeasonRow>(
          `UPDATE affiliation.season SET
             label_en = COALESCE($3, label_en),
             label_fr = COALESCE($4, label_fr),
             season_start_date = COALESCE($5::date, season_start_date),
             season_end_date = COALESCE($6::date, season_end_date),
             application_opens_at = COALESCE($7::timestamptz, application_opens_at),
             application_closes_at = COALESCE($8::timestamptz, application_closes_at),
             updated_by = $9, version = version + 1, updated_at = now()
           WHERE tenant_id = $1 AND id = $2
           RETURNING ${SEASON_SELECT}`,
          [
            command.tenantId,
            before.id,
            command.labelEn ?? null,
            command.labelFr ?? null,
            command.seasonStartDate ?? null,
            command.seasonEndDate ?? null,
            command.applicationOpensAt ?? null,
            command.applicationClosesAt ?? null,
            meta.actorUserId ?? command.updatedBy ?? null,
          ],
        );
        return rows[0]!;
      },
      payload: (_before, after) => ({ seasonId: after.season_id, status: after.status }),
    });
  }

  async publish(command: PublishSeasonCommand): Promise<SeasonMutationOutcome> {
    return this.runHeadTransition(command, {
      eventType: 'published',
      messageType: SEASON_PUBLISHED_MESSAGE_TYPE,
      allowedStates: ['draft'],
      apply: async (client, before, meta) => {
        const rows = await client.query<SeasonRow>(
          `UPDATE affiliation.season SET
             status = 'published', updated_by = $3, version = version + 1, updated_at = now()
           WHERE tenant_id = $1 AND id = $2
           RETURNING ${SEASON_SELECT}`,
          [command.tenantId, before.id, meta.actorUserId ?? command.publishedBy ?? null],
        );
        return rows[0]!;
      },
      payload: (_before, after) => ({ seasonId: after.season_id, status: 'published' }),
    });
  }

  async makeCurrent(command: MakeSeasonCurrentCommand): Promise<SeasonMutationOutcome> {
    return this.runHeadTransition(
      command,
      {
        eventType: 'made_current',
        messageType: SEASON_MADE_CURRENT_MESSAGE_TYPE,
        allowedStates: ['published'],
        apply: async (client, before, meta) => {
          // Demote the outgoing current season (if any, and not the target).
          const demoted = await client.query<{ season_id: string }>(
            `UPDATE affiliation.season SET
               is_current = false, version = version + 1, updated_at = now()
             WHERE tenant_id = $1 AND is_current = true AND id <> $2
             RETURNING season_id`,
            [command.tenantId, before.id],
          );
          const rows = await client.query<SeasonRow>(
            `UPDATE affiliation.season SET
               is_current = true, updated_by = $3, version = version + 1, updated_at = now()
             WHERE tenant_id = $1 AND id = $2
             RETURNING ${SEASON_SELECT}`,
            [command.tenantId, before.id, meta.actorUserId ?? command.actedBy ?? null],
          );
          const after = rows[0]!;
          (after as SeasonRow & { __demoted?: string }).__demoted = demoted[0]?.season_id;
          return after;
        },
        payload: (_before, after) => ({
          seasonId: after.season_id,
          isCurrent: true,
          ...((after as SeasonRow & { __demoted?: string }).__demoted !== undefined
            ? { previousCurrentSeasonId: (after as SeasonRow & { __demoted?: string }).__demoted }
            : {}),
        }),
      },
      // Serialize current-switches per tenant so concurrent switches converge deterministically.
      { serializeCurrentSwitch: true },
    );
  }

  async openWindow(command: OpenSeasonWindowCommand): Promise<SeasonMutationOutcome> {
    return this.runHeadTransition(command, {
      eventType: 'applications_opened',
      messageType: SEASON_APPLICATIONS_OPENED_MESSAGE_TYPE,
      allowedStates: ['published'],
      apply: async (client, before, meta) => {
        const rows = await client.query<SeasonRow>(
          `UPDATE affiliation.season SET
             application_opens_at = COALESCE($3::timestamptz, now()),
             application_closes_at = $4::timestamptz,
             updated_by = $5, version = version + 1, updated_at = now()
           WHERE tenant_id = $1 AND id = $2
           RETURNING ${SEASON_SELECT}`,
          [
            command.tenantId,
            before.id,
            command.applicationOpensAt ?? null,
            command.applicationClosesAt ?? null,
            meta.actorUserId ?? command.actedBy ?? null,
          ],
        );
        return rows[0]!;
      },
      payload: (_before, after) => ({
        seasonId: after.season_id,
        applicationOpensAt: after.application_opens_at,
        applicationClosesAt: after.application_closes_at,
      }),
    });
  }

  async closeWindow(command: CloseSeasonWindowCommand): Promise<SeasonMutationOutcome> {
    return this.runHeadTransition(command, {
      eventType: 'applications_closed',
      messageType: SEASON_APPLICATIONS_CLOSED_MESSAGE_TYPE,
      allowedStates: ['published'],
      apply: async (client, before, meta) => {
        const rows = await client.query<SeasonRow>(
          `UPDATE affiliation.season SET
             application_closes_at = COALESCE($3::timestamptz, now()),
             updated_by = $4, version = version + 1, updated_at = now()
           WHERE tenant_id = $1 AND id = $2
           RETURNING ${SEASON_SELECT}`,
          [
            command.tenantId,
            before.id,
            command.applicationClosesAt ?? null,
            meta.actorUserId ?? command.actedBy ?? null,
          ],
        );
        return rows[0]!;
      },
      payload: (_before, after) => ({
        seasonId: after.season_id,
        applicationClosesAt: after.application_closes_at,
      }),
    });
  }

  async retire(command: RetireSeasonCommand): Promise<SeasonMutationOutcome> {
    return this.runHeadTransition(command, {
      eventType: 'retired',
      messageType: SEASON_RETIRED_MESSAGE_TYPE,
      allowedStates: ['draft', 'published'],
      ...(command.reasonCode !== undefined ? { reasonCode: command.reasonCode } : {}),
      apply: async (client, before, meta) => {
        const rows = await client.query<SeasonRow>(
          `UPDATE affiliation.season SET
             status = 'retired', is_current = false,
             updated_by = $3, version = version + 1, updated_at = now()
           WHERE tenant_id = $1 AND id = $2
           RETURNING ${SEASON_SELECT}`,
          [command.tenantId, before.id, meta.actorUserId ?? command.actedBy ?? null],
        );
        return rows[0]!;
      },
      payload: (_before, after) => ({
        seasonId: after.season_id,
        status: 'retired',
        ...(command.reasonCode !== undefined ? { reasonCode: command.reasonCode } : {}),
      }),
    });
  }

  // ---- Shared machinery ----------------------------------------------------------------------

  private async selectHead(
    client: QueryClient,
    tenantId: string,
    seasonId: string,
  ): Promise<SeasonRow | undefined> {
    const rows = await client.query<SeasonRow>(
      `SELECT ${SEASON_SELECT} FROM affiliation.season WHERE tenant_id = $1 AND season_id = $2`,
      [tenantId, seasonId],
    );
    return rows[0];
  }

  /** Fast replay: if this command's idempotency key already committed, return the current head. */
  private async replayHead(
    client: QueryClient,
    command: { tenantId: string; seasonId: string; idempotencyKey: string },
  ): Promise<SeasonRecord | undefined> {
    const seen = await client.query<{ id: string }>(
      `SELECT id FROM affiliation.season_event WHERE tenant_id = $1 AND idempotency_key = $2`,
      [command.tenantId, command.idempotencyKey],
    );
    if (seen.length === 0) {
      return undefined;
    }
    const head = await this.selectHead(client, command.tenantId, command.seasonId);
    return head === undefined ? undefined : toSeasonRecord(head);
  }

  private async recordEvents(
    client: QueryClient,
    input: {
      command: { tenantId: string; idempotencyKey: string };
      meta: SeasonCommandMeta;
      seasonRowId: string;
      eventType: SeasonEventType;
      messageType: string;
      fromState: string | null;
      toState: string;
      reasonCode?: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    const { command, meta } = input;
    await appendSeasonEvent(client, {
      tenantId: command.tenantId,
      seasonRowId: input.seasonRowId,
      eventType: input.eventType,
      fromState: input.fromState,
      toState: input.toState,
      idempotencyKey: command.idempotencyKey,
      ...(meta.actorUserId !== undefined ? { actorUserId: meta.actorUserId } : {}),
      ...(input.reasonCode !== undefined ? { reasonCode: input.reasonCode } : {}),
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
      ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
      payload: input.payload,
    });
    await appendAuditEvent(client, {
      tenantId: command.tenantId,
      seasonRowId: input.seasonRowId,
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
      dedupeKey: seasonDedupeKey(input.messageType, command.idempotencyKey),
      maxRetries: SEASON_OUTBOX_MAX_RETRIES,
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
      ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
    });
  }

  private async runHeadTransition(
    command: {
      tenantId: string;
      seasonId: string;
      idempotencyKey: string;
      expectedVersion?: number;
      meta?: SeasonCommandMeta;
    },
    spec: HeadTransitionSpec,
    options: { serializeCurrentSwitch?: boolean } = {},
  ): Promise<SeasonMutationOutcome> {
    const meta = command.meta ?? {};
    try {
      return await withTenantTransaction(
        command.tenantId,
        async (client) => {
          if (options.serializeCurrentSwitch === true) {
            await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [
              `${command.tenantId}:season-current`,
            ]);
          }
          // Fast idempotent replay.
          const replayed = await this.replayHead(client, command);
          if (replayed !== undefined) {
            return { outcome: 'replayed', record: replayed };
          }
          // Lock the head (tenant-scoped). Cross-tenant / unknown -> not found.
          const locked = await selectForUpdate<SeasonRow>(
            client,
            `SELECT ${SEASON_SELECT} FROM affiliation.season WHERE tenant_id = $1 AND season_id = $2`,
            [command.tenantId, command.seasonId],
          );
          if (locked.length === 0) {
            return { outcome: 'not_found' };
          }
          const before = locked[0]!;
          if (command.expectedVersion !== undefined && before.version !== command.expectedVersion) {
            return { outcome: 'version_conflict', record: toSeasonRecord(before) };
          }
          if (!spec.allowedStates.includes(before.status as SeasonStatus)) {
            return { outcome: 'invalid_state', record: toSeasonRecord(before) };
          }
          const after = await spec.apply(client, before, meta);
          const payload = spec.payload(before, after);
          await this.recordEvents(client, {
            command,
            meta,
            seasonRowId: before.id,
            eventType: spec.eventType,
            messageType: spec.messageType,
            fromState: before.status,
            toState: after.status,
            ...(spec.reasonCode !== undefined ? { reasonCode: spec.reasonCode } : {}),
            payload,
          });
          return { outcome: 'applied', record: toSeasonRecord(after) };
        },
        this.pool,
      );
    } catch (error) {
      // Concurrency backstop: a raced identical command collapses to an idempotent replay.
      if (isUniqueViolation(error) && constraintName(error) !== 'season_one_current_idx') {
        const replayed = await this.getBySeasonId(command.tenantId, command.seasonId);
        if (replayed !== undefined) {
          return { outcome: 'replayed', record: replayed };
        }
      }
      throw error;
    }
  }

  /** Post-unique-violation replay resolution for createDraft. */
  private async replayOutcomeForCreate(
    command: CreateSeasonDraftCommand,
  ): Promise<CreateSeasonDraftOutcome | undefined> {
    const head = await this.getBySeasonId(command.tenantId, command.seasonId);
    if (head === undefined) {
      return undefined;
    }
    // A racing create of the SAME key (same idempotency) is a replay; a different key colliding on
    // the season key is a conflict.
    return head.idempotencyKey === command.idempotencyKey
      ? { outcome: 'replayed', record: head }
      : { outcome: 'conflict', record: head };
  }
}
