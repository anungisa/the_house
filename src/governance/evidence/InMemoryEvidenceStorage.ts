/**
 * In-memory evidence payload storage.
 *
 * LOCAL/DEMO/TEST ONLY: payloads live in a process-local Map and are lost on restart. It
 * implements the exact {@link EvidenceStorage} contract (hash-address on write, optional
 * hash-verify on read) so tests exercise the same behavior as the Azure Blob backend without
 * any Azure dependency.
 */

import type { Clock } from '../../shared/time/clock.js';
import { systemClock } from '../../shared/time/clock.js';
import { sha256EvidenceHasher, type EvidenceHasher } from './EvidenceHasher.js';
import {
  EvidenceHashMismatchError,
  EvidenceNotFoundError,
} from './EvidenceStorageErrors.js';
import {
  buildEvidenceStorageKey,
  type EvidenceObjectRef,
  type EvidenceStorage,
  type GetEvidenceObjectResult,
  type PutEvidenceObjectInput,
  type StoredEvidenceMetadata,
} from './EvidenceStorage.js';

export interface InMemoryEvidenceStorageOptions {
  /** Verify the SHA-256 digest on read (defaults to true). */
  readonly requireHash?: boolean;
  /** Logical container name reported in metadata (defaults to 'memory'). */
  readonly containerName?: string;
  readonly hasher?: EvidenceHasher;
  readonly clock?: Clock;
}

interface StoredEntry {
  readonly content: Uint8Array;
  readonly metadata: StoredEvidenceMetadata;
}

export class InMemoryEvidenceStorage implements EvidenceStorage {
  readonly provider = 'memory' as const;
  private readonly store = new Map<string, StoredEntry>();
  private readonly requireHash: boolean;
  private readonly containerName: string;
  private readonly hasher: EvidenceHasher;
  private readonly clock: Clock;

  constructor(options: InMemoryEvidenceStorageOptions = {}) {
    this.requireHash = options.requireHash ?? true;
    this.containerName = options.containerName ?? 'memory';
    this.hasher = options.hasher ?? sha256EvidenceHasher;
    this.clock = options.clock ?? systemClock;
  }

  putEvidenceObject(input: PutEvidenceObjectInput): Promise<StoredEvidenceMetadata> {
    const sha256 = this.hasher.hash(input.content);
    if (input.expectedSha256 !== undefined && input.expectedSha256 !== sha256) {
      return Promise.reject(
        new EvidenceHashMismatchError(
          'Computed payload digest does not match the expected SHA-256.',
          { evidenceObjectId: input.evidenceObjectId },
        ),
      );
    }

    const storageKey = buildEvidenceStorageKey(input.tenantId, input.evidenceObjectId, sha256);
    const metadata: StoredEvidenceMetadata = {
      tenantId: input.tenantId,
      evidenceObjectId: input.evidenceObjectId,
      contentType: input.contentType,
      sizeBytes: input.content.byteLength,
      sha256,
      storageProvider: this.provider,
      storageContainer: this.containerName,
      storageKey,
      createdAt: this.clock.nowIso(),
      ...(input.sourceFilename !== undefined ? { sourceFilename: input.sourceFilename } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
      ...(input.retentionClass !== undefined ? { retentionClass: input.retentionClass } : {}),
    };

    // Copy the bytes so later mutation of the caller's buffer cannot alter stored content.
    this.store.set(storageKey, { content: Uint8Array.from(input.content), metadata });
    return Promise.resolve(metadata);
  }

  getEvidenceObject(ref: EvidenceObjectRef): Promise<GetEvidenceObjectResult> {
    const entry = this.store.get(ref.storageKey);
    if (entry === undefined) {
      return Promise.reject(
        new EvidenceNotFoundError('Evidence object not found.', { storageKey: ref.storageKey }),
      );
    }

    const sha256 = this.hasher.hash(entry.content);
    if (this.requireHash && sha256 !== ref.sha256) {
      return Promise.reject(
        new EvidenceHashMismatchError(
          'Stored payload digest does not match the reference SHA-256.',
          { storageKey: ref.storageKey },
        ),
      );
    }

    return Promise.resolve({
      content: Uint8Array.from(entry.content),
      sizeBytes: entry.content.byteLength,
      sha256,
      storageProvider: this.provider,
      storageContainer: entry.metadata.storageContainer,
      storageKey: ref.storageKey,
    });
  }

  deleteEvidenceObject(ref: EvidenceObjectRef): Promise<void> {
    this.store.delete(ref.storageKey);
    return Promise.resolve();
  }
}
