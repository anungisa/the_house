/**
 * Real Azure Service Bus implementation of the {@link OutboxPublisher} port.
 *
 * Responsibilities (and ONLY these):
 *  - Map one already-claimed {@link PublishableMessage} onto a Service Bus message.
 *  - Send exactly one message to the configured queue or topic.
 *  - Return a controlled {@link PublishResult}; on failure, surface a sanitized,
 *    NSO-generic error message (never connection strings, SQL, or tenant payloads).
 *
 * It explicitly does NOT:
 *  - claim, lease, mark, reschedule, or delete outbox rows (the OutboxWorker owns that);
 *  - touch any governance/affiliation table or know about any specific domain;
 *  - set a Service Bus SessionId — v1 does not use sessions
 *    (see {@link V1_SERVICE_BUS_USES_SESSIONS}). `causationId` is an ordinary property.
 *
 * The Azure SDK is wrapped behind the tiny {@link ServiceBusClientLike} /
 * {@link ServiceBusSenderLike} interfaces so this class is fully unit-testable with a fake
 * and never imports the vendor SDK directly. The real client is built in
 * `azureServiceBusClient.ts`.
 */

import type { OutboxPublisher } from './OutboxPublisher.js';
import type { PublishResult, PublishableMessage } from './OutboxTypes.js';

/** Minimal shape of a Service Bus message we set. Mirrors `@azure/service-bus`. */
export interface ServiceBusMessageLike {
  body: unknown;
  messageId?: string;
  contentType?: string;
  correlationId?: string;
  subject?: string;
  applicationProperties?: Record<string, string | number | boolean>;
}

/** Minimal sender surface used by the publisher. */
export interface ServiceBusSenderLike {
  sendMessages(message: ServiceBusMessageLike): Promise<unknown>;
  close(): Promise<void>;
}

/** Minimal client surface used by the publisher. */
export interface ServiceBusClientLike {
  createSender(entityName: string): ServiceBusSenderLike;
  close(): Promise<void>;
}

export interface AzureServiceBusPublisherOptions {
  /** A Service Bus client (real adapter in production, fake in tests). */
  readonly client: ServiceBusClientLike;
  /** Target queue or topic name. */
  readonly entityName: string;
  /** Optional structured log sink (no-op by default). Never logs secrets. */
  readonly log?: (message: string) => void;
}

const CONTENT_TYPE_JSON = 'application/json';

export class AzureServiceBusPublisher implements OutboxPublisher {
  private readonly client: ServiceBusClientLike;
  private readonly entityName: string;
  private readonly log: (message: string) => void;
  private sender: ServiceBusSenderLike | undefined;

  constructor(options: AzureServiceBusPublisherOptions) {
    this.client = options.client;
    this.entityName = options.entityName;
    this.log = options.log ?? (() => {});
  }

  /**
   * Publish a single message. Returns a controlled {@link PublishResult}; SDK/transport
   * errors are caught and surfaced as a transient, sanitized failure so the OutboxWorker
   * can apply its own retry/backoff policy. The publisher never marks the row itself.
   */
  async publish(message: PublishableMessage): Promise<PublishResult> {
    try {
      const sender = this.getSender();
      await sender.sendMessages(this.toServiceBusMessage(message));
      return { published: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown Service Bus error';
      this.log(`[service-bus] publish failed for ${message.messageId}: ${errorMessage}`);
      // Transport/SDK failures are treated as transient: the worker decides retry vs. fail.
      return { published: false, transient: true, errorMessage };
    }
  }

  /**
   * Map a {@link PublishableMessage} onto a Service Bus message.
   *
   * - MessageId = the stable `messageId` (dedupeKey or outbox row id) so broker-side
   *   duplicate detection (if enabled) collapses idempotent retries.
   * - Subject = the event type.
   * - ContentType = application/json.
   * - applicationProperties carry NSO-generic routing/observability metadata only.
   * - No SessionId is ever set (v1 does not use sessions).
   */
  toServiceBusMessage(message: PublishableMessage): ServiceBusMessageLike {
    const applicationProperties: Record<string, string | number | boolean> = {
      outboxMessageId: message.messageId,
      eventType: message.messageType,
      tenantId: message.tenantId,
    };
    if (message.correlationId !== undefined) {
      applicationProperties.correlationId = message.correlationId;
    }
    if (message.causationId !== undefined) {
      applicationProperties.causationId = message.causationId;
    }
    if (message.dedupeKey !== undefined) {
      applicationProperties.dedupeKey = message.dedupeKey;
    }
    if (message.createdAt !== undefined) {
      applicationProperties.createdAt = new Date(message.createdAt).toISOString();
    }
    if (message.attempt !== undefined) {
      applicationProperties.attempt = message.attempt;
    }

    return {
      body: message.body,
      messageId: message.messageId,
      contentType: CONTENT_TYPE_JSON,
      subject: message.messageType,
      ...(message.correlationId !== undefined ? { correlationId: message.correlationId } : {}),
      applicationProperties,
    };
  }

  /** Lazily create (and cache) the sender for the configured entity. */
  private getSender(): ServiceBusSenderLike {
    if (this.sender === undefined) {
      this.sender = this.client.createSender(this.entityName);
    }
    return this.sender;
  }

  /**
   * Close the sender and client. Safe to call multiple times. Invoked by a worker host on
   * shutdown; this pass does not start one.
   */
  async close(): Promise<void> {
    if (this.sender !== undefined) {
      await this.sender.close();
      this.sender = undefined;
    }
    await this.client.close();
  }
}
