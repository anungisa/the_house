/**
 * Evidence HTTP endpoint DTOs and header contract.
 *
 * These describe the transport shapes for the narrow evidence payload upload/download
 * endpoints. They are NSO-generic (no sport-specific fields) and never carry raw payload
 * bytes in a JSON body — uploads send raw bytes as the request body, downloads return raw
 * bytes as the response body.
 */

import type { EvidenceStorageProvider } from '../../governance/evidence/EvidenceStorage.js';

/**
 * Evidence-specific request headers (lowercased to match Node's incoming header map).
 *
 * Identity for evidence endpoints is carried in the shared `x-house-*` trusted-header
 * contract (see {@link TRUSTED_HEADER_NAMES}) because the request body is binary; these
 * headers add only payload metadata.
 */
export const EVIDENCE_HEADER_NAMES = {
  /** Optional original filename of the uploaded payload. */
  sourceFilename: 'x-house-source-filename',
  /** Optional free-form retention class label (not constrained in v1). */
  retentionClass: 'x-house-retention-class',
  /** Optional caller-supplied evidence object id to reuse (else one is generated). */
  evidenceObjectId: 'x-house-evidence-object-id',
  /** Optional correlation id for tracing. */
  correlationId: 'x-house-correlation-id',
} as const;

/** A parsed evidence upload request: identity headers + raw payload bytes. */
export interface EvidenceUploadRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly content: Uint8Array;
}

/** A parsed evidence download request: identity headers + a JSON body. */
export interface EvidenceDownloadRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Parsed JSON body, expected to be `{ evidenceObjectId, storageRef }`. */
  readonly body: unknown;
}

/** Success body for a stored evidence payload. Never includes the payload bytes. */
export type EvidenceUploadResponseBody = {
  readonly status: 'stored';
  readonly evidenceObjectId: string;
  /** SHA-256 hex digest of the stored payload (also the governance `content_hash`). */
  readonly contentHash: string;
  /** Serialized storage reference (the governance `storage_ref`). */
  readonly storageRef: string;
  readonly storageProvider: EvidenceStorageProvider;
  readonly storageContainer: string;
  readonly storageKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly requestId: string;
};
