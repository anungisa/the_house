import { describe, it, expect } from 'vitest';

import { MockAffiliationApiClient } from '../api/affiliationClient';
import { AffiliationMockStore } from '../api/affiliationMockData';
import { AffiliationApiError } from '../api/affiliationTypes';

function newFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'application/pdf' });
}

describe('MockAffiliationApiClient (synthetic surface parity)', () => {
  it('initiate binds the applicable versioned requirements and is idempotent', async () => {
    const client = new MockAffiliationApiClient();
    const first = await client.initiate({ organizationId: 'club-1', seasonId: '2025-26' });
    expect(first.lifecycleStatus).toBe('draft');
    expect(first.requirements.map((r) => r.code).sort()).toEqual([
      'GOVERNING_DOCUMENT',
      'INSURANCE_CONFIRMATION',
      'ORG_PROFILE_CONFIRMATION',
      'PRIMARY_CONTACT_DETAILS',
    ]);
    expect(first.requirements.every((r) => r.version === 1)).toBe(true);

    // Idempotent: initiating again returns the same application (not a second draft).
    const second = await client.initiate({ organizationId: 'club-1', seasonId: '2025-26' });
    expect(second.applicationId).toBe(first.applicationId);
  });

  it('persists a response and reloads it (answered but not automatically submitted)', async () => {
    const store = new AffiliationMockStore();
    const client = new MockAffiliationApiClient(store);
    const app = await client.initiate({ organizationId: 'club-1', seasonId: '2025-26' });

    const saved = await client.saveDraft({
      applicationId: app.applicationId,
      expectedVersion: app.concurrencyToken,
      responses: [{ requirementCode: 'ORG_PROFILE_CONFIRMATION', value: { acknowledged: true } }],
    });
    expect(saved.concurrencyToken).toBe('2');

    const reloaded = await client.getApplication(app.applicationId);
    const req = reloaded.requirements.find((r) => r.code === 'ORG_PROFILE_CONFIRMATION');
    expect(req?.response).toEqual({ acknowledged: true });
    expect(req?.status).toBe('answered');
    expect(reloaded.lifecycleStatus).toBe('draft'); // saving is not submitting
  });

  it('rejects a stale write with a version-conflict (optimistic concurrency)', async () => {
    const client = new MockAffiliationApiClient();
    const app = await client.initiate({ organizationId: 'club-1', seasonId: '2025-26' });
    await client.saveDraft({
      applicationId: app.applicationId,
      expectedVersion: app.concurrencyToken, // '1' -> now '2'
      responses: [{ requirementCode: 'ORG_PROFILE_CONFIRMATION', value: { acknowledged: true } }],
    });

    await expect(
      client.saveDraft({
        applicationId: app.applicationId,
        expectedVersion: '1', // stale
        responses: [{ requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'A' } }],
      }),
    ).rejects.toMatchObject({ category: 'version-conflict', httpStatus: 409 });
  });

  it('associates evidence WITHOUT advancing the lifecycle or bumping the token (association ≠ acceptance)', async () => {
    const store = new AffiliationMockStore();
    const client = new MockAffiliationApiClient(store);
    const app = await client.initiate({ organizationId: 'club-1', seasonId: '2025-26' });
    const beforeToken = app.concurrencyToken;

    const after = await client.associateEvidence({
      applicationId: app.applicationId,
      requirementCode: 'GOVERNING_DOCUMENT',
      file: newFile('bylaws.pdf'),
    });
    const doc = after.requirements.find((r) => r.code === 'GOVERNING_DOCUMENT');
    expect(doc?.evidence).toHaveLength(1);
    expect(doc?.evidence[0]?.displayName).toBe('bylaws.pdf');
    expect(after.lifecycleStatus).toBe('draft');
    expect(after.concurrencyToken).toBe(beforeToken); // association does not mutate the draft head

    // Remove only that link.
    const removed = await client.removeEvidence({
      applicationId: app.applicationId,
      linkId: doc!.evidence[0]!.linkId,
    });
    expect(removed.requirements.find((r) => r.code === 'GOVERNING_DOCUMENT')?.evidence).toHaveLength(0);
  });

  it('derives completeness that distinguishes blocked from answered', async () => {
    const store = new AffiliationMockStore();
    const client = new MockAffiliationApiClient(store);
    let app = await client.initiate({ organizationId: 'club-1', seasonId: '2025-26' });

    // INSURANCE_CONFIRMATION is blocked until GOVERNING_DOCUMENT is complete.
    expect(app.requirements.find((r) => r.code === 'INSURANCE_CONFIRMATION')?.status).toBe('blocked');
    expect(app.completeness.eligibleForSubmission).toBe(false);

    app = await client.saveDraft({
      applicationId: app.applicationId,
      expectedVersion: app.concurrencyToken,
      responses: [{ requirementCode: 'ORG_PROFILE_CONFIRMATION', value: { acknowledged: true } }],
    });
    expect(app.requirements.find((r) => r.code === 'ORG_PROFILE_CONFIRMATION')?.complete).toBe(true);
    // Still not all complete.
    expect(app.completeness.eligibleForSubmission).toBe(false);
  });

  it('fails closed for an organization the representative cannot represent (opaque not-found)', async () => {
    const client = new MockAffiliationApiClient();
    await expect(
      client.getOverview({ organizationId: 'club-9', season: '2025-26' }),
    ).rejects.toBeInstanceOf(AffiliationApiError);
    await expect(
      client.getOverview({ organizationId: 'club-9', season: '2025-26' }),
    ).rejects.toMatchObject({ category: 'not-found', httpStatus: 404 });
  });
});
