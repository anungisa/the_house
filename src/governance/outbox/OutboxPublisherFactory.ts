/**
 * Outbox publisher factory.
 *
 * Selects the concrete {@link OutboxPublisher} from configuration so the rest of the system
 * depends only on the port:
 *
 *  - `serviceBus.enabled === false` (the default for local/test) → {@link NoopServiceBusPublisher}.
 *    No broker, no connection string, no network. Publishing is a loud no-op.
 *  - `serviceBus.enabled === true` → {@link AzureServiceBusPublisher} bound to the configured
 *    queue or topic, using a real Service Bus client.
 *
 * The real client adapter is injected via {@link OutboxPublisherFactoryDeps.createClient} so
 * unit tests can supply a fake and never import the vendor SDK. In production the default
 * is `createAzureServiceBusClient`.
 *
 * Managed identity is intentionally out of scope for v1: configuration is connection-string
 * based. The factory boundary makes it straightforward to add a credential-based client
 * later without touching the publisher or worker.
 */

import type { AppConfig } from '../../config/index.js';
import { AzureServiceBusPublisher } from './AzureServiceBusPublisher.js';
import type { ServiceBusClientLike } from './AzureServiceBusPublisher.js';
import { createAzureServiceBusClient } from './azureServiceBusClient.js';
import { NoopServiceBusPublisher, type OutboxPublisher } from './OutboxPublisher.js';

export interface OutboxPublisherFactoryDeps {
  /** Build a Service Bus client from a connection string. Injectable for tests. */
  readonly createClient?: (connectionString: string) => ServiceBusClientLike;
  /** Optional log sink passed to the Azure publisher (never logs secrets). */
  readonly log?: (message: string) => void;
}

/**
 * Resolve the outbox publisher for the given configuration.
 *
 * When Service Bus is disabled, returns the no-op publisher and never reads the connection
 * string. When enabled, `loadConfig` has already validated that the connection string and
 * the relevant queue/topic name are present, so the entity name is non-empty here.
 */
export function createOutboxPublisher(
  config: AppConfig,
  deps: OutboxPublisherFactoryDeps = {},
): OutboxPublisher {
  const sb = config.serviceBus;
  if (!sb.enabled) {
    return new NoopServiceBusPublisher();
  }

  const entityName = sb.publishTarget === 'queue' ? sb.queueName : sb.topicName;
  const createClient = deps.createClient ?? createAzureServiceBusClient;
  const client = createClient(sb.connectionString);

  const options: ConstructorParameters<typeof AzureServiceBusPublisher>[0] = {
    client,
    entityName,
  };
  if (deps.log !== undefined) {
    return new AzureServiceBusPublisher({ ...options, log: deps.log });
  }
  return new AzureServiceBusPublisher(options);
}
