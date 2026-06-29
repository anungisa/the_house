/**
 * Outbox worker runtime host.
 *
 * Schedules {@link OutboxWorker.processBatch} so the transactional outbox can actually be
 * drained. This is the operational loop that sits between the worker (claim/publish/mark
 * mechanics) and a process entrypoint (`scripts/outbox-worker.ts`).
 *
 * Responsibilities (and ONLY these):
 *  - run one batch (run-once mode) or repeated batches on a fixed interval (continuous);
 *  - never overlap ticks — if a batch is still in flight when the next tick fires, skip it;
 *  - survive per-batch errors in continuous mode (log and keep going);
 *  - shut down gracefully: stop scheduling, let the in-flight batch finish, then close the
 *    publisher and the DB pool via injected callbacks.
 *
 * It is deliberately decoupled from PostgreSQL and Azure: it depends on a small
 * {@link OutboxWorkerRunnable} (just `processBatch`) plus optional close callbacks, and the
 * timer functions are injectable. That keeps it fully unit-testable with fakes — no real
 * broker, no real database.
 *
 * NOT in scope (separate hardening passes): multi-process leader election, production
 * observability/metrics/alerts, an Azure Functions host, DLQ consumers, deployment/IaC.
 */

import type { ProcessBatchSummary } from './OutboxWorker.js';
import { setInterval, clearInterval } from 'node:timers';

/** Minimal surface the runtime needs from the worker. */
export interface OutboxWorkerRunnable {
  processBatch(): Promise<ProcessBatchSummary>;
}

export interface OutboxWorkerRuntimeConfig {
  /** Delay between ticks (ms) in continuous mode. Must be > 0. */
  readonly intervalMs: number;
  /** Process exactly one batch then shut down. */
  readonly runOnce: boolean;
  /** Stable worker identity (for startup logging/diagnostics). */
  readonly workerId: string;
  /** Batch size (for startup logging). */
  readonly batchSize: number;
  /** Lease seconds (for startup logging). */
  readonly lockSeconds: number;
  /** Whether the configured publisher targets a real broker (for startup logging). */
  readonly serviceBusEnabled: boolean;
}

export type IntervalHandle = ReturnType<typeof setInterval>;

export interface OutboxWorkerRuntimeDeps {
  readonly worker: OutboxWorkerRunnable;
  readonly config: OutboxWorkerRuntimeConfig;
  /** Info log sink (default: console.log with a stable prefix). Never logs secrets. */
  readonly log?: (message: string) => void;
  /** Error log sink (default: console.error). Receives a generic message + the raw error. */
  readonly onError?: (message: string, error: unknown) => void;
  /** Close the publisher/broker client on shutdown (optional). */
  readonly closePublisher?: () => Promise<void>;
  /** Close the database pool on shutdown (optional). */
  readonly closePool?: () => Promise<void>;
  /** Injectable timers for deterministic tests. */
  readonly setIntervalFn?: (handler: () => void, ms: number) => IntervalHandle;
  readonly clearIntervalFn?: (handle: IntervalHandle) => void;
}

const DEFAULT_LOG = (message: string): void => {
  console.log(`[outbox-worker] ${message}`);
};

const DEFAULT_ERROR = (message: string, error: unknown): void => {
  console.error(`[outbox-worker] ${message}`, error);
};

export class OutboxWorkerRuntime {
  private readonly worker: OutboxWorkerRunnable;
  private readonly config: OutboxWorkerRuntimeConfig;
  private readonly log: (message: string) => void;
  private readonly onError: (message: string, error: unknown) => void;
  private readonly closePublisher: (() => Promise<void>) | undefined;
  private readonly closePool: (() => Promise<void>) | undefined;
  private readonly setIntervalFn: (handler: () => void, ms: number) => IntervalHandle;
  private readonly clearIntervalFn: (handle: IntervalHandle) => void;

  private started = false;
  private inFlight = false;
  private shuttingDown = false;
  private intervalHandle: IntervalHandle | undefined;
  private currentBatch: Promise<void> | undefined;

  constructor(deps: OutboxWorkerRuntimeDeps) {
    this.worker = deps.worker;
    this.config = deps.config;
    this.log = deps.log ?? DEFAULT_LOG;
    this.onError = deps.onError ?? DEFAULT_ERROR;
    this.closePublisher = deps.closePublisher;
    this.closePool = deps.closePool;
    this.setIntervalFn = deps.setIntervalFn ?? ((handler, ms) => setInterval(handler, ms));
    this.clearIntervalFn = deps.clearIntervalFn ?? ((handle) => clearInterval(handle));
  }

  /**
   * Start the runtime. In run-once mode this awaits a single batch and then shuts down
   * (closing resources). In continuous mode it schedules ticks and returns immediately;
   * the caller keeps the process alive and calls {@link shutdown} on a signal.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.logStartup();

    if (this.config.runOnce) {
      await this.runGuardedBatch();
      await this.shutdown();
      return;
    }

    this.intervalHandle = this.setIntervalFn(() => {
      void this.runGuardedBatch();
    }, this.config.intervalMs);
  }

  private logStartup(): void {
    this.log(
      `starting (mode=${this.config.runOnce ? 'run-once' : 'continuous'}, ` +
        `workerId=${this.config.workerId}, intervalMs=${this.config.intervalMs}, ` +
        `batchSize=${this.config.batchSize}, lockSeconds=${this.config.lockSeconds}, ` +
        `serviceBus=${this.config.serviceBusEnabled ? 'enabled' : 'disabled'})`,
    );
  }

  /** Run a batch unless one is already in flight or we are shutting down. */
  private async runGuardedBatch(): Promise<void> {
    if (this.shuttingDown) return;
    if (this.inFlight) {
      this.log('skipping tick: previous batch still running');
      return;
    }
    this.inFlight = true;
    const batch = this.executeBatch().finally(() => {
      this.inFlight = false;
    });
    this.currentBatch = batch;
    await batch;
  }

  /** Execute exactly one batch, logging the summary or handling an operational error. */
  private async executeBatch(): Promise<void> {
    try {
      const s = await this.worker.processBatch();
      this.log(
        `batch complete: claimed=${s.claimed} published=${s.published} ` +
          `rescheduled=${s.rescheduled} failed=${s.failed} recovered=${s.recoveredLeases}`,
      );
    } catch (error) {
      // Keep the worker alive in continuous mode; do not leak internals into the info log.
      this.onError('outbox batch encountered an operational error; worker stays alive', error);
    }
  }

  /**
   * Stop scheduling, wait for any in-flight batch to finish, then close the publisher and
   * the DB pool. Idempotent: a second call awaits the same in-flight batch and returns.
   */
  async shutdown(): Promise<void> {
    if (this.shuttingDown) {
      if (this.currentBatch !== undefined) await this.currentBatch.catch(() => {});
      return;
    }
    this.shuttingDown = true;

    if (this.intervalHandle !== undefined) {
      this.clearIntervalFn(this.intervalHandle);
      this.intervalHandle = undefined;
    }

    if (this.currentBatch !== undefined) {
      this.log('waiting for in-flight batch to finish...');
      await this.currentBatch.catch(() => {});
    }

    if (this.closePublisher !== undefined) {
      try {
        await this.closePublisher();
      } catch (error) {
        this.onError('failed to close publisher', error);
      }
    }

    if (this.closePool !== undefined) {
      try {
        await this.closePool();
      } catch (error) {
        this.onError('failed to close database pool', error);
      }
    }

    this.log('shutdown complete.');
  }
}
