import { describe, it, expect } from 'vitest';

import {
  handleAffiliationOverview,
  handleAffiliationInitiate,
  handleAffiliationGet,
  handleAffiliationSaveDraft,
  handleAffiliationAssociateEvidence,
  handleAffiliationRemoveEvidence,
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
import { TelemetryCounters } from '../../../../../src/observability/TelemetryEvents.js';

/**
 * Unit tests for the Button club-affiliation DRAFT HTTP adapter (Slice C).
 *
 * Protocol-pure and hermetic: identity travels in the shared `x-house-*` trusted-header contract,
 * every backing port is in-memory, and each handler is invoked directly. NO database, NO Docker,
 * NO Azure/Entra. Proves representative authorization (fail closed, no existence disclosure),
 * versioned requirement binding, optimistic-concurrency (ETag / If-Match) saves, evidence
 * association (association ≠ acceptance), server-derived completeness/blockers, and telemetry.
 */

const DEMO = new DemoAuthContextResolver();
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const CLUB_ID = 'club-1';
const OTHER_ORG_ID = 'club-9';
const SEASON = '2025-26';
const NOW_ISO = '2026-01-15T00:00:00.000Z';

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

interface Harness {
  deps: ButtonAffiliationHttpDeps;
  telemetry: InMemoryTelemetry;
  evidence: InMemoryEvidenceReferenceValidator;
}

function build(rows: readonly OrganizationView[] = [org({ organizationId: CLUB_ID })]): Harness {
  const telemetry = new InMemoryTelemetry();
  const evidence = new InMemoryEvidenceReferenceValidator();
  const service = new AffiliationDraftService({
    store: new InMemoryAffiliationDraftStore(),
    catalog: new InMemoryRequirementCatalogStore(),
    lifecycle: new InMemoryAffiliationLifecycleReader(),
    evidenceValidator: evidence,
  });
  const deps: ButtonAffiliationHttpDeps = {
    service,
    organizations: new FakeOrganizationReadStore(rows),
    authorities: new RoleDerivedRepresentativeAuthorityProvider(),
    jurisdictions: new OrganizationTypeJurisdictionResolver(),
    nowIso: () => NOW_ISO,
    telemetry,
  };
  return { deps, telemetry, evidence };
}

function repHeaders(extra: Record<string, string> = {}): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': TENANT_A,
    'x-house-actor-user-id': 'user-1',
    'x-house-actor-role-keys': CLUB_AFFILIATION_REPRESENTATIVE_ROLE,
    'x-house-organization-id': CLUB_ID,
    ...extra,
  };
}

function req(over: Partial<ButtonAffiliationHttpRequest> = {}): ButtonAffiliationHttpRequest {
  return { headers: repHeaders(), query: {}, params: {}, ...over };
}

async function initiate(h: Harness): Promise<Record<string, unknown>> {
  const result = await handleAffiliationInitiate(
    h.deps,
    req({ body: { organizationId: CLUB_ID, seasonId: SEASON, pathway: 'new_affiliation' } }),
    'req-init',
    DEMO,
  );
  expect(result.status).toBe(200);
  return result.body['application'] as Record<string, unknown>;
}

