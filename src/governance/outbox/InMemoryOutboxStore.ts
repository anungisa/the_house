/**
 * In-memory outbox store (full implementation for unit tests).
 *
 * Simulates FOR UPDATE SKIP LOCKED claiming with locked_until/locked_by leasing and a
 * partial-unique (tenantId, dedupeKey) constraint for idempotent enqueue.
 */

import type { Clock } from '../../shared/time/clock.js';
import { systemClock } from '../../shared/time/clock.js';
import type { IdGenerator } from '../../shared/uuid/id.js';
import { uuidGenerator } from '../../shared/uuid/id.js';
import type { OutboxRow } from './OutboxTypes.js';
import {
  toOutboxRow,
  type OutboxEnqueueInput,
  type OutboxRecord,
  type OutboxStore,
} from './OutboxStore.js';

export class InMemoryOutboxStore implements OutboxStore {
  /** Shared backing array (also written to by the in-memory governance store). */
  public readonly records: OutboxRecord[];

  constructor(
    private readonly clock: Clock = systemClock,
    private readonly ids: IdGenerator = uuidGenerator,
    backing?: OutboxRecord[],
  ) {
    this.records = backing ?? [];
  }

  enqueue(input: OutboxEnqueueInput): Promise<string> {
    // Idempotent on (tenantId, dedupeKey).
    const existing = this.records.find(
      (r) => r.tenantId === input.tenantId && r.dedupeKey === input.dedupeKey,
    );
    if (existing !== undefined) {
      return Promise.resolve(existing.id);
    }
    const now = this.clock.now();
    const rec: OutboxRecord = {
      id: this.ids.newId(),
      tenantId: input.tenantId,
      messageType: input.messageType,
      payload: { ...input.payload },
      dedupeKey: input.dedupeKey,
      status: 'pending',
      retryCount: 0,
      maxRetries: input.maxRetries,
      nextAttemptAt: now,
      createdAt: now,
    };
    if (input.correlationId !== undefined) rec.correlationId = input.correlationId;
    if (input.causationId !== undefined) rec.causationId = input.causationId;
    this.records.push(rec);
    return Promise.resolve(rec.id);
  }

  claimBatch(workerId: string, limit: number, lockMs: number): Promise<OutboxRow[]> {
    const now = this.clock.now();
    const claimable = this.records
      .filter((r) => r.status === 'pending' && r.nextAttemptAt <= now)
      .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)
      .slice(0, limit);
    const claimed: OutboxRow[] = [];
    for (const rec of claimable) {
      rec.status = 'processing';
      rec.lockedUntil = now + lockMs;
      rec.lockedBy = workerId;
      claimed.push(toOutboxRow(rec));
    }
    return Promise.resolve(claimed);
  }

  markProcessed(id: string, publishedMessageId: string): Promise<void> {
    const rec = this.find(id);
    if (rec !== undefined) {
      rec.status = 'processed';
      rec.publishedMessageId = publishedMessageId;
      rec.processedAt = this.clock.now();
      rec.lockedUntil = undefined;
      rec.lockedBy = undefined;
      rec.error = undefined;
    }
    return Promise.resolve();
  }

  reschedule(id: string, nextAttemptInMs: number, errorMessage: string): Promise<void> {
    const rec = this.find(id);
    if (rec !== undefined) {
      rec.status = 'pending';
      rec.retryCount += 1;
      rec.nextAttemptAt = this.clock.now() + nextAttemptInMs;
      rec.error = errorMessage;
      rec.lockedUntil = undefined;
      rec.lockedBy = undefined;
    }
    return Promise.resolve();
  }

  markFailed(id: string, errorMessage: string): Promise<void> {
    const rec = this.find(id);
    if (rec !== undefined) {
      rec.status = 'failed';
      rec.error = errorMessage;
      rec.lockedUntil = undefined;
      rec.lockedBy = undefined;
    }
    return Promise.resolve();
  }

  recoverExpiredLeases(): Promise<number> {
    const now = this.clock.now();
    let recovered = 0;
    for (const rec of this.records) {
      if (rec.status === 'processing' && rec.lockedUntil !== undefined && rec.lockedUntil <= now) {
        rec.status = 'pending';
        rec.lockedUntil = undefined;
        rec.lockedBy = undefined;
        recovered += 1;
      }
    }
    return Promise.resolve(recovered);
  }

  get(id: string): Promise<OutboxRow | undefined> {
    const rec = this.find(id);
    return Promise.resolve(rec === undefined ? undefined : toOutboxRow(rec));
  }

  private find(id: string): OutboxRecord | undefined {
    return this.records.find((r) => r.id === id);
  }
}
