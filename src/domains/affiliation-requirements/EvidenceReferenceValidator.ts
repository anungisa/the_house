/**
 * Evidence reference validator.
 *
 * Before a representative can ASSOCIATE evidence with a requirement, the House must confirm the
 * referenced payload actually exists FOR THE CALLING TENANT. Because stored payloads are
 * tenant-partitioned and hash-addressed (see {@link buildEvidenceStorageKey}), a cross-tenant or
 * fabricated reference simply resolves to a key that does not exist for the tenant and is rejected.
 *
 * Association is NOT acceptance: validating a reference only proves the payload was uploaded by the
 * tenant. Governed acceptance happens later, through the kernel, at submission/review.
 */

import type { EvidenceStorageProvider } from '../../config/index.js';
import {
  buildEvidenceStorageKey,
  type EvidenceStorage,
} from '../../governance/evidence/EvidenceStorage.js';

export interface EvidenceReference {
  readonly tenantId: string;
  readonly evidenceObjectId: string;
  readonly contentHash: string;
}

export interface EvidenceReferenceValidator {
  /** True only when the referenced payload exists for the tenant with the given digest. */
  isValid(reference: EvidenceReference): Promise<boolean>;
}

/** In-memory validator: an explicit allow-set of tenant-scoped references (for unit tests). */
export class InMemoryEvidenceReferenceValidator implements EvidenceReferenceValidator {
  private readonly refs = new Set<string>();

  register(reference: EvidenceReference): void {
    this.refs.add(this.key(reference));
  }

  private key(reference: EvidenceReference): string {
    return `${reference.tenantId}|${reference.evidenceObjectId}|${reference.contentHash}`;
  }

  async isValid(reference: EvidenceReference): Promise<boolean> {
    return this.refs.has(this.key(reference));
  }
}

/**
 * Validator backed by the real {@link EvidenceStorage}. Reconstructs the tenant-partitioned,
 * hash-addressed storage key and confirms the payload resolves with a matching digest. A
 * cross-tenant reference reconstructs a different tenant's key and therefore fails closed.
 */
export class StorageBackedEvidenceReferenceValidator implements EvidenceReferenceValidator {
  constructor(
    private readonly storage: EvidenceStorage,
    private readonly containerName: string,
    private readonly provider: EvidenceStorageProvider = storage.provider,
  ) {}

  async isValid(reference: EvidenceReference): Promise<boolean> {
    const storageKey = buildEvidenceStorageKey(
      reference.tenantId,
      reference.evidenceObjectId,
      reference.contentHash,
    );
    try {
      await this.storage.getEvidenceObject({
        tenantId: reference.tenantId,
        evidenceObjectId: reference.evidenceObjectId,
        storageProvider: this.provider,
        storageContainer: this.containerName,
        storageKey,
        sha256: reference.contentHash,
      });
      return true;
    } catch {
      // Not found / digest mismatch / storage error => fail closed (no existence disclosure).
      return false;
    }
  }
}
