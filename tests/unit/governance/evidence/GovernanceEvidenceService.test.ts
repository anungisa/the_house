import { TextEncoder } from 'node:util';
import { describe, expect, it } from 'vitest';

import { fixedClock } from '../../../../src/shared/time/clock.js';
import { sha256Hex } from '../../../../src/governance/evidence/EvidenceHasher.js';
import { InMemoryEvidenceStorage } from '../../../../src/governance/evidence/InMemoryEvidenceStorage.js';
import { GovernanceEvidenceService } from '../../../../src/governance/evidence/GovernanceEvidenceService.js';
import { parseEvidenceStorageRef } from '../../../../src/governance/evidence/EvidenceMetadataBinding.js';
import type { IdGenerator } from '../../../../src/shared/uuid/id.js';

const enc = new TextEncoder();
const TENANT = '11111111-1111-1111-1111-111111111111';
const CLOCK = fixedClock(0);

function fixedId(id: string): IdGenerator {
  return { newId: () => id };
}

describe('GovernanceEvidenceService', () => {
  it('stores payload bytes and returns metadata plus a governance binding', async () => {
    const storage = new InMemoryEvidenceStorage({ clock: CLOCK });
    const service = new GovernanceEvidenceService(storage, {
      generateId: fixedId('33333333-3333-3333-3333-333333333333'),
    });

    const bytes = enc.encode('signed-affiliation.pdf');
    const result = await service.storeEvidencePayload({
      tenantId: TENANT,
      content: bytes,
      contentType: 'application/pdf',
      sourceFilename: 'signed.pdf',
    });

    expect(result.evidenceObjectId).toBe('33333333-3333-3333-3333-333333333333');
    expect(result.metadata.sha256).toBe(sha256Hex(bytes));
    expect(result.binding.contentHash).toBe(sha256Hex(bytes));

    const ref = parseEvidenceStorageRef(result.binding.storageRef);
    expect(ref.provider).toBe('memory');
    expect(ref.sha256).toBe(sha256Hex(bytes));
    expect(ref.contentType).toBe('application/pdf');
    expect(ref.sourceFilename).toBe('signed.pdf');
  });

  it('reuses a supplied evidence object id when provided', async () => {
    const storage = new InMemoryEvidenceStorage({ clock: CLOCK });
    const service = new GovernanceEvidenceService(storage);

    const result = await service.storeEvidencePayload({
      tenantId: TENANT,
      evidenceObjectId: '44444444-4444-4444-4444-444444444444',
      content: enc.encode('x'),
      contentType: 'text/plain',
    });

    expect(result.evidenceObjectId).toBe('44444444-4444-4444-4444-444444444444');
    expect(result.metadata.evidenceObjectId).toBe('44444444-4444-4444-4444-444444444444');
  });

  it('does not expose raw payload bytes in the returned binding', async () => {
    const storage = new InMemoryEvidenceStorage({ clock: CLOCK });
    const service = new GovernanceEvidenceService(storage);

    const result = await service.storeEvidencePayload({
      tenantId: TENANT,
      content: enc.encode('secret-bytes'),
      contentType: 'application/octet-stream',
    });

    expect(result.binding.storageRef).not.toContain('secret-bytes');
    expect(JSON.parse(result.binding.storageRef)).not.toHaveProperty('content');
  });

  it('is payload-only: it does not create governance lifecycle evidence metadata', () => {
    // GovernanceEvidenceService exposes exactly one operation: storeEvidencePayload.
    // It has no method to write governance.evidence_object — that remains the kernel's job.
    const service = new GovernanceEvidenceService(new InMemoryEvidenceStorage({ clock: CLOCK }));
    const ownKeys = Object.getOwnPropertyNames(
      Object.getPrototypeOf(service) as object,
    ).filter((k) => k !== 'constructor');
    expect(ownKeys).toEqual(['storeEvidencePayload']);
  });
});
