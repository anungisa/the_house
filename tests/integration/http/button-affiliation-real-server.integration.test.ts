import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { URL } from 'node:url';
import { TextEncoder } from 'node:util';
import pg from 'pg';

import {
  AffiliationDraftService,
  InMemoryEvidenceReferenceValidator,
  PgAffiliationDraftStore,
  PgAffiliationLifecycleReader,
  PgRequirementCatalogStore,
  type RequirementResolutionContext,
} from '../../../src/domains/affiliation-requirements/index.js';
import { createPgAffiliationHttpServer } from '../../../src/http/composition.js';
import { TrustedHeadersAuthContextResolver } from '../../../src/http/auth/TrustedHeadersAuthContextResolver.js';
import { closePool, withTenantTransaction } from '../../../src/db/pool.js';
import { HOUSE_TRUSTED_ISSUER } from '../../../src/domains/representative-authority/index.js';

/**
 * Gated PostgreSQL end-to-end test for the Button club-affiliation REPRESENTATIVE journey driven
 * over the REAL production HTTP server (createPgAffiliationHttpServer) bound to a real loopback
 * socket, backed by real PostgreSQL. Unlike the mock-transport frontend tests and the
 * service-level submission suites, this proves the full governed path end-to-end through actual
 * HTTP routing + dispatch + trusted-header identity + Pg-backed services + the governance kernel:
 *
 *   GET  /v1/button/context                                    (representative context read)
 *   GET  /v1/button/affiliation/applications/:id               (draft projection, eligible)
 *   POST /v1/button/affiliation/applications/:id/submissions   (governed submit -> submitted)
 *   POST (replay, same Idempotency-Key)                        (idempotent, same receipt)
 *   GET  /v1/button/affiliation/applications/:id/submission-state
 *   POST /v1/button/affiliation/applications                   (initiate a fresh governed draft)
 *
 * plus cross-tenant isolation (a foreign tenant's representative gets an opaque 404, never
 * existence disclosure). Governed persistence is asserted directly in PostgreSQL: the entity
 * advances draft -> submitted, a submission snapshot + submit-triggered evidence + state
 * transition + audit event + outbox message are written, and RLS keeps the snapshot invisible to
 * other tenants.
 *
 * The submittable draft is built up with the SAME Pg-backed draft/requirement stores the server
 * uses (initiate + saveDraft + evidence association over real PostgreSQL); the governed SUBMISSION
 * and every representative read then run over the real HTTP socket. No mocks, no in-memory
 * transport, and no external network (Azure/Entra/Service Bus/Key Vault/Docker) are contacted.
 *
 * GATING: runs only when RUN_DB_TESTS=1 and DATABASE_URL is set (the CI postgres-integration job);
 * otherwise the suite is skipped so the default `npm test` stays hermetic.
 */

const RUN = process.env.RUN_DB_TESTS === '1' && (process.env.DATABASE_URL ?? '') !== '';
const d = RUN ? describe : describe.skip;

const SEASON = '2025-26';
const REPRESENTATIVE_ROLE = 'club_affiliation_representative';
const CONTEXT: RequirementResolutionContext = {
  orgType: 'local',
  jurisdiction: 'member',
  pathway: 'new_affiliation',
  season: SEASON,
};

let server: Server | undefined;
let baseUrl = '';
let previousEvidenceStorageProvider: string | undefined;

interface HttpResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** Trusted-header identity for a club-affiliation representative acting for `organizationId`. */
function representativeHeaders(input: {
  tenantId: string;
  userId: string;
  organizationId: string;
}): Record<string, string> {
  return {
    'x-house-tenant-id': input.tenantId,
    'x-house-actor-user-id': input.userId,
    'x-house-actor-role-keys': REPRESENTATIVE_ROLE,
    'x-house-organization-id': input.organizationId,
  };
}

async function call(
  method: string,
  path: string,
  options: { headers: Record<string, string>; body?: unknown } = { headers: {} },
): Promise<HttpResponse> {
  const hasBody = options.body !== undefined;
  const res = await globalThis.fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...options.headers,
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await res.text();
  const body = text === '' ? {} : (JSON.parse(text) as Record<string, unknown>);
  return { status: res.status, body };
}

