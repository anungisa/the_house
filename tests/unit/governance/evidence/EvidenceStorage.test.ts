import { TextDecoder, TextEncoder } from 'node:util';
import { describe, expect, it } from 'vitest';

import { fixedClock } from '../../../../src/shared/time/clock.js';
import { sha256Hex } from '../../../../src/governance/evidence/EvidenceHasher.js';
import {
  EvidenceHashMismatchError,
  EvidenceNotFoundError,
  EvidenceStorageError,
} from '../../../../src/governance/evidence/EvidenceStorageErrors.js';
import {
  AzureBlobEvidenceStorage,
  type BlobUploadOptionsLike,
  type BlockBlobClientLike,
  type ContainerClientLike,
} from '../../../../src/governance/evidence/AzureBlobEvidenceStorage.js';
import { InMemoryEvidenceStorage } from '../../../../src/governance/evidence/InMemoryEvidenceStorage.js';
import {
  buildEvidenceStorageKey,
  type EvidenceObjectRef,
  type PutEvidenceObjectInput,
} from '../../../../src/governance/evidence/EvidenceStorage.js';

const enc = new TextEncoder();
const TENANT = '11111111-1111-1111-1111-111111111111';
const EVIDENCE_ID = '22222222-2222-2222-2222-222222222222';
const CLOCK = fixedClock(0);

