import { describe, expect, it, vi } from 'vitest';

import type { StandingReviewService } from '../../../../../src/domains/affiliation-standing/index.js';
import type { RepresentativeAuthorityProvider } from '../../../../../src/http/button/ButtonContextService.js';
import {
  handleButtonStandingDetail,
  handleButtonStandingQueue,
  type ButtonStandingHttpDeps,
} from '../../../../../src/http/button/standing/index.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const STANDING = '33333333-3333-4333-8333-333333333333';
const APP = '44444444-4444-4444-8444-444444444444';
const NOW_ISO = '2026-01-01T00:00:00.000Z';

function headers(): Record<string, string> {
  return {
    'x-house-tenant-id': TENANT,
    'x-house-actor-user-id': 'rep-user',
    'x-house-actor-role-keys': 'club_affiliation_representative',
    'x-house-organization-id': ORG,
  };
}

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    standingId: STANDING,
    affiliationApplicationId: APP,
    organizationId: ORG,
    season: '2026',
    standingVersion: 1,
    effectiveFrom: '2025-09-01T00:00:00.000Z',
    effectiveUntil: '2026-08-31T00:00:00.000Z',
    pathway: 'new_affiliation',
    lifecycleState: 'active',
    ...overrides,
  };
}

function activeAuthorities(): RepresentativeAuthorityProvider {
  return {
    authoritiesFor: vi.fn().mockResolvedValue([{ organizationId: ORG, status: 'active' }]),
  };
}

function deps(
  standing: Partial<StandingReviewService>,
  authorities: RepresentativeAuthorityProvider = activeAuthorities(),
): ButtonStandingHttpDeps {
  return {
    standing: standing as StandingReviewService,
    authorities,
    nowIso: () => NOW_ISO,
  };
}

describe('Button standing HTTP adapter', () => {
  it('lists standings scoped to the active-authority organization ids and derives expiry hints', async () => {
    const listForOrganizations = vi.fn().mockResolvedValue([record()]);
    const result = await handleButtonStandingQueue(
      deps({ listForOrganizations }),
      { headers: headers() },
      'request-list',
    );

    expect(result.status).toBe(200);
    expect(listForOrganizations).toHaveBeenCalledWith(TENANT, [ORG]);
    const items = result.body['items'] as ReadonlyArray<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      standingId: STANDING,
      status: 'active',
      isExpired: false,
    });
    expect(items[0]?.['daysUntilExpiry']).toBeGreaterThan(0);
  });

  it('returns an empty list (never queries) when the representative holds no active authority', async () => {
    const listForOrganizations = vi.fn().mockResolvedValue([]);
    const authorities: RepresentativeAuthorityProvider = {
      authoritiesFor: vi.fn().mockResolvedValue([{ organizationId: ORG, status: 'expired' }]),
    };
    const result = await handleButtonStandingQueue(
      deps({ listForOrganizations }, authorities),
      { headers: headers() },
      'request-empty',
    );

    expect(result.status).toBe(200);
    expect(result.body['items']).toEqual([]);
    expect(listForOrganizations).toHaveBeenCalledWith(TENANT, []);
  });

  it('marks an elapsed effective period as expired with no remaining days', async () => {
    const listForOrganizations = vi
      .fn()
      .mockResolvedValue([record({ effectiveUntil: '2025-08-31T00:00:00.000Z', lifecycleState: 'lapsed' })]);
    const result = await handleButtonStandingQueue(
      deps({ listForOrganizations }),
      { headers: headers() },
      'request-lapsed',
    );

    const items = result.body['items'] as ReadonlyArray<Record<string, unknown>>;
    expect(items[0]).toMatchObject({ status: 'lapsed', isExpired: true, daysUntilExpiry: null });
  });

  it('returns a single standing scoped to the active-authority organization ids', async () => {
    const getStanding = vi.fn().mockResolvedValue(record());
    const result = await handleButtonStandingDetail(
      deps({ getStanding }),
      { headers: headers(), params: { standingId: STANDING } },
      'request-detail',
    );

    expect(result.status).toBe(200);
    expect(getStanding).toHaveBeenCalledWith(TENANT, STANDING, [ORG]);
    expect(result.body['standing']).toMatchObject({ standingId: STANDING, status: 'active' });
  });

  it('returns an opaque 404 when the standing is outside the representative scope', async () => {
    const getStanding = vi.fn().mockResolvedValue(undefined);
    const result = await handleButtonStandingDetail(
      deps({ getStanding }),
      { headers: headers(), params: { standingId: STANDING } },
      'request-missing',
    );

    expect(result.status).toBe(404);
    expect(result.body['code']).toBe('NOT_FOUND');
  });

  it('rejects a malformed standing id with 400 before touching the service', async () => {
    const getStanding = vi.fn();
    const result = await handleButtonStandingDetail(
      deps({ getStanding }),
      { headers: headers(), params: { standingId: 'not-a-uuid' } },
      'request-bad-id',
    );

    expect(result.status).toBe(400);
    expect(getStanding).not.toHaveBeenCalled();
  });

  it('attaches a representative-safe renewal projection when a renewal reader is wired (additive)', async () => {
    const getStanding = vi.fn().mockResolvedValue(record());
    const evaluateForRecord = vi.fn().mockResolvedValue({
      posture: 'eligible',
      pathway: 'continuity',
      targetSeasons: [{ id: '2026-27', label: '2026-27', phase: 'upcoming', acceptingApplications: true }],
    });
    const base = deps({ getStanding });
    const withRenewal: ButtonStandingHttpDeps = {
      ...base,
      renewal: { evaluateForRecord } as unknown as ButtonStandingHttpDeps['renewal'],
    };
    const result = await handleButtonStandingDetail(
      withRenewal,
      { headers: headers(), params: { standingId: STANDING } },
      'request-renewal',
    );

    expect(result.status).toBe(200);
    expect(evaluateForRecord).toHaveBeenCalledWith(TENANT, expect.objectContaining({ standingId: STANDING }), NOW_ISO);
    expect(result.body['renewal']).toMatchObject({ posture: 'eligible', pathway: 'continuity' });
  });
});
