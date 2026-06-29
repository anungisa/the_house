/**
 * Evidence payload storage port (hexagonal boundary).
 *
 * THE HOUSE HAS TWO EVIDENCE LAYERS — keep them distinct:
 *
 *  1. Governance evidence METADATA — rows in `governance.evidence_object` (PostgreSQL,
 *     tenant-scoped, RLS, auditable). Created ONLY by the Governance Kernel during a governed
 *     transition. This layer is unchanged by this module.
 *
 *  2. Evidence PAYLOAD/document bytes — stored OUTSIDE PostgreSQL (Azure Blob in production,
 *     in-memory for tests). This port owns ONLY that payload layer.
 *
 * This port deliberately does NOT:
 *  - create governance metadata or transitions (storing a payload is NOT an approval);
 *  - know about any specific domain (NSO-generic; no sport-specific terms);
 *  - trust a payload without a SHA-256 digest.
 *
 * Payloads are hash-addressed: the storage key embeds the content SHA-256, and reads can be
 * verified against the digest in the {@link EvidenceObjectRef}.
 */

import type { EvidenceStorageProvider } from '../../config/index.js';

export type { EvidenceStorageProvider };

/** A reference that uniquely locates a stored evidence payload and pins its digest. */
export interface EvidenceObjectRef {
  readonly tenantId: string;
  readonly evidenceObjectId: string;
  readonly storageProvider: EvidenceStorageProvider;
  readonly storageContainer: string;
  readonly storageKey: string;
  /** Expected SHA-256 (hex) of the payload; verified on read when hashing is required. */
  readonly sha256: string;
}

/** Metadata describing one stored evidence payload. Never includes the payload bytes. */
export interface StoredEvidenceMetadata {
  readonly tenantId: string;
  readonly evidenceObjectId: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly storageProvider: EvidenceStorageProvider;
  readonly storageContainer: string;
  readonly storageKey: string;
  /** ISO-8601 UTC timestamp the payload was stored. */
  readonly createdAt: string;
  readonly sourceFilename?: string;
  readonly correlationId?: string;
  readonly retentionClass?: string;
}

/** Input to store one evidence payload. */
export interface PutEvidenceObjectInput {
  readonly tenantId: string;
  readonly evidenceObjectId: string;
  readonly content: Uint8Array;
  readonly contentType: string;
  readonly sourceFilename?: string;
  readonly correlationId?: string;
  readonly retentionClass?: string;
  /**
   * Optional caller-supplied digest. When present, storage MUST verify the computed SHA-256
   * matches before persisting and reject a mismatch (never store unverified bytes).
   */
  readonly expectedSha256?: string;
}

/** Result of reading one evidence payload. */
export interface GetEvidenceObjectResult {
  readonly content: Uint8Array;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly storageProvider: EvidenceStorageProvider;
  readonly storageContainer: string;
  readonly storageKey: string;
}

/** Payload storage backend. */
export interface EvidenceStorage {
  readonly provider: EvidenceStorageProvider;
  /** Store a payload (verifying any caller-supplied digest) and return its metadata. */
  putEvidenceObject(input: PutEvidenceObjectInput): Promise<StoredEvidenceMetadata>;
  /** Read a payload by reference, optionally verifying the digest on read. */
  getEvidenceObject(ref: EvidenceObjectRef): Promise<GetEvidenceObjectResult>;
  /**
   * Delete a payload. OPTIONAL: provided mainly for test cleanup. A production backend may
   * leave this unimplemented (evidence is generally append-only / retention-governed).
   */
  deleteEvidenceObject?(ref: EvidenceObjectRef): Promise<void>;
  /** Optional resource cleanup (e.g. closing SDK clients). */
  close?(): Promise<void>;
}

/**
 * Build the deterministic, tenant-partitioned storage key for an evidence payload.
 *
 *   tenants/{tenantId}/evidence/{evidenceObjectId}/{sha256}
 *
 * Tenant-first partitioning keeps payloads namespaced per tenant; embedding the SHA-256 makes
 * the key content-addressed and tamper-evident. NSO-generic — no sport-specific segments.
 */
export function buildEvidenceStorageKey(
  tenantId: string,
  evidenceObjectId: string,
  sha256: string,
): string {
  return `tenants/${tenantId}/evidence/${evidenceObjectId}/${sha256}`;
}
