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

/**
 * Transport-only tests for the Button club-affiliation DRAFT routes wired into the native HTTP
 * server (Slice C). Exercises path/method routing (405 with `Allow` on mismatch), the `ETag`
 * concurrency header over the wire, and the `{ status, code, message, requestId }` error envelope.
 * Hermetic: every backing port is in-memory; a short-lived loopback listener drives the server.
 */

const { fetch } = globalThis;
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const CLUB_ID = 'club-1';
const SEASON = '2025-26';

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

function buttonAffiliation(): ButtonAffiliationHttpDeps {
  const service = new AffiliationDraftService({
    store: new InMemoryAffiliationDraftStore(),
    catalog: new InMemoryRequirementCatalogStore(),
    lifecycle: new InMemoryAffiliationLifecycleReader(),
    evidenceValidator: new InMemoryEvidenceReferenceValidator(),
  });
  return {
    service,
    organizations: new FakeOrganizationReadStore(),
    authorities: new RoleDerivedRepresentativeAuthorityProvider(),
    jurisdictions: new OrganizationTypeJurisdictionResolver(),
    seasons: acceptingSeasonAuthorization,
    nowIso: () => '2026-01-15T00:00:00.000Z',
  };
}

const openServers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (s) => new Promise<void>((resolve) => s.close(() => resolve())),
    ),
  );
});

async function start(): Promise<string> {
  const server = createAffiliationHttpServer({
    executor: new NoopExecutor(),
    buttonAffiliation: buttonAffiliation(),
  });
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const HEADERS: Record<string, string> = {
  'content-type': 'application/json',
  'x-house-tenant-id': TENANT_A,
  'x-house-actor-user-id': 'user-1',
  'x-house-actor-role-keys': CLUB_AFFILIATION_REPRESENTATIVE_ROLE,
  'x-house-organization-id': CLUB_ID,
};

describe('Button affiliation routes (transport)', () => {
  it('routes the full begin → resume → save flow with an ETag concurrency header', async () => {
    const base = await start();

    const overview = await fetch(
      `${base}/v1/button/affiliation?organizationId=${CLUB_ID}&season=${SEASON}`,
      { headers: HEADERS },
    );
    expect(overview.status).toBe(200);

    const initiate = await fetch(`${base}/v1/button/affiliation/applications`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ organizationId: CLUB_ID, seasonId: SEASON }),
    });
    expect(initiate.status).toBe(200);
    const initiated = (await initiate.json()) as { application: { applicationId: string } };
    const applicationId = initiated.application.applicationId;

    const detail = await fetch(`${base}/v1/button/affiliation/applications/${applicationId}`, {
      headers: HEADERS,
    });
    expect(detail.status).toBe(200);
    expect(detail.headers.get('etag')).toBe('"1"');

    const save = await fetch(`${base}/v1/button/affiliation/applications/${applicationId}/draft`, {
      method: 'PUT',
      headers: { ...HEADERS, 'if-match': '"1"' },
      body: JSON.stringify({
        responses: [{ requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'Dana' } }],
      }),
    });
    expect(save.status).toBe(200);
    expect(save.headers.get('etag')).toBe('"2"');
  });

  it('returns 405 with an Allow header for an unsupported method on a known path', async () => {
    const base = await start();
    const res = await fetch(`${base}/v1/button/affiliation`, { method: 'DELETE', headers: HEADERS });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('404s the whole prefix when the transport is not wired', async () => {
    const server = createAffiliationHttpServer({ executor: new NoopExecutor() });
    openServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/v1/button/affiliation`, { headers: HEADERS });
    expect(res.status).toBe(404);
  });
});
