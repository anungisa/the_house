import { describe, it, expect } from 'vitest';

import {
  handleAffiliationOverview,
  handleAffiliationInitiate,
  type ButtonAffiliationHttpDeps,
  type ButtonAffiliationHttpRequest,
} from '../../../../../src/http/button/affiliation/ButtonAffiliationHttpAdapter.js';
import {
  AffiliationDraftService,
  InMemoryAffiliationDraftStore,
  InMemoryRequirementCatalogStore,
  InMemoryAffiliationLifecycleReader,
  InMemoryEvidenceReferenceValidator,
} from '../../../../../src/domains/affiliation-requirements/index.js';
import {
  RoleDerivedRepresentativeAuthorityProvider,
  OrganizationTypeJurisdictionResolver,
} from '../../../../../src/http/button/ButtonContextService.js';
import { CLUB_AFFILIATION_REPRESENTATIVE_ROLE } from '../../../../../src/http/button/ButtonContextTypes.js';
import type { OrganizationReadStore } from '../../../../../src/http/organization/OrganizationReadHttpAdapter.js';
import type {
  OrganizationListFilter,
  OrganizationListResult,
  OrganizationType,
  OrganizationView,
} from '../../../../../src/domains/organization-registry/OrganizationTypes.js';
import { DemoAuthContextResolver } from '../../../../../src/http/auth/DemoAuthContextResolver.js';
import { InMemoryTelemetry } from '../../../../../src/observability/index.js';
import type { EffectiveSeason } from '../../../../../src/domains/season-catalog/index.js';
import { seasonAuthorizationFrom } from '../../../../helpers/fakeSeasonAuthorization.js';

/**
 * Unit tests for SERVER-SIDE season authorization in the Button affiliation adapter. These pin the
 * governed contract that the season catalog — not a browser flag — decides which seasons a
 * representative may view (any published) and initiate against (current + application-accepting):
 *
 *  - a published season appears; an unpublished (unknown/draft/retired) season is invisible;
 *  - initiation requires the CURRENT, application-accepting season (fail closed, no disclosure);
 *  - a historical (past/closed) published season stays readable but cannot be initiated against.
 *
 * Protocol-pure and hermetic: identity travels in the `x-house-*` trusted-header contract and every
 * port (including the season authorization) is an in-memory double.
 */

const DEMO = new DemoAuthContextResolver();
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const CLUB_ID = 'club-1';
const NOW_ISO = '2026-01-15T00:00:00.000Z';

const CURRENT_SEASON = '2025-26';
const PAST_SEASON = '2024-25';
const FUTURE_SEASON = '2026-27';

function org(over: Partial<OrganizationView> & { organizationId: string }): OrganizationView {
  return {
    tenantId: TENANT_A,
    organizationType: 'local' as OrganizationType,
    displayName: 'Riverside Club',
    status: 'active',
    source: 'manual',
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    ...over,
  };
}

class FakeOrganizationReadStore implements OrganizationReadStore {
  constructor(private readonly rows: readonly OrganizationView[]) {}
  list(_tenantId: string, _filter: OrganizationListFilter): Promise<OrganizationListResult> {
    return Promise.resolve({ items: [] });
  }
  getById(tenantId: string, organizationId: string): Promise<OrganizationView | undefined> {
    return Promise.resolve(
      this.rows.find((r) => r.tenantId === tenantId && r.organizationId === organizationId),
    );
  }
}

function effective(over: Partial<EffectiveSeason> & { id: string }): EffectiveSeason {
  return {
    label: over.id,
    current: false,
    phase: 'upcoming',
    acceptingApplications: false,
    ...over,
  };
}

