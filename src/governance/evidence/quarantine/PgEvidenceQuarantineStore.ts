/**
 * PostgreSQL {@link EvidenceQuarantineStore} (integration).
 *
 * Writes the quarantine event row AND its outbox message row in the SAME tenant-scoped
 * transaction (transactional outbox: the security event and the message that announces it
 * commit together, or not at all). Both tables are under FORCE RLS keyed on
 * governance.current_tenant_id(); the transaction sets `app.tenant_id` first so a
 * non-superuser, non-BYPASSRLS role is tenant-isolated. NEVER stores raw payload bytes.
 *
 * The operator review surface (list/detail/disposition) runs under the same RLS-scoped
 * transactions. A disposition locks the event row FOR UPDATE, validates the transition, advances
 * the status, and enqueues the disposition outbox event atomically. It never stores bytes,
 * never creates governed evidence, and never touches governance.entity_state.
 *
 * `pool` is injectable so a dedicated connection can be wired; the default uses the shared
 * pool (DATABASE_URL).
 */

import type pg from 'pg';
import { withTenantTransaction } from '../../../db/pool.js';
import type { OutboxEnqueueInput } from '../../outbox/OutboxStore.js';
import {
  buildQuarantineDispositionOutbox,
  type EvidenceQuarantineStore,
  type RecordQuarantineDispositionOutcome,
  type RecordQuarantineDispositionStoreInput,
} from './EvidenceQuarantineStore.js';
import {
  dispositionTargetStatus,
  isAllowedQuarantineTransition,
  QUARANTINE_LIST_DEFAULT_LIMIT,
  QUARANTINE_LIST_MAX_LIMIT,
  type EvidenceQuarantineRecord,
  type QuarantineEventView,
  type QuarantineListFilter,
  type QuarantineListResult,
  type QuarantineScanStatus,
  type QuarantineStatus,
  type RecordedQuarantineEvent,
} from './EvidenceQuarantineTypes.js';

/** Raw row shape selected from governance.evidence_quarantine_event. */
type QuarantineRow = {
  id: string;
  tenant_id: string;
  evidence_object_id: string | null;
  source_filename: string | null;
  content_type: string;
  size_bytes: number;
  content_hash: string;
  scan_status: string;
  scanner: string;
  signature_version: string | null;
  threat_name: string | null;
  reason: string | null;
  quarantine_status: string;
  upload_actor_user_id: string | null;
  request_id: string | null;
  correlation_id: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  disposition_reason: string | null;
  created_at: string;
  updated_at: string;
};

const VIEW_COLUMNS = `
  id, tenant_id, evidence_object_id, source_filename, content_type, size_bytes, content_hash,
  scan_status, scanner, signature_version, threat_name, reason, quarantine_status,
  upload_actor_user_id, request_id, correlation_id, reviewed_by_user_id, reviewed_at,
  disposition_reason, created_at, updated_at`;

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return QUARANTINE_LIST_DEFAULT_LIMIT;
  if (limit < 1) return 1;
  return Math.min(limit, QUARANTINE_LIST_MAX_LIMIT);
}

function toView(row: QuarantineRow): QuarantineEventView {
  return {
    quarantineEventId: row.id,
    tenantId: row.tenant_id,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    contentHash: row.content_hash,
    scanStatus: row.scan_status as QuarantineScanStatus,
    scanner: row.scanner,
    quarantineStatus: row.quarantine_status as QuarantineStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.evidence_object_id !== null ? { evidenceObjectId: row.evidence_object_id } : {}),
    ...(row.source_filename !== null ? { sourceFilename: row.source_filename } : {}),
    ...(row.signature_version !== null ? { signatureVersion: row.signature_version } : {}),
    ...(row.threat_name !== null ? { threatName: row.threat_name } : {}),
    ...(row.reason !== null ? { reason: row.reason } : {}),
    ...(row.upload_actor_user_id !== null ? { uploadActorUserId: row.upload_actor_user_id } : {}),
    ...(row.request_id !== null ? { requestId: row.request_id } : {}),
    ...(row.correlation_id !== null ? { correlationId: row.correlation_id } : {}),
    ...(row.reviewed_by_user_id !== null ? { reviewedByUserId: row.reviewed_by_user_id } : {}),
    ...(row.reviewed_at !== null ? { reviewedAt: row.reviewed_at } : {}),
    ...(row.disposition_reason !== null ? { dispositionReason: row.disposition_reason } : {}),
  };
}

export class PgEvidenceQuarantineStore implements EvidenceQuarantineStore {
  constructor(private readonly pool?: pg.Pool) {}

