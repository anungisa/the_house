/**
 * Real Azure Blob Storage implementation of the {@link EvidenceStorage} port.
 *
 * Responsibilities (and ONLY these):
 *  - Hash-address one evidence payload (SHA-256), verifying any caller-supplied digest.
 *  - Upload the bytes to a deterministic, tenant-partitioned blob key in the configured
 *    container, setting the content type.
 *  - Read a payload back and (optionally) verify its digest against the reference.
 *  - Surface controlled, sanitized errors ({@link EvidenceNotFoundError},
 *    {@link EvidenceHashMismatchError}, {@link EvidenceStorageError}).
 *
 * It explicitly does NOT:
 *  - create governance evidence metadata or transitions (payload storage is infrastructure);
 *  - log payload contents or secrets (connection strings, SAS tokens);
 *  - know about any specific domain (NSO-generic).
 *
 * The Azure SDK is wrapped behind the tiny {@link ContainerClientLike} /
 * {@link BlockBlobClientLike} interfaces so this class is fully unit-testable with a fake and
 * never imports the vendor SDK directly. The real client is built in `azureBlobClient.ts`.
 *
 * v1 uses connection-string auth; the client is injected so managed-identity auth can be
 * added later without touching this class.
 */

import type { Clock } from '../../shared/time/clock.js';
import { systemClock } from '../../shared/time/clock.js';
import { sha256EvidenceHasher, type EvidenceHasher } from './EvidenceHasher.js';
import {
  EvidenceHashMismatchError,
  EvidenceNotFoundError,
  EvidenceStorageError,
} from './EvidenceStorageErrors.js';
import {
  buildEvidenceStorageKey,
  type EvidenceObjectRef,
  type EvidenceStorage,
  type GetEvidenceObjectResult,
  type PutEvidenceObjectInput,
  type StoredEvidenceMetadata,
} from './EvidenceStorage.js';

/** Minimal blob upload options we set. Mirrors `@azure/storage-blob`. */
export interface BlobUploadOptionsLike {
  readonly blobHTTPHeaders?: { readonly blobContentType?: string };
  readonly metadata?: Record<string, string>;
}

/** Minimal block-blob surface used by the storage backend. */
export interface BlockBlobClientLike {
  uploadData(content: Uint8Array, options?: BlobUploadOptionsLike): Promise<unknown>;
  downloadToBuffer(): Promise<Uint8Array>;
  deleteIfExists(): Promise<{ readonly succeeded: boolean }>;
}

/** Minimal container surface used by the storage backend. */
export interface ContainerClientLike {
  readonly containerName: string;
  getBlockBlobClient(blobName: string): BlockBlobClientLike;
  /** Ensure the container exists. Safe to call repeatedly. */
  createIfNotExists(): Promise<unknown>;
  close?(): Promise<void>;
}

export interface AzureBlobEvidenceStorageOptions {
  /** A container client (real adapter in production, fake in tests). */
  readonly containerClient: ContainerClientLike;
  /** Verify the SHA-256 digest on read (defaults to true). */
  readonly requireHash?: boolean;
  /** Create the container on first write if missing (defaults to false). */
  readonly ensureContainer?: boolean;
  readonly hasher?: EvidenceHasher;
  readonly clock?: Clock;
  /** Optional log sink (never logs payloads or secrets). */
  readonly log?: (message: string) => void;
}

