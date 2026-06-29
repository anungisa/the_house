/**
 * Evidence metadata binding.
 *
 * Bridges the evidence PAYLOAD storage layer ({@link StoredEvidenceMetadata}) to the
 * governance evidence METADATA model (`governance.evidence_object.content_hash` /
 * `storage_ref`). It produces a stable, serializable reference so governance metadata can
 * point at a hash-addressed payload WITHOUT the kernel or governance store ever depending on
 * Azure Blob or holding raw bytes.
 *
 * Column semantics:
 *  - `content_hash` ← the lowercase hex SHA-256 digest of the payload.
 *  - `storage_ref`  ← a stable JSON string ({@link EvidenceStorageRef}) locating the payload.
 *
 * Raw payload bytes are NEVER placed in either column (or anywhere in PostgreSQL).
 */

import type { EvidencePayloadBinding } from '../types/TransitionTypes.js';
import type { EvidenceStorageProvider, StoredEvidenceMetadata } from './EvidenceStorage.js';

export type { EvidencePayloadBinding };

/**
 * The structured, serializable storage reference persisted to `evidence_object.storage_ref`.
 * NSO-generic and provider-agnostic; never contains payload bytes or secrets.
 */
export interface EvidenceStorageRef {
  readonly provider: EvidenceStorageProvider;
  readonly container: string;
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly sourceFilename?: string;
  readonly retentionClass?: string;
}

/** Build a structured storage reference from stored payload metadata. */
export function buildEvidenceStorageRef(metadata: StoredEvidenceMetadata): EvidenceStorageRef {
  return {
    provider: metadata.storageProvider,
    container: metadata.storageContainer,
    key: metadata.storageKey,
    contentType: metadata.contentType,
    sizeBytes: metadata.sizeBytes,
    sha256: metadata.sha256,
    ...(metadata.sourceFilename !== undefined ? { sourceFilename: metadata.sourceFilename } : {}),
    ...(metadata.retentionClass !== undefined ? { retentionClass: metadata.retentionClass } : {}),
  };
}

/** Serialize a storage reference to the stable JSON string stored in `storage_ref`. */
export function serializeEvidenceStorageRef(ref: EvidenceStorageRef): string {
  return JSON.stringify(ref);
}

/** Parse a `storage_ref` JSON string back into a structured reference. */
export function parseEvidenceStorageRef(raw: string): EvidenceStorageRef {
  return JSON.parse(raw) as EvidenceStorageRef;
}

/**
 * Convert stored payload metadata into the governance evidence binding
 * (`content_hash` + serialized `storage_ref`) ready to attach to kernel-created evidence.
 */
export function toEvidencePayloadBinding(
  metadata: StoredEvidenceMetadata,
): EvidencePayloadBinding {
  return {
    contentHash: metadata.sha256,
    storageRef: serializeEvidenceStorageRef(buildEvidenceStorageRef(metadata)),
  };
}