describe('button affiliation HTTP adapter', () => {
  it('overview reports begin (canInitiate) before any application exists', async () => {
    const h = build();
    const result = await handleAffiliationOverview(
      h.deps,
      req({ query: { organizationId: CLUB_ID, season: SEASON } }),
      'req-1',
      DEMO,
    );
    expect(result.status).toBe(200);
    const overview = result.body['overview'] as Record<string, unknown>;
    expect(overview['canInitiate']).toBe(true);
    expect(overview['application']).toBeNull();
    expect(h.telemetry.counterTotal(TelemetryCounters.buttonAffiliationOperation)).toBeGreaterThan(0);
  });

  it('an authorized representative initiates an application with the applicable requirement versions', async () => {
    const h = build();
    const application = await initiate(h);
    const requirements = application['requirements'] as Array<Record<string, unknown>>;
    const codes = requirements.map((r) => r['code']);
    // A local (member) organization: all four institutional requirements apply.
    expect(codes).toContain('ORG_PROFILE_CONFIRMATION');
    expect(codes).toContain('PRIMARY_CONTACT_DETAILS');
    expect(codes).toContain('GOVERNING_DOCUMENT');
    expect(codes).toContain('INSURANCE_CONFIRMATION');
    for (const r of requirements) expect(r['version']).toBe(1);
    expect(application['lifecycleStatus']).toBe('draft');
    expect(application['concurrencyToken']).toBe('1');
  });

  it('initiation is idempotent — the same subject resolves the same application', async () => {
    const h = build();
    const first = await initiate(h);
    const second = await initiate(h);
    expect(second['applicationId']).toBe(first['applicationId']);
    const overview = await handleAffiliationOverview(
      h.deps,
      req({ query: { organizationId: CLUB_ID, season: SEASON } }),
      'req-ov',
      DEMO,
    );
    const body = overview.body['overview'] as Record<string, unknown>;
    expect(body['canInitiate']).toBe(false);
    expect((body['application'] as Record<string, unknown>)['applicationId']).toBe(
      first['applicationId'],
    );
  });

  it('rejects an organization the actor cannot represent as an opaque 404 (no existence disclosure)', async () => {
    const h = build();
    const result = await handleAffiliationInitiate(
      h.deps,
      req({ body: { organizationId: OTHER_ORG_ID, seasonId: SEASON } }),
      'req-x',
      DEMO,
    );
    expect(result.status).toBe(404);
    expect(result.body['code']).toBe('AFFILIATION_APPLICATION_NOT_FOUND');
  });

  it('rejects an actor without an active representative authority as 403', async () => {
    const h = build();
    const result = await handleAffiliationInitiate(
      h.deps,
      {
        headers: {
          'x-house-tenant-id': TENANT_A,
          'x-house-actor-user-id': 'user-2',
          'x-house-actor-role-keys': 'viewer',
          'x-house-organization-id': CLUB_ID,
        },
        query: {},
        params: {},
        body: { organizationId: CLUB_ID, seasonId: SEASON },
      },
      'req-403',
      DEMO,
    );
    expect(result.status).toBe(403);
    expect(result.body['code']).toBe('FORBIDDEN');
  });

  it('returns the ETag concurrency token on detail and persists saved responses', async () => {
    const h = build();
    const application = await initiate(h);
    const applicationId = application['applicationId'] as string;

    const detail = await handleAffiliationGet(
      h.deps,
      req({ params: { applicationId } }),
      'req-detail',
      DEMO,
    );
    expect(detail.status).toBe(200);
    expect(detail.headers?.['ETag']).toBe('"1"');

    const saved = await handleAffiliationSaveDraft(
      h.deps,
      req({
        headers: repHeaders({ 'if-match': '"1"' }),
        params: { applicationId },
        body: { responses: [{ requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'Dana' } }] },
      }),
      'req-save',
      DEMO,
    );
    expect(saved.status).toBe(200);
    expect(saved.headers?.['ETag']).toBe('"2"');

    const reload = await handleAffiliationGet(
      h.deps,
      req({ params: { applicationId } }),
      'req-reload',
      DEMO,
    );
    const requirements = (reload.body['application'] as Record<string, unknown>)[
      'requirements'
    ] as Array<Record<string, unknown>>;
    const contact = requirements.find((r) => r['code'] === 'PRIMARY_CONTACT_DETAILS');
    expect(contact?.['response']).toEqual({ name: 'Dana' });
    expect(contact?.['status']).toBe('answered');
  });

  it('rejects a stale save with 409 (optimistic concurrency)', async () => {
    const h = build();
    const application = await initiate(h);
    const applicationId = application['applicationId'] as string;

    await handleAffiliationSaveDraft(
      h.deps,
      req({
        headers: repHeaders({ 'if-match': '"1"' }),
        params: { applicationId },
        body: { responses: [{ requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'A' } }] },
      }),
      'req-save-1',
      DEMO,
    );
    const stale = await handleAffiliationSaveDraft(
      h.deps,
      req({
        headers: repHeaders({ 'if-match': '"1"' }),
        params: { applicationId },
        body: { responses: [{ requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'B' } }] },
      }),
      'req-save-2',
      DEMO,
    );
    expect(stale.status).toBe(409);
    expect(stale.body['code']).toBe('AFFILIATION_DRAFT_VERSION_CONFLICT');
  });

  it('requires an If-Match precondition to save (400 when absent)', async () => {
    const h = build();
    const application = await initiate(h);
    const applicationId = application['applicationId'] as string;
    const result = await handleAffiliationSaveDraft(
      h.deps,
      req({ params: { applicationId }, body: { responses: [] } }),
      'req-noprecondition',
      DEMO,
    );
    expect(result.status).toBe(400);
    expect(result.body['code']).toBe('INVALID_INPUT');
  });

  it('associates governed evidence without accepting it (association ≠ acceptance)', async () => {
    const h = build();
    const application = await initiate(h);
    const applicationId = application['applicationId'] as string;
    h.evidence.register({
      tenantId: TENANT_A,
      evidenceObjectId: 'ev-1',
      contentHash: 'abc123',
    });

    const result = await handleAffiliationAssociateEvidence(
      h.deps,
      req({
        params: { applicationId },
        body: {
          requirementCode: 'GOVERNING_DOCUMENT',
          evidenceObjectId: 'ev-1',
          contentHash: 'abc123',
          contentType: 'application/pdf',
          displayName: 'Bylaws.pdf',
        },
      }),
      'req-ev',
      DEMO,
    );
    expect(result.status).toBe(200);
    const link = result.body['link'] as Record<string, unknown>;
    expect(link['requirementCode']).toBe('GOVERNING_DOCUMENT');
    expect(link['evidenceObjectId']).toBe('ev-1');
    // Association never advances governed lifecycle state.
    const projection = result.body['application'] as Record<string, unknown>;
    expect(projection['lifecycleStatus']).toBe('draft');
  });

  it('cannot associate a cross-tenant evidence reference (400, fail closed)', async () => {
    const h = build();
    const application = await initiate(h);
    const applicationId = application['applicationId'] as string;
    // Registered for a DIFFERENT tenant only.
    h.evidence.register({ tenantId: TENANT_B, evidenceObjectId: 'ev-x', contentHash: 'z' });

    const result = await handleAffiliationAssociateEvidence(
      h.deps,
      req({
        params: { applicationId },
        body: {
          requirementCode: 'GOVERNING_DOCUMENT',
          evidenceObjectId: 'ev-x',
          contentHash: 'z',
          contentType: 'application/pdf',
        },
      }),
      'req-ev-x',
      DEMO,
    );
    expect(result.status).toBe(400);
    expect(result.body['code']).toBe('AFFILIATION_EVIDENCE_REFERENCE_INVALID');
  });

  it('server-derived completeness distinguishes answered, evidence-required, and blocked', async () => {
    const h = build();
    const application = await initiate(h);
    const applicationId = application['applicationId'] as string;
    await handleAffiliationSaveDraft(
      h.deps,
      req({
        headers: repHeaders({ 'if-match': '"1"' }),
        params: { applicationId },
        body: {
          responses: [
            { requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'Dana' } },
            { requirementCode: 'INSURANCE_CONFIRMATION', value: { confirmed: true } },
          ],
        },
      }),
      'req-save',
      DEMO,
    );
    const detail = await handleAffiliationGet(
      h.deps,
      req({ params: { applicationId } }),
      'req-detail',
      DEMO,
    );
    const app = detail.body['application'] as Record<string, unknown>;
    const requirements = app['requirements'] as Array<Record<string, unknown>>;
    const byCode = (code: string): Record<string, unknown> =>
      requirements.find((r) => r['code'] === code) as Record<string, unknown>;

    expect(byCode('PRIMARY_CONTACT_DETAILS')['status']).toBe('answered');
    // INSURANCE requires evidence AND depends on GOVERNING_DOCUMENT (not complete) => blocked.
    expect(byCode('INSURANCE_CONFIRMATION')['status']).toBe('blocked');

    const completeness = app['completeness'] as Record<string, unknown>;
    expect(completeness['eligibleForSubmission']).toBe(false);
    expect(Array.isArray(completeness['unresolvedBlockers'])).toBe(true);
  });

  it('removing an evidence association deletes only the draft link', async () => {
    const h = build();
    const application = await initiate(h);
    const applicationId = application['applicationId'] as string;
    h.evidence.register({ tenantId: TENANT_A, evidenceObjectId: 'ev-1', contentHash: 'abc' });
    const associated = await handleAffiliationAssociateEvidence(
      h.deps,
      req({
        params: { applicationId },
        body: {
          requirementCode: 'GOVERNING_DOCUMENT',
          evidenceObjectId: 'ev-1',
          contentHash: 'abc',
          contentType: 'application/pdf',
        },
      }),
      'req-ev',
      DEMO,
    );
    const linkId = (associated.body['link'] as Record<string, unknown>)['linkId'] as string;

    const removed = await handleAffiliationRemoveEvidence(
      h.deps,
      req({ params: { applicationId, linkId } }),
      'req-rm',
      DEMO,
    );
    expect(removed.status).toBe(200);
    const projection = removed.body['application'] as Record<string, unknown>;
    const governing = (projection['requirements'] as Array<Record<string, unknown>>).find(
      (r) => r['code'] === 'GOVERNING_DOCUMENT',
    );
    expect((governing?.['evidence'] as unknown[])?.length ?? 0).toBe(0);
    // Lifecycle never changed through any of this.
    expect(projection['lifecycleStatus']).toBe('draft');
  });

  it('a detail read for a non-representable tenant fails as an opaque 404', async () => {
    const h = build();
    const application = await initiate(h);
    const applicationId = application['applicationId'] as string;
    // Same application id, but a DIFFERENT tenant's actor => RLS-equivalent not-found.
    const result = await handleAffiliationGet(
      h.deps,
      {
        headers: {
          'x-house-tenant-id': TENANT_B,
          'x-house-actor-user-id': 'user-9',
          'x-house-actor-role-keys': CLUB_AFFILIATION_REPRESENTATIVE_ROLE,
          'x-house-organization-id': CLUB_ID,
        },
        query: {},
        params: { applicationId },
      },
      'req-cross',
      DEMO,
    );
    expect(result.status).toBe(404);
    expect(result.body['code']).toBe('AFFILIATION_APPLICATION_NOT_FOUND');
  });
});
