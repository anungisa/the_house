import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { GovernanceKernel } from '../../../src/governance/kernel/GovernanceKernel.js';
import { GuardRegistry } from '../../../src/governance/guards/GuardRegistry.js';
import { registerAffiliationGuards } from '../../../src/governance/guards/handlers.js';
import { PgGovernanceStore } from '../../../src/governance/store/PgGovernanceStore.js';
import { PgAffiliationApplicationStore } from '../../../src/domains/affiliation/PgAffiliationApplicationStore.js';
import { DomainBackedAffiliationGuardRepository } from '../../../src/domains/affiliation/DomainBackedAffiliationGuardRepository.js';
import { AffiliationWorkflowPlanner } from '../../../src/governance/workflow/AffiliationWorkflowPlanner.js';
import { PgWorkflowStore } from '../../../src/governance/workflow/PgWorkflowStore.js';
import { WorkflowDecisionService } from '../../../src/governance/workflow/WorkflowDecisionService.js';
import { ApprovedWorkflowExecutionService } from '../../../src/governance/workflow/ApprovedWorkflowExecutionService.js';
import {
  handleWorkflowList,
  handleWorkflowDetail,
} from '../../../src/http/workflow/WorkflowReadHttpAdapter.js';
import { handleWorkflowExecution } from '../../../src/http/workflow/WorkflowExecutionHttpAdapter.js';
import { createAffiliationHttpServer } from '../../../src/http/server.js';
import { TrustedHeadersAuthContextResolver } from '../../../src/http/auth/TrustedHeadersAuthContextResolver.js';
import {
  closePool,
  queryRaw,
  withTenantTransaction,
  type QueryClient,
} from '../../../src/db/pool.js';
import type { TransitionInput } from '../../../src/governance/types/TransitionTypes.js';
import type { AffiliationCommandExecutor } from '../../../src/http/AffiliationHttpAdapter.js';

/**
 * Gated integration tests for the workflow admin READ SURFACES (list + detail) against a real
 * PostgreSQL database. GATED on RUN_DB_TESTS=1 + DATABASE_URL (default `npm test` stays
 * hermetic). The runtime role must be a non-superuser, non-BYPASSRLS role so RLS holds.
 * Migrations run via MIGRATE_DATABASE_URL when provided.
 *
 * Proves that list/detail reads work through the real PgWorkflowStore and the HTTP read path
 * while preserving tenant isolation (RLS) and strict read-only behaviour: reads never mutate
 * entity_state, never append state_transition / audit_event rows, and never record decisions.
 * The execution-readiness field is a derived hint only.
 */
const RUN = process.env.RUN_DB_TESTS === '1' && (process.env.DATABASE_URL ?? '') !== '';
const d = RUN ? describe : describe.skip;

const { fetch } = globalThis;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

// HARNESS ISOLATION: these gated suites run against a PERSISTENT PostgreSQL test DB that is NOT
// truncated between runs. This suite has a default-page-dependent assertion ("filters the list by
// status" lists approved workflows with no entityId filter, so it depends on the default 50-row
// page). With a fixed tenant, repeated gated runs (and other workflow suites that share the same
// fixed tenant) accumulate dozens of approved/pending workflow rows under that tenant, eventually
// pushing this suite's freshly-created approved workflow off the first page and failing the run.
// Fix: give each RUN a UNIQUE tenant namespace so this suite only ever sees the rows it created,
// regardless of leftover data or parallel workflow suites. This preserves RLS (any UUID is a valid
// tenant), needs no truncation (no cross-suite races), and does not change production pagination.
const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const ENTITY_TYPE = 'AffiliationApplication';
const SEASON = '2025-26';
const TRUSTED = new TrustedHeadersAuthContextResolver();

