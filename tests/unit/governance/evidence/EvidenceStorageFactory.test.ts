import { TextDecoder, TextEncoder } from 'node:util';
import { describe, expect, it } from 'vitest';

import type { EvidenceStorageConfig } from '../../../../src/config/index.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';
import { AzureBlobEvidenceStorage } from '../../../../src/governance/evidence/AzureBlobEvidenceStorage.js';
import type {
  BlockBlobClientLike,
  ContainerClientLike,
} from '../../../../src/governance/evidence/AzureBlobEvidenceStorage.js';
import { InMemoryEvidenceStorage } from '../../../../src/governance/evidence/InMemoryEvidenceStorage.js';
import { createEvidenceStorage } from '../../../../src/governance/evidence/EvidenceStorageFactory.js';
import { EvidenceStorageService } from '../../../../src/governance/evidence/EvidenceStorageService.js';
import type { IdGenerator } from '../../../../src/shared/uuid/id.js';

const MEMORY_CONFIG: EvidenceStorageConfig = {
  provider: 'memory',
  connectionString: '',
  containerName: '',
  requireHash: true,
};

const AZURE_CONFIG: EvidenceStorageConfig = {
  provider: 'azure_blob',
  connectionString: 'UseDevelopmentStorage=true',
  containerName: 'evidence',
  requireHash: true,
};

class StubBlockBlobClient implements BlockBlobClientLike {
  uploadData(): Promise<unknown> {
    return Promise.resolve({});
  }
  downloadToBuffer(): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array());
  }
  deleteIfExists(): Promise<{ succeeded: boolean }> {
    return Promise.resolve({ succeeded: true });
  }
}

class StubContainerClient implements ContainerClientLike {
  readonly containerName = 'evidence';
  getBlockBlobClient(): BlockBlobClientLike {
    return new StubBlockBlobClient();
  }
  createIfNotExists(): Promise<unknown> {
    return Promise.resolve({});
  }
}

describe('createEvidenceStorage', () => {
  // (10) Defaults to the in-memory backend.
  it('returns the in-memory backend for the memory provider', () => {
    const storage = createEvidenceStorage(MEMORY_CONFIG);
    expect(storage).toBeInstanceOf(InMemoryEvidenceStorage);
    expect(storage.provider).toBe('memory');
  });

  // (11) Returns the Azure backend when configured, using an injected container client.
  it('returns the Azure backend when configured', () => {
    let connArg = '';
    let containerArg = '';
    const storage = createEvidenceStorage(AZURE_CONFIG, {
      createContainerClient: (connectionString, containerName) => {
        connArg = connectionString;
        containerArg = containerName;
        return new StubContainerClient();
      },
    });
    expect(storage).toBeInstanceOf(AzureBlobEvidenceStorage);
    expect(storage.provider).toBe('azure_blob');
    expect(connArg).toBe('UseDevelopmentStorage=true');
    expect(containerArg).toBe('evidence');
  });
});

describe('EvidenceStorageService', () => {
  const enc = new TextEncoder();

  it('generates an evidence object id when none is supplied', async () => {
    const storage = new InMemoryEvidenceStorage({ clock: fixedClock(0) });
    const idGen: IdGenerator = { newId: () => 'generated-id' };
    const service = new EvidenceStorageService(storage, { generateId: idGen });

    const meta = await service.storeEvidencePayload({
      tenantId: '11111111-1111-1111-1111-111111111111',
      content: enc.encode('doc'),
      contentType: 'text/plain',
    });
    expect(meta.evidenceObjectId).toBe('generated-id');
  });

  it('reuses a supplied evidence object id and round-trips via a ref', async () => {
    const storage = new InMemoryEvidenceStorage({ clock: fixedClock(0) });
    const service = new EvidenceStorageService(storage);

    const meta = await service.storeEvidencePayload({
      tenantId: '11111111-1111-1111-1111-111111111111',
      evidenceObjectId: 'evid-1',
      content: enc.encode('doc'),
      contentType: 'text/plain',
    });
    expect(meta.evidenceObjectId).toBe('evid-1');

    const result = await storage.getEvidenceObject(EvidenceStorageService.refFromMetadata(meta));
    expect(new TextDecoder().decode(result.content)).toBe('doc');
  });
});
