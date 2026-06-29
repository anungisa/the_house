/**
 * The ONLY module that imports the `@azure/service-bus` vendor SDK.
 *
 * It adapts the real `ServiceBusClient` to the tiny {@link ServiceBusClientLike} interface
 * consumed by {@link AzureServiceBusPublisher}. Keeping the SDK import isolated here means
 * the publisher and the rest of the codebase stay unit-testable with fakes and never pull
 * the vendor SDK into test runs.
 *
 * v1 RULE: sessions are NOT used. We create a plain (non-session) sender and never set a
 * SessionId on outgoing messages.
 */

import { ServiceBusClient } from '@azure/service-bus';
import type {
  ServiceBusClientLike,
  ServiceBusMessageLike,
  ServiceBusSenderLike,
} from './AzureServiceBusPublisher.js';

/**
 * Build a real Service Bus client adapter from a connection string.
 *
 * The connection string is a secret: it is used only to construct the SDK client and is
 * never logged or surfaced in errors by the publisher.
 */
export function createAzureServiceBusClient(connectionString: string): ServiceBusClientLike {
  const client = new ServiceBusClient(connectionString);
  return {
    createSender(entityName: string): ServiceBusSenderLike {
      const sender = client.createSender(entityName);
      return {
        sendMessages(message: ServiceBusMessageLike): Promise<unknown> {
          // The SDK accepts a superset of our minimal message shape.
          return sender.sendMessages(message);
        },
        close(): Promise<void> {
          return sender.close();
        },
      };
    },
    close(): Promise<void> {
      return client.close();
    },
  };
}