async function applyMigrations(): Promise<void> {
  const adminUrl = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  const pool = new pg.Pool({ connectionString: adminUrl });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query<{ filename: string }>(
      'SELECT filename FROM public.schema_migrations',
    );
    const applied = new Set(rows.map((r) => r.filename));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO public.schema_migrations(filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

function makeKernel(): GovernanceKernel {
  const registry = new GuardRegistry();
  registerAffiliationGuards(
    registry,
    new DomainBackedAffiliationGuardRepository(new PgAffiliationApplicationStore()),
  );
  return new GovernanceKernel({
    store: new PgGovernanceStore(),
    guards: registry,
    workflowPlanner: new AffiliationWorkflowPlanner(),
  });
}

function input(
  tenantId: string,
  o: Pick<TransitionInput, 'entityId' | 'trigger' | 'idempotencyKey'> & Partial<TransitionInput>,
): TransitionInput {
  return {
    entityType: ENTITY_TYPE,
    actor: o.actor ?? {
      actorId: 'reviewer-1',
      tenantId,
      scopeType: 'national_organization',
      roles: ['reviewer'],
    },
    context: o.context ?? { tenantId, scopeType: 'national_organization' },
    ...o,
  };
}

/** Seed affiliation DOMAIN facts (all-pass) for the persistence-backed guards. */
async function seedApplication(tenantId: string, entityId: string): Promise<void> {
  await withTenantTransaction(tenantId, async (c: QueryClient) => {
    await c.query(
      `INSERT INTO affiliation.affiliation_application
         (id, tenant_id, season_id, required_fields_complete, documents_verified, payment_status)
       VALUES ($1,$2,$3,true,true,'paid')`,
      [entityId, tenantId, SEASON],
    );
    await c.query(
      `INSERT INTO affiliation.application_document
         (tenant_id, application_id, document_type, required, status)
       VALUES ($1,$2,'affiliation_form',true,'approved')`,
      [tenantId, entityId],
    );
    await c.query(
      `INSERT INTO affiliation.season (tenant_id, season_id, is_current)
       VALUES ($1,$2,true)
       ON CONFLICT (tenant_id, season_id) DO UPDATE SET is_current = true`,
      [tenantId, SEASON],
    );
  });
}

/** Drive draft -> submitted -> under_review, then the approval-required `approve`. */
async function driveToApprove(kernel: GovernanceKernel, tenantId: string, entityId: string) {
  await seedApplication(tenantId, entityId);
  await kernel.transition(input(tenantId, { entityId, trigger: 'submit', idempotencyKey: randomUUID() }));
  await kernel.transition(
    input(tenantId, { entityId, trigger: 'review_start', idempotencyKey: randomUUID() }),
  );
  return kernel.transition(
    input(tenantId, { entityId, trigger: 'approve', idempotencyKey: randomUUID() }),
  );
}

/** Record both tier sign-offs so the workflow instance becomes `approved`. */
async function approveWorkflow(tenantId: string, workflowInstanceId: string): Promise<void> {
  const decisions = new WorkflowDecisionService(new PgWorkflowStore());
  await decisions.recordDecision({
    tenantId,
    workflowInstanceId,
    stepCode: 'regional_signoff',
    decision: 'approve',
    actorUserId: randomUUID(),
  });
  await decisions.recordDecision({
    tenantId,
    workflowInstanceId,
    stepCode: 'national_signoff',
    decision: 'approve',
    actorUserId: randomUUID(),
  });
}

async function scalar<T>(tenantId: string, sql: string, params: readonly unknown[]): Promise<T> {
  const rows = await withTenantTransaction(tenantId, (c: QueryClient) =>
    c.query<{ v: T }>(sql, params),
  );
  return rows[0]!.v;
}

/** Reader identity headers: a reviewer role satisfies the v1 workflow-read gate. */
function readerHeaders(tenantId: string, userId: string): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': userId,
    'x-house-actor-role-keys': 'regional_reviewer',
  };
}

function reviewerHeaders(tenantId: string, userId: string): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': userId,
    'x-house-actor-role-keys': 'reviewer',
  };
}

function readDeps() {
  return { readStore: new PgWorkflowStore() };
}

