import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { GovernanceKernel } from '../../../src/governance/kernel/GovernanceKernel.js';
import { GuardRegistry } from '../../../src/governance/guards/GuardRegistry.js';
import { registerAffiliationGuards } from '../../../src/governance/guards/handlers.js';
import { PgGovernanceStore } from '../../../src/governance/store/PgGovernanceStore.js';
import { PgAffiliationApplicationStore } from '../../../src/domains/affiliation/PgAffiliationApplicationStore.js';
import { DomainBackedAffiliationGuardRepository } from '../../../src/domains/affiliation/DomainBackedAffiliationGuardRepository.js';
import { AffiliationActiveStandingSerializationResolver } from '../../../src/domains/affiliation/AffiliationActiveStandingSerializationResolver.js';
import { ErrorCode } from '../../../src/shared/errors/AppError.js';
import {
  closePool,
  queryRaw,
  withTenantTransaction,
  type QueryClient,
} from '../../../src/db/pool.js';
import type { TransitionInput } from '../../../src/governance/types/TransitionTypes.js';

/**
 * Integration tests for the AffiliationApplication governed transition path against a real
 * PostgreSQL database. GATED: they run only when RUN_DB_TESTS=1 and DATABASE_URL are set;
 * otherwise the suite is skipped so the default `npm test` stays hermetic.
 *
 * RLS: the runtime connection (DATABASE_URL) MUST be a non-superuser, non-BYPASSRLS role
 * for the RLS isolation assertions to hold. Migrations are DDL and require elevated
 * privileges, so they are applied through MIGRATE_DATABASE_URL when provided (falling
 * back to DATABASE_URL for superuser-run local dev). Migration application is idempotent
 * via the public.schema_migrations ledger.
 */
const RUN = process.env.RUN_DB_TESTS === '1' && (process.env.DATABASE_URL ?? '') !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const ENTITY_TYPE = 'AffiliationApplication';
const SEASON = '2025-26';

/** Apply migrations idempotently using an elevated connection (DDL needs privileges). */
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
  // PRODUCTION wiring: guards read PERSISTED affiliation domain facts, not payload facts.
  const affiliationStore = new PgAffiliationApplicationStore();
  registerAffiliationGuards(
    registry,
    new DomainBackedAffiliationGuardRepository(affiliationStore),
  );
  return new GovernanceKernel({
    store: new PgGovernanceStore(),
    guards: registry,
    serializationKeyResolvers: new Map([
      [ENTITY_TYPE, new AffiliationActiveStandingSerializationResolver(affiliationStore)],
    ]),
  });
}

function input(
  o: Pick<TransitionInput, 'entityId' | 'trigger' | 'idempotencyKey'> & Partial<TransitionInput>,
): TransitionInput {
  return {
    entityType: ENTITY_TYPE,
    actor: o.actor ?? {
      actorId: 'reviewer-1',
      tenantId: TENANT_A,
      scopeType: 'national_organization',
      roles: ['reviewer'],
    },
    context: o.context ?? { tenantId: TENANT_A, scopeType: 'national_organization' },
    ...o,
  };
}

/**
 * Seed an affiliation DOMAIN application row (+ optional supporting rows) used by the
 * persistence-backed guards. This writes DOMAIN facts only — never governed lifecycle
 * state. Runs as the restricted runtime role under tenant context (RLS enforced).
 */
