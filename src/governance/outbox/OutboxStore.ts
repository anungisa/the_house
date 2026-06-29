/**
 * Outbox store port + shared mutable record shape.
 *
 * The store owns claim/lease/retry mechanics. The kernel ENQUEUES outbox rows inside the
 * governed transaction (via GovernanceTx.insertOutboxMessage / the pg store), so `enqueue`
 * here is used by the in-memory wiring and tests; production pg enqueue happens inside the
 * same SQL transaction as the transition.
 */

import type { OutboxRow, OutboxStatus } from './OutboxTypes.js';

/** A message to enqueue (mirrors OutboxMessageInsert without store concerns). */
export interface OutboxEnqueueInput {
  readonly tenantId: string;
  readonly messageType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly dedupeKey: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly maxRetries: number;
}

export interface OutboxStore {
  /** Insert a pending message (idempotent on (tenantId, dedupeKey)). Returns the row id. */
  enqueue(input: OutboxEnqueueInput): Promise<string>;

  /**
   * Atomically claim up to `limit` pending rows whose next_attempt_at <= now, leasing them
   * to `workerId` until now+lockMs. Mirrors FOR UPDATE SKIP LOCKED + locked_until leasing.
   */
  claimBatch(workerId: string, limit: number, lockMs: number): Promise<OutboxRow[]>;

  /** Mark a claimed row processed. */
  markProcessed(id: string, publishedMessageId: string): Promise<void>;

  /**
   * Transient failure: increment retry_count, set next_attempt_at, return row to 'pending'.
   */
  reschedule(id: string, nextAttemptInMs: number, errorMessage: string): Promise<void>;

  /** Permanent failure: mark 'failed' (no further automatic retries). */
  markFailed(id: string, errorMessage: string): Promise<void>;

  /** Return rows whose processing lease expired to 'pending'. Returns count recovered. */
  recoverExpiredLeases(): Promise<number>;

  /** Fetch a single row (tests/inspection). */
  get(id: string): Promise<OutboxRow | undefined>;
}

/** Internal mutable record used by the in-memory store. */
export interface OutboxRecord {
  id: string;
  tenantId: string;
  messageType: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
  correlationId?: string;
  causationId?: string;
  status: OutboxStatus;
  retryCount: number;
  maxRetries: number;
  nextAttemptAt: number;
  lockedUntil?: number;
  lockedBy?: string;
  publishedMessageId?: string;
  error?: string;
  createdAt: number;
  processedAt?: number;
}

export function toOutboxRow(rec: OutboxRecord): OutboxRow {
  const row: {
    -readonly [K in keyof OutboxRow]: OutboxRow[K];
  } = {
    id: rec.id,
    tenantId: rec.tenantId,
    messageType: rec.messageType,
    payload: rec.payload,
    dedupeKey: rec.dedupeKey,
    status: rec.status,
    retryCount: rec.retryCount,
    maxRetries: rec.maxRetries,
    nextAttemptAt: rec.nextAttemptAt,
    createdAt: rec.createdAt,
  };
  if (rec.correlationId !== undefined) row.correlationId = rec.correlationId;
  if (rec.causationId !== undefined) row.causationId = rec.causationId;
  if (rec.lockedUntil !== undefined) row.lockedUntil = rec.lockedUntil;
  if (rec.lockedBy !== undefined) row.lockedBy = rec.lockedBy;
  return row;
}
