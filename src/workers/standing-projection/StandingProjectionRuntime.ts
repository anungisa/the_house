/**
 * Standing-projection worker runtime host.
 *
 * Schedules {@link StandingProjectionWorker.processBatch} so ACTIVATED affiliations can actually be
 * projected into governed AffiliationStandings. This is the operational loop that sits between the
 * batch worker (poll-due → orchestrate → tally) and a process entrypoint
 * (`scripts/standing-projection-worker.ts` / the compiled `src/server/worker.ts`). It MIRRORS
 * {@link OutboxWorkerRuntime} deliberately: the two runtimes share the same lifecycle contract.
 *
 * Responsibilities (and ONLY these):
 *  - run one batch (run-once mode) or repeated batches on a fixed interval (continuous);
 *  - never overlap ticks — if a batch is still in flight when the next tick fires, skip it;
 *  - survive per-batch errors in continuous mode (log and keep going);
 *  - emit operational metrics (batch / projected / governed-failure / retry / exhaustion) plus a
 *    completed/failed event — visibility ONLY; never affects projection or governed state;
 *  - expose a readiness/health snapshot for operators and tests;
 *  - shut down gracefully: stop scheduling, let the in-flight batch finish, then close the DB pool
 *    via an injected callback.
 *
 * It holds NO governed authority: every standing is opened through the Governance Kernel inside the
 * orchestrator the worker calls. This host NEVER mutates standing state directly. It is decoupled
 * from PostgreSQL (depends on a small {@link StandingProjectionRunnable}) and the timer functions
 * are injectable, so it is fully unit-testable with fakes.
 *
 * NOT in scope (separate passes): multi-process leader election, an Azure Functions host,
 * deployment/IaC, an HTTP health endpoint (the snapshot is exposed as a method).
 */

import { setInterval, clearInterval } from 'node:timers';
import type { StandingProjectionBatchSummary } from '../../domains/affiliation-standing/orchestration/StandingProjectionWorker.js';
import {
  NOOP_TELEMETRY,
  startStopwatch,
  TelemetryAttributeKeys,
  TelemetryCounters,
  TelemetryDurations,
  TelemetryEvents,
  TelemetryResult,
  type Telemetry,
} from '../../observability/index.js';

/** Minimal surface the runtime needs from the worker. */
export interface StandingProjectionRunnable {
  processBatch(): Promise<StandingProjectionBatchSummary>;
}

export interface StandingProjectionRuntimeConfig {
  /** Delay between ticks (ms) in continuous mode. Must be > 0. */
  readonly intervalMs: number;
  /** Process exactly one batch then shut down. */
  readonly runOnce: boolean;
  /** Stable worker identity (for startup logging / telemetry). */
  readonly workerId: string;
  /** Batch size (for startup logging). */
  readonly batchSize: number;
}

export type IntervalHandle = ReturnType<typeof setInterval>;

export interface StandingProjectionRuntimeDeps {
  readonly worker: StandingProjectionRunnable;
  readonly config: StandingProjectionRuntimeConfig;
  /** Info log sink (default: console.log with a stable prefix). Never logs secrets. */
  readonly log?: (message: string) => void;
  /** Error log sink (default: console.error). Receives a generic message + the raw error. */
  readonly onError?: (message: string, error: unknown) => void;
  /** Close the database pool on shutdown (optional). */
  readonly closePool?: () => Promise<void>;
  /** Injectable timers for deterministic tests. */
  readonly setIntervalFn?: (handler: () => void, ms: number) => IntervalHandle;
  readonly clearIntervalFn?: (handle: IntervalHandle) => void;
  /**
   * Optional telemetry sink. Visibility only — never affects projection/retry behavior or governed
   * state.
   */
  readonly telemetry?: Telemetry;
  /** Injectable clock for the health snapshot's `lastBatchAtMs` (defaults to Date.now). */
  readonly now?: () => number;
}

