/**
 * Evidence storage service.
 *
 * A thin application seam over the {@link EvidenceStorage} port for storing an external
 * evidence payload and obtaining its reference/metadata. It generates an evidence object id
 * when the caller does not supply one.
 *
 * IMPORTANT SCOPE: this service stores PAYLOAD bytes only. It does NOT create governance
 * evidence metadata, does NOT run a governed transition, and does NOT bypass the Governance
 * Kernel. Storing a document is infrastructure — it is NOT a lifecycle approval. The kernel
 * remains the only path that creates `governance.evidence_object` metadata for governed
 * actions. A future pass can wire this service's returned {@link StoredEvidenceMetadata}
 * (content_hash + storage_ref) into kernel-created metadata.
 */

import { uuidGenerator, type IdGenerator } from '../../shared/uuid/id.js';
import type {
  EvidenceObjectRef,
  EvidenceStorage,
  StoredEvidenceMetadata,
} from './EvidenceStorage.js';

export interface StoreEvidencePayloadInput {
  readonly tenantId: string;
  readonly content: Uint8Array;
  readonly contentType: string;
  /** Reuse an existing governance evidence object id, or omit to generate one. */
  readonly evidenceObjectId?: string;
  readonly sourceFilename?: string;
  readonly correlationId?: string;
  readonly retentionClass?: string;
  readonly expectedSha256?: string;
}

export interface EvidenceStorageServiceDeps {
  readonly generateId?: IdGenerator;
}

export class EvidenceStorageService {
  private readonly generateId: IdGenerator;

  constructor(
    private readonly storage: EvidenceStorage,
    deps: EvidenceStorageServiceDeps = {},
  ) {
    this.generateId = deps.generateId ?? uuidGenerator;
  }

  /** Store an external evidence payload and return its stored metadata. */
  async storeEvidencePayload(input: StoreEvidencePayloadInput): Promise<StoredEvidenceMetadata> {
    const evidenceObjectId = input.evidenceObjectId ?? this.generateId.newId();
    return this.storage.putEvidenceObject({
      tenantId: input.tenantId,
      evidenceObjectId,
      content: input.content,
      contentType: input.contentType,
      ...(input.sourceFilename !== undefined ? { sourceFilename: input.sourceFilename } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
      ...(input.retentionClass !== undefined ? { retentionClass: input.retentionClass } : {}),
      ...(input.expectedSha256 !== undefined ? { expectedSha256: input.expectedSha256 } : {}),
    });
  }

  /** Build a reference to a stored payload from its metadata. */
  static refFromMetadata(metadata: StoredEvidenceMetadata): EvidenceObjectRef {
    return {
      tenantId: metadata.tenantId,
      evidenceObjectId: metadata.evidenceObjectId,
      storageProvider: metadata.storageProvider,
      storageContainer: metadata.storageContainer,
      storageKey: metadata.storageKey,
      sha256: metadata.sha256,
    };
  }
}
