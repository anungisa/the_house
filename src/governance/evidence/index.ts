/**
 * Public surface of the evidence payload storage module.
 *
 * Governance evidence METADATA continues to live in PostgreSQL and is owned by the Governance
 * Kernel. This module owns ONLY the payload/document byte layer (Azure Blob in production,
 * in-memory for tests).
 */

export {
  buildEvidenceStorageKey,
  type EvidenceObjectRef,
  type EvidenceStorage,
  type EvidenceStorageProvider,
  type GetEvidenceObjectResult,
  type PutEvidenceObjectInput,
  type StoredEvidenceMetadata,
} from './EvidenceStorage.js';
export {
  sha256EvidenceHasher,
  sha256Hex,
  type EvidenceHasher,
} from './EvidenceHasher.js';
export {
  EvidenceHashMismatchError,
  EvidenceNotFoundError,
  EvidenceStorageError,
} from './EvidenceStorageErrors.js';
export {
  InMemoryEvidenceStorage,
  type InMemoryEvidenceStorageOptions,
} from './InMemoryEvidenceStorage.js';
export {
  AzureBlobEvidenceStorage,
  type AzureBlobEvidenceStorageOptions,
  type BlobUploadOptionsLike,
  type BlockBlobClientLike,
  type ContainerClientLike,
} from './AzureBlobEvidenceStorage.js';
export { createAzureBlobContainerClient } from './azureBlobClient.js';
export {
  createEvidenceStorage,
  type CreateEvidenceStorageDeps,
} from './EvidenceStorageFactory.js';
export {
  EvidenceStorageService,
  type EvidenceStorageServiceDeps,
  type StoreEvidencePayloadInput,
} from './EvidenceStorageService.js';
export {
  buildEvidenceStorageRef,
  parseEvidenceStorageRef,
  serializeEvidenceStorageRef,
  toEvidencePayloadBinding,
  type EvidencePayloadBinding,
  type EvidenceStorageRef,
} from './EvidenceMetadataBinding.js';
export {
  GovernanceEvidenceService,
  type GovernanceEvidenceServiceDeps,
  type StoredEvidenceWithBinding,
} from './GovernanceEvidenceService.js';