/** Running totals accumulated across batches (monotonic; visibility only). */
export interface StandingProjectionRuntimeTotals {
  readonly batches: number;
  readonly batchFailures: number;
  readonly claimed: number;
  readonly projected: number;
  readonly governedFailures: number;
  readonly retries: number;
  readonly exhausted: number;
}

/** A point-in-time health/readiness snapshot for operators and tests. */
export interface StandingProjectionRuntimeHealth {
  readonly workerId: string;
  readonly started: boolean;
  readonly shuttingDown: boolean;
  readonly inFlight: boolean;
  /** True once started and not shutting down — safe to report as ready. */
  readonly ready: boolean;
  /** Epoch ms of the last completed batch (undefined before the first batch). */
  readonly lastBatchAtMs: number | undefined;
  /** Sanitized message from the last batch that threw (undefined if none). */
  readonly lastError: string | undefined;
  readonly totals: StandingProjectionRuntimeTotals;
}

const DEFAULT_LOG = (message: string): void => {
  console.log(`[standing-projection-worker] ${message}`);
};

const DEFAULT_ERROR = (message: string, error: unknown): void => {
  console.error(`[standing-projection-worker] ${message}`, error);
};

export class StandingProjectionRuntime {
  private readonly worker: StandingProjectionRunnable;
  private readonly config: StandingProjectionRuntimeConfig;
  private readonly log: (message: string) => void;
  private readonly onError: (message: string, error: unknown) => void;
  private readonly closePool: (() => Promise<void>) | undefined;
  private readonly setIntervalFn: (handler: () => void, ms: number) => IntervalHandle;
  private readonly clearIntervalFn: (handle: IntervalHandle) => void;
  private readonly telemetry: Telemetry;
  private readonly now: () => number;

  private started = false;
  private inFlight = false;
  private shuttingDown = false;
  private intervalHandle: IntervalHandle | undefined;
  private currentBatch: Promise<void> | undefined;

  private lastBatchAtMs: number | undefined;
  private lastError: string | undefined;
  private totals: StandingProjectionRuntimeTotals = {
    batches: 0,
    batchFailures: 0,
    claimed: 0,
    projected: 0,
    governedFailures: 0,
    retries: 0,
    exhausted: 0,
  };

  constructor(deps: StandingProjectionRuntimeDeps) {
    this.worker = deps.worker;
    this.config = deps.config;
    this.log = deps.log ?? DEFAULT_LOG;
    this.onError = deps.onError ?? DEFAULT_ERROR;
    this.closePool = deps.closePool;
    this.setIntervalFn = deps.setIntervalFn ?? ((handler, ms) => setInterval(handler, ms));
    this.clearIntervalFn = deps.clearIntervalFn ?? ((handle) => clearInterval(handle));
    this.telemetry = deps.telemetry ?? NOOP_TELEMETRY;
    this.now = deps.now ?? (() => Date.now());
  }

  /**
   * Start the runtime. In run-once mode this awaits a single batch and then shuts down (closing the
   * pool). In continuous mode it schedules ticks and returns immediately; the caller keeps the
   * process alive and calls {@link shutdown} on a signal.
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

  /** A point-in-time readiness/health snapshot (safe to log / expose; never throws). */
  health(): StandingProjectionRuntimeHealth {
    return {
      workerId: this.config.workerId,
      started: this.started,
      shuttingDown: this.shuttingDown,
      inFlight: this.inFlight,
      ready: this.started && !this.shuttingDown,
      lastBatchAtMs: this.lastBatchAtMs,
      lastError: this.lastError,
      totals: this.totals,
    };
  }

