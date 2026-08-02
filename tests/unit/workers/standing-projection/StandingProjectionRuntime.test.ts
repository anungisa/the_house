import { describe, it, expect } from 'vitest';
import { setTimeout } from 'node:timers';
import {
  StandingProjectionRuntime,
  type IntervalHandle,
  type StandingProjectionRunnable,
  type StandingProjectionRuntimeConfig,
} from '../../../../src/workers/standing-projection/StandingProjectionRuntime.js';
import type { StandingProjectionBatchSummary } from '../../../../src/domains/affiliation-standing/orchestration/StandingProjectionWorker.js';
import { TelemetryCounters, TelemetryEvents } from '../../../../src/observability/index.js';
import type { Telemetry } from '../../../../src/observability/index.js';

const EMPTY: StandingProjectionBatchSummary = {
  claimed: 0,
  projected: 0,
  governedFailures: 0,
  retries: 0,
  exhausted: 0,
};

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeWorker implements StandingProjectionRunnable {
  calls = 0;
  constructor(
    private readonly impl: () => Promise<StandingProjectionBatchSummary> = () => Promise.resolve(EMPTY),
  ) {}
  processBatch(): Promise<StandingProjectionBatchSummary> {
    this.calls += 1;
    return this.impl();
  }
}

/** Fake interval scheduler: captures the handler so tests can drive ticks deterministically. */
function fakeTimer() {
  let handler: (() => void) | undefined;
  const cleared: IntervalHandle[] = [];
  let intervalArg = -1;
  const handle = 1 as unknown as IntervalHandle;
  return {
    setIntervalFn: (h: () => void, ms: number): IntervalHandle => {
      handler = h;
      intervalArg = ms;
      return handle;
    },
    clearIntervalFn: (hd: IntervalHandle): void => {
      cleared.push(hd);
    },
    tick: (): void => handler?.(),
    cleared,
    get intervalArg(): number {
      return intervalArg;
    },
    handle,
  };
}

/** Recording telemetry double: captures counters and events for assertions. */
function fakeTelemetry() {
  const counters: Array<{ name: string; value: number }> = [];
  const durations: Array<{ name: string; value: number }> = [];
  const events: string[] = [];
  const telemetry: Telemetry = {
    incrementCounter: (name, value = 1) => {
      counters.push({ name, value });
    },
    recordDuration: (name, value) => {
      durations.push({ name, value });
    },
    recordEvent: (name) => {
      events.push(name);
    },
  };
  const counterTotal = (name: string): number =>
    counters.filter((c) => c.name === name).reduce((sum, c) => sum + c.value, 0);
  return { telemetry, counters, durations, events, counterTotal };
}

function makeRuntimeConfig(
  over: Partial<StandingProjectionRuntimeConfig> = {},
): StandingProjectionRuntimeConfig {
  return {
    intervalMs: 5000,
    runOnce: false,
    workerId: 'test-standing-projection-worker',
    batchSize: 25,
    ...over,
  };
}