async function seedApplication(
  entityId: string,
  opts: {
    tenantId?: string;
    requiredFieldsComplete?: boolean;
    documentStatus?: 'approved' | 'pending';
    openComplianceFlag?: boolean;
    unpaid?: boolean;
    seasonCurrent?: boolean;
    scopeId?: string;
  } = {},
): Promise<void> {
  const tenantId = opts.tenantId ?? TENANT_A;
  await withTenantTransaction(tenantId, async (c: QueryClient) => {
    // The affiliation_application -> season FK is immediate: a matching season row must exist
    // BEFORE the application insert. `is_current` reflects the SEASON_IS_CURRENT guard fixture and
    // never downgrades an already-current season (upsert with OR).
    await c.query(
      `INSERT INTO affiliation.season (tenant_id, season_id, status, is_current)
       VALUES ($1,$2,'published',$3)
       ON CONFLICT (tenant_id, season_id)
         DO UPDATE SET status = 'published',
                       is_current = affiliation.season.is_current OR EXCLUDED.is_current`,
      [tenantId, SEASON, opts.seasonCurrent === true],
    );
    await c.query(
      `INSERT INTO affiliation.affiliation_application
         (id, tenant_id, season_id, required_fields_complete, documents_verified, payment_status, scope_id)
       VALUES ($1,$2,$3,$4,$4,$5,$6)`,
      [
        entityId,
        tenantId,
        SEASON,
        opts.requiredFieldsComplete ?? true,
        opts.unpaid === true ? 'unpaid' : 'paid',
        opts.scopeId ?? null,
      ],
    );
    await c.query(
      `INSERT INTO affiliation.application_document
         (tenant_id, application_id, document_type, required, status)
       VALUES ($1,$2,'affiliation_form',true,$3)`,
      [tenantId, entityId, opts.documentStatus ?? 'approved'],
    );
    if (opts.openComplianceFlag === true) {
      await c.query(
        `INSERT INTO affiliation.compliance_flag
           (tenant_id, application_id, flag_type, status)
         VALUES ($1,$2,'eligibility','open')`,
        [tenantId, entityId],
      );
    }
    if (opts.unpaid === true) {
      await c.query(
        `INSERT INTO affiliation.payment_obligation
           (tenant_id, application_id, obligation_type, status, amount_cents)
         VALUES ($1,$2,'affiliation_fee','unpaid',5000)`,
        [tenantId, entityId],
      );
    }
  });
}

async function count(tenantId: string, sql: string, params: readonly unknown[]): Promise<number> {
  const rows = await withTenantTransaction(tenantId, (c: QueryClient) =>
    c.query<{ n: number }>(sql, params),
  );
  return rows[0]!.n;
}