  private logStartup(): void {
    this.log(
      `starting (mode=${this.config.runOnce ? 'run-once' : 'continuous'}, ` +
        `workerId=${this.config.workerId}, intervalMs=${this.config.intervalMs}, ` +
        `batchSize=${this.config.batchSize})`,
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
    const stop = startStopwatch();
    try {
      const s = await this.worker.processBatch();
      this.recordSuccess(s);
      this.log(
        `batch complete: claimed=${s.claimed} projected=${s.projected} ` +
          `governedFailures=${s.governedFailures} retries=${s.retries} exhausted=${s.exhausted}`,
      );
      this.emitBatchTelemetry(s, stop());
    } catch (error) {
      // Keep the worker alive in continuous mode; do not leak internals into the info log.
      this.recordFailure(error);
      this.onError('standing projection batch encountered an operational error; worker stays alive', error);
      this.emitBatchFailure(stop());
    }
  }

  private recordSuccess(summary: StandingProjectionBatchSummary): void {
    this.lastBatchAtMs = this.now();
    this.totals = {
      batches: this.totals.batches + 1,
      batchFailures: this.totals.batchFailures,
      claimed: this.totals.claimed + summary.claimed,
      projected: this.totals.projected + summary.projected,
      governedFailures: this.totals.governedFailures + summary.governedFailures,
      retries: this.totals.retries + summary.retries,
      exhausted: this.totals.exhausted + summary.exhausted,
    };
  }

  private recordFailure(error: unknown): void {
    this.lastBatchAtMs = this.now();
    this.lastError = error instanceof Error ? error.message : String(error);
    this.totals = { ...this.totals, batchFailures: this.totals.batchFailures + 1 };
  }

  /** Emit operational metrics for a completed batch (visibility only; never throws). */
  private emitBatchTelemetry(summary: StandingProjectionBatchSummary, elapsedMs: number): void {
    const attributes = {
      [TelemetryAttributeKeys.workerId]: this.config.workerId,
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
      [TelemetryAttributeKeys.claimed]: summary.claimed,
      [TelemetryAttributeKeys.projected]: summary.projected,
      [TelemetryAttributeKeys.governedFailures]: summary.governedFailures,
      [TelemetryAttributeKeys.retries]: summary.retries,
      [TelemetryAttributeKeys.exhausted]: summary.exhausted,
    };
    this.telemetry.incrementCounter(TelemetryCounters.standingProjectionBatch, 1, attributes);
    this.telemetry.recordDuration(TelemetryDurations.standingProjectionBatch, elapsedMs, attributes);
    const workerAttr = { [TelemetryAttributeKeys.workerId]: this.config.workerId };
    if (summary.projected > 0) {
      this.telemetry.incrementCounter(
        TelemetryCounters.standingProjectionProjected,
        summary.projected,
        workerAttr,
      );
    }
    if (summary.governedFailures > 0) {
      this.telemetry.incrementCounter(
        TelemetryCounters.standingProjectionGovernedFailure,
        summary.governedFailures,
        workerAttr,
      );
    }
    if (summary.retries > 0) {
      this.telemetry.incrementCounter(
        TelemetryCounters.standingProjectionRetry,
        summary.retries,
        workerAttr,
      );
    }
    if (summary.exhausted > 0) {
      this.telemetry.incrementCounter(
        TelemetryCounters.standingProjectionExhausted,
        summary.exhausted,
        workerAttr,
      );
    }
    this.telemetry.recordEvent(TelemetryEvents.standingProjectionBatchCompleted, attributes);
  }

  /** Emit operational metrics for a batch that threw (visibility only; never throws). */
  private emitBatchFailure(elapsedMs: number): void {
    const attributes = {
      [TelemetryAttributeKeys.workerId]: this.config.workerId,
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    };
    this.telemetry.incrementCounter(TelemetryCounters.standingProjectionBatch, 1, attributes);
    this.telemetry.recordDuration(TelemetryDurations.standingProjectionBatch, elapsedMs, attributes);
    this.telemetry.recordEvent(TelemetryEvents.standingProjectionBatchFailed, attributes);
  }

  /**
   * Stop scheduling, wait for any in-flight batch to finish, then close the DB pool. Idempotent: a
   * second call awaits the same in-flight batch and returns.
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
