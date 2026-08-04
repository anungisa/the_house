/**
 * Button standing-renewal initiation HTTP adapter — bounded-command + security proofs (hermetic).
 *
 * These proofs pin the representative-facing contract of
 * `POST /v1/button/affiliation/standing/:standingId/renewals`: it starts OR resumes a renewal by
 * routing into the EXISTING application workflow, and NEVER executes the governed standing-renewal
 * transition (renew / renew_active). Everything the browser could assert is re-resolved server-side
 * — authority, organization, target season, jurisdiction, posture, source version — so a trusted
 * identity without a governed, active authority gets nothing, a foreign standing is an opaque 404,
 * and a browser-supplied source version/season is ignored. All ports are in-memory fakes.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  handleButtonStandingRenewalInitiate,
  type ButtonStandingRenewalHttpDeps,
} from '../../../../../src/http/button/standing/index.js';
import type { StandingReviewRecord } from '../../../../../src/domains/affiliation-standing/StandingReviewService.js';
import type { StandingRenewalView } from '../../../../../src/domains/affiliation-standing/index.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const STANDING = '33333333-3333-4333-8333-333333333333';
const APP = '44444444-4444-4444-8444-444444444444';
const RENEWAL_APP = '55555555-5555-4555-8555-555555555555';
const NOW_ISO = '2026-06-01T00:00:00.000Z';
const TARGET = '2026-27';

function headers(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const base: Record<string, string> = {
    'x-house-tenant-id': TENANT,
    'x-house-actor-user-id': 'rep-user',
    'x-house-actor-role-keys': 'club_affiliation_representative',
    'x-house-organization-id': ORG,
    'idempotency-key': 'idem-1',
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete base[k];
    else base[k] = v;
  }
  return base;
}

function record(overrides: Partial<StandingReviewRecord> = {}): StandingReviewRecord {
  return {
    standingId: STANDING,
    affiliationApplicationId: APP,
    organizationId: ORG,
    season: '2025-26',
    standingVersion: 7,
    effectiveFrom: '2025-09-01T00:00:00.000Z',
    effectiveUntil: '2026-06-20T00:00:00.000Z',
    pathway: 'new_affiliation',
    lifecycleState: 'active',
    ...overrides,
  };
}

const ELIGIBLE_VIEW: StandingRenewalView = {
  posture: 'eligible',
  pathway: 'continuity',
  targetSeasons: [
    { id: TARGET, label: '2026-27', phase: 'upcoming', acceptingApplications: true },
  ],
};

interface Fakes {
  readonly authorityStatus?: 'active' | 'expired';
  readonly orgStatus?: 'active' | 'inactive';
  readonly seasonOk?: boolean;
  readonly jurisdictionResolved?: boolean;
  readonly standing?: StandingReviewRecord | undefined;
  readonly view?: StandingRenewalView;
  readonly created?: boolean;
  readonly initiateDetailed?: ReturnType<typeof vi.fn>;
  readonly getStanding?: ReturnType<typeof vi.fn>;
}

function deps(f: Fakes = {}): {
  deps: ButtonStandingRenewalHttpDeps;
  initiateDetailed: ReturnType<typeof vi.fn>;
  getStanding: ReturnType<typeof vi.fn>;
} {
  const initiateDetailed =
    f.initiateDetailed ??
    vi.fn().mockResolvedValue({
      application: { applicationId: RENEWAL_APP },
      created: f.created ?? true,
    });
  const standingRecord = 'standing' in f ? f.standing : record();
  const getStanding = f.getStanding ?? vi.fn().mockResolvedValue(standingRecord);

  const built: ButtonStandingRenewalHttpDeps = {
    organizations: {
      getById: vi
        .fn()
        .mockResolvedValue({ id: ORG, status: f.orgStatus ?? 'active', organizationType: 'club' }),
    } as unknown as ButtonStandingRenewalHttpDeps['organizations'],
    authorities: {
      authoritiesFor: vi
        .fn()
        .mockResolvedValue([{ organizationId: ORG, status: f.authorityStatus ?? 'active' }]),
    } as unknown as ButtonStandingRenewalHttpDeps['authorities'],
    jurisdictions: {
      jurisdictionFor: vi.fn().mockResolvedValue(
        f.jurisdictionResolved === false
          ? { outcome: 'unresolved' }
          : { outcome: 'resolved', jurisdiction: { code: 'ON' } },
      ),
    } as unknown as ButtonStandingRenewalHttpDeps['jurisdictions'],
    seasons: {
      resolveSeason: vi.fn().mockResolvedValue(
        f.seasonOk === false
          ? { outcome: 'unavailable' }
          : { outcome: 'ok', season: { current: true, acceptingApplications: true } },
      ),
    } as unknown as ButtonStandingRenewalHttpDeps['seasons'],
    nowIso: () => NOW_ISO,
    standing: {
      getStanding,
    } as unknown as ButtonStandingRenewalHttpDeps['standing'],
    eligibility: {
      evaluateForRecord: vi.fn().mockResolvedValue(f.view ?? ELIGIBLE_VIEW),
    } as unknown as ButtonStandingRenewalHttpDeps['eligibility'],
    draft: {
      initiateDetailed,
    } as unknown as ButtonStandingRenewalHttpDeps['draft'],
  };
  return { deps: built, initiateDetailed, getStanding };
}

async function run(f: Fakes = {}, body: unknown = { targetSeasonId: TARGET }, hdrs = headers()) {
  const { deps: d, initiateDetailed, getStanding } = deps(f);
  const result = await handleButtonStandingRenewalInitiate(
    d,
    { headers: hdrs, params: { standingId: STANDING }, body },
    'request-1',
  );
  return { result, initiateDetailed, getStanding };
}

describe('Button standing-renewal initiation HTTP adapter', () => {
  it('starts a new renewal (201) routed into the application workflow with server-resolved source facts', async () => {
    const { result, initiateDetailed } = await run({ created: true });

    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      status: 'ok',
      posture: 'eligible',
      created: true,
      renewalApplicationId: RENEWAL_APP,
    });
    // The renewal is an ordinary renewal-pathway application (no second workflow, no kernel renew).
    const call = initiateDetailed.mock.calls[0]![0] as Record<string, unknown>;
    expect(call).toMatchObject({ organizationId: ORG, seasonId: TARGET });
    expect((call['context'] as Record<string, unknown>)['pathway']).toBe('renewal');
    // Source facts come from the SERVER-resolved record, never the request body.
    expect(call['renewal']).toMatchObject({
      standingId: STANDING,
      sourceStandingVersion: 7,
      sourceSeasonId: '2025-26',
      targetSeasonId: TARGET,
    });
  });

  it('an idempotent replay resumes the existing application (200, created:false)', async () => {
    const { result } = await run({ created: false });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ created: false, resumed: true, renewalApplicationId: RENEWAL_APP });
  });

  it('an already-in-progress renewal resumes WITHOUT initiating a new application', async () => {
    const { result, initiateDetailed } = await run({
      view: { posture: 'in_progress', targetSeasons: [], renewalApplicationId: RENEWAL_APP },
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ posture: 'in_progress', resumed: true, renewalApplicationId: RENEWAL_APP });
    expect(initiateDetailed).not.toHaveBeenCalled();
  });

  it('a reconciliation-required standing is a 409, never a silent start', async () => {
    const { result, initiateDetailed } = await run({
      view: { posture: 'reconciliation_required', targetSeasons: [] },
    });
    expect(result.status).toBe(409);
    expect(result.body['code']).toBe('STANDING_RENEWAL_RECONCILIATION_REQUIRED');
    expect(initiateDetailed).not.toHaveBeenCalled();
  });

  it('a not-eligible standing is a 409', async () => {
    const { result, initiateDetailed } = await run({
      view: { posture: 'not_eligible', reasonCode: 'renewal_window_not_open', targetSeasons: [] },
    });
    expect(result.status).toBe(409);
    expect(result.body['code']).toBe('STANDING_RENEWAL_NOT_ELIGIBLE');
    expect(initiateDetailed).not.toHaveBeenCalled();
  });

  it('rejects a target season the server did not independently offer (409)', async () => {
    const { result, initiateDetailed } = await run({}, { targetSeasonId: '2099-00' });
    expect(result.status).toBe(409);
    expect(result.body['code']).toBe('STANDING_RENEWAL_NOT_ELIGIBLE');
    expect(initiateDetailed).not.toHaveBeenCalled();
  });

  it('a foreign / out-of-scope standing is an opaque 404 (no existence disclosure)', async () => {
    const { result } = await run({ standing: undefined });
    expect(result.status).toBe(404);
    expect(result.body['code']).toBe('NOT_FOUND');
  });

  it('a trusted identity whose authority is not active is blocked (403)', async () => {
    const { result, initiateDetailed } = await run({ authorityStatus: 'expired' });
    expect(result.status).toBe(403);
    expect(initiateDetailed).not.toHaveBeenCalled();
  });

  it('a closed / non-current target season fails closed (409)', async () => {
    const { result, initiateDetailed } = await run({ seasonOk: false });
    expect(result.status).toBe(409);
    expect(result.body['code']).toBe('SEASON_UNAVAILABLE');
    expect(initiateDetailed).not.toHaveBeenCalled();
  });

  it('an organization with no resolving jurisdiction cannot initiate (409)', async () => {
    const { result, initiateDetailed } = await run({ jurisdictionResolved: false });
    expect(result.status).toBe(409);
    expect(result.body['code']).toBe('JURISDICTION_UNAVAILABLE');
    expect(initiateDetailed).not.toHaveBeenCalled();
  });

  it('requires an Idempotency-Key header (400)', async () => {
    const { result, initiateDetailed } = await run(
      {},
      { targetSeasonId: TARGET },
      headers({ 'idempotency-key': undefined }),
    );
    expect(result.status).toBe(400);
    expect(initiateDetailed).not.toHaveBeenCalled();
  });

  it('rejects a malformed standing id with 400 before any governed lookup', async () => {
    const { deps: d, getStanding } = deps();
    const result = await handleButtonStandingRenewalInitiate(
      d,
      { headers: headers(), params: { standingId: 'not-a-uuid' }, body: { targetSeasonId: TARGET } },
      'request-bad',
    );
    expect(result.status).toBe(400);
    expect(getStanding).not.toHaveBeenCalled();
  });
});
