import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EvidenceStorage } from '../../../src/governance/evidence/EvidenceStorage.js';
import * as evidenceStorageFactory from '../../../src/governance/evidence/EvidenceStorageFactory.js';
import { createPgAffiliationHttpServer } from '../../../src/http/composition.js';

const ENV_KEYS = [
  'DATABASE_URL',
  'EVIDENCE_STORAGE_PROVIDER',
  'EVIDENCE_BLOB_CONNECTION_STRING',
  'EVIDENCE_BLOB_CONTAINER_NAME',
] as const;

const savedEnv = new Map<string, string | undefined>();

for (const key of ENV_KEYS) {
  savedEnv.set(key, process.env[key]);
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) {
    const original = savedEnv.get(key);
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

function fakeStorage(provider: 'memory' | 'azure_blob'): EvidenceStorage {
  return {
    provider,
    async putEvidenceObject() {
      throw new Error('Not implemented for composition test');
    },
    async getEvidenceObject() {
      throw new Error('Not implemented for composition test');
    },
  };
}

describe('createPgAffiliationHttpServer evidence storage composition', () => {
  it('constructs one logical evidence storage boundary for memory provider', () => {
    process.env.DATABASE_URL = 'postgres://user:pw@localhost:5432/the_house';
    process.env.EVIDENCE_STORAGE_PROVIDER = 'memory';

    const spy = vi
      .spyOn(evidenceStorageFactory, 'createEvidenceStorage')
      .mockReturnValue(fakeStorage('memory'));

    const server = createPgAffiliationHttpServer();

    expect(server).toBeDefined();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ provider: 'memory' }));
  });

  it('constructs one logical evidence storage boundary for azure blob provider', () => {
    process.env.DATABASE_URL = 'postgres://user:pw@localhost:5432/the_house';
    process.env.EVIDENCE_STORAGE_PROVIDER = 'azure_blob';
    process.env.EVIDENCE_BLOB_CONNECTION_STRING =
      'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=test;EndpointSuffix=core.windows.net';
    process.env.EVIDENCE_BLOB_CONTAINER_NAME = 'evidence';

    const spy = vi
      .spyOn(evidenceStorageFactory, 'createEvidenceStorage')
      .mockReturnValue(fakeStorage('azure_blob'));

    const server = createPgAffiliationHttpServer();

    expect(server).toBeDefined();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ provider: 'azure_blob' }));
  });
});
