import { describe, it, expect } from 'vitest';
import {
  buildEvidenceStorageRef,
  parseEvidenceStorageRef,
  serializeEvidenceStorageRef,
  toEvidencePayloadBinding,
  type EvidenceStorageRef,
} from '../../../../src/governance/evidence/EvidenceMetadataBinding.js';
import type { StoredEvidenceMetadata } from '../../../../src/governance/evidence/EvidenceStorage.js';

const SHA = 'a'.repeat(64);

function meta(overrides: Partial<StoredEvidenceMetadata> = {}): StoredEvidenceMetadata {
  return {
    tenantId: '11111111-1111-1111-1111-111111111111',
    evidenceObjectId: '22222222-2222-2222-2222-222222222222',
    contentType: 'application/pdf',
    sizeBytes: 1234,
    sha256: SHA,
    storageProvider: 'memory',
    storageContainer: 'evidence',
    storageKey: 'tenants/t/evidence/e/' + SHA,
    createdAt: '1970-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('EvidenceMetadataBinding', () => {
  it('builds a storage reference from stored payload metadata', () => {
    const ref = buildEvidenceStorageRef(meta());
    expect(ref).toEqual({
      provider: 'memory',
      container: 'evidence',
      key: 'tenants/t/evidence/e/' + SHA,
      contentType: 'application/pdf',
      sizeBytes: 1234,
      sha256: SHA,
    } satisfies EvidenceStorageRef);
  });

  it('includes optional sourceFilename and retentionClass when present', () => {
    const ref = buildEvidenceStorageRef(
      meta({ sourceFilename: 'cert.pdf', retentionClass: 'long' }),
    );
    expect(ref.sourceFilename).toBe('cert.pdf');
    expect(ref.retentionClass).toBe('long');
  });

  it('omits optional fields when absent (no undefined keys serialized)', () => {
    const serialized = serializeEvidenceStorageRef(buildEvidenceStorageRef(meta()));
    expect(serialized).not.toContain('sourceFilename');
    expect(serialized).not.toContain('retentionClass');
    expect(serialized).not.toContain('undefined');
  });

  it('round-trips serialize/parse', () => {
    const ref = buildEvidenceStorageRef(meta({ sourceFilename: 'a.pdf' }));
    expect(parseEvidenceStorageRef(serializeEvidenceStorageRef(ref))).toEqual(ref);
  });

  it('converts stored metadata into a governance evidence payload binding', () => {
    const binding = toEvidencePayloadBinding(meta());
    expect(binding.contentHash).toBe(SHA);
    const ref = parseEvidenceStorageRef(binding.storageRef);
    expect(ref.provider).toBe('memory');
    expect(ref.container).toBe('evidence');
    expect(ref.key).toBe('tenants/t/evidence/e/' + SHA);
    expect(ref.contentType).toBe('application/pdf');
    expect(ref.sizeBytes).toBe(1234);
    expect(ref.sha256).toBe(SHA);
  });

  it('contentHash is populated from the SHA-256 digest', () => {
    const binding = toEvidencePayloadBinding(meta({ sha256: 'b'.repeat(64) }));
    expect(binding.contentHash).toBe('b'.repeat(64));
  });

  it('binding storageRef never contains raw payload bytes (only references)', () => {
    const binding = toEvidencePayloadBinding(meta());
    // The reference is metadata only: provider/container/key/hash/size/contentType.
    expect(JSON.parse(binding.storageRef)).not.toHaveProperty('content');
    expect(JSON.parse(binding.storageRef)).not.toHaveProperty('bytes');
  });
});