  async record(
    record: EvidenceQuarantineRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<RecordedQuarantineEvent> {
    return withTenantTransaction(
      record.tenantId,
      async (client) => {
        const quarantineRows = await client.query<{ id: string }>(
          `INSERT INTO governance.evidence_quarantine_event
             (id, tenant_id, evidence_object_id, source_filename, content_type, size_bytes,
              content_hash, scan_status, scanner, signature_version, threat_name, reason,
              quarantine_status, upload_actor_user_id, request_id, correlation_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'recorded',$13,$14,$15)
           RETURNING id`,
          [
            record.quarantineEventId,
            record.tenantId,
            record.evidenceObjectId ?? null,
            record.sourceFilename ?? null,
            record.contentType,
            record.sizeBytes,
            record.contentHash,
            record.scanStatus,
            record.scanner,
            record.signatureVersion ?? null,
            record.threatName ?? null,
            record.reason ?? null,
            record.uploadActorUserId ?? null,
            record.requestId ?? null,
            record.correlationId ?? null,
          ],
        );
        const quarantineEventId = quarantineRows[0]!.id;

        const outboxRows = await client.query<{ id: string }>(
          `INSERT INTO governance.outbox_message
             (tenant_id, message_type, payload, status, max_retries, dedupe_key,
              correlation_id, causation_id)
           VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)
           ON CONFLICT (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL
           DO UPDATE SET tenant_id = governance.outbox_message.tenant_id
           RETURNING id`,
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

        return { quarantineEventId, outboxMessageId: outboxRows[0]!.id };
      },
      this.pool,
    );
  }

  list(tenantId: string, filter: QuarantineListFilter): Promise<QuarantineListResult> {
    const limit = clampLimit(filter.limit);
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const conditions: string[] = [];
        const params: unknown[] = [];
        const add = (sql: (idx: number) => string, value: unknown): void => {
          params.push(value);
          conditions.push(sql(params.length));
        };
        if (filter.quarantineStatus !== undefined) {
          add((i) => `quarantine_status = $${i}`, filter.quarantineStatus);
        }
        if (filter.scanStatus !== undefined) add((i) => `scan_status = $${i}`, filter.scanStatus);
        if (filter.cursor !== undefined) {
          params.push(filter.cursor.createdAt);
          const cIdx = params.length;
          params.push(filter.cursor.id);
          const idIdx = params.length;
          conditions.push(`(created_at, id) > ($${cIdx}, $${idIdx})`);
        }
        params.push(limit);
        const limitIdx = params.length;
        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const rows = await client.query<QuarantineRow>(
          `SELECT ${VIEW_COLUMNS}
             FROM governance.evidence_quarantine_event
             ${where}
            ORDER BY created_at ASC, id ASC
            LIMIT $${limitIdx}`,
          params,
        );
        const items = rows.map(toView);
        const last = rows[rows.length - 1];
        const hasMore = rows.length === limit && last !== undefined;
        return {
          items,
          ...(hasMore && last !== undefined
            ? { nextCursor: { createdAt: last.created_at, id: last.id } }
            : {}),
        };
      },
      this.pool,
    );
  }

  getById(tenantId: string, quarantineEventId: string): Promise<QuarantineEventView | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<QuarantineRow>(
          `SELECT ${VIEW_COLUMNS}
             FROM governance.evidence_quarantine_event
            WHERE id = $1 LIMIT 1`,
          [quarantineEventId],
        );
        const row = rows[0];
        return row === undefined ? undefined : toView(row);
      },
      this.pool,
    );
  }

  recordDisposition(
    input: RecordQuarantineDispositionStoreInput,
  ): Promise<RecordQuarantineDispositionOutcome> {
    return withTenantTransaction(
      input.tenantId,
      async (client): Promise<RecordQuarantineDispositionOutcome> => {
        // Lock the event row so concurrent dispositions on the same event serialize.
        const lockedRows = await client.query<{
          quarantine_status: string;
          content_hash: string;
          scan_status: string;
          scanner: string;
          threat_name: string | null;
        }>(
          `SELECT quarantine_status, content_hash, scan_status, scanner, threat_name
             FROM governance.evidence_quarantine_event
            WHERE id = $1 FOR UPDATE`,
          [input.quarantineEventId],
        );
        const locked = lockedRows[0];
        if (locked === undefined) return { outcome: 'not_found' };

        const previousStatus = locked.quarantine_status as QuarantineStatus;
        const newStatus = dispositionTargetStatus(input.disposition);
        if (!isAllowedQuarantineTransition(previousStatus, newStatus)) {
          return { outcome: 'illegal_transition', currentStatus: previousStatus };
        }

        const outbox = buildQuarantineDispositionOutbox({
          row: {
            quarantineEventId: input.quarantineEventId,
            tenantId: input.tenantId,
            contentHash: locked.content_hash,
            scanStatus: locked.scan_status as QuarantineScanStatus,
            scanner: locked.scanner,
            ...(locked.threat_name !== null ? { threatName: locked.threat_name } : {}),
          },
          disposition: input.disposition,
          previousStatus,
          actorUserId: input.actorUserId,
          maxRetries: input.maxRetries,
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
          ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
          ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
        });

        const outboxRows = await client.query<{ id: string }>(
          `INSERT INTO governance.outbox_message
             (tenant_id, message_type, payload, status, max_retries, dedupe_key,
              correlation_id, causation_id)
           VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)
           ON CONFLICT (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL
           DO UPDATE SET tenant_id = governance.outbox_message.tenant_id
           RETURNING id`,
          [
            outbox.tenantId,
            outbox.messageType,
            JSON.stringify(outbox.payload),
            outbox.maxRetries,
            outbox.dedupeKey,
            outbox.correlationId ?? null,
            null,
          ],
        );
        const outboxMessageId = outboxRows[0]!.id;

        await client.query(
          `UPDATE governance.evidence_quarantine_event
              SET quarantine_status = $2,
                  reviewed_by_user_id = $3,
                  reviewed_at = now(),
                  disposition_reason = $4,
                  disposition_outbox_message_id = $5,
                  updated_at = now()
            WHERE id = $1`,
          [
            input.quarantineEventId,
            newStatus,
            input.actorUserId,
            input.reason ?? null,
            outboxMessageId,
          ],
        );

        return {
          outcome: 'applied',
          quarantineEventId: input.quarantineEventId,
          previousStatus,
          newStatus,
          outboxMessageId,
        };
      },
      this.pool,
    );
  }
}