describe('StandingProjectionRuntime', () => {
  // (1) run-once mode calls processBatch exactly once and closes the pool.
  it('run-once mode processes a single batch then shuts down and closes the pool', async () => {
    const worker = new FakeWorker();
    const timer = fakeTimer();
    const closed: string[] = [];
    const runtime = new StandingProjectionRuntime({
      worker,
      config: makeRuntimeConfig({ runOnce: true }),
      log: () => {},
      closePool: async () => {
        closed.push('pool');
      },
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    });

    await runtime.start();

    expect(worker.calls).toBe(1);
    expect(timer.intervalArg).toBe(-1); // never scheduled an interval
    expect(closed).toEqual(['pool']);
    expect(runtime.health().ready).toBe(false); // shut down after the single batch
  });

  // (2) continuous mode schedules repeated processBatch calls.
  it('continuous mode runs a batch on each tick', async () => {
    const worker = new FakeWorker();
    const timer = fakeTimer();
    const runtime = new StandingProjectionRuntime({
      worker,
      config: makeRuntimeConfig({ intervalMs: 1234 }),
      log: () => {},
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    });

    await runtime.start();
    expect(timer.intervalArg).toBe(1234);

    timer.tick();
    await flush();
    timer.tick();
    await flush();
    timer.tick();
    await flush();

    expect(worker.calls).toBe(3);
  });

  // (3) an overlapping tick is skipped while a batch is still running.
  it('skips a tick when a previous batch is still in flight', async () => {
    const d = deferred<StandingProjectionBatchSummary>();
    let first = true;
    const worker = new FakeWorker(() => {
      if (first) {
        first = false;
        return d.promise;
      }
      return Promise.resolve(EMPTY);
    });
    const timer = fakeTimer();
    const logs: string[] = [];
    const runtime = new StandingProjectionRuntime({
      worker,
      config: makeRuntimeConfig(),
      log: (m) => logs.push(m),
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    });

    await runtime.start();
    timer.tick(); // starts the long-running batch
    timer.tick(); // should be skipped

    expect(worker.calls).toBe(1);
    expect(logs.some((l) => /skipping tick/.test(l))).toBe(true);

    d.resolve(EMPTY);
    await flush();
    expect(worker.calls).toBe(1);
  });

  // (4) a per-batch error is handled and continuous mode keeps running.
  it('handles a batch error and stays alive', async () => {
    let n = 0;
    const worker = new FakeWorker(() => {
      n += 1;
      return n === 1 ? Promise.reject(new Error('transient boom')) : Promise.resolve(EMPTY);
    });
    const timer = fakeTimer();
    const errors: string[] = [];
    const runtime = new StandingProjectionRuntime({
      worker,
      config: makeRuntimeConfig(),
      log: () => {},
      onError: (m) => errors.push(m),
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    });

    await runtime.start();
    timer.tick();
    await flush();
    timer.tick();
    await flush();

    expect(worker.calls).toBe(2); // survived the first failure
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/operational error/);
    expect(runtime.health().lastError).toBe('transient boom');
    expect(runtime.health().totals.batchFailures).toBe(1);
  });

  // (5) shutdown stops future ticks.
  it('stops scheduling and ignores ticks after shutdown', async () => {
    const worker = new FakeWorker();
    const timer = fakeTimer();
    const runtime = new StandingProjectionRuntime({
      worker,
      config: makeRuntimeConfig(),
      log: () => {},
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    });

    await runtime.start();
    timer.tick();
    await flush();
    expect(worker.calls).toBe(1);

    await runtime.shutdown();
    expect(timer.cleared).toEqual([timer.handle]);

    timer.tick(); // fake still has the handler; the runtime guard must ignore it
    await flush();
    expect(worker.calls).toBe(1);
  });

  // (6) shutdown waits for the in-flight batch before closing the pool.
  it('waits for an in-flight batch before closing the pool', async () => {
    const d = deferred<StandingProjectionBatchSummary>();
    let first = true;
    const worker = new FakeWorker(() => {
      if (first) {
        first = false;
        return d.promise;
      }
      return Promise.resolve(EMPTY);
    });
    const timer = fakeTimer();
    const order: string[] = [];
    const runtime = new StandingProjectionRuntime({
      worker,
      config: makeRuntimeConfig(),
      log: () => {},
      closePool: async () => {
        order.push('pool-closed');
      },
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    });

    await runtime.start();
    timer.tick(); // batch in flight (pending)

    const shutdownPromise = runtime.shutdown();
    await flush();
    expect(order).toEqual([]); // still waiting on the in-flight batch

    d.resolve(EMPTY);
    await shutdownPromise;
    expect(order).toEqual(['pool-closed']);
  });

  it('shutdown is idempotent', async () => {
    const worker = new FakeWorker();
    const timer = fakeTimer();
    let closes = 0;
    const runtime = new StandingProjectionRuntime({
      worker,
      config: makeRuntimeConfig(),
      log: () => {},
      closePool: async () => {
        closes += 1;
      },
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    });

    await runtime.start();
    await runtime.shutdown();
    await runtime.shutdown();
    expect(closes).toBe(1);
  });

  // (7) health snapshot reflects totals across batches.
  it('exposes a health snapshot with running totals', async () => {
    const worker = new FakeWorker(() =>
      Promise.resolve({ claimed: 3, projected: 2, governedFailures: 1, retries: 1, exhausted: 0 }),
    );
    const timer = fakeTimer();
    let clock = 1_000;
    const runtime = new StandingProjectionRuntime({
      worker,
      config: makeRuntimeConfig(),
      log: () => {},
      now: () => clock,
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    });

    await runtime.start();
    expect(runtime.health().ready).toBe(true);
    expect(runtime.health().lastBatchAtMs).toBeUndefined();

    clock = 2_000;
    timer.tick();
    await flush();

    const h = runtime.health();
    expect(h.lastBatchAtMs).toBe(2_000);
    expect(h.totals).toEqual({
      batches: 1,
      batchFailures: 0,
      claimed: 3,
      projected: 2,
      governedFailures: 1,
      retries: 1,
      exhausted: 0,
    });
  });

  // (8) telemetry is emitted for a completed batch (visibility only).
  it('emits batch/projected/governed-failure/retry/exhaustion metrics for a batch', async () => {
    const worker = new FakeWorker(() =>
      Promise.resolve({ claimed: 5, projected: 3, governedFailures: 1, retries: 2, exhausted: 1 }),
    );
    const timer = fakeTimer();
    const t = fakeTelemetry();
    const runtime = new StandingProjectionRuntime({
      worker,
      config: makeRuntimeConfig(),
      log: () => {},
      telemetry: t.telemetry,
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    });

    await runtime.start();
    timer.tick();
    await flush();

    expect(t.counterTotal(TelemetryCounters.standingProjectionBatch)).toBe(1);
    expect(t.counterTotal(TelemetryCounters.standingProjectionProjected)).toBe(3);
    expect(t.counterTotal(TelemetryCounters.standingProjectionGovernedFailure)).toBe(1);
    expect(t.counterTotal(TelemetryCounters.standingProjectionRetry)).toBe(2);
    expect(t.counterTotal(TelemetryCounters.standingProjectionExhausted)).toBe(1);
    expect(t.events).toContain(TelemetryEvents.standingProjectionBatchCompleted);
  });

  // (9) a batch failure emits the failed event but not the projected counter.
  it('emits a batch-failed event when the batch throws', async () => {
    const worker = new FakeWorker(() => Promise.reject(new Error('kaboom')));
    const timer = fakeTimer();
    const t = fakeTelemetry();
    const runtime = new StandingProjectionRuntime({
      worker,
      config: makeRuntimeConfig(),
      log: () => {},
      onError: () => {},
      telemetry: t.telemetry,
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    });

    await runtime.start();
    timer.tick();
    await flush();

    expect(t.counterTotal(TelemetryCounters.standingProjectionBatch)).toBe(1);
    expect(t.counterTotal(TelemetryCounters.standingProjectionProjected)).toBe(0);
    expect(t.events).toContain(TelemetryEvents.standingProjectionBatchFailed);
    expect(t.events).not.toContain(TelemetryEvents.standingProjectionBatchCompleted);
  });

  // (10) start is idempotent — a second call does not schedule a second interval.
  it('start is idempotent', async () => {
    const worker = new FakeWorker();
    const timer = fakeTimer();
    let intervals = 0;
    const runtime = new StandingProjectionRuntime({
      worker,
      config: makeRuntimeConfig(),
      log: () => {},
      setIntervalFn: (h, ms) => {
        intervals += 1;
        return timer.setIntervalFn(h, ms);
      },
      clearIntervalFn: timer.clearIntervalFn,
    });

    await runtime.start();
    await runtime.start();
    expect(intervals).toBe(1);
  });
});
