/**
 * PostgreSQL OutboxStore (integration) — WORKER side.
 *
 * Implements cross-tenant claim/lease/retry against governance.outbox_message. The outbox
 * processor runs across ALL tenants, but governance.outbox_message is under FORCE RLS, so a
 * non-superuser, non-BYPASSRLS worker role cannot read tenant-owned rows directly.
 *
 * Rather than grant the worker broad table access (or BYPASSRLS), all worker operations go
 * through a NARROW set of SECURITY DEFINER functions added in migration 0004
 * (governance.claim_outbox_messages / mark_outbox_processed / reschedule_outbox_message /
 * mark_outbox_failed / recover_expired_outbox_messages / get_outbox_message). The worker
 * role is granted EXECUTE on those functions and nothing else on governed tables. Direct
 * table access by the worker role stays blocked; normal app-role RLS is untouched.
 * See docs/architecture/outbox-worker-role.md.
 *
 * `pool` is injectable so production can wire the dedicated worker connection while the
 * default falls back to the shared pool.
 */

import type pg from 'pg';
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
  /**
   * @param pool Optional dedicated worker connection pool. When omitted, the shared pool
   *   (DATABASE_URL) is used. Production wires the worker-role pool here.
   */
  constructor(private readonly pool?: pg.Pool) {}

  /**
   * Tenant-scoped enqueue. NOTE: the governed transition path enqueues directly inside the
   * kernel transaction (PgGovernanceStore.insertOutboxMessage); this method exists for
   * non-kernel wiring/tests and runs under tenant context (RLS-enforced), not the worker
   * role.
   */
  async enqueue(input: OutboxEnqueueInput): Promise<string> {
    return withTenantTransaction(
      input.tenantId,
      async (client) => {
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
      },
      this.pool,
    );
  }

  /**
   * Claim across all tenants via the SECURITY DEFINER function. The worker role has no
   * direct table access; cross-tenant claiming is mediated entirely by the function, which
   * performs FOR UPDATE SKIP LOCKED + locked_until/locked_by leasing. Lease window is
   * `lockMs`.
   */
  async claimBatch(workerId: string, limit: number, lockMs: number): Promise<OutboxRow[]> {
    const lockSeconds = Math.ceil(lockMs / 1000);
    const rows = await queryRaw<OutboxDbRow>(
      `SELECT * FROM governance.claim_outbox_messages($1, $2, $3)`,
      [limit, workerId, lockSeconds],
      this.pool,
    );
    return rows.map(mapRow);
  }

  async markProcessed(id: string, publishedMessageId: string): Promise<void> {
    await queryRaw(
      `SELECT governance.mark_outbox_processed($1, $2)`,
      [id, publishedMessageId],
      this.pool,
    );
  }

  async reschedule(id: string, nextAttemptInMs: number, errorMessage: string): Promise<void> {
    const seconds = Math.ceil(nextAttemptInMs / 1000);
    await queryRaw(
      `SELECT governance.reschedule_outbox_message($1, $2, $3)`,
      [id, seconds, errorMessage],
      this.pool,
    );
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await queryRaw(
      `SELECT governance.mark_outbox_failed($1, $2)`,
      [id, errorMessage],
      this.pool,
    );
  }

  async recoverExpiredLeases(): Promise<number> {
    const rows = await queryRaw<{ recovered: number }>(
      `SELECT governance.recover_expired_outbox_messages() AS recovered`,
      undefined,
      this.pool,
    );
    return rows[0]?.recovered ?? 0;
  }

  async get(id: string): Promise<OutboxRow | undefined> {
    const rows = await queryRaw<OutboxDbRow>(
      `SELECT * FROM governance.get_outbox_message($1)`,
      [id],
      this.pool,
    );
    const r = rows[0];
    return r === undefined ? undefined : mapRow(r);
  }
}