async function uploadEvidence(
  headers: Record<string, string>,
  input: { filename: string; contentType: string; content: string },
): Promise<HttpResponse> {
  const res = await globalThis.fetch(`${baseUrl}/v1/evidence/objects`, {
    method: 'POST',
    headers: {
      ...headers,
      accept: 'application/json',
      'content-type': input.contentType,
      'x-house-source-filename': encodeURIComponent(input.filename),
    },
    body: new TextEncoder().encode(input.content),
  });
  const text = await res.text();
  const body = text === '' ? {} : (JSON.parse(text) as Record<string, unknown>);
  return { status: res.status, body };
}

/**
 * Seed one ACTIVE local organization for the tenant using the admin (RLS-bypassing) connection,
 * so the representative's target org exists and is representable for the Button authorization gate.
 */
async function seedOrganization(
  admin: pg.Pool,
  input: { tenantId: string; organizationId: string; displayName: string },
): Promise<void> {
  await admin.query(
    `INSERT INTO organization_registry.organization
       (id, tenant_id, organization_type, display_name, status, source, created_at, updated_at)
     VALUES ($1, $2, 'local', $3, 'active', 'manual', now(), now())`,
    [input.organizationId, input.tenantId, input.displayName],
  );
}

/**
 * Seed the governed current season using the admin (RLS-bypassing) connection. The affiliation
 * application head's (tenant_id, season_id) FK to affiliation.season is immediate, so the season
 * must exist before an application is initiated (whether over HTTP or via the draft store).
 */
async function seedSeason(admin: pg.Pool, input: { tenantId: string; seasonId: string }): Promise<void> {
  await admin.query(
    `INSERT INTO affiliation.season (tenant_id, season_id, status, is_current)
     VALUES ($1, $2, 'published', true)
     ON CONFLICT (tenant_id, season_id) DO NOTHING`,
    [input.tenantId, input.seasonId],
  );
}

/**
 * Seed a GOVERNED representative authority grant (identity subject + authority head) using the
 * admin connection. Under the governed model, a trusted role key + organization header no longer
 * manufacture authority: it exists ONLY when a persisted, in-window, un-revoked grant says so. The
 * `status` controls the stored authoritative state; a past `validUntil` derives as expired at read.
 */
async function seedAuthorityGrant(
  admin: pg.Pool,
  input: {
    tenantId: string;
    userId: string;
    organizationId: string;
    status?: 'active' | 'revoked';
    validFrom?: string;
    validUntil?: string | null;
  },
): Promise<void> {
  const status = input.status ?? 'active';
  const validFrom = input.validFrom ?? new Date(Date.now() - 3_600_000).toISOString();
  const validUntil = input.validUntil ?? null;
  const subjectId = randomUUID();
  await admin.query(
    `INSERT INTO authority.identity_subject
       (id, tenant_id, issuer, external_subject, status, source, linked_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'active', 'manual', now(), now(), now())`,
    [subjectId, input.tenantId, HOUSE_TRUSTED_ISSUER, input.userId],
  );
  const revoked = status === 'revoked';
  await admin.query(
    `INSERT INTO authority.representative_authority
       (id, tenant_id, identity_subject_id, organization_id, authority_type, status,
        valid_from, valid_until, issued_by, issued_at, revoked_by, revoked_at,
        source_reference, idempotency_key, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'club_affiliation_representative', $5,
        $6, $7, 'seed', now(), $8, $9, 'seed:test', $10, 1, now(), now())`,
    [
      randomUUID(),
      input.tenantId,
      subjectId,
      input.organizationId,
      status,
      validFrom,
      validUntil,
      revoked ? 'seed' : null,
      revoked ? new Date().toISOString() : null,
      `seed-${randomUUID()}`,
    ],
  );
}

