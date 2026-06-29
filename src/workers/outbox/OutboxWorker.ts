import type { OutboxPublisher } from '../../governance/outbox/OutboxPublisher.js';
import type { OutboxStore } from '../../governance/outbox/OutboxStore.js';
import type { OutboxRow, PublishableMessage } from '../../governance/outbox/OutboxTypes.js';
import type { Clock } from '../../shared/time/clock.js';
import { systemClock } from '../../shared/time/clock.js';
import { fullJitterDelayMs } from './backoff.js';

/**
 * Outbox processor worker.
 *
 * Runtime: a timer-triggered, Azure Function-compatible processor that runs the
 * recover -> claim -> publish -> mark loop:
 *  - recover expired processing leases so stuck rows become claimable again
 *  - claim pending rows with FOR UPDATE SKIP LOCKED + locked_until/locked_by leasing
 *  - publish via the OutboxPublisher abstraction
 *  - MessageId = dedupe_key (else outbox row id); propagate correlation/causation ids
 *  - mark processed on success; on transient failure increment retry_count and schedule
 *    next_attempt_at using TRUE FULL JITTER; mark failed once max retries is exceeded
 *  - Azure Service Bus SESSIONS ARE NOT USED in v1 (causationId is an ordinary property)
 *
 * DLQ distinction: a publish failure BEFORE Service Bus accepts a message is a FAILED
 * Postgres outbox row, NOT a Service Bus DLQ event. See
 * docs/architecture/outbox-dead-letter-investigation.md.
 */
export interface OutboxWorkerConfig {
  readonly batchSize: number;
  readonly lockSeconds: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly maxRetries: number;
}

export interface OutboxWorkerOptions {
  readonly workerId?: string;
  readonly clock?: Clock;
  /** Injectable RNG for deterministic jitter in tests. */
  readonly random?: () => number;
}

export interface ProcessBatchSummary {
  readonly claimed: number;
  readonly published: number;
  readonly rescheduled: number;
  readonly failed: number;
  readonly recoveredLeases: number;
}

export class OutboxWorker {
  private readonly workerId: string;
  private readonly clock: Clock;
  private readonly random: () => number;

  constructor(
    private readonly store: OutboxStore,
    private readonly publisher: OutboxPublisher,
    private readonly config: OutboxWorkerConfig,
    options: OutboxWorkerOptions = {},
  ) {
    this.workerId = options.workerId ?? `outbox-worker-${Math.random().toString(16).slice(2)}`;
    this.clock = options.clock ?? systemClock;
    this.random = options.random ?? Math.random;
  }

  /**
   * Process one batch: recover expired leases, claim a batch, publish each, and mark rows.
   * Returns a summary of what happened (useful for tests/metrics).
   */
  async processBatch(): Promise<ProcessBatchSummary> {
    const recoveredLeases = await this.store.recoverExpiredLeases();

    const claimed = await this.store.claimBatch(
      this.workerId,
      this.config.batchSize,
      this.config.lockSeconds * 1000,
    );

    let published = 0;
    let rescheduled = 0;
    let failed = 0;

    for (const row of claimed) {
      const outcome = await this.publishOne(row);
      if (outcome === 'published') published += 1;
      else if (outcome === 'rescheduled') rescheduled += 1;
      else failed += 1;
    }

    return { claimed: claimed.length, published, rescheduled, failed, recoveredLeases };
  }

  /**
   * Publish a single claimed row and update its status.
   * @returns the outcome category for batch accounting.
   */
  private async publishOne(row: OutboxRow): Promise<'published' | 'rescheduled' | 'failed'> {
    const message = this.toPublishable(row);
    let transient = true;
    let errorMessage = 'unknown publish failure';

    try {
      const result = await this.publisher.publish(message);
      if (result.published) {
        await this.store.markProcessed(row.id, message.messageId);
        return 'published';
      }
      transient = result.transient ?? false;
      errorMessage = result.errorMessage ?? 'publisher returned published=false';
    } catch (error) {
      // A thrown error before broker acceptance is treated as transient by default.
      transient = true;
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    // Permanent failure, or retries exhausted => mark failed (Postgres 'failed', NOT a DLQ).
    if (!transient || row.retryCount + 1 > this.config.maxRetries) {
      await this.store.markFailed(row.id, errorMessage);
      return 'failed';
    }

    const delay = this.nextAttemptDelayMs(row.retryCount + 1);
    await this.store.reschedule(row.id, delay, errorMessage);
    return 'rescheduled';
  }

  /** Build a PublishableMessage. MessageId = dedupeKey when present, else the row id. */
  private toPublishable(row: OutboxRow): PublishableMessage {
    const messageId = row.dedupeKey !== '' ? row.dedupeKey : row.id;
    const message: { -readonly [K in keyof PublishableMessage]: PublishableMessage[K] } = {
      messageId,
      messageType: row.messageType,
      body: row.payload,
    };
    if (row.correlationId !== undefined) message.correlationId = row.correlationId;
    if (row.causationId !== undefined) message.causationId = row.causationId;
    return message;
  }

  /**
   * Pure helper: next attempt delay for a given retry attempt, using true full jitter.
   * No I/O so retry scheduling is unit-testable.
   */
  nextAttemptDelayMs(attempt: number): number {
    return fullJitterDelayMs({
      attempt,
      baseDelayMs: this.config.baseDelayMs,
      maxDelayMs: this.config.maxDelayMs,
      random: this.random,
    });
  }

  /** Recover expired processing leases (exposed for scheduling/tests). */
  recoverExpiredLeases(): Promise<number> {
    return this.store.recoverExpiredLeases();
  }

  /** Current worker id (for diagnostics/tests). */
  get id(): string {
    return this.workerId;
  }

  /** Current clock epoch (keeps the injected clock part of the contract). */
  protected now(): number {
    return this.clock.now();
  }
}
