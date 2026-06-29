/**
 * Governance evidence service.
 *
 * Coordinates evidence PAYLOAD storage with the production of governance evidence METADATA
 * binding. It stores the bytes via the {@link EvidenceStorage} port and returns a
 * {@link StoredEvidenceWithBinding}: the stored payload metadata PLUS the
 * {@link EvidencePayloadBinding} (`content_hash` + serialized `storage_ref`) that a governed
 * transition can attach to kernel-created evidence.
 *
 * STRICT SCOPE — this service does NOT:
 *  - write to `governance.evidence_object` (only the Governance Kernel creates governed
 *    transition evidence metadata);
 *  - run or trigger a governed transition;
 *  - bypass {@link GovernanceKernel.transition};
 *  - call domain services.
 *
 * The intended flow (for a future upload endpoint) is: store bytes here → obtain the binding →
 * pass the binding in `TransitionInput.evidence` → the kernel persists it onto the evidence
 * metadata it creates inside the governed transaction. Storing a payload is infrastructure; it
 * is NOT a lifecycle approval.
 */

import { uuidGenerator, type IdGenerator } from '../../shared/uuid/id.js';
import type { EvidencePayloadBinding } from '../types/TransitionTypes.js';
import type { EvidenceStorage, StoredEvidenceMetadata } from './EvidenceStorage.js';
import { toEvidencePayloadBinding } from './EvidenceMetadataBinding.js';

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

/** Stored payload metadata plus the governance metadata binding derived from it. */
export interface StoredEvidenceWithBinding {
  readonly evidenceObjectId: string;
  readonly metadata: StoredEvidenceMetadata;
  readonly binding: EvidencePayloadBinding;
}

export interface GovernanceEvidenceServiceDeps {
  readonly generateId?: IdGenerator;
}

export class GovernanceEvidenceService {
  private readonly generateId: IdGenerator;

  constructor(
    private readonly storage: EvidenceStorage,
    deps: GovernanceEvidenceServiceDeps = {},
  ) {
    this.generateId = deps.generateId ?? uuidGenerator;
  }

  /**
   * Store an evidence payload and return its stored metadata together with the governance
   * binding. Does NOT persist any governance metadata itself.
   */
  async storeEvidencePayload(
    input: StoreEvidencePayloadInput,
  ): Promise<StoredEvidenceWithBinding> {
    const evidenceObjectId = input.evidenceObjectId ?? this.generateId.newId();
    const metadata = await this.storage.putEvidenceObject({
      tenantId: input.tenantId,
      evidenceObjectId,
      content: input.content,
      contentType: input.contentType,
      ...(input.sourceFilename !== undefined ? { sourceFilename: input.sourceFilename } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
      ...(input.retentionClass !== undefined ? { retentionClass: input.retentionClass } : {}),
      ...(input.expectedSha256 !== undefined ? { expectedSha256: input.expectedSha256 } : {}),
    });

    return {
      evidenceObjectId,
      metadata,
      binding: toEvidencePayloadBinding(metadata),
    };
  }
}
