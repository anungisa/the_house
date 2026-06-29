import { NotImplementedError } from '../../shared/errors/NotImplementedError.js';
import type { PublishResult, PublishableMessage } from './OutboxTypes.js';

/**
 * v1 INVARIANT: Azure Service Bus sessions are NOT enabled in v1.
 *
 * Any real publisher MUST NOT set a SessionId and MUST NOT require a session-enabled
 * entity. `causationId` is carried as an ordinary application property. This constant is
 * asserted by tests so the rule cannot silently regress.
 */
export const V1_SERVICE_BUS_USES_SESSIONS = false;

/**
 * Publisher abstraction for the transactional outbox (scaffold).
 *
 * The concrete implementation (a real Azure Service Bus publisher) is wired in a later
 * pass. The kernel and worker depend on this interface, never on a vendor SDK directly.
 *
 * v1 RULE: Azure Service Bus SESSIONS ARE NOT USED. Do not set a SessionId; `causationId`
 * is propagated as an ordinary application property, not a session identifier.
 */
export interface OutboxPublisher {
  /**
   * Publish a single message to the broker.
   * Set MessageId to the message's `messageId` (dedupeKey or outbox row id) for
   * broker-side de-duplication. Propagate correlationId/causationId as properties.
   */
  publish(message: PublishableMessage): Promise<PublishResult>;
}

/**
 * No-op publisher skeleton used by the scaffold and tests.
 *
 * It does not connect to Azure. `publish()` throws NotImplementedError so accidental use
 * in a real path is loud, while still satisfying the OutboxPublisher contract for wiring.
 */
export class NoopServiceBusPublisher implements OutboxPublisher {
  async publish(_message: PublishableMessage): Promise<PublishResult> {
    throw new NotImplementedError('OutboxPublisher.publish (Azure Service Bus)', {
      details: {
        note: 'Service Bus sessions are NOT used in v1. Real publisher wired in a later pass.',
      },
    });
  }
}
