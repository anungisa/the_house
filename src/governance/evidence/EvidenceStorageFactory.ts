/**
 * Evidence storage factory.
 *
 * Selects the {@link EvidenceStorage} implementation from {@link EvidenceStorageConfig}:
 *  - `memory`     -> {@link InMemoryEvidenceStorage} (default; local/demo/test).
 *  - `azure_blob` -> {@link AzureBlobEvidenceStorage} backed by a real container client.
 *
 * The Azure container client is built via an injectable `createContainerClient` so tests can
 * supply a fake and the real `@azure/storage-blob` SDK never loads during unit runs.
 */

import type { EvidenceStorageConfig } from '../../config/index.js';
import type { Clock } from '../../shared/time/clock.js';
import {
  AzureBlobEvidenceStorage,
  type ContainerClientLike,
} from './AzureBlobEvidenceStorage.js';
import { createAzureBlobContainerClient } from './azureBlobClient.js';
import type { EvidenceStorage } from './EvidenceStorage.js';
import { InMemoryEvidenceStorage } from './InMemoryEvidenceStorage.js';

export interface CreateEvidenceStorageDeps {
  /** Build a real Azure container client. Defaults to the `@azure/storage-blob` adapter. */
  readonly createContainerClient?: (
    connectionString: string,
    containerName: string,
  ) => ContainerClientLike;
  readonly clock?: Clock;
  readonly log?: (message: string) => void;
}

export function createEvidenceStorage(
  config: EvidenceStorageConfig,
  deps: CreateEvidenceStorageDeps = {},
): EvidenceStorage {
  if (config.provider === 'memory') {
    return new InMemoryEvidenceStorage({
      requireHash: config.requireHash,
      ...(deps.clock !== undefined ? { clock: deps.clock } : {}),
    });
  }

  // provider === 'azure_blob': loadConfig has already validated connectionString + containerName.
  const createContainerClient = deps.createContainerClient ?? createAzureBlobContainerClient;
  const containerClient = createContainerClient(config.connectionString, config.containerName);
  return new AzureBlobEvidenceStorage({
    containerClient,
    requireHash: config.requireHash,
    ...(deps.clock !== undefined ? { clock: deps.clock } : {}),
    ...(deps.log !== undefined ? { log: deps.log } : {}),
  });
}