/** Detect a 404 / blob-not-found from an opaque SDK error without importing the SDK. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { statusCode?: number; code?: string };
  return e.statusCode === 404 || e.code === 'BlobNotFound';
}

export class AzureBlobEvidenceStorage implements EvidenceStorage {
  readonly provider = 'azure_blob' as const;
  private readonly containerClient: ContainerClientLike;
  private readonly containerName: string;
  private readonly requireHash: boolean;
  private readonly ensureContainer: boolean;
  private readonly hasher: EvidenceHasher;
  private readonly clock: Clock;
  private readonly log: (message: string) => void;
  private containerEnsured = false;

  constructor(options: AzureBlobEvidenceStorageOptions) {
    this.containerClient = options.containerClient;
    this.containerName = options.containerClient.containerName;
    this.requireHash = options.requireHash ?? true;
    this.ensureContainer = options.ensureContainer ?? false;
    this.hasher = options.hasher ?? sha256EvidenceHasher;
    this.clock = options.clock ?? systemClock;
    this.log = options.log ?? (() => {});
  }

  async putEvidenceObject(input: PutEvidenceObjectInput): Promise<StoredEvidenceMetadata> {
    const sha256 = this.hasher.hash(input.content);
    if (input.expectedSha256 !== undefined && input.expectedSha256 !== sha256) {
      // Reject BEFORE any upload: never persist bytes whose digest the caller disputes.
      throw new EvidenceHashMismatchError(
        'Computed payload digest does not match the expected SHA-256.',
        { evidenceObjectId: input.evidenceObjectId },
      );
    }

    const storageKey = buildEvidenceStorageKey(input.tenantId, input.evidenceObjectId, sha256);

    try {
      await this.ensureContainerExists();
      const blob = this.containerClient.getBlockBlobClient(storageKey);
      await blob.uploadData(input.content, {
        blobHTTPHeaders: { blobContentType: input.contentType },
        // Blob metadata is NSO-generic and never includes payload bytes or secrets.
        metadata: {
          tenantId: input.tenantId,
          evidenceObjectId: input.evidenceObjectId,
          sha256,
        },
      });
    } catch (error) {
      throw this.toStorageError('upload', storageKey, error);
    }

    this.log(`[evidence-blob] stored ${storageKey} (${input.content.byteLength} bytes)`);

    return {
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
  }

  async getEvidenceObject(ref: EvidenceObjectRef): Promise<GetEvidenceObjectResult> {
    const blob = this.containerClient.getBlockBlobClient(ref.storageKey);
    let content: Uint8Array;
    try {
      content = await blob.downloadToBuffer();
    } catch (error) {
      if (isNotFound(error)) {
        throw new EvidenceNotFoundError('Evidence object not found.', {
          storageKey: ref.storageKey,
        });
      }
      throw this.toStorageError('download', ref.storageKey, error);
    }

    const sha256 = this.hasher.hash(content);
    if (this.requireHash && sha256 !== ref.sha256) {
      throw new EvidenceHashMismatchError(
        'Stored payload digest does not match the reference SHA-256.',
        { storageKey: ref.storageKey },
      );
    }

    return {
      content,
      sizeBytes: content.byteLength,
      sha256,
      storageProvider: this.provider,
      storageContainer: this.containerName,
      storageKey: ref.storageKey,
    };
  }

  async deleteEvidenceObject(ref: EvidenceObjectRef): Promise<void> {
    try {
      const blob = this.containerClient.getBlockBlobClient(ref.storageKey);
      await blob.deleteIfExists();
    } catch (error) {
      throw this.toStorageError('delete', ref.storageKey, error);
    }
  }

  async close(): Promise<void> {
    await this.containerClient.close?.();
  }

  private async ensureContainerExists(): Promise<void> {
    if (!this.ensureContainer || this.containerEnsured) return;
    await this.containerClient.createIfNotExists();
    this.containerEnsured = true;
  }

  /** Wrap an opaque SDK error in a controlled, sanitized {@link EvidenceStorageError}. */
  private toStorageError(op: string, storageKey: string, error: unknown): EvidenceStorageError {
    const reason = error instanceof Error ? error.message : 'unknown blob storage error';
    this.log(`[evidence-blob] ${op} failed for ${storageKey}: ${reason}`);
    return new EvidenceStorageError(`Evidence ${op} failed.`, {
      details: { storageKey, op },
      cause: error,
    });
  }
}
