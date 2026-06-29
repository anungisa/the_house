/**
 * PostgreSQL OutboxStore (integration).
 *
 * Implements claim/lease/retry against governance.outbox_message. Claiming uses
 * FOR UPDATE SKIP LOCKED with locked_until/locked_by leasing.
 *
 * Tenant context: the outbox processor runs cross-tenant. This store therefore operates
 * through a connection that is expected to be a privileged background-worker role (or a
 * per-tenant context loop). See db/migrations/0001 header for the production guidance.
 * For gated integration tests, a non-RLS-bypassing role with explicit tenant context is
 * used per operation.
 */

import { withTenantTransaction, queryRaw } from '../../db/pool.js';
import type { OutboxRow } from './OutboxTypes.js';
import type { OutboxEnqueueInput, OutboxStore } from './OutboxStore.js';

interface OutboxDbRow {
  [key: string]: unknown;
  id: string;
  tenant_id: string;
  message_type: string;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  status: OutboxRow['status'];
  retry_count: number;
  max_retries: number;
  next_attempt_at: Date;
  locked_until: Date | null;
  locked_by: string | null;
  created_at: Date;
}

function mapRow(r: OutboxDbRow): OutboxRow {
  const row: { -readonly [K in keyof OutboxRow]: OutboxRow[K] } = {
    id: r.id,
    tenantId: r.tenant_id,
    messageType: r.message_type,
    payload: r.payload,
    dedupeKey: r.dedupe_key ?? r.id,
    status: r.status,
    retryCount: r.retry_count,
    maxRetries: r.max_retries,
    nextAttemptAt: r.next_attempt_at.getTime(),
    createdAt: r.created_at.getTime(),
  };
  if (r.correlation_id !== null) row.correlationId = r.correlation_id;
  if (r.causation_id !== null) row.causationId = r.causation_id;
  if (r.locked_until !== null) row.lockedUntil = r.locked_until.getTime();
  if (r.locked_by !== null) row.lockedBy = r.locked_by;
  return row;
}

export class PgOutboxStore implements OutboxStore {
  async enqueue(input: OutboxEnqueueInput): Promise<string> {
    return withTenantTransaction(input.tenantId, async (client) => {
      const rows = await client.query<{ id: string }>(
        `INSERT INTO governance.outbox_message
           (tenant_id, message_type, payload, status, max_retries, dedupe_key,
            correlation_id, causation_id)
         VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)
         ON CONFLICT (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL
         DO UPDATE SET tenant_id = governance.outbox_message.tenant_id
         RETURNING id`,
        [
          input.tenantId,
          input.messageType,
          JSON.stringify(input.payload),
          input.maxRetries,
          input.dedupeKey,
          input.correlationId ?? null,
          input.causationId ?? null,
        ],
      );
      return rows[0]!.id;
    });
  }

  /**
   * Claim across all tenants. Uses a privileged connection (no tenant context); intended
   * for the background worker role. Lease window is `lockMs`.
   */
  async claimBatch(workerId: string, limit: number, lockMs: number): Promise<OutboxRow[]> {
    const lockSeconds = Math.ceil(lockMs / 1000);
    const rows = await queryRaw<OutboxDbRow>(
      `WITH claimed AS (
         SELECT id FROM governance.outbox_message
          WHERE status = 'pending' AND next_attempt_at <= now()
          ORDER BY next_attempt_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $1
       )
       UPDATE governance.outbox_message o
          SET status = 'processing',
              locked_by = $2,
              locked_until = now() + make_interval(secs => $3),
              last_attempt_at = now()
         FROM claimed
        WHERE o.id = claimed.id
       RETURNING o.*`,
      [limit, workerId, lockSeconds],
    );
    return rows.map(mapRow);
  }

  async markProcessed(id: string, publishedMessageId: string): Promise<void> {
    await queryRaw(
      `UPDATE governance.outbox_message
          SET status = 'processed', processed_at = now(), published_message_id = $2,
              locked_until = NULL, locked_by = NULL, error = NULL
        WHERE id = $1`,
      [id, publishedMessageId],
    );
  }

  async reschedule(id: string, nextAttemptInMs: number, errorMessage: string): Promise<void> {
    const seconds = Math.ceil(nextAttemptInMs / 1000);
    await queryRaw(
      `UPDATE governance.outbox_message
          SET status = 'pending', retry_count = retry_count + 1,
              next_attempt_at = now() + make_interval(secs => $2),
              error = $3, locked_until = NULL, locked_by = NULL
        WHERE id = $1`,
      [id, seconds, errorMessage],
    );
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await queryRaw(
      `UPDATE governance.outbox_message
          SET status = 'failed', error = $2, locked_until = NULL, locked_by = NULL
        WHERE id = $1`,
      [id, errorMessage],
    );
  }

  async recoverExpiredLeases(): Promise<number> {
    const rows = await queryRaw<{ id: string }>(
      `UPDATE governance.outbox_message
          SET status = 'pending', locked_until = NULL, locked_by = NULL
        WHERE status = 'processing' AND locked_until IS NOT NULL AND locked_until <= now()
       RETURNING id`,
    );
    return rows.length;
  }

  async get(id: string): Promise<OutboxRow | undefined> {
    const rows = await queryRaw<OutboxDbRow>(
      `SELECT * FROM governance.outbox_message WHERE id = $1`,
      [id],
    );
    const r = rows[0];
    return r === undefined ? undefined : mapRow(r);
  }
}
