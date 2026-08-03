import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpAffiliationApiClient, MockAffiliationApiClient } from '../api/affiliationClient';
import { AffiliationMockStore } from '../api/affiliationMockData';
import { AffiliationApiError } from '../api/affiliationTypes';

function newFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'application/pdf' });
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

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

  it('associates evidence without advancing lifecycle and invalidates stale draft submissions', async () => {
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
    expect(after.concurrencyToken).not.toBe(beforeToken);

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

  it('submits a complete draft once and replays the immutable receipt by idempotency key', async () => {
    const client = new MockAffiliationApiClient();
    let app = await client.initiate({ organizationId: 'club-1', seasonId: '2025-26' });
    app = await client.saveDraft({
      applicationId: app.applicationId,
      expectedVersion: app.concurrencyToken,
      responses: [
        { requirementCode: 'ORG_PROFILE_CONFIRMATION', value: { acknowledged: true } },
        { requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'Dana' } },
        { requirementCode: 'GOVERNING_DOCUMENT', value: { attached: true } },
        { requirementCode: 'INSURANCE_CONFIRMATION', value: { confirmed: true } },
      ],
    });
    app = await client.associateEvidence({
      applicationId: app.applicationId,
      requirementCode: 'GOVERNING_DOCUMENT',
      file: newFile('bylaws.pdf'),
    });
    app = await client.associateEvidence({
      applicationId: app.applicationId,
      requirementCode: 'INSURANCE_CONFIRMATION',
      file: newFile('insurance.pdf'),
    });
    expect(app.completeness.eligibleForSubmission).toBe(true);

    const input = {
      applicationId: app.applicationId,
      expectedVersion: app.concurrencyToken,
      idempotencyKey: 'submit-app-1-v2',
    };
    const first = await client.submit(input);
    const replay = await client.submit(input);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      applicationId: app.applicationId,
      sequence: 1,
      sourceDraftVersion: 4,
      idempotencyKey: input.idempotencyKey,
    });
    expect((await client.getApplication(app.applicationId)).lifecycleStatus).toBe('submitted');
  });

  it('exposes bounded correction scope and appends a corrected resubmission receipt', async () => {
    const store = new AffiliationMockStore();
    const client = new MockAffiliationApiClient(store);
    let app = await client.initiate({ organizationId: 'club-1', seasonId: '2025-26' });
    app = await client.saveDraft({
      applicationId: app.applicationId,
      expectedVersion: app.concurrencyToken,
      responses: [
        { requirementCode: 'ORG_PROFILE_CONFIRMATION', value: { acknowledged: true } },
        { requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'Dana' } },
        { requirementCode: 'GOVERNING_DOCUMENT', value: { attached: true } },
        { requirementCode: 'INSURANCE_CONFIRMATION', value: { confirmed: true } },
      ],
    });
    for (const requirementCode of ['GOVERNING_DOCUMENT', 'INSURANCE_CONFIRMATION']) {
      app = await client.associateEvidence({
        applicationId: app.applicationId,
        requirementCode,
        file: newFile(`${requirementCode}.pdf`),
      });
    }
    await client.submit({
      applicationId: app.applicationId,
      expectedVersion: app.concurrencyToken,
      idempotencyKey: 'submit-1',
    });
    const correction = store.openCorrection(
      app.applicationId,
      ['PRIMARY_CONTACT_DETAILS'],
      [{ requirementCode: 'PRIMARY_CONTACT_DETAILS', reason: 'Add a phone number.' }],
    );
    expect((await client.getSubmissionState(app.applicationId)).openCorrection).toEqual(correction);
    await expect(
      client.saveDraft({
        applicationId: app.applicationId,
        expectedVersion: app.concurrencyToken,
        responses: [
          { requirementCode: 'ORG_PROFILE_CONFIRMATION', value: { acknowledged: false } },
        ],
      }),
    ).rejects.toMatchObject({ category: 'version-conflict', httpStatus: 409 });

    app = await client.saveDraft({
      applicationId: app.applicationId,
      expectedVersion: app.concurrencyToken,
      responses: [
        { requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'Dana', phone: '555-0100' } },
      ],
    });
    const receipt = await client.resubmitCorrection({
      applicationId: app.applicationId,
      correctionRequestId: correction.correctionRequestId,
      expectedVersion: app.concurrencyToken,
      idempotencyKey: 'resubmit-1',
    });
    expect(receipt.sequence).toBe(2);
    expect((await client.getSubmissionState(app.applicationId)).receipts).toHaveLength(2);
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

describe('HttpAffiliationApiClient', () => {
  it('maps network failures to service-unavailable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('network down'));

    const client = new HttpAffiliationApiClient();

    await expect(client.getOverview({ organizationId: 'club-1', season: '2025-26' })).rejects.toMatchObject(
      {
        category: 'service-unavailable',
      },
    );
  });
});