function putInput(overrides: Partial<PutEvidenceObjectInput> = {}): PutEvidenceObjectInput {
  return {
    tenantId: TENANT,
    evidenceObjectId: EVIDENCE_ID,
    content: enc.encode('evidence-bytes'),
    contentType: 'application/pdf',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// In-memory backend
// ---------------------------------------------------------------------------

describe('InMemoryEvidenceStorage', () => {
  // (2) Round-trips bytes and reports correct metadata.
  it('stores and retrieves payload bytes with correct metadata', async () => {
    const storage = new InMemoryEvidenceStorage({ clock: CLOCK });
    const meta = await storage.putEvidenceObject(putInput());

    expect(meta.storageProvider).toBe('memory');
    expect(meta.sha256).toBe(sha256Hex(enc.encode('evidence-bytes')));
    expect(meta.sizeBytes).toBe(enc.encode('evidence-bytes').byteLength);
    expect(meta.storageKey).toBe(buildEvidenceStorageKey(TENANT, EVIDENCE_ID, meta.sha256));
    expect(meta.createdAt).toBe('1970-01-01T00:00:00.000Z');

    const ref: EvidenceObjectRef = {
      tenantId: TENANT,
      evidenceObjectId: EVIDENCE_ID,
      storageProvider: 'memory',
      storageContainer: meta.storageContainer,
      storageKey: meta.storageKey,
      sha256: meta.sha256,
    };
    const result = await storage.getEvidenceObject(ref);
    expect(new TextDecoder().decode(result.content)).toBe('evidence-bytes');
    expect(result.sha256).toBe(meta.sha256);
  });

  // (3) Verifies the digest on read and rejects a tampered reference.
  it('rejects a read whose reference digest does not match', async () => {
    const storage = new InMemoryEvidenceStorage({ clock: CLOCK, requireHash: true });
    const meta = await storage.putEvidenceObject(putInput());
    const tampered: EvidenceObjectRef = {
      tenantId: TENANT,
      evidenceObjectId: EVIDENCE_ID,
      storageProvider: 'memory',
      storageContainer: meta.storageContainer,
      storageKey: meta.storageKey,
      sha256: 'deadbeef',
    };
    await expect(storage.getEvidenceObject(tampered)).rejects.toBeInstanceOf(
      EvidenceHashMismatchError,
    );
  });

  // Rejects a write whose caller-supplied digest does not match the content (never stores it).
  it('rejects a write with a mismatched expected digest', async () => {
    const storage = new InMemoryEvidenceStorage({ clock: CLOCK });
    await expect(
      storage.putEvidenceObject(putInput({ expectedSha256: 'not-the-real-hash' })),
    ).rejects.toBeInstanceOf(EvidenceHashMismatchError);
  });

  // (4) Missing object yields a controlled not-found error.
  it('raises a controlled not-found error for an unknown object', async () => {
    const storage = new InMemoryEvidenceStorage({ clock: CLOCK });
    const ref: EvidenceObjectRef = {
      tenantId: TENANT,
      evidenceObjectId: EVIDENCE_ID,
      storageProvider: 'memory',
      storageContainer: 'memory',
      storageKey: 'tenants/x/evidence/y/z',
      sha256: 'abc',
    };
    await expect(storage.getEvidenceObject(ref)).rejects.toBeInstanceOf(EvidenceNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Azure Blob backend (with SDK fakes — no real Azure)
// ---------------------------------------------------------------------------

interface RecordedUpload {
  readonly content: Uint8Array;
  readonly options?: BlobUploadOptionsLike;
}

class FakeBlockBlobClient implements BlockBlobClientLike {
  uploaded?: RecordedUpload;

  constructor(
    private readonly store: Map<string, Uint8Array>,
    private readonly blobName: string,
    private readonly failUpload = false,
  ) {}

  uploadData(content: Uint8Array, options?: BlobUploadOptionsLike): Promise<unknown> {
    if (this.failUpload) {
      return Promise.reject(new Error('simulated blob failure'));
    }
    this.uploaded = { content, ...(options !== undefined ? { options } : {}) };
    this.store.set(this.blobName, Uint8Array.from(content));
    return Promise.resolve({});
  }

  downloadToBuffer(): Promise<Uint8Array> {
    const bytes = this.store.get(this.blobName);
    if (bytes === undefined) {
      return Promise.reject({ statusCode: 404, code: 'BlobNotFound' });
    }
    return Promise.resolve(bytes);
  }

  deleteIfExists(): Promise<{ succeeded: boolean }> {
    const existed = this.store.delete(this.blobName);
    return Promise.resolve({ succeeded: existed });
  }
}

class FakeContainerClient implements ContainerClientLike {
  readonly containerName = 'evidence';
  readonly store = new Map<string, Uint8Array>();
  readonly clients = new Map<string, FakeBlockBlobClient>();
  createdContainer = false;

  constructor(private readonly failUpload = false) {}

  getBlockBlobClient(blobName: string): FakeBlockBlobClient {
    let client = this.clients.get(blobName);
    if (client === undefined) {
      client = new FakeBlockBlobClient(this.store, blobName, this.failUpload);
      this.clients.set(blobName, client);
    }
    return client;
  }

  createIfNotExists(): Promise<unknown> {
    this.createdContainer = true;
    return Promise.resolve({});
  }
}

describe('AzureBlobEvidenceStorage', () => {
  // (5) Maps the storage key correctly; (6) sets content type; (8) returns metadata.
  it('uploads under the tenant-partitioned key, sets content type, and returns metadata', async () => {
    const container = new FakeContainerClient();
    const storage = new AzureBlobEvidenceStorage({ containerClient: container, clock: CLOCK });

    const meta = await storage.putEvidenceObject(putInput());
    const expectedKey = buildEvidenceStorageKey(TENANT, EVIDENCE_ID, meta.sha256);

    expect(meta.storageProvider).toBe('azure_blob');
    expect(meta.storageContainer).toBe('evidence');
    expect(meta.storageKey).toBe(expectedKey);
    expect(meta.sha256).toBe(sha256Hex(enc.encode('evidence-bytes')));
    expect(meta.createdAt).toBe('1970-01-01T00:00:00.000Z');

    const blob = container.getBlockBlobClient(expectedKey);
    expect(blob.uploaded?.options?.blobHTTPHeaders?.blobContentType).toBe('application/pdf');
    // Blob metadata is NSO-generic and contains no payload bytes.
    expect(blob.uploaded?.options?.metadata).toEqual({
      tenantId: TENANT,
      evidenceObjectId: EVIDENCE_ID,
      sha256: meta.sha256,
    });
  });

  // (7) Sends the exact payload without logging its contents.
  it('uploads the exact payload bytes and never logs their contents', async () => {
    const container = new FakeContainerClient();
    const logs: string[] = [];
    const storage = new AzureBlobEvidenceStorage({
      containerClient: container,
      clock: CLOCK,
      log: (m) => logs.push(m),
    });

    const meta = await storage.putEvidenceObject(putInput());
    const blob = container.getBlockBlobClient(meta.storageKey);
    expect(new TextDecoder().decode(blob.uploaded?.content ?? new Uint8Array())).toBe(
      'evidence-bytes',
    );
    // Logs may reference the key/size but never the payload contents.
    for (const line of logs) {
      expect(line).not.toContain('evidence-bytes');
    }
  });

  // Round-trips through download and verifies the digest.
  it('downloads and verifies the payload digest', async () => {
    const container = new FakeContainerClient();
    const storage = new AzureBlobEvidenceStorage({ containerClient: container, clock: CLOCK });
    const meta = await storage.putEvidenceObject(putInput());

    const result = await storage.getEvidenceObject({
      tenantId: TENANT,
      evidenceObjectId: EVIDENCE_ID,
      storageProvider: 'azure_blob',
      storageContainer: 'evidence',
      storageKey: meta.storageKey,
      sha256: meta.sha256,
    });
    expect(new TextDecoder().decode(result.content)).toBe('evidence-bytes');
  });

  // Missing blob maps to a controlled not-found error.
  it('maps a 404 download to a controlled not-found error', async () => {
    const container = new FakeContainerClient();
    const storage = new AzureBlobEvidenceStorage({ containerClient: container, clock: CLOCK });
    await expect(
      storage.getEvidenceObject({
        tenantId: TENANT,
        evidenceObjectId: EVIDENCE_ID,
        storageProvider: 'azure_blob',
        storageContainer: 'evidence',
        storageKey: 'tenants/x/evidence/y/z',
        sha256: 'abc',
      }),
    ).rejects.toBeInstanceOf(EvidenceNotFoundError);
  });

  // (9) Propagates an upload failure as a controlled, sanitized storage error.
  it('wraps an upload failure in a controlled storage error', async () => {
    const container = new FakeContainerClient(true);
    const storage = new AzureBlobEvidenceStorage({ containerClient: container, clock: CLOCK });
    await expect(storage.putEvidenceObject(putInput())).rejects.toBeInstanceOf(
      EvidenceStorageError,
    );
  });

  it('creates the container on first write when ensureContainer is set', async () => {
    const container = new FakeContainerClient();
    const storage = new AzureBlobEvidenceStorage({
      containerClient: container,
      clock: CLOCK,
      ensureContainer: true,
    });
    await storage.putEvidenceObject(putInput());
    expect(container.createdContainer).toBe(true);
  });
});