/** Position an entity directly at a given state (test fixture for hard-to-reach states). */
async function seedEntityStateAt(entityId: string, state: string): Promise<void> {
  await withTenantTransaction(TENANT_A, async (c: QueryClient) => {
    const sm = await c.query<{ id: string }>(
      `SELECT id FROM governance.state_machine
        WHERE entity_type = $1 AND status = 'active' ORDER BY version DESC LIMIT 1`,
      [ENTITY_TYPE],
    );
    await c.query(
      `INSERT INTO governance.entity_state
         (tenant_id, entity_type, entity_id, current_state, state_machine_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [TENANT_A, ENTITY_TYPE, entityId, state, sm[0]!.id],
    );
  });
}

d('AffiliationApplication governed transition (integration)', () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closePool();
  });

  it('runtime connection is a non-superuser, non-BYPASSRLS role (RLS is enforced)', async () => {
    const rows = await queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    expect(rows[0]!.rolsuper).toBe(false);
    expect(rows[0]!.rolbypassrls).toBe(false);
  });

  it('executes draft -> submitted and writes entity_state, journal, audit, and one outbox row', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    await seedApplication(entityId);
    const result = await kernel.transition(
      input({ entityId, trigger: 'submit', idempotencyKey: randomUUID() }),
    );
    expect(result.status).toBe('executed');
    expect(result.toState).toBe('submitted');

    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.entity_state
          WHERE entity_id = $1 AND current_state = 'submitted'`,
        [entityId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.state_transition WHERE entity_id = $1`,
        [entityId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.audit_event
          WHERE entity_id = $1 AND action = 'transition.executed'`,
        [entityId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.outbox_message
          WHERE payload->>'entityId' = $1`,
        [entityId],
      ),
    ).toBe(1);
  });

  it('denies an unknown transition (fail closed)', async () => {
    const kernel = makeKernel();
    await expect(
      kernel.transition(
        input({ entityId: randomUUID(), trigger: 'approve', idempotencyKey: randomUUID() }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.UNKNOWN_TRANSITION });
  });

  it('approval-required transition records a request and does NOT mutate state or outbox', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    await seedApplication(entityId);
    await kernel.transition(input({ entityId, trigger: 'submit', idempotencyKey: randomUUID() }));
    await kernel.transition(
      input({ entityId, trigger: 'review_start', idempotencyKey: randomUUID() }),
    );
    const result = await kernel.transition(
      input({ entityId, trigger: 'approve', idempotencyKey: randomUUID() }),
    );
    expect(result.status).toBe('approval_required');
    expect(result.transitionRequestId).toBeDefined();

    // No state mutation: still under_review.
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.entity_state
          WHERE entity_id = $1 AND current_state = 'under_review'`,
        [entityId],
      ),
    ).toBe(1);
    // A request row exists.
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.transition_request
          WHERE entity_id = $1 AND trigger = 'approve'`,
        [entityId],
      ),
    ).toBe(1);
    // No executed transition to 'approved', and no outbox for approve.
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.state_transition
          WHERE entity_id = $1 AND to_state = 'approved'`,
        [entityId],
      ),
    ).toBe(0);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.outbox_message
          WHERE payload->>'entityId' = $1 AND message_type LIKE '%approve%'`,
        [entityId],
      ),
    ).toBe(0);
  });

  it('high-risk executed transition (archive) creates evidence metadata', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    await seedEntityStateAt(entityId, 'closed');
    const result = await kernel.transition(
      input({ entityId, trigger: 'archive', idempotencyKey: randomUUID() }),
    );
    expect(result.status).toBe('executed');
    expect(result.toState).toBe('archived');
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.evidence_object
          WHERE entity_id = $1 AND trigger = 'archive'`,
        [entityId],
      ),
    ).toBe(1);
  });

  it('persists and reads back an evidence payload binding (content_hash + storage_ref)', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    await seedEntityStateAt(entityId, 'closed');

    const sha = 'a'.repeat(64);
    const storageRef = JSON.stringify({
      provider: 'memory',
      container: 'evidence',
      key: `tenants/${TENANT_A}/evidence/${entityId}/${sha}`,
      contentType: 'application/pdf',
      sizeBytes: 42,
      sha256: sha,
    });

    const result = await kernel.transition(
      input({
        entityId,
        trigger: 'archive',
        idempotencyKey: randomUUID(),
        evidence: { contentHash: sha, storageRef },
      }),
    );
    expect(result.status).toBe('executed');

    const rows = await withTenantTransaction(TENANT_A, (c: QueryClient) =>
      c.query<{ content_hash: string | null; storage_ref: string | null }>(
        `SELECT content_hash, storage_ref FROM governance.evidence_object
          WHERE entity_id = $1 AND trigger = 'archive'`,
        [entityId],
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.content_hash).toBe(sha);
    expect(rows[0]!.storage_ref).toBe(storageRef);
    expect(JSON.parse(rows[0]!.storage_ref!)).toMatchObject({ provider: 'memory', sha256: sha });
  });

  it('metadata-only evidence persists with NULL content_hash and storage_ref', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    await seedEntityStateAt(entityId, 'closed');

    await kernel.transition(input({ entityId, trigger: 'archive', idempotencyKey: randomUUID() }));

    const rows = await withTenantTransaction(TENANT_A, (c: QueryClient) =>
      c.query<{ content_hash: string | null; storage_ref: string | null }>(
        `SELECT content_hash, storage_ref FROM governance.evidence_object
          WHERE entity_id = $1 AND trigger = 'archive'`,
        [entityId],
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.content_hash).toBeNull();
    expect(rows[0]!.storage_ref).toBeNull();
  });

  it('idempotent retry does not duplicate state_transition or outbox rows', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    const key = randomUUID();
    await seedApplication(entityId);
    await kernel.transition(input({ entityId, trigger: 'submit', idempotencyKey: key }));
    const replay = await kernel.transition(input({ entityId, trigger: 'submit', idempotencyKey: key }));
    expect(replay.status).toBe('idempotent_replay');

    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.state_transition WHERE entity_id = $1`,
        [entityId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.outbox_message
          WHERE payload->>'entityId' = $1`,
        [entityId],
      ),
    ).toBe(1);
  });

  it('enforces RLS read isolation: tenant B cannot see tenant A entity_state', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    await seedApplication(entityId);
    await kernel.transition(input({ entityId, trigger: 'submit', idempotencyKey: randomUUID() }));

    const visibleToB = await withTenantTransaction(TENANT_B, (c) =>
      c.query(`SELECT id FROM governance.entity_state WHERE entity_id = $1`, [entityId]),
    );
    expect(visibleToB).toHaveLength(0);
  });

  it('enforces RLS write isolation: tenant B cannot update tenant A entity_state', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    await seedApplication(entityId);
    await kernel.transition(input({ entityId, trigger: 'submit', idempotencyKey: randomUUID() }));

    // Attempt to mutate tenant A's row while in tenant B context: RLS hides the row,
    // so 0 rows are affected and tenant A's state is unchanged.
    const affected = await withTenantTransaction(TENANT_B, async (c) => {
      const res = await c.query<{ id: string }>(
        `UPDATE governance.entity_state SET current_state = 'revoked'
          WHERE entity_id = $1 RETURNING id`,
        [entityId],
      );
      return res.length;
    });
    expect(affected).toBe(0);

    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.entity_state
          WHERE entity_id = $1 AND current_state = 'submitted'`,
        [entityId],
      ),
    ).toBe(1);
  });

  it('fails closed at the database when tenant context is not set', async () => {
    await expect(
      queryRaw(`SELECT governance.current_tenant_id()`),
    ).rejects.toThrow(/TENANT_CONTEXT_MISSING/);
  });

  it('guards PASS from persisted domain facts (submit succeeds when facts are complete)', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    await seedApplication(entityId, { requiredFieldsComplete: true, documentStatus: 'approved' });
    const result = await kernel.transition(
      input({ entityId, trigger: 'submit', idempotencyKey: randomUUID() }),
    );
    expect(result.status).toBe('executed');
    expect(result.toState).toBe('submitted');
  });

  it('guards FAIL from persisted domain facts (submit rejected when required fields incomplete)', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    await seedApplication(entityId, { requiredFieldsComplete: false });
    const result = await kernel.transition(
      input({ entityId, trigger: 'submit', idempotencyKey: randomUUID() }),
    );
    expect(result.status).toBe('rejected');
    // No state mutation occurred on a guard rejection.
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.entity_state WHERE entity_id = $1`,
        [entityId],
      ),
    ).toBe(0);
  });

  it('guards FAIL when a required document is not approved (persisted docs drive the outcome)', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    await seedApplication(entityId, { requiredFieldsComplete: true, documentStatus: 'pending' });
    const result = await kernel.transition(
      input({ entityId, trigger: 'submit', idempotencyKey: randomUUID() }),
    );
    expect(result.status).toBe('rejected');
  });

  it('persisted domain facts override caller payload facts (payload cannot force a pass)', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    // Persisted state says incomplete; caller still sends an optimistic payload.
    await seedApplication(entityId, { requiredFieldsComplete: false });
    const result = await kernel.transition(
      input({
        entityId,
        trigger: 'submit',
        idempotencyKey: randomUUID(),
        payload: {
          facts: {
            requiredFieldsComplete: true,
            requiredDocsPresent: true,
            openComplianceFlags: false,
            feesPaid: true,
            seasonIsCurrent: true,
          },
        },
      }),
    );
    expect(result.status).toBe('rejected');
  });

  it('restricted app role can read/write its own affiliation domain rows', async () => {
    const entityId = randomUUID();
    await seedApplication(entityId, { requiredFieldsComplete: true });
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation.affiliation_application WHERE id = $1`,
        [entityId],
      ),
    ).toBe(1);
  });

  it('enforces RLS isolation on affiliation domain tables (tenant B cannot see tenant A rows)', async () => {
    const entityId = randomUUID();
    await seedApplication(entityId, { tenantId: TENANT_A });
    const visibleToB = await withTenantTransaction(TENANT_B, (c) =>
      c.query(`SELECT id FROM affiliation.affiliation_application WHERE id = $1`, [entityId]),
    );
    expect(visibleToB).toHaveLength(0);
  });

  it('fails closed on affiliation domain tables when tenant context is not set', async () => {
    await expect(
      queryRaw(`SELECT count(*) FROM affiliation.affiliation_application`),
    ).rejects.toThrow(/TENANT_CONTEXT_MISSING/);
  });

  it('activate EXECUTES when no other application holds active standing for the scope+season', async () => {
    const kernel = makeKernel();
    const subject = randomUUID();
    const entityId = randomUUID();
    await seedApplication(entityId, { scopeId: subject, seasonCurrent: true });
    await seedEntityStateAt(entityId, 'approved');
    const result = await kernel.transition(
      input({ entityId, trigger: 'activate', idempotencyKey: randomUUID() }),
    );
    expect(result.status).toBe('executed');
    expect(result.toState).toBe('active');
  });

  it('activate is REJECTED when another application already holds active standing for the same scope+season', async () => {
    const kernel = makeKernel();
    const subject = randomUUID();

    const existing = randomUUID();
    await seedApplication(existing, { scopeId: subject, seasonCurrent: true });
    await seedEntityStateAt(existing, 'active');

    const entityId = randomUUID();
    await seedApplication(entityId, { scopeId: subject, seasonCurrent: true });
    await seedEntityStateAt(entityId, 'approved');

    const result = await kernel.transition(
      input({ entityId, trigger: 'activate', idempotencyKey: randomUUID() }),
    );
    expect(result.status).toBe('rejected');

    // No governed mutation: the blocked application remains 'approved' and never 'active'.
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.entity_state
          WHERE entity_id = $1 AND current_state = 'approved'`,
        [entityId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.entity_state
          WHERE entity_id = $1 AND current_state = 'active'`,
        [entityId],
      ),
    ).toBe(0);
  });

  it('activate EXECUTES when an active application exists for a DIFFERENT season (no conflict)', async () => {
    const kernel = makeKernel();
    const subject = randomUUID();

    const existing = randomUUID();
    await withTenantTransaction(TENANT_A, async (c: QueryClient) => {
      await c.query(
        `INSERT INTO affiliation.season (tenant_id, season_id, is_current)
         VALUES ($1,'2024-25',false)
         ON CONFLICT (tenant_id, season_id) DO NOTHING`,
        [TENANT_A],
      );
      await c.query(
        `INSERT INTO affiliation.affiliation_application
           (id, tenant_id, season_id, required_fields_complete, documents_verified, payment_status, scope_id)
         VALUES ($1,$2,'2024-25',true,true,'paid',$3)`,
        [existing, TENANT_A, subject],
      );
    });
    await seedEntityStateAt(existing, 'active');

    const entityId = randomUUID();
    await seedApplication(entityId, { scopeId: subject, seasonCurrent: true });
    await seedEntityStateAt(entityId, 'approved');

    const result = await kernel.transition(
      input({ entityId, trigger: 'activate', idempotencyKey: randomUUID() }),
    );
    expect(result.status).toBe('executed');
    expect(result.toState).toBe('active');
  });
});