/**
 * Build a submittable draft over the SAME Pg-backed stores the server uses: initiate, answer all
 * seeded requirements, and associate evidence for the two document requirements. Returns the
 * application id and the current draft version (submission precondition).
 */
async function buildSubmittableDraft(input: {
  tenantId: string;
  organizationId: string;
  applicantUserId: string;
}): Promise<{ applicationId: string; version: number }> {
  const evidence = new InMemoryEvidenceReferenceValidator();
  const drafts = new AffiliationDraftService({
    store: new PgAffiliationDraftStore(),
    catalog: new PgRequirementCatalogStore(),
    lifecycle: new PgAffiliationLifecycleReader(),
    evidenceValidator: evidence,
  });

  // The affiliation_application -> season FK is immediate: seed the season before `initiate`
  // (which inserts the application head) so the FK is satisfied.
  await withTenantTransaction(input.tenantId, (client) =>
    client.query(
      `INSERT INTO affiliation.season (tenant_id, season_id, status, is_current)
       VALUES ($1, $2, 'published', true)
       ON CONFLICT (tenant_id, season_id) DO NOTHING`,
      [input.tenantId, SEASON],
    ),
  );

  let application = await drafts.initiate({
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    seasonId: SEASON,
    actor: input.applicantUserId,
    context: CONTEXT,
  });
  application = await drafts.saveDraft({
    tenantId: input.tenantId,
    applicationId: application.applicationId,
    expectedVersion: Number(application.concurrencyToken),
    actor: input.applicantUserId,
    responses: [
      { requirementCode: 'ORG_PROFILE_CONFIRMATION', value: { acknowledged: true } },
      { requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'Dana' } },
      { requirementCode: 'GOVERNING_DOCUMENT', value: { attached: true } },
      { requirementCode: 'INSURANCE_CONFIRMATION', value: { confirmed: true } },
    ],
  });
  for (const requirementCode of ['GOVERNING_DOCUMENT', 'INSURANCE_CONFIRMATION'] as const) {
    const evidenceObjectId = randomUUID();
    evidence.register({ tenantId: input.tenantId, evidenceObjectId, contentHash: evidenceObjectId });
    await drafts.associateEvidence({
      tenantId: input.tenantId,
      applicationId: application.applicationId,
      requirementCode,
      evidenceObjectId,
      contentHash: evidenceObjectId,
      contentType: 'application/pdf',
      actor: input.applicantUserId,
    });
  }
  application = await drafts.getProjection(input.tenantId, application.applicationId);
  return { applicationId: application.applicationId, version: Number(application.concurrencyToken) };
}

