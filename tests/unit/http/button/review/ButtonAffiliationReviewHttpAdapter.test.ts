import { describe, expect, it } from 'vitest';

import {
  handleAffiliationReviewCase,
  handleAffiliationReviewQueue,
  handleAffiliationReviewStart,
} from '../../../../../src/http/button/review/index.js';
import type { AffiliationReviewService } from '../../../../../src/domains/affiliation-review/index.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const SCOPE = '22222222-2222-4222-8222-222222222222';
const APPLICATION = '33333333-3333-4333-8333-333333333333';

function headers(role = 'reviewer'): Record<string, string> {
  return {
    'x-house-tenant-id': TENANT,
    'x-house-actor-user-id': 'reviewer-1',
    'x-house-actor-role-keys': role,
    'x-house-organization-id': SCOPE,
  };
}

function service(): AffiliationReviewService {
  return {
    listQueue: () =>
      Promise.resolve([
        {
          applicationId: APPLICATION,
          organizationId: SCOPE,
          seasonId: '2025-26',
          lifecycleState: 'submitted' as const,
          submittedAt: '2026-01-15T00:00:00.000Z',
          submissionSequence: 1,
        },
      ]),
    startReview: () =>
      Promise.resolve({
        applicationId: APPLICATION,
        organizationId: SCOPE,
        seasonId: '2025-26',
        lifecycleState: 'under_review' as const,
        submittedAt: '2026-01-15T00:00:00.000Z',
        submissionSequence: 1,
        assignedReviewerUserId: 'reviewer-1',
      }),
    getCase: () =>
      Promise.resolve({
        applicationId: APPLICATION,
        organizationId: SCOPE,
        seasonId: '2025-26',
        lifecycleState: 'under_review' as const,
        submittedAt: '2026-01-15T00:00:00.000Z',
        submissionSequence: 1,
        assignedReviewerUserId: 'reviewer-1',
        requirements: [
          {
            code: 'GOVERNING_DOCUMENT',
            version: 1,
            titleEn: 'Governing document',
            titleFr: 'Document constitutif',
            guidanceEn: 'Review it.',
            guidanceFr: 'Examinez-le.',
            appliesBecause: 'Required.',
            response: { attached: true },
            evidence: [
              {
                evidenceObjectId: 'evidence-1',
                contentType: 'application/pdf',
                displayName: 'governing-document.pdf',
              },
            ],
          },
        ],
      }),
  } as unknown as AffiliationReviewService;
}

describe('Button affiliation review HTTP adapter', () => {
  it('returns the resource-scoped reviewer queue', async () => {
    const result = await handleAffiliationReviewQueue(
      service(),
      { headers: headers(), query: { season: '2025-26' }, params: {} },
      'req-queue',
    );
    expect(result.status).toBe(200);
    expect(result.body['items']).toEqual([
      expect.objectContaining({ applicationId: APPLICATION, lifecycleState: 'submitted' }),
    ]);
  });

  it('starts review using trusted identity and an idempotency key', async () => {
    const result = await handleAffiliationReviewStart(
      service(),
      {
        headers: { ...headers(), 'idempotency-key': `review-start:${APPLICATION}` },
        query: {},
        params: { applicationId: APPLICATION },
        body: {},
      },
      'req-start',
    );
    expect(result.status).toBe(200);
    expect(result.body['item']).toEqual(
      expect.objectContaining({
        applicationId: APPLICATION,
        lifecycleState: 'under_review',
        assignedReviewerUserId: 'reviewer-1',
      }),
    );
  });

  it('returns an assigned reviewer-safe submitted snapshot', async () => {
    const result = await handleAffiliationReviewCase(
      service(),
      {
        headers: headers(),
        query: {},
        params: { applicationId: APPLICATION },
      },
      'req-case',
    );
    expect(result.status).toBe(200);
    expect(result.body['reviewCase']).toEqual(
      expect.objectContaining({
        applicationId: APPLICATION,
        lifecycleState: 'under_review',
        requirements: [
          expect.objectContaining({
            code: 'GOVERNING_DOCUMENT',
            evidence: [
              expect.not.objectContaining({ contentHash: expect.anything() }),
            ],
          }),
        ],
      }),
    );
  });

  it('rejects an invalid queue state before calling the domain', async () => {
    const result = await handleAffiliationReviewQueue(
      service(),
      { headers: headers(), query: { state: 'all' }, params: {} },
      'req-invalid',
    );
    expect(result.status).toBe(400);
    expect(result.body['code']).toBe('INVALID_INPUT');
  });
});