/** A no-op command executor: the read routes never invoke it (transition routes are unused here). */
const NOOP_EXECUTOR: AffiliationCommandExecutor = {
  executeCommand() {
    return Promise.reject(new Error('command executor must not be called by read routes'));
  },
};

d('Workflow admin read surfaces (integration)', () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closePool();
  });

  // (1) Migration state supports the read surfaces: created_at/updated_at projection columns
  // exist and RLS is FORCED on the workflow tables the reads touch.
  it('migration state supports workflow read surfaces (projection columns + forced RLS)', async () => {
    const cols = await queryRaw<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'governance' AND table_name = 'workflow_instance'
          AND column_name IN ('created_at','updated_at','status','current_step_code')`,
    );
    expect(new Set(cols.map((c) => c.column_name))).toEqual(
      new Set(['created_at', 'updated_at', 'status', 'current_step_code']),
    );

    const forced = await queryRaw<{ relname: string; relforcerowsecurity: boolean }>(
      `SELECT relname, relforcerowsecurity FROM pg_class
        WHERE relnamespace = 'governance'::regnamespace
          AND relname IN ('workflow_instance','workflow_step','transition_request')
        ORDER BY relname`,
    );
    expect(forced).toHaveLength(3);
    expect(forced.every((r) => r.relforcerowsecurity)).toBe(true);
  });

  // (18) The runtime role reads through expected grants only: non-superuser, non-BYPASSRLS,
  // and holding SELECT on the read tables.
  it('runtime role reads through expected grants only (non-superuser, non-BYPASSRLS, SELECT granted)', async () => {
    const role = await queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    expect(role[0]!.rolsuper).toBe(false);
    expect(role[0]!.rolbypassrls).toBe(false);

    const grants = await queryRaw<{
      instance_select: boolean;
      step_select: boolean;
      request_select: boolean;
    }>(
      `SELECT
         has_table_privilege(current_user,'governance.workflow_instance','SELECT')   AS instance_select,
         has_table_privilege(current_user,'governance.workflow_step','SELECT')       AS step_select,
         has_table_privilege(current_user,'governance.transition_request','SELECT')  AS request_select`,
    );
    expect(grants[0]!.instance_select).toBe(true);
    expect(grants[0]!.step_select).toBe(true);
    expect(grants[0]!.request_select).toBe(true);
  });

  // (2,3,4,5,15,19) Restricted role lists + reads detail for its tenant through the HTTP read
  // adapter; the pending workflow summary and ordered steps are returned with NSO-generic,
  // sport-free vocabulary, and a pending workflow is not executable.
  it('lists and reads a pending workflow for its tenant with ordered steps and a generic vocabulary', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    const result = await driveToApprove(kernel, TENANT_A, entityId);
    expect(result.status).toBe('approval_required');
    const workflowInstanceId = result.workflowInstanceId!;

    // (2,4) List shows the pending workflow summary.
    const list = await handleWorkflowList(
      readDeps(),
      { headers: readerHeaders(TENANT_A, randomUUID()), query: { entityId } },
      'req-list',
      TRUSTED,
    );
    expect(list.status).toBe(200);
    const items = list.body['items'] as Array<Record<string, unknown>>;
    const summary = items.find((i) => i['workflowInstanceId'] === workflowInstanceId);
    expect(summary).toBeDefined();
    expect(summary!['status']).toBe('pending');
    expect(summary!['entityType']).toBe(ENTITY_TYPE);
    expect(summary!['entityId']).toBe(entityId);
    // (15) Pending is not executable.
    expect(summary!['execution']).toEqual({
      executable: false,
      reason: 'workflow_not_approved',
    });

    // (3,5) Detail returns the steps in step_order.
    const detail = await handleWorkflowDetail(
      readDeps(),
      { workflowInstanceId, headers: readerHeaders(TENANT_A, randomUUID()) },
      'req-detail',
      TRUSTED,
    );
    expect(detail.status).toBe(200);
    expect(detail.body['workflowStatus']).toBe('pending');
    const steps = detail.body['steps'] as Array<Record<string, unknown>>;
    expect(steps.map((s) => s['stepCode'])).toEqual(['regional_signoff', 'national_signoff']);
    expect(steps.map((s) => s['stepOrder'])).toEqual([1, 2]);
    expect(steps.map((s) => s['reviewTier'])).toEqual(['regional_review', 'national_review']);

    // (19) No sport-specific vocabulary leaks into the serialized response bodies.
    const sportTerms = /curl|curler|bonspiel|rink|sheet|club|skip|hockey|soccer|team/i;
    expect(sportTerms.test(JSON.stringify(list.body))).toBe(false);
    expect(sportTerms.test(JSON.stringify(detail.body))).toBe(false);
  });

  // (6) The list filters by status.
  it('filters the list by status', async () => {
    const kernel = makeKernel();
    const pendingId = randomUUID();
    const approvedId = randomUUID();
    const pending = await driveToApprove(kernel, TENANT_A, pendingId);
    const approved = await driveToApprove(kernel, TENANT_A, approvedId);
    await approveWorkflow(TENANT_A, approved.workflowInstanceId!);

    const approvedList = await handleWorkflowList(
      readDeps(),
      { headers: readerHeaders(TENANT_A, randomUUID()), query: { status: 'approved' } },
      'req-status',
      TRUSTED,
    );
    expect(approvedList.status).toBe(200);
    const items = approvedList.body['items'] as Array<Record<string, unknown>>;
    expect(items.every((i) => i['status'] === 'approved')).toBe(true);
    expect(items.some((i) => i['workflowInstanceId'] === approved.workflowInstanceId)).toBe(true);
    expect(items.some((i) => i['workflowInstanceId'] === pending.workflowInstanceId)).toBe(false);
  });

  // (7) The list filters by reviewTier (matches a step in that tier).
  it('filters the list by reviewTier', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    const result = await driveToApprove(kernel, TENANT_A, entityId);

    const nationalList = await handleWorkflowList(
      readDeps(),
      {
        headers: readerHeaders(TENANT_A, randomUUID()),
        query: { reviewTier: 'national_review', entityId },
      },
      'req-tier',
      TRUSTED,
    );
    expect(nationalList.status).toBe(200);
    const items = nationalList.body['items'] as Array<Record<string, unknown>>;
    expect(items.some((i) => i['workflowInstanceId'] === result.workflowInstanceId)).toBe(true);
  });

  // (8,9) Tenant isolation: tenant A never sees tenant B's workflow in a list, and a detail
  // request for tenant B's workflow returns a safe 404 (RLS hides the row).
  it('enforces tenant isolation across list and detail (RLS confines rows to the caller tenant)', async () => {
    const kernel = makeKernel();
    const entityB = randomUUID();
    const resultB = await driveToApprove(kernel, TENANT_B, entityB);
    const workflowB = resultB.workflowInstanceId!;

    // Tenant A's list (broad) never includes tenant B's workflow.
    const listA = await handleWorkflowList(
      readDeps(),
      { headers: readerHeaders(TENANT_A, randomUUID()), query: { limit: '100' } },
      'req-iso-list',
      TRUSTED,
    );
    expect(listA.status).toBe(200);
    const itemsA = listA.body['items'] as Array<Record<string, unknown>>;
    expect(itemsA.some((i) => i['workflowInstanceId'] === workflowB)).toBe(false);

    // Tenant A's detail request for tenant B's workflow is a safe not-found.
    const detailA = await handleWorkflowDetail(
      readDeps(),
      { workflowInstanceId: workflowB, headers: readerHeaders(TENANT_A, randomUUID()) },
      'req-iso-detail',
      TRUSTED,
    );
    expect(detailA.status).toBe(404);
    expect(detailA.body['code']).toBe('WORKFLOW_NOT_FOUND');

    // Sanity: tenant B can still read its own workflow.
    const detailB = await handleWorkflowDetail(
      readDeps(),
      { workflowInstanceId: workflowB, headers: readerHeaders(TENANT_B, randomUUID()) },
      'req-iso-detail-b',
      TRUSTED,
    );
    expect(detailB.status).toBe(200);
    expect(detailB.body['workflowInstanceId']).toBe(workflowB);
  });

  // (10) Missing tenant context fails closed at the Pg/store layer (RLS), and the read endpoints
  // fail closed (401) when no tenant identity is presented.
  it('fails closed when tenant context is missing (store layer RLS and 401 at the adapter)', async () => {
    // Direct DB access without tenant context is denied by RLS / current_tenant_id().
    await expect(
      queryRaw(`SELECT count(*) FROM governance.workflow_instance`),
    ).rejects.toThrow();

    // The adapter rejects a request that carries no tenant identity header.
    const list = await handleWorkflowList(
      readDeps(),
      { headers: { 'x-house-actor-user-id': randomUUID() }, query: {} },
      'req-no-tenant',
      TRUSTED,
    );
    expect(list.status).toBe(401);
  });

  // (11,12,13,14) Reads are strictly read-only: list + detail never change entity_state, never
  // append state_transition / audit_event rows, and never record workflow_decision rows.
  it('reads do not mutate entity_state, state_transition, audit_event, or workflow_decision', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    const result = await driveToApprove(kernel, TENANT_A, entityId);
    const workflowInstanceId = result.workflowInstanceId!;

    const stateBefore = await scalar<string>(
      TENANT_A,
      `SELECT current_state AS v FROM governance.entity_state WHERE entity_id = $1`,
      [entityId],
    );
    const transitionsBefore = await scalar<number>(
      TENANT_A,
      `SELECT count(*)::int AS v FROM governance.state_transition WHERE entity_id = $1`,
      [entityId],
    );
    const auditBefore = await scalar<number>(
      TENANT_A,
      `SELECT count(*)::int AS v FROM governance.audit_event WHERE entity_id = $1`,
      [entityId],
    );
    const decisionsBefore = await scalar<number>(
      TENANT_A,
      `SELECT count(*)::int AS v FROM governance.workflow_decision wd
         JOIN governance.workflow_step ws ON ws.id = wd.workflow_step_id
        WHERE ws.workflow_instance_id = $1`,
      [workflowInstanceId],
    );

    // Exercise both read paths multiple times.
    await handleWorkflowList(
      readDeps(),
      { headers: readerHeaders(TENANT_A, randomUUID()), query: { entityId } },
      'req-ro-list',
      TRUSTED,
    );
    await handleWorkflowDetail(
      readDeps(),
      { workflowInstanceId, headers: readerHeaders(TENANT_A, randomUUID()) },
      'req-ro-detail',
      TRUSTED,
    );

    expect(
      await scalar<string>(
        TENANT_A,
        `SELECT current_state AS v FROM governance.entity_state WHERE entity_id = $1`,
        [entityId],
      ),
    ).toBe(stateBefore);
    expect(
      await scalar<number>(
        TENANT_A,
        `SELECT count(*)::int AS v FROM governance.state_transition WHERE entity_id = $1`,
        [entityId],
      ),
    ).toBe(transitionsBefore);
    expect(
      await scalar<number>(
        TENANT_A,
        `SELECT count(*)::int AS v FROM governance.audit_event WHERE entity_id = $1`,
        [entityId],
      ),
    ).toBe(auditBefore);
    expect(
      await scalar<number>(
        TENANT_A,
        `SELECT count(*)::int AS v FROM governance.workflow_decision wd
           JOIN governance.workflow_step ws ON ws.id = wd.workflow_step_id
          WHERE ws.workflow_instance_id = $1`,
        [workflowInstanceId],
      ),
    ).toBe(decisionsBefore);
  });

  // (16) Execution readiness is TRUE for an approved (not-yet-executed) workflow.
  it('reports executable=true for an approved (not-yet-executed) workflow', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    const result = await driveToApprove(kernel, TENANT_A, entityId);
    await approveWorkflow(TENANT_A, result.workflowInstanceId!);

    const detail = await handleWorkflowDetail(
      readDeps(),
      { workflowInstanceId: result.workflowInstanceId!, headers: readerHeaders(TENANT_A, randomUUID()) },
      'req-ready-approved',
      TRUSTED,
    );
    expect(detail.status).toBe(200);
    expect(detail.body['workflowStatus']).toBe('approved');
    expect(detail.body['execution']).toEqual({ executable: true, reason: null });

    // entity_state is still under_review — readiness is a hint, not execution.
    expect(
      await scalar<string>(
        TENANT_A,
        `SELECT current_state AS v FROM governance.entity_state WHERE entity_id = $1`,
        [entityId],
      ),
    ).toBe('under_review');
  });

  // (17) Execution readiness is FALSE once the approved transition has been executed.
  it('reports executable=false (already executed) after the approved transition is executed', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    const result = await driveToApprove(kernel, TENANT_A, entityId);
    await approveWorkflow(TENANT_A, result.workflowInstanceId!);

    // Execute the approved transition through the governed execution endpoint.
    const exec = await handleWorkflowExecution(
      { executor: new ApprovedWorkflowExecutionService(makeKernel(), new PgWorkflowStore()) },
      {
        workflowInstanceId: result.workflowInstanceId!,
        headers: { ...reviewerHeaders(TENANT_A, randomUUID()), 'idempotency-key': randomUUID() },
        body: {},
      },
      'req-exec',
      TRUSTED,
    );
    expect(exec.status).toBe(200);
    expect(exec.body['status']).toBe('executed');

    const detail = await handleWorkflowDetail(
      readDeps(),
      { workflowInstanceId: result.workflowInstanceId!, headers: readerHeaders(TENANT_A, randomUUID()) },
      'req-ready-executed',
      TRUSTED,
    );
    expect(detail.status).toBe(200);
    // The instance stays `approved`; the read layer derives `executed` from transition_request.
    expect(detail.body['workflowStatus']).toBe('approved');
    expect(detail.body['execution']).toEqual({
      executable: false,
      reason: 'workflow_already_executed',
    });
  });

  // Server-level proof: the read routes work end-to-end through the native HTTP server with the
  // trusted-headers resolver wired (no real Entra/JWKS), exercising real GET requests.
  it('serves GET /v1/workflows and GET /v1/workflows/:id through the native HTTP server', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    const result = await driveToApprove(kernel, TENANT_A, entityId);
    const workflowInstanceId = result.workflowInstanceId!;

    const server: Server = createAffiliationHttpServer({
      executor: NOOP_EXECUTOR,
      workflowRead: readDeps(),
      resolver: TRUSTED,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${port}`;
      const headers = readerHeaders(TENANT_A, randomUUID()) as Record<string, string>;

      const listRes = await fetch(`${base}/v1/workflows?entityId=${entityId}`, { headers });
      expect(listRes.status).toBe(200);
      const listBody = (await listRes.json()) as Record<string, unknown>;
      const items = listBody['items'] as Array<Record<string, unknown>>;
      expect(items.some((i) => i['workflowInstanceId'] === workflowInstanceId)).toBe(true);

      const detailRes = await fetch(`${base}/v1/workflows/${workflowInstanceId}`, { headers });
      expect(detailRes.status).toBe(200);
      const detailBody = (await detailRes.json()) as Record<string, unknown>;
      expect(detailBody['workflowInstanceId']).toBe(workflowInstanceId);
      const steps = detailBody['steps'] as Array<Record<string, unknown>>;
      expect(steps.map((s) => s['stepCode'])).toEqual(['regional_signoff', 'national_signoff']);

      // A reader with no tenant identity is rejected (401) — fail closed at the transport too.
      const noTenant = await fetch(`${base}/v1/workflows`, {
        headers: { 'x-house-actor-user-id': randomUUID() },
      });
      expect(noTenant.status).toBe(401);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});
