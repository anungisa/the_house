/**
 * Azure Blob SDK adapter — the ONLY file that imports `@azure/storage-blob`.
 *
 * It adapts the real `ContainerClient` to the tiny {@link ContainerClientLike} interface so the
 * rest of the codebase (and the entire test suite) stays free of the vendor SDK. Keeping the
 * import isolated here means unit tests never pull the Azure SDK into the run.
 *
 * v1 authenticates with a connection string. Managed-identity auth can be added later by
 * introducing a sibling factory without changing {@link AzureBlobEvidenceStorage}.
 */

import { BlobServiceClient } from '@azure/storage-blob';
import type { ContainerClientLike } from './AzureBlobEvidenceStorage.js';

/**
 * Build a {@link ContainerClientLike} backed by a real Azure Blob container client.
 *
 * @param connectionString Azure Storage connection string (secret — never logged).
 * @param containerName Target container.
 */
export function createAzureBlobContainerClient(
  connectionString: string,
  containerName: string,
): ContainerClientLike {
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const container = service.getContainerClient(containerName);

  return {
    containerName: container.containerName,
    getBlockBlobClient: (blobName: string) => container.getBlockBlobClient(blobName),
    createIfNotExists: () => container.createIfNotExists(),
  };
}
