import { describe, it, expect } from 'vitest';
import { setTimeout } from 'node:timers';
import {
  OutboxWorkerRuntime,
  type IntervalHandle,
  type OutboxWorkerRunnable,
  type OutboxWorkerRuntimeConfig,
} from '../../../src/workers/outbox/OutboxWorkerRuntime.js';
import type { ProcessBatchSummary } from '../../../src/workers/outbox/OutboxWorker.js';
import { OutboxWorker } from '../../../src/workers/outbox/OutboxWorker.js';
import { InMemoryOutboxStore } from '../../../src/governance/outbox/InMemoryOutboxStore.js';
import { createOutboxPublisher } from '../../../src/governance/outbox/OutboxPublisherFactory.js';
import {
  type ServiceBusClientLike,
  type ServiceBusMessageLike,
  type ServiceBusSenderLike,
} from '../../../src/governance/outbox/AzureServiceBusPublisher.js';
import type { AppConfig, ServiceBusConfig } from '../../../src/config/index.js';
import { fixedClock } from '../../../src/shared/time/clock.js';
import { sequentialIds } from '../../helpers/affiliationKernel.js';

const SUMMARY: ProcessBatchSummary = {
  claimed: 0,
  published: 0,
  rescheduled: 0,
  failed: 0,
  recoveredLeases: 0,
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

class FakeWorker implements OutboxWorkerRunnable {
  calls = 0;
  constructor(private readonly impl: () => Promise<ProcessBatchSummary> = () => Promise.resolve(SUMMARY)) {}
  processBatch(): Promise<ProcessBatchSummary> {
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

function makeRuntimeConfig(over: Partial<OutboxWorkerRuntimeConfig> = {}): OutboxWorkerRuntimeConfig {
  return {
    intervalMs: 5000,
    runOnce: false,
    workerId: 'test-worker',
    batchSize: 25,
    lockSeconds: 60,
    serviceBusEnabled: false,
    ...over,
  };
}

describe('OutboxWorkerRuntime', () => {
  // (1) run-once mode calls processBatch exactly once and closes resources.
  it('run-once mode processes a single batch then shuts down', async () => {
    const worker = new FakeWorker();
    const timer = fakeTimer();
    const closed: string[] = [];
    const runtime = new OutboxWorkerRuntime({
      worker,
      config: makeRuntimeConfig({ runOnce: true }),
      log: () => {},
      closePublisher: async () => {
        closed.push('publisher');
      },
      closePool: async () => {
        closed.push('pool');
      },
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    });

    await runtime.start();

    expect(worker.calls).toBe(1);
    expect(timer.intervalArg).toBe(-1); // never scheduled an interval
    expect(closed).toEqual(['publisher', 'pool']); // publisher closed before pool
  });

  // (2) continuous mode schedules repeated processBatch calls.
  it('continuous mode runs a batch on each tick', async () => {
    const worker = new FakeWorker();
    const timer = fakeTimer();
    const runtime = new OutboxWorkerRuntime({
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
    const d = deferred<ProcessBatchSummary>();
    let first = true;
    const worker = new FakeWorker(() => {
      if (first) {
        first = false;
        return d.promise;
      }
      return Promise.resolve(SUMMARY);
    });
    const timer = fakeTimer();
    const logs: string[] = [];
    const runtime = new OutboxWorkerRuntime({
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

    d.resolve(SUMMARY);
    await flush();
    expect(worker.calls).toBe(1);
  });

  // (4) a per-batch error is handled and continuous mode keeps running.
  it('handles a batch error and stays alive', async () => {
    let n = 0;
    const worker = new FakeWorker(() => {
      n += 1;
      return n === 1 ? Promise.reject(new Error('transient boom')) : Promise.resolve(SUMMARY);
    });
    const timer = fakeTimer();
    const errors: string[] = [];
    const runtime = new OutboxWorkerRuntime({
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
  });

  // (5) shutdown stops future ticks.
  it('stops scheduling and ignores ticks after shutdown', async () => {
    const worker = new FakeWorker();
    const timer = fakeTimer();
    const runtime = new OutboxWorkerRuntime({
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

  // (6) shutdown waits for the in-flight batch before closing resources.
  it('waits for an in-flight batch before closing resources', async () => {
    const d = deferred<ProcessBatchSummary>();
    let first = true;
    const worker = new FakeWorker(() => {
      if (first) {
        first = false;
        return d.promise;
      }
      return Promise.resolve(SUMMARY);
    });
    const timer = fakeTimer();
    const order: string[] = [];
    const runtime = new OutboxWorkerRuntime({
      worker,
      config: makeRuntimeConfig(),
      log: () => {},
      closePublisher: async () => {
        order.push('publisher-closed');
      },
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    });

    await runtime.start();
    timer.tick(); // batch in flight (pending)

    const shutdownPromise = runtime.shutdown();
    await flush();
    expect(order).toEqual([]); // still waiting on the in-flight batch

    d.resolve(SUMMARY);
    await shutdownPromise;
    expect(order).toEqual(['publisher-closed']);
  });

  // (7) a closeable publisher/client is closed on shutdown.
  it('closes the publisher and pool on shutdown', async () => {
    const worker = new FakeWorker();
    const timer = fakeTimer();
    const order: string[] = [];
    const runtime = new OutboxWorkerRuntime({
      worker,
      config: makeRuntimeConfig(),
      log: () => {},
      closePublisher: async () => {
        order.push('publisher');
      },
      closePool: async () => {
        order.push('pool');
      },
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    });

    await runtime.start();
    await runtime.shutdown();
    expect(order).toEqual(['publisher', 'pool']);
  });

  it('shutdown is idempotent', async () => {
    const worker = new FakeWorker();
    const timer = fakeTimer();
    let closes = 0;
    const runtime = new OutboxWorkerRuntime({
      worker,
      config: makeRuntimeConfig(),
      log: () => {},
      closePublisher: async () => {
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
});

// --- Integration-ish: runtime + real OutboxWorker + factory (no Azure, no Postgres) ---

function makeConfig(serviceBus: ServiceBusConfig): AppConfig {
  return {
    appEnv: 'local',
    appRegion: 'canada',
    logLevel: 'info',
    databaseUrl: '',
    serviceBus,
    outbox: { batchSize: 25, lockSeconds: 60, baseDelayMs: 1000, maxDelayMs: 300_000, maxRetries: 10 },
    api: { host: '127.0.0.1', port: 3000 },
    outboxWorker: {
      enabled: true,
      intervalMs: 5000,
      batchSize: 25,
      workerId: 'test-worker',
      lockSeconds: 60,
      runOnce: true,
    },
    auth: { mode: 'demo' },
    evidenceStorage: { provider: 'memory', connectionString: '', containerName: '', requireHash: true, uploadMaxBytes: 10_485_760 },
    evidenceMalwareScanning: { mode: 'disabled', required: false, testSignaturesEnabled: false },
    evidenceQuarantine: { enabled: true, includeEventIdInResponse: true },
  };
}

class FakeSender implements ServiceBusSenderLike {
  readonly sent: ServiceBusMessageLike[] = [];
  sendMessages(message: ServiceBusMessageLike): Promise<unknown> {
    this.sent.push(message);
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeClient implements ServiceBusClientLike {
  readonly sender = new FakeSender();
  createSender(): ServiceBusSenderLike {
    return this.sender;
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

function buildWorker(store: InMemoryOutboxStore, config: AppConfig, deps?: { createClient?: () => FakeClient }) {
  const publisher = createOutboxPublisher(
    config,
    deps?.createClient ? { createClient: deps.createClient } : {},
  );
  const worker = new OutboxWorker(
    store,
    publisher,
    {
      batchSize: config.outboxWorker.batchSize,
      lockSeconds: config.outboxWorker.lockSeconds,
      baseDelayMs: config.outbox.baseDelayMs,
      maxDelayMs: config.outbox.maxDelayMs,
      maxRetries: config.outbox.maxRetries,
    },
    { workerId: config.outboxWorker.workerId },
  );
  return { worker, publisher };
}

describe('OutboxWorkerRuntime with the real worker + publisher factory', () => {
  // (14) Service Bus disabled: an empty run-once drain works with no connection string.
  it('runs run-once with Service Bus disabled and no connection string', async () => {
    const store = new InMemoryOutboxStore(fixedClock(1_700_000_000_000), sequentialIds('obx'));
    const config = makeConfig({
      enabled: false,
      connectionString: '',
      publishTarget: 'queue',
      queueName: '',
      topicName: '',
    });
    const { worker } = buildWorker(store, config);

    let errored = false;
    const runtime = new OutboxWorkerRuntime({
      worker,
      config: { ...config.outboxWorker, serviceBusEnabled: false },
      log: () => {},
      onError: () => {
        errored = true;
      },
    });

    await runtime.start(); // run-once, empty store → nothing claimed, no publish, no error
    expect(errored).toBe(false);
  });

  // (15) Service Bus enabled: drains one row through the factory publisher using a fake client.
  it('drains a queued row through the Azure publisher fake (no Azure contacted)', async () => {
    const store = new InMemoryOutboxStore(fixedClock(1_700_000_000_000), sequentialIds('obx'));
    const id = await store.enqueue({
      tenantId: 't-1',
      messageType: 'AffiliationApplication.submit',
      payload: { hello: 'world' },
      dedupeKey: 'AffiliationApplication:app-1:k1',
      correlationId: 'corr-1',
      causationId: 'st-1',
      maxRetries: 3,
    });

    const client = new FakeClient();
    const config = makeConfig({
      enabled: true,
      connectionString: 'Endpoint=sb://x/;SharedAccessKey=k',
      publishTarget: 'queue',
      queueName: 'outbox-q',
      topicName: '',
    });
    const { worker } = buildWorker(store, config, { createClient: () => client });

    const runtime = new OutboxWorkerRuntime({
      worker,
      config: { ...config.outboxWorker, serviceBusEnabled: true },
      log: () => {},
    });

    await runtime.start(); // run-once: claim 1 → publish via fake → mark processed

    expect(client.sender.sent).toHaveLength(1);
    expect(client.sender.sent[0]!.messageId).toBe('AffiliationApplication:app-1:k1');
    expect((await store.get(id))!.status).toBe('processed');
  });
});
