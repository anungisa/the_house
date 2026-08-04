import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAffiliationHttpServer } from '../../../../../src/http/server.js';
import type { AffiliationCommandExecutor } from '../../../../../src/http/AffiliationHttpAdapter.js';
import type {
  AffiliationApplicationTransitionRequest,
  AffiliationApplicationTransitionResponse,
} from '../../../../../src/domains/affiliation/AffiliationApplicationDtos.js';
import type { ButtonAffiliationHttpDeps } from '../../../../../src/http/button/affiliation/index.js';
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
import { acceptingSeasonAuthorization } from '../../../../helpers/fakeSeasonAuthorization.js';
import { InMemoryRenewalLinkRegistry } from '../../../../../src/domains/affiliation-standing/index.js';
import type { StandingReviewService, StandingReviewRecord } from '../../../../../src/domains/affiliation-standing/StandingReviewService.js';
import type {
  StandingRenewalEligibilityService,
  StandingRenewalView,
} from '../../../../../src/domains/affiliation-standing/index.js';

/**
 * Transport-only proofs for the Button standing-renewal routes wired into the native HTTP server
 * (`POST /v1/button/affiliation/standing/:standingId/renewals` + the renewal projection on the
 * standing DETAIL read). Unlike the adapter-level suite (which drives the handler directly), this
 * exercises the REAL server: path/method routing, deps assembly in `createAffiliationHttpServer`,
 * and the `{ status, code, message, requestId }` error envelope over a real loopback socket. It
 * proves the wired route starts a renewal INTO the single application workflow (201), is idempotent
 * on replay (200, no duplicate link/audit/outbox), and never executes a governed kernel transition.
 * Hermetic: every backing port is in-memory; no PostgreSQL, Azure, or external network.
 */

const { fetch } = globalThis;
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const CLUB_ID = 'club-1';
const STANDING_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_SEASON = '2025-26';
const TARGET_SEASON = '2026-27';
const NOW_ISO = '2026-06-01T00:00:00.000Z';

class NoopExecutor implements AffiliationCommandExecutor {
  executeCommand(
    _command: string,
    _request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return Promise.reject(new Error('not used'));
  }
}

class FakeOrganizationReadStore implements OrganizationReadStore {
  list(_tenantId: string, _filter: OrganizationListFilter): Promise<OrganizationListResult> {
    return Promise.resolve({ items: [] });
  }
  getById(tenantId: string, organizationId: string): Promise<OrganizationView | undefined> {
    if (tenantId !== TENANT_A || organizationId !== CLUB_ID) return Promise.resolve(undefined);
    return Promise.resolve({
      tenantId: TENANT_A,
      organizationId: CLUB_ID,
      organizationType: 'local' as OrganizationType,
      displayName: 'Riverside Club',
      status: 'active',
      source: 'manual',
      createdAt: '2026-01-15T00:00:00.000Z',
      updatedAt: '2026-01-15T00:00:00.000Z',
    });
  }
}

/** The server-resolved standing record for the acting club (source of renewal facts). */
function standingRecord(): StandingReviewRecord {
  return {
    standingId: STANDING_ID,
    affiliationApplicationId: '44444444-4444-4444-8444-444444444444',
    organizationId: CLUB_ID,
    season: SOURCE_SEASON,
    standingVersion: 7,
    effectiveFrom: '2025-09-01T00:00:00.000Z',
    effectiveUntil: '2026-06-20T00:00:00.000Z',
    pathway: 'new_affiliation',
    lifecycleState: 'active',
  };
}

const ELIGIBLE_VIEW: StandingRenewalView = {
  posture: 'eligible',
  pathway: 'continuity',
  targetSeasons: [{ id: TARGET_SEASON, label: TARGET_SEASON, phase: 'upcoming', acceptingApplications: true }],
};

interface Harness {
  readonly base: string;
  readonly renewalLinks: InMemoryRenewalLinkRegistry;
  readonly store: InMemoryAffiliationDraftStore;
}

const openServers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
});

