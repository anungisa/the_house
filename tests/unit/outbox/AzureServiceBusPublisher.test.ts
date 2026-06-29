import { describe, it, expect } from 'vitest';
import {
  AzureServiceBusPublisher,
  type ServiceBusClientLike,
  type ServiceBusMessageLike,
  type ServiceBusSenderLike,
} from '../../../src/governance/outbox/AzureServiceBusPublisher.js';
import type { PublishableMessage } from '../../../src/governance/outbox/OutboxTypes.js';

/**
 * Unit tests for the AzureServiceBusPublisher.
 *
 * The vendor SDK is replaced by a fake client/sender, so these tests never connect to Azure
 * and require no secrets. They assert the message mapping, stable MessageId, content type,
 * applicationProperties, controlled failure handling, and resource close.
 */

class FakeSender implements ServiceBusSenderLike {
  readonly sent: ServiceBusMessageLike[] = [];
  closed = 0;
  constructor(private readonly onSend?: (m: ServiceBusMessageLike) => void) {}
  sendMessages(message: ServiceBusMessageLike): Promise<unknown> {
    this.onSend?.(message);
    this.sent.push(message);
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed += 1;
    return Promise.resolve();
  }
}

class FakeClient implements ServiceBusClientLike {
  readonly senders: FakeSender[] = [];
  readonly createdFor: string[] = [];
  closed = 0;
  constructor(private readonly senderFactory: () => FakeSender = () => new FakeSender()) {}
  createSender(entityName: string): ServiceBusSenderLike {
    this.createdFor.push(entityName);
    const sender = this.senderFactory();
    this.senders.push(sender);
    return sender;
  }
  close(): Promise<void> {
    this.closed += 1;
    return Promise.resolve();
  }
}

function makeMessage(over: Partial<PublishableMessage> = {}): PublishableMessage {
  return {
    messageId: 'AffiliationApplication:app-1:k1',
    messageType: 'AffiliationApplication.submit',
    tenantId: 't-1',
    body: { hello: 'world' },
    correlationId: 'corr-1',
    causationId: 'st-1',
    dedupeKey: 'AffiliationApplication:app-1:k1',
    createdAt: 0,
    attempt: 0,
    ...over,
  };
}

describe('AzureServiceBusPublisher', () => {
  // (6) Body maps through unchanged.
  it('maps the message body unchanged', async () => {
    const client = new FakeClient();
    const publisher = new AzureServiceBusPublisher({ client, entityName: 'outbox-q' });
    await publisher.publish(makeMessage({ body: { a: 1, b: 'two' } }));
    expect(client.senders[0]!.sent[0]!.body).toEqual({ a: 1, b: 'two' });
  });

  // (7) Stable MessageId from the message id (dedupeKey or outbox id).
  it('sets a stable MessageId from the message id', async () => {
    const client = new FakeClient();
    const publisher = new AzureServiceBusPublisher({ client, entityName: 'outbox-q' });
    await publisher.publish(makeMessage({ messageId: 'stable-id-123' }));
    expect(client.senders[0]!.sent[0]!.messageId).toBe('stable-id-123');
  });

  // (8) applicationProperties carry generic routing/observability metadata.
  it('sets applicationProperties from the message', async () => {
    const client = new FakeClient();
    const publisher = new AzureServiceBusPublisher({ client, entityName: 'outbox-q' });
    await publisher.publish(
      makeMessage({ tenantId: 't-9', createdAt: 1_700_000_000_000, attempt: 2 }),
    );
    const props = client.senders[0]!.sent[0]!.applicationProperties!;
    expect(props.outboxMessageId).toBe('AffiliationApplication:app-1:k1');
    expect(props.eventType).toBe('AffiliationApplication.submit');
    expect(props.tenantId).toBe('t-9');
    expect(props.correlationId).toBe('corr-1');
    expect(props.causationId).toBe('st-1');
    expect(props.dedupeKey).toBe('AffiliationApplication:app-1:k1');
    expect(props.createdAt).toBe('2023-11-14T22:13:20.000Z');
    expect(props.attempt).toBe(2);
  });

  it('omits optional applicationProperties that are absent', async () => {
    const client = new FakeClient();
    const publisher = new AzureServiceBusPublisher({ client, entityName: 'outbox-q' });
    await publisher.publish({
      messageId: 'm1',
      messageType: 'X.y',
      tenantId: 't-1',
      body: {},
    });
    const props = client.senders[0]!.sent[0]!.applicationProperties!;
    expect(props.correlationId).toBeUndefined();
    expect(props.causationId).toBeUndefined();
    expect(props.dedupeKey).toBeUndefined();
    expect(props.createdAt).toBeUndefined();
    expect(props.attempt).toBeUndefined();
  });

  // (9) Content type is application/json.
  it('sets contentType application/json and subject = event type', async () => {
    const client = new FakeClient();
    const publisher = new AzureServiceBusPublisher({ client, entityName: 'outbox-q' });
    await publisher.publish(makeMessage());
    const msg = client.senders[0]!.sent[0]!;
    expect(msg.contentType).toBe('application/json');
    expect(msg.subject).toBe('AffiliationApplication.submit');
  });

  // v1 invariant: sessions are never used — no SessionId is set on the message.
  it('never sets a Service Bus SessionId (sessions off in v1)', async () => {
    const client = new FakeClient();
    const publisher = new AzureServiceBusPublisher({ client, entityName: 'outbox-q' });
    await publisher.publish(makeMessage());
    const msg = client.senders[0]!.sent[0]! as unknown as Record<string, unknown>;
    expect('sessionId' in msg).toBe(false);
  });

  it('reports published=true on success', async () => {
    const client = new FakeClient();
    const publisher = new AzureServiceBusPublisher({ client, entityName: 'outbox-q' });
    const result = await publisher.publish(makeMessage());
    expect(result.published).toBe(true);
  });

  // (10) A transport/SDK failure becomes a controlled, sanitized PublishResult.
  it('surfaces a publish failure as a controlled transient result', async () => {
    const failing = new FakeSender(() => {
      throw new Error('AMQP connection reset');
    });
    const client = new FakeClient(() => failing);
    const publisher = new AzureServiceBusPublisher({ client, entityName: 'outbox-q' });
    const result = await publisher.publish(makeMessage());
    expect(result.published).toBe(false);
    expect(result.transient).toBe(true);
    expect(result.errorMessage).toBe('AMQP connection reset');
  });

  it('reuses a single sender across multiple publishes', async () => {
    const client = new FakeClient();
    const publisher = new AzureServiceBusPublisher({ client, entityName: 'outbox-q' });
    await publisher.publish(makeMessage({ messageId: 'a' }));
    await publisher.publish(makeMessage({ messageId: 'b' }));
    expect(client.createdFor).toEqual(['outbox-q']);
    expect(client.senders).toHaveLength(1);
    expect(client.senders[0]!.sent).toHaveLength(2);
  });

  // (11) close() closes the sender and the client.
  it('closes the sender and client on close()', async () => {
    const client = new FakeClient();
    const publisher = new AzureServiceBusPublisher({ client, entityName: 'outbox-q' });
    await publisher.publish(makeMessage());
    await publisher.close();
    expect(client.senders[0]!.closed).toBe(1);
    expect(client.closed).toBe(1);
  });

  it('close() is safe when nothing was ever sent', async () => {
    const client = new FakeClient();
    const publisher = new AzureServiceBusPublisher({ client, entityName: 'outbox-q' });
    await publisher.close();
    expect(client.closed).toBe(1);
  });
});