d('Button club-affiliation representative journey over the real HTTP server (PostgreSQL)', () => {
  beforeAll(async () => {
    previousEvidenceStorageProvider = process.env.EVIDENCE_STORAGE_PROVIDER;
    process.env.EVIDENCE_STORAGE_PROVIDER = 'memory';

    const admin = new pg.Pool({
      connectionString: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    try {
      // Grant the runtime role exactly the privileges the governed journey needs (idempotent).
      const runtimeUser = new URL(process.env.DATABASE_URL ?? '').username;
      const role = `"${runtimeUser.replace(/"/gu, '""')}"`;
      await admin.query(
        `GRANT USAGE ON SCHEMA governance, affiliation, organization_registry TO ${role}`,
      );
      await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA governance TO ${role}`);
      await admin.query(
        `GRANT INSERT, UPDATE ON governance.entity_state, governance.transition_request,
           governance.outbox_message TO ${role}`,
      );
      await admin.query(
        `GRANT INSERT ON governance.state_transition, governance.transition_guard_result,
           governance.audit_event, governance.evidence_object TO ${role}`,
      );
      await admin.query(`GRANT EXECUTE ON FUNCTION governance.current_tenant_id() TO ${role}`);
      await admin.query(`GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA affiliation TO ${role}`);
      await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA organization_registry TO ${role}`);
      // The governed representative authority source is READ by the Button authorization provider.
      await admin.query(`GRANT USAGE ON SCHEMA authority TO ${role}`);
      await admin.query(
        `GRANT SELECT ON authority.identity_subject, authority.representative_authority TO ${role}`,
      );
    } finally {
      await admin.end();
    }

    // Boot the REAL production HTTP server with the trusted-header edge resolver on an ephemeral
    // loopback port. It shares the Pg-backed default pool with the draft build-up helper.
    server = createPgAffiliationHttpServer({ resolver: new TrustedHeadersAuthContextResolver() });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server !== undefined) {
      await new Promise<void>((resolve, reject) =>
        server!.close((err) => (err ? reject(err) : resolve())),
      );
    }
    await closePool();
    if (previousEvidenceStorageProvider === undefined) {
      delete process.env.EVIDENCE_STORAGE_PROVIDER;
    } else {
      process.env.EVIDENCE_STORAGE_PROVIDER = previousEvidenceStorageProvider;
    }
  });

  it('shares one memory evidence boundary across upload and validation and fails closed across tenants', async () => {
    const tenantA = randomUUID();
    const orgA = randomUUID();
    const userA = randomUUID();
    const tenantB = randomUUID();
    const orgB = randomUUID();
    const userB = randomUUID();

    const admin = new pg.Pool({
      connectionString: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    try {
      await seedOrganization(admin, { tenantId: tenantA, organizationId: orgA, displayName: 'Granite Club' });
      await seedOrganization(admin, { tenantId: tenantB, organizationId: orgB, displayName: 'Summit Club' });
      await seedSeason(admin, { tenantId: tenantA, seasonId: SEASON });
      await seedSeason(admin, { tenantId: tenantB, seasonId: SEASON });
      await seedAuthorityGrant(admin, { tenantId: tenantA, userId: userA, organizationId: orgA });
      await seedAuthorityGrant(admin, { tenantId: tenantB, userId: userB, organizationId: orgB });
    } finally {
      await admin.end();
    }

    const headersA = representativeHeaders({ tenantId: tenantA, userId: userA, organizationId: orgA });
    const headersB = representativeHeaders({ tenantId: tenantB, userId: userB, organizationId: orgB });

    const initiateA = await call('POST', '/v1/button/affiliation/applications', {
      headers: headersA,
      body: { organizationId: orgA, seasonId: SEASON, pathway: 'new_affiliation' },
    });
    expect(initiateA.status).toBe(200);
    const appA = String((initiateA.body['application'] as Record<string, unknown>)['applicationId']);

    const uploadA = await uploadEvidence(headersA, {
      filename: 'bylaws.pdf',
      contentType: 'application/pdf',
      content: 'tenant-a-bylaws',
    });
    expect(uploadA.status).toBe(201);

    const evidenceObjectId = String(uploadA.body['evidenceObjectId']);
    const contentHash = String(uploadA.body['contentHash']);
    const contentType = String(uploadA.body['contentType']);

    // A single same-tenant association succeeds without retry, proving upload + validator share storage.
    const associateA = await call(
      'POST',
      `/v1/button/affiliation/applications/${encodeURIComponent(appA)}/evidence-links`,
      {
        headers: headersA,
        body: {
          requirementCode: 'GOVERNING_DOCUMENT',
          evidenceObjectId,
          contentHash,
          contentType,
          displayName: 'bylaws.pdf',
        },
      },
    );
    expect(associateA.status).toBe(200);
    expect((associateA.body['link'] as Record<string, unknown>)['evidenceObjectId']).toBe(evidenceObjectId);

    const wrongHash = await call(
      'POST',
      `/v1/button/affiliation/applications/${encodeURIComponent(appA)}/evidence-links`,
      {
        headers: headersA,
        body: {
          requirementCode: 'GOVERNING_DOCUMENT',
          evidenceObjectId,
          contentHash: `${contentHash}-mismatch`,
          contentType,
          displayName: 'bylaws.pdf',
        },
      },
    );
    expect(wrongHash.status).toBe(400);
    expect(wrongHash.body['code']).toBe('AFFILIATION_EVIDENCE_REFERENCE_INVALID');

    const fabricatedObject = await call(
      'POST',
      `/v1/button/affiliation/applications/${encodeURIComponent(appA)}/evidence-links`,
      {
        headers: headersA,
        body: {
          requirementCode: 'GOVERNING_DOCUMENT',
          evidenceObjectId: randomUUID(),
          contentHash,
          contentType,
          displayName: 'fake.pdf',
        },
      },
    );
    expect(fabricatedObject.status).toBe(400);
    expect(fabricatedObject.body['code']).toBe('AFFILIATION_EVIDENCE_REFERENCE_INVALID');

    const initiateB = await call('POST', '/v1/button/affiliation/applications', {
      headers: headersB,
      body: { organizationId: orgB, seasonId: SEASON, pathway: 'new_affiliation' },
    });
    expect(initiateB.status).toBe(200);
    const appB = String((initiateB.body['application'] as Record<string, unknown>)['applicationId']);

    const crossTenant = await call(
      'POST',
      `/v1/button/affiliation/applications/${encodeURIComponent(appB)}/evidence-links`,
      {
        headers: headersB,
        body: {
          requirementCode: 'GOVERNING_DOCUMENT',
          evidenceObjectId,
          contentHash,
          contentType,
          displayName: 'cross-tenant.pdf',
        },
      },
    );
    expect(crossTenant.status).toBe(400);
    expect(crossTenant.body['code']).toBe('AFFILIATION_EVIDENCE_REFERENCE_INVALID');

    const appBProjection = await call('GET', `/v1/button/affiliation/applications/${encodeURIComponent(appB)}`, {
      headers: headersB,
    });
    expect(appBProjection.status).toBe(200);
    const requirements = (appBProjection.body['application'] as Record<string, unknown>)[
      'requirements'
    ] as Array<Record<string, unknown>>;
    const governingDocument = requirements.find((requirement) => requirement['code'] === 'GOVERNING_DOCUMENT');
    const evidenceLinks = (governingDocument?.['evidence'] as unknown[] | undefined) ?? [];
    expect(evidenceLinks).toHaveLength(0);
  });

  it('drives context, governed submission, idempotent replay, and asserts governed persistence', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    const applicantUserId = randomUUID();

    const admin = new pg.Pool({
      connectionString: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    try {
      await seedOrganization(admin, { tenantId, organizationId, displayName: 'Riverside Club' });
      await seedAuthorityGrant(admin, { tenantId, userId: applicantUserId, organizationId });
    } finally {
      await admin.end();
    }

    const draft = await buildSubmittableDraft({ tenantId, organizationId, applicantUserId });
    const headers = representativeHeaders({ tenantId, userId: applicantUserId, organizationId });

    // 1) Representative context read over the real server.
    const context = await call('GET', `/v1/button/context?organizationId=${organizationId}&season=${SEASON}`, {
      headers,
    });
    expect(context.status).toBe(200);
    expect(context.body['status']).toBe('ok');
    expect(context.body['context']).toBeDefined();

    // 2) Draft projection read: authorized, eligible for submission.
    const projection = await call(
      'GET',
      `/v1/button/affiliation/applications/${draft.applicationId}`,
      { headers },
    );
    expect(projection.status).toBe(200);
    const application = projection.body['application'] as Record<string, unknown>;
    expect(application['organizationId']).toBe(organizationId);
    expect(application['lifecycleStatus']).toBe('draft');
    const completeness = application['completeness'] as Record<string, unknown>;
    expect(completeness['eligibleForSubmission']).toBe(true);

    // 3) Governed submission over the real server.
    const idempotencyKey = `submit:${draft.applicationId}:${draft.version}`;
    const submit = await call(
      'POST',
      `/v1/button/affiliation/applications/${draft.applicationId}/submissions`,
      {
        headers: { ...headers, 'if-match': String(draft.version), 'idempotency-key': idempotencyKey },
        body: {},
      },
    );
    expect(submit.status).toBe(201);
    const receipt = submit.body['receipt'] as Record<string, unknown>;
    expect(receipt['sequence']).toBe(1);
    expect(receipt['sourceDraftVersion']).toBe(draft.version);

    // 4) Idempotent replay: same key + version returns the identical receipt, no second transition.
    const replay = await call(
      'POST',
      `/v1/button/affiliation/applications/${draft.applicationId}/submissions`,
      {
        headers: { ...headers, 'if-match': String(draft.version), 'idempotency-key': idempotencyKey },
        body: {},
      },
    );
    expect(replay.status).toBe(201);
    expect(replay.body['receipt']).toEqual(receipt);

    // 5) Applicant submission-state read reflects the submitted application.
    const state = await call(
      'GET',
      `/v1/button/affiliation/applications/${draft.applicationId}/submission-state`,
      { headers },
    );
    expect(state.status).toBe(200);
    expect(state.body['status']).toBe('ok');

    // 6) Governed persistence assertions in PostgreSQL (single submit, evidence, transition, audit).
    await withTenantTransaction(tenantId, async (client) => {
      const snapshots = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM affiliation.submission_snapshot WHERE application_id = $1`,
        [draft.applicationId],
      );
      const entityState = await client.query<{ current_state: string }>(
        `SELECT current_state FROM governance.entity_state
           WHERE entity_type = 'AffiliationApplication' AND entity_id = $1`,
        [draft.applicationId],
      );
      const evidence = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM governance.evidence_object
           WHERE entity_type = 'AffiliationApplication' AND entity_id = $1 AND trigger = 'submit'`,
        [draft.applicationId],
      );
      const transitions = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM governance.state_transition
           WHERE entity_type = 'AffiliationApplication' AND entity_id = $1 AND to_state = 'submitted'`,
        [draft.applicationId],
      );
      const audits = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM governance.audit_event
           WHERE entity_type = 'AffiliationApplication' AND entity_id = $1`,
        [draft.applicationId],
      );
      const outbox = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM governance.outbox_message WHERE tenant_id = $1`,
        [tenantId],
      );
      expect(snapshots[0]?.n).toBe(1);
      expect(entityState[0]?.current_state).toBe('submitted');
      expect(evidence[0]?.n).toBeGreaterThanOrEqual(1);
      expect(transitions[0]?.n).toBe(1);
      expect(audits[0]?.n).toBeGreaterThanOrEqual(1);
      expect(outbox[0]?.n).toBeGreaterThanOrEqual(1);
    });

    // RLS: a foreign tenant cannot see this tenant's submission snapshot.
    const foreignVisible = await withTenantTransaction(randomUUID(), (client) =>
      client.query(`SELECT id FROM affiliation.submission_snapshot WHERE application_id = $1`, [
        draft.applicationId,
      ]),
    );
    expect(foreignVisible).toEqual([]);
  });

  it('initiates a fresh governed draft over the real server for a representable organization', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    const applicantUserId = randomUUID();

    const admin = new pg.Pool({
      connectionString: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    try {
      await seedOrganization(admin, { tenantId, organizationId, displayName: 'Hillcrest Club' });
      await seedSeason(admin, { tenantId, seasonId: SEASON });
      await seedAuthorityGrant(admin, { tenantId, userId: applicantUserId, organizationId });
    } finally {
      await admin.end();
    }

    const headers = representativeHeaders({ tenantId, userId: applicantUserId, organizationId });
    const initiate = await call('POST', '/v1/button/affiliation/applications', {
      headers,
      body: { organizationId, seasonId: SEASON, pathway: 'new_affiliation' },
    });
    expect(initiate.status).toBe(200);
    const application = initiate.body['application'] as Record<string, unknown>;
    expect(application['organizationId']).toBe(organizationId);
    expect(application['lifecycleStatus']).toBe('draft');
    expect(typeof application['applicationId']).toBe('string');

    // The draft is readable back through the server (proves real Pg persistence).
    const readBack = await call(
      'GET',
      `/v1/button/affiliation/applications/${String(application['applicationId'])}`,
      { headers },
    );
    expect(readBack.status).toBe(200);
    expect((readBack.body['application'] as Record<string, unknown>)['applicationId']).toBe(
      application['applicationId'],
    );
  });

  it('fails closed with an opaque 404 for a foreign tenant representative (no existence disclosure)', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    const applicantUserId = randomUUID();

    const admin = new pg.Pool({
      connectionString: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    try {
      await seedOrganization(admin, { tenantId, organizationId, displayName: 'Lakeside Club' });
    } finally {
      await admin.end();
    }

    const draft = await buildSubmittableDraft({ tenantId, organizationId, applicantUserId });

    // A DIFFERENT tenant's representative (even referencing the same org id) must get an opaque 404.
    const foreignHeaders = representativeHeaders({
      tenantId: randomUUID(),
      userId: randomUUID(),
      organizationId,
    });
    const foreign = await call(
      'GET',
      `/v1/button/affiliation/applications/${draft.applicationId}`,
      { headers: foreignHeaders },
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body['code']).toBe('AFFILIATION_APPLICATION_NOT_FOUND');
  });

  it('denies a trusted representative with NO governed grant an opaque 404 (identity ≠ authority)', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    const applicantUserId = randomUUID();

    const admin = new pg.Pool({
      connectionString: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    try {
      // The org exists and is active, and the actor carries the representative role key + org header
      // — but there is NO persisted authority grant, so the House grants NOTHING.
      await seedOrganization(admin, { tenantId, organizationId, displayName: 'Ungoverned Club' });
    } finally {
      await admin.end();
    }

    const draft = await buildSubmittableDraft({ tenantId, organizationId, applicantUserId });
    const headers = representativeHeaders({ tenantId, userId: applicantUserId, organizationId });

    const projection = await call(
      'GET',
      `/v1/button/affiliation/applications/${draft.applicationId}`,
      { headers },
    );
    expect(projection.status).toBe(404);
    expect(projection.body['code']).toBe('AFFILIATION_APPLICATION_NOT_FOUND');

    const initiate = await call('POST', '/v1/button/affiliation/applications', {
      headers,
      body: { organizationId, seasonId: SEASON, pathway: 'new_affiliation' },
    });
    expect(initiate.status).toBe(404);
  });

  it('denies a representative whose governed authority has EXPIRED with a 403 (time-bound)', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    const applicantUserId = randomUUID();

    const admin = new pg.Pool({
      connectionString: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    try {
      await seedOrganization(admin, { tenantId, organizationId, displayName: 'Lapsed Club' });
      await seedAuthorityGrant(admin, {
        tenantId,
        userId: applicantUserId,
        organizationId,
        validFrom: '2020-01-01T00:00:00.000Z',
        validUntil: '2020-06-01T00:00:00.000Z',
      });
    } finally {
      await admin.end();
    }

    const draft = await buildSubmittableDraft({ tenantId, organizationId, applicantUserId });
    const headers = representativeHeaders({ tenantId, userId: applicantUserId, organizationId });

    const projection = await call(
      'GET',
      `/v1/button/affiliation/applications/${draft.applicationId}`,
      { headers },
    );
    expect(projection.status).toBe(403);
    expect(projection.body['code']).toBe('FORBIDDEN');
  });

  it('denies a representative whose governed authority was REVOKED with a 403 (revocation propagates)', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    const applicantUserId = randomUUID();

    const admin = new pg.Pool({
      connectionString: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    try {
      await seedOrganization(admin, { tenantId, organizationId, displayName: 'Revoked Club' });
      await seedAuthorityGrant(admin, {
        tenantId,
        userId: applicantUserId,
        organizationId,
        status: 'revoked',
      });
    } finally {
      await admin.end();
    }

    const draft = await buildSubmittableDraft({ tenantId, organizationId, applicantUserId });
    const headers = representativeHeaders({ tenantId, userId: applicantUserId, organizationId });

    const projection = await call(
      'GET',
      `/v1/button/affiliation/applications/${draft.applicationId}`,
      { headers },
    );
    expect(projection.status).toBe(403);
    expect(projection.body['code']).toBe('FORBIDDEN');
  });
});