/** Catalog: current-open, historical (past/closed), and future-published-but-not-current seasons. */
const CATALOG: Readonly<Record<string, EffectiveSeason>> = {
  [CURRENT_SEASON]: effective({
    id: CURRENT_SEASON,
    current: true,
    phase: 'current',
    acceptingApplications: true,
  }),
  [PAST_SEASON]: effective({ id: PAST_SEASON, phase: 'past' }),
  [FUTURE_SEASON]: effective({ id: FUTURE_SEASON, phase: 'upcoming' }),
  // draft / retired / unknown seasons are intentionally ABSENT -> resolve 'unavailable'.
};

function build(): ButtonAffiliationHttpDeps {
  const service = new AffiliationDraftService({
    store: new InMemoryAffiliationDraftStore(),
    catalog: new InMemoryRequirementCatalogStore(),
    lifecycle: new InMemoryAffiliationLifecycleReader(),
    evidenceValidator: new InMemoryEvidenceReferenceValidator(),
  });
  return {
    service,
    organizations: new FakeOrganizationReadStore([org({ organizationId: CLUB_ID })]),
    authorities: new RoleDerivedRepresentativeAuthorityProvider(),
    jurisdictions: new OrganizationTypeJurisdictionResolver(),
    seasons: seasonAuthorizationFrom(CATALOG),
    nowIso: () => NOW_ISO,
    telemetry: new InMemoryTelemetry(),
  };
}

function repHeaders(): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': TENANT_A,
    'x-house-actor-user-id': 'user-1',
    'x-house-actor-role-keys': CLUB_AFFILIATION_REPRESENTATIVE_ROLE,
    'x-house-organization-id': CLUB_ID,
  };
}

function overviewReq(season: string): ButtonAffiliationHttpRequest {
  return { headers: repHeaders(), query: { organizationId: CLUB_ID, season }, params: {} };
}

function initiateReq(seasonId: string): ButtonAffiliationHttpRequest {
  return {
    headers: repHeaders(),
    query: {},
    params: {},
    body: { organizationId: CLUB_ID, seasonId, pathway: 'new_affiliation' },
  };
}

describe('button affiliation season authorization (overview)', () => {
  it('allows viewing the current published season', async () => {
    const result = await handleAffiliationOverview(build(), overviewReq(CURRENT_SEASON), 'r', DEMO);
    expect(result.status).toBe(200);
  });

  it('allows viewing a historical (past/closed) published season', async () => {
    const result = await handleAffiliationOverview(build(), overviewReq(PAST_SEASON), 'r', DEMO);
    expect(result.status).toBe(200);
  });

  it('hides an unpublished (unknown/draft/retired) season with a non-disclosing 409', async () => {
    const result = await handleAffiliationOverview(build(), overviewReq('draft-1'), 'r', DEMO);
    expect(result.status).toBe(409);
    expect(result.body['code']).toBe('SEASON_UNAVAILABLE');
  });
});

describe('button affiliation season authorization (initiate)', () => {
  it('permits initiation against the current, application-accepting season', async () => {
    const result = await handleAffiliationInitiate(build(), initiateReq(CURRENT_SEASON), 'r', DEMO);
    expect(result.status).toBe(200);
  });

  it('blocks initiation against a historical (past/closed) season', async () => {
    const result = await handleAffiliationInitiate(build(), initiateReq(PAST_SEASON), 'r', DEMO);
    expect(result.status).toBe(409);
    expect(result.body['code']).toBe('SEASON_UNAVAILABLE');
  });

  it('blocks initiation against a published-but-not-current future season', async () => {
    const result = await handleAffiliationInitiate(build(), initiateReq(FUTURE_SEASON), 'r', DEMO);
    expect(result.status).toBe(409);
    expect(result.body['code']).toBe('SEASON_UNAVAILABLE');
  });

  it('blocks initiation against an unknown/unpublished season', async () => {
    const result = await handleAffiliationInitiate(build(), initiateReq('nope'), 'r', DEMO);
    expect(result.status).toBe(409);
    expect(result.body['code']).toBe('SEASON_UNAVAILABLE');
  });
});