async function start(options: { standing?: StandingReviewRecord | undefined } = {}): Promise<Harness> {
  const renewalLinks = new InMemoryRenewalLinkRegistry();
  const store = new InMemoryAffiliationDraftStore({ renewalLinks });
  const service = new AffiliationDraftService({
    store,
    catalog: new InMemoryRequirementCatalogStore(),
    lifecycle: new InMemoryAffiliationLifecycleReader(),
    evidenceValidator: new InMemoryEvidenceReferenceValidator(),
  });
  const buttonAffiliation: ButtonAffiliationHttpDeps = {
    service,
    organizations: new FakeOrganizationReadStore(),
    authorities: new RoleDerivedRepresentativeAuthorityProvider(),
    jurisdictions: new OrganizationTypeJurisdictionResolver(),
    seasons: acceptingSeasonAuthorization,
    nowIso: () => NOW_ISO,
  };
  const record = 'standing' in options ? options.standing : standingRecord();
  const buttonStanding = {
    getStanding: (_tenantId: string, standingId: string): Promise<StandingReviewRecord | undefined> =>
      Promise.resolve(record !== undefined && standingId === record.standingId ? record : undefined),
  } as unknown as StandingReviewService;
  const buttonStandingRenewal = {
    evaluateForRecord: (): Promise<StandingRenewalView> => Promise.resolve(ELIGIBLE_VIEW),
  } as unknown as StandingRenewalEligibilityService;

  const server = createAffiliationHttpServer({
    executor: new NoopExecutor(),
    buttonAffiliation,
    buttonStanding,
    buttonStandingRenewal,
  });
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, renewalLinks, store };
}

function headers(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-house-tenant-id': TENANT_A,
    'x-house-actor-user-id': 'rep-user',
    'x-house-actor-role-keys': CLUB_AFFILIATION_REPRESENTATIVE_ROLE,
    'x-house-organization-id': CLUB_ID,
    ...overrides,
  };
}

async function post(
  base: string,
  standingId: string,
  body: unknown,
  hdrs: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${base}/v1/button/affiliation/standing/${standingId}/renewals`, {
    method: 'POST',
    headers: hdrs,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) };
}

describe('Button standing-renewal routes (transport)', () => {
  it('starts a renewal (201) routed into the application workflow with a captured link, audit, and outbox', async () => {
    const { base, renewalLinks, store } = await start();

    const started = await post(base, STANDING_ID, { targetSeasonId: TARGET_SEASON }, headers({ 'idempotency-key': 'idem-1' }));

    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({ status: 'ok', posture: 'eligible', created: true });
    const renewalApplicationId = started.body['renewalApplicationId'] as string;
    expect(renewalApplicationId).toBeTypeOf('string');

    // Governed side effects attributed to the standing, with SERVER-resolved source facts.
    const links = renewalLinks.forStanding(TENANT_A, STANDING_ID);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      renewalApplicationId,
      standingId: STANDING_ID,
      sourceStandingVersion: 7,
      sourceSeasonId: SOURCE_SEASON,
      targetSeasonId: TARGET_SEASON,
    });
    expect(store.renewalAuditEvents).toHaveLength(1);
    expect(store.renewalOutboxMessages).toHaveLength(1);
    expect(store.renewalOutboxMessages[0]!.dedupeKey).toContain(STANDING_ID);
  });

  it('is idempotent on replay (200, no duplicate link / audit / outbox)', async () => {
    const { base, renewalLinks, store } = await start();

    const first = await post(base, STANDING_ID, { targetSeasonId: TARGET_SEASON }, headers({ 'idempotency-key': 'idem-1' }));
    const replay = await post(base, STANDING_ID, { targetSeasonId: TARGET_SEASON }, headers({ 'idempotency-key': 'idem-1' }));

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ created: false });
    expect(replay.body['renewalApplicationId']).toBe(first.body['renewalApplicationId']);
    expect(renewalLinks.forStanding(TENANT_A, STANDING_ID)).toHaveLength(1);
    expect(store.renewalAuditEvents).toHaveLength(1);
    expect(store.renewalOutboxMessages).toHaveLength(1);
  });

  it('rejects a non-POST method on the renewals route with 405 + Allow: POST', async () => {
    const { base } = await start();
    const res = await fetch(`${base}/v1/button/affiliation/standing/${STANDING_ID}/renewals`, {
      method: 'GET',
      headers: headers(),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('returns 400 when the Idempotency-Key header is absent', async () => {
    const { base } = await start();
    const res = await post(base, STANDING_ID, { targetSeasonId: TARGET_SEASON }, headers());
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ status: 'error', requestId: expect.any(String) });
  });

  it('keeps a foreign standing opaque (404) — never existence disclosure', async () => {
    const { base, renewalLinks } = await start();
    const res = await post(
      base,
      '99999999-9999-4999-8999-999999999999',
      { targetSeasonId: TARGET_SEASON },
      headers({ 'idempotency-key': 'idem-x' }),
    );
    expect(res.status).toBe(404);
    expect(renewalLinks.forStanding(TENANT_A, STANDING_ID)).toHaveLength(0);
  });
});
