import { describe, it, expect } from 'vitest';
import { OutboxWorker } from '../../../src/workers/outbox/OutboxWorker.js';
import { InMemoryOutboxStore } from '../../../src/governance/outbox/InMemoryOutboxStore.js';
import {
  V1_SERVICE_BUS_USES_SESSIONS,
  type OutboxPublisher,
} from '../../../src/governance/outbox/OutboxPublisher.js';
import type {
  PublishResult,
  PublishableMessage,
} from '../../../src/governance/outbox/OutboxTypes.js';
import { fixedClock } from '../../../src/shared/time/clock.js';
import { sequentialIds } from '../../helpers/affiliationKernel.js';

const CONFIG = {
  batchSize: 10,
  lockSeconds: 30,
  baseDelayMs: 1000,
  maxDelayMs: 60_000,
  maxRetries: 3,
};

class CollectingPublisher implements OutboxPublisher {
  public readonly seen: PublishableMessage[] = [];
  constructor(private readonly result: (m: PublishableMessage) => PublishResult) {}
  publish(message: PublishableMessage): Promise<PublishResult> {
    this.seen.push(message);
    return Promise.resolve(this.result(message));
  }
}

function makeStore(now = 1_700_000_000_000): InMemoryOutboxStore {
  return new InMemoryOutboxStore(fixedClock(now), sequentialIds('obx'));
}

describe('OutboxWorker.processBatch', () => {
  it('publishes a pending message with MessageId = dedupeKey and marks it processed', async () => {
    const store = makeStore();
    const id = await store.enqueue({
      tenantId: 't1',
      messageType: 'AffiliationApplication.submit',
      payload: { hello: 'world' },
      dedupeKey: 'AffiliationApplication:app-1:k1',
      correlationId: 'corr-1',
      causationId: 'st-1',
      maxRetries: 3,
    });

    const publisher = new CollectingPublisher(() => ({ published: true }));
    const worker = new OutboxWorker(store, publisher, CONFIG, { workerId: 'w1' });

    const summary = await worker.processBatch();
    expect(summary.published).toBe(1);
    expect(publisher.seen[0]!.messageId).toBe('AffiliationApplication:app-1:k1');
    expect(publisher.seen[0]!.correlationId).toBe('corr-1');
    expect(publisher.seen[0]!.causationId).toBe('st-1');

    const row = await store.get(id);
    expect(row!.status).toBe('processed');
  });

  it('reschedules with backoff on transient failure, then succeeds', async () => {
    const store = makeStore();
    const id = await store.enqueue({
      tenantId: 't1',
      messageType: 'x',
      payload: {},
      dedupeKey: 'd1',
      maxRetries: 3,
    });

    let attempt = 0;
    const publisher = new CollectingPublisher(() => {
      attempt += 1;
      return attempt === 1
        ? { published: false, transient: true, errorMessage: 'temporary' }
        : { published: true };
    });
    // Deterministic jitter so next_attempt_at is predictable.
    const worker = new OutboxWorker(store, publisher, CONFIG, {
      workerId: 'w1',
      random: () => 0.5,
    });

    const first = await worker.processBatch();
    expect(first.rescheduled).toBe(1);
    let row = await store.get(id);
    expect(row!.status).toBe('pending');
    expect(row!.retryCount).toBe(1);
    // next_attempt_at is in the future, so it won't be claimed immediately.
    expect(row!.nextAttemptAt).toBeGreaterThan(row!.createdAt);

    // Make it eligible again, then process: should publish.
    row = await store.get(id);
    // Force eligibility by rescheduling to now via a fresh worker with the same store but
    // a clock that is past nextAttemptAt.
    const futureStore = new InMemoryOutboxStore(
      fixedClock(row!.nextAttemptAt + 1),
      sequentialIds('obx'),
      store.records,
    );
    const worker2 = new OutboxWorker(futureStore, publisher, CONFIG, { workerId: 'w1' });
    const second = await worker2.processBatch();
    expect(second.published).toBe(1);
    expect((await futureStore.get(id))!.status).toBe('processed');
  });

  it('marks failed after exceeding max retries', async () => {
    const store = makeStore();
    const id = await store.enqueue({
      tenantId: 't1',
      messageType: 'x',
      payload: {},
      dedupeKey: 'd1',
      maxRetries: 3,
    });
    // Pre-set retryCount to the max so the next transient failure fails permanently.
    store.records[0]!.retryCount = CONFIG.maxRetries;

    const publisher = new CollectingPublisher(() => ({
      published: false,
      transient: true,
      errorMessage: 'still failing',
    }));
    const worker = new OutboxWorker(store, publisher, CONFIG, { workerId: 'w1' });

    const summary = await worker.processBatch();
    expect(summary.failed).toBe(1);
    const row = await store.get(id);
    expect(row!.status).toBe('failed');
    expect(store.records[0]!.error).toBe('still failing');
  });

  it('marks failed immediately on a permanent (non-transient) failure', async () => {
    const store = makeStore();
    const id = await store.enqueue({
      tenantId: 't1',
      messageType: 'x',
      payload: {},
      dedupeKey: 'd1',
      maxRetries: 3,
    });
    const publisher = new CollectingPublisher(() => ({
      published: false,
      transient: false,
      errorMessage: 'permanent',
    }));
    const worker = new OutboxWorker(store, publisher, CONFIG, { workerId: 'w1' });

    await worker.processBatch();
    expect((await store.get(id))!.status).toBe('failed');
  });

  it('claim is concurrency-safe: two workers do not double-process the same row', async () => {
    const store = makeStore();
    await store.enqueue({
      tenantId: 't1',
      messageType: 'x',
      payload: {},
      dedupeKey: 'd1',
      maxRetries: 3,
    });

    const publisher = new CollectingPublisher(() => ({ published: true }));
    const a = new OutboxWorker(store, publisher, CONFIG, { workerId: 'A' });
    const b = new OutboxWorker(store, publisher, CONFIG, { workerId: 'B' });

    const [sa, sb] = await Promise.all([a.processBatch(), b.processBatch()]);
    // Exactly one worker published the single row.
    expect(sa.published + sb.published).toBe(1);
    expect(publisher.seen).toHaveLength(1);
  });

  it('recovers an expired processing lease so the row becomes claimable again', async () => {
    const store = makeStore(1000);
    await store.enqueue({
      tenantId: 't1',
      messageType: 'x',
      payload: {},
      dedupeKey: 'd1',
      maxRetries: 3,
    });
    // Claim it, simulating a crashed worker that never marked it processed.
    await store.claimBatch('dead-worker', 10, 5000); // locked_until = 1000 + 5000 = 6000
    expect(store.records[0]!.status).toBe('processing');

    // A later worker (clock past the lease) recovers and processes the row.
    const futureStore = new InMemoryOutboxStore(fixedClock(20_000), sequentialIds('obx'), store.records);
    const publisher = new CollectingPublisher(() => ({ published: true }));
    const worker = new OutboxWorker(futureStore, publisher, CONFIG, { workerId: 'w-live' });

    const summary = await worker.processBatch();
    expect(summary.recoveredLeases).toBe(1);
    expect(summary.published).toBe(1);
  });
});

describe('v1 Service Bus invariants', () => {
  it('does NOT enable Service Bus sessions in v1', () => {
    expect(V1_SERVICE_BUS_USES_SESSIONS).toBe(false);
  });
});
