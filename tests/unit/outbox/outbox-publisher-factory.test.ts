import { describe, it, expect } from 'vitest';
import { createOutboxPublisher } from '../../../src/governance/outbox/OutboxPublisherFactory.js';
import {
  AzureServiceBusPublisher,
  type ServiceBusClientLike,
  type ServiceBusMessageLike,
  type ServiceBusSenderLike,
} from '../../../src/governance/outbox/AzureServiceBusPublisher.js';
import { NoopServiceBusPublisher } from '../../../src/governance/outbox/OutboxPublisher.js';
import { InMemoryOutboxStore } from '../../../src/governance/outbox/InMemoryOutboxStore.js';
import { OutboxWorker } from '../../../src/workers/outbox/OutboxWorker.js';
import type { AppConfig, ServiceBusConfig } from '../../../src/config/index.js';
import { fixedClock } from '../../../src/shared/time/clock.js';
import { sequentialIds } from '../../helpers/affiliationKernel.js';

/**
 * Unit tests for the outbox publisher factory.
 *
 * The factory selects Noop vs. Azure from config. The real Azure client is injected as a
 * fake so no vendor SDK is loaded and no secrets are needed.
 */

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
  readonly createdFor: string[] = [];
  createSender(entityName: string): ServiceBusSenderLike {
    this.createdFor.push(entityName);
    return this.sender;
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

function makeConfig(serviceBus: ServiceBusConfig): AppConfig {
  return {
    appEnv: 'local',
    appRegion: 'canada',
    logLevel: 'info',
    databaseUrl: '',
    serviceBus,
    outbox: { batchSize: 25, lockSeconds: 120, baseDelayMs: 1000, maxDelayMs: 300_000, maxRetries: 10 },
    api: { host: '127.0.0.1', port: 3000 },
  };
}

const DISABLED: ServiceBusConfig = {
  enabled: false,
  connectionString: '',
  publishTarget: 'queue',
  queueName: '',
  topicName: '',
};

describe('createOutboxPublisher', () => {
  // (12) Disabled config yields the no-op publisher and never builds a client.
  it('returns the Noop publisher when Service Bus is disabled', () => {
    let built = 0;
    const publisher = createOutboxPublisher(makeConfig(DISABLED), {
      createClient: () => {
        built += 1;
        return new FakeClient();
      },
    });
    expect(publisher).toBeInstanceOf(NoopServiceBusPublisher);
    expect(built).toBe(0);
  });

  // (13) Enabled queue config yields the Azure publisher bound to the queue.
  it('returns the Azure publisher targeting the queue when enabled', () => {
    const client = new FakeClient();
    const publisher = createOutboxPublisher(
      makeConfig({
        enabled: true,
        connectionString: 'Endpoint=sb://x/;SharedAccessKey=k',
        publishTarget: 'queue',
        queueName: 'outbox-q',
        topicName: '',
      }),
      { createClient: () => client },
    );
    expect(publisher).toBeInstanceOf(AzureServiceBusPublisher);
  });

  it('targets the topic when publishTarget is topic', () => {
    const client = new FakeClient();
    const publisher = createOutboxPublisher(
      makeConfig({
        enabled: true,
        connectionString: 'Endpoint=sb://x/;SharedAccessKey=k',
        publishTarget: 'topic',
        queueName: '',
        topicName: 'outbox-t',
      }),
      { createClient: () => client },
    );
    expect(publisher).toBeInstanceOf(AzureServiceBusPublisher);
    // Lazily creates the sender on first publish; force it.
    return (publisher as AzureServiceBusPublisher)
      .publish({ messageId: 'm', messageType: 'X.y', tenantId: 't', body: {} })
      .then(() => {
        expect(client.createdFor).toEqual(['outbox-t']);
      });
  });

  it('passes the connection string to the client factory exactly once', () => {
    const seen: string[] = [];
    createOutboxPublisher(
      makeConfig({
        enabled: true,
        connectionString: 'Endpoint=sb://x/;SharedAccessKey=secret',
        publishTarget: 'queue',
        queueName: 'outbox-q',
        topicName: '',
      }),
      {
        createClient: (cs) => {
          seen.push(cs);
          return new FakeClient();
        },
      },
    );
    expect(seen).toEqual(['Endpoint=sb://x/;SharedAccessKey=secret']);
  });
});

describe('OutboxWorker with the Azure publisher fake', () => {
  // (14) The worker uses the Azure publisher with unchanged semantics.
  it('publishes a claimed row and marks it processed', async () => {
    const client = new FakeClient();
    const publisher = createOutboxPublisher(
      makeConfig({
        enabled: true,
        connectionString: 'Endpoint=sb://x/;SharedAccessKey=k',
        publishTarget: 'queue',
        queueName: 'outbox-q',
        topicName: '',
      }),
      { createClient: () => client },
    );

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

    const worker = new OutboxWorker(
      store,
      publisher,
      { batchSize: 10, lockSeconds: 30, baseDelayMs: 1000, maxDelayMs: 60_000, maxRetries: 3 },
      { workerId: 'w1' },
    );

    const summary = await worker.processBatch();
    expect(summary.published).toBe(1);
    expect((await store.get(id))!.status).toBe('processed');

    // The fake broker received exactly one correctly-mapped message.
    expect(client.sender.sent).toHaveLength(1);
    const msg = client.sender.sent[0]!;
    expect(msg.messageId).toBe('AffiliationApplication:app-1:k1');
    expect(msg.contentType).toBe('application/json');
    expect(msg.applicationProperties!.tenantId).toBe('t-1');
    expect(msg.applicationProperties!.causationId).toBe('st-1');
  });
});
