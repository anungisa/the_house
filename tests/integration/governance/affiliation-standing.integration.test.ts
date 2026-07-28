import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { createPgAffiliationStandingService } from '../../../src/http/composition.js';
import { ErrorCode } from '../../../src/shared/errors/AppError.js';
import {
  closePool,
  queryRaw,
  withTenantTransaction,
  type QueryClient,
} from '../../../src/db/pool.js';
import { AffiliationStandingService } from '../../../src/domains/affiliation-standing/index.js';
import type { StandingTransitionRequest } from '../../../src/domains/affiliation-standing/index.js';

/**
 * Integration tests for the AffiliationStanding governed slice against a real PostgreSQL database
 * (with the affiliation_standing schema + RLS from migration 0014). GATED: runs only when
 * RUN_DB_TESTS=1 and DATABASE_URL are set; otherwise skipped so `npm test` stays hermetic. The
 * runtime connection (DATABASE_URL) MUST be a non-superuser, non-BYPASSRLS role for the RLS
 * assertions to hold. Migrations (DDL) are applied via MIGRATE_DATABASE_URL. All synthetic.
 *
 * The standing guards read the PERSISTED effective period against the real system clock. To reach
 * time-dependent states deterministically (lapsed / term-ended) without controlling the runtime
 * clock, fixtures seed a standing HEAD + v1 period + governed entity_state directly at the target
 * state with an effective period positioned relative to `now()`.
 */
const RUN = process.env.RUN_DB_TESTS === '1' && (process.env.DATABASE_URL ?? '') !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const ENTITY_TYPE = 'AffiliationStanding';
const SEASON = '2025-26';

const ROLE = {
  registrar: 'standing_registrar',
  lifecycle: 'standing_lifecycle_officer',
  renewal: 'standing_renewal_authority',
  compliance: 'standing_compliance_officer',
  termination: 'standing_termination_authority',
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const isoFromNow = (ms: number): string => new Date(Date.now() + ms).toISOString();

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

function makeService(): AffiliationStandingService {
  return createPgAffiliationStandingService();
}

function actor(roleKeys: readonly string[], userId: string = randomUUID()) {
  return { userId, roleKeys };
}

function openReq(
  standingId: string,
  o: {
    tenantId?: string;
    from?: string;
    until?: string;
    pathway?: string;
    roleKeys?: readonly string[];
  } = {},
): StandingTransitionRequest {
  return {
    tenantId: o.tenantId ?? TENANT_A,
    standingId,
    actor: actor(o.roleKeys ?? [ROLE.registrar]),
    idempotencyKey: randomUUID(),
    details: {
      affiliationApplicationId: randomUUID(),
      subjectId: randomUUID(),
      season: SEASON,
      pathway: o.pathway ?? 'new_affiliation',
      effectiveFrom: o.from ?? isoFromNow(-5 * DAY_MS),
      effectiveUntil: o.until ?? isoFromNow(365 * DAY_MS),
    },
  };
}

async function count(tenantId: string, sql: string, params: readonly unknown[]): Promise<number> {
  const rows = await withTenantTransaction(tenantId, (c: QueryClient) =>
    c.query<{ n: number }>(sql, params),
  );
  return rows[0]!.n;
}

/**
 * Seed a standing HEAD + its v1 period + a governed entity_state directly at `state`, with an
 * effective period positioned relative to `now()`. Used to reach time-dependent states.
 */
async function seedStandingAt(
  standingId: string,
  state: string,
  o: { tenantId?: string; from?: string; until?: string } = {},
): Promise<void> {
  const tenantId = o.tenantId ?? TENANT_A;
  const from = o.from ?? isoFromNow(-30 * DAY_MS);
  const until = o.until ?? isoFromNow(-1 * DAY_MS);
  await withTenantTransaction(tenantId, async (c: QueryClient) => {
    const establishedBy = randomUUID();
    await c.query(
      `INSERT INTO affiliation_standing.affiliation_standing
         (id, tenant_id, affiliation_application_id, subject_id, season, standing_version,
          effective_from, effective_until, pathway, established_by)
       VALUES ($1,$2,$3,$4,$5,1,$6,$7,'new_affiliation',$8)`,
      [standingId, tenantId, randomUUID(), randomUUID(), SEASON, from, until, establishedBy],
    );
    await c.query(
      `INSERT INTO affiliation_standing.standing_period
         (tenant_id, standing_id, version, effective_from, effective_until, pathway, recorded_by)
       VALUES ($1,$2,1,$3,$4,'new_affiliation',$5)`,
      [tenantId, standingId, from, until, establishedBy],
    );
    const sm = await c.query<{ id: string }>(
      `SELECT id FROM governance.state_machine
        WHERE entity_type = $1 AND status = 'active' ORDER BY version DESC LIMIT 1`,
      [ENTITY_TYPE],
    );
    await c.query(
      `INSERT INTO governance.entity_state
         (tenant_id, entity_type, entity_id, current_state, state_machine_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [tenantId, ENTITY_TYPE, standingId, state, sm[0]!.id],
    );
  });
}

/** Position a governed entity at a state WITHOUT a standing head (for rollback proof). */
async function seedEntityStateOnly(
  standingId: string,
  state: string,
  tenantId = TENANT_A,
): Promise<void> {
  await withTenantTransaction(tenantId, async (c: QueryClient) => {
    const sm = await c.query<{ id: string }>(
      `SELECT id FROM governance.state_machine
        WHERE entity_type = $1 AND status = 'active' ORDER BY version DESC LIMIT 1`,
      [ENTITY_TYPE],
    );
    await c.query(
      `INSERT INTO governance.entity_state
         (tenant_id, entity_type, entity_id, current_state, state_machine_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [tenantId, ENTITY_TYPE, standingId, state, sm[0]!.id],
    );
  });
}

d('AffiliationStanding governed slice (integration)', () => {
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

  it('open persists the standing head + v1 period atomically with governance rows', async () => {
    const svc = makeService();
    const standingId = randomUUID();
    const res = await svc.openStanding(openReq(standingId));
    expect(res.status).toBe('executed');

    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation_standing.affiliation_standing
          WHERE id = $1 AND standing_version = 1`,
        [standingId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation_standing.standing_period
          WHERE standing_id = $1 AND version = 1`,
        [standingId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.entity_state
          WHERE entity_id = $1 AND entity_type = $2 AND current_state = 'pending'`,
        [standingId, ENTITY_TYPE],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.outbox_message WHERE payload->>'entityId' = $1`,
        [standingId],
      ),
    ).toBe(1);
  });

  it('open then activate brings the standing into force when the clock is inside the period', async () => {
    const svc = makeService();
    const standingId = randomUUID();
    await svc.openStanding(openReq(standingId));
    const res = await svc.activateStanding({
      tenantId: TENANT_A,
      standingId,
      actor: actor([ROLE.registrar]),
      idempotencyKey: randomUUID(),
    });
    expect(res.status).toBe('executed');
    if (res.status === 'executed') expect(res.toState).toBe('active');
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.entity_state
          WHERE entity_id = $1 AND current_state = 'active'`,
        [standingId],
      ),
    ).toBe(1);
  });

  it('renew of a lapsed standing appends period v2, advances the head, records evidence', async () => {
    const svc = makeService();
    const standingId = randomUUID();
    await seedStandingAt(standingId, 'lapsed'); // head + v1 period (past) + entity_state lapsed

    const res = await svc.renewStanding({
      tenantId: TENANT_A,
      standingId,
      actor: actor([ROLE.renewal]),
      idempotencyKey: randomUUID(),
      reason: 'renewal for next season',
      details: {
        pathway: 'continuity',
        effectiveFrom: isoFromNow(0),
        effectiveUntil: isoFromNow(365 * DAY_MS),
      },
    });
    expect(res.status).toBe('executed');
    if (res.status === 'executed') expect(res.toState).toBe('active');

    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation_standing.affiliation_standing
          WHERE id = $1 AND standing_version = 2 AND pathway = 'continuity'`,
        [standingId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation_standing.standing_period
          WHERE standing_id = $1 AND version = 2`,
        [standingId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation_standing.standing_event
          WHERE standing_id = $1 AND event_kind = 'renewal'`,
        [standingId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.evidence_object
          WHERE entity_id = $1 AND entity_type = $2`,
        [standingId, ENTITY_TYPE],
      ),
    ).toBeGreaterThanOrEqual(1);
  });

  it('cross-tenant reads are hidden by RLS and a cross-tenant transition fails closed', async () => {
    const svc = makeService();
    const standingId = randomUUID();
    await svc.openStanding(openReq(standingId)); // tenant A

    // Tenant B cannot see the standing head at all (RLS).
    expect(
      await count(
        TENANT_B,
        `SELECT count(*)::int AS n FROM affiliation_standing.affiliation_standing WHERE id = $1`,
        [standingId],
      ),
    ).toBe(0);

    // A cross-tenant mutation attempt fails closed (no such governed entity for tenant B).
    let caught: unknown;
    try {
      await svc.activateStanding({
        tenantId: TENANT_B,
        standingId,
        actor: actor([ROLE.registrar]),
        idempotencyKey: randomUUID(),
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    // Tenant A's standing is untouched (still pending, one period).
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation_standing.standing_period WHERE standing_id = $1`,
        [standingId],
      ),
    ).toBe(1);
  });

  it('a domain-effect failure rolls back the ENTIRE governed transaction (no partial rows)', async () => {
    const svc = makeService();
    // Position an entity at `lapsed` WITHOUT a standing head row, so the renewal effect UPDATE
    // finds no head and throws INSIDE the governed transaction.
    const standingId = randomUUID();
    await seedEntityStateOnly(standingId, 'lapsed');

    const before = await count(
      TENANT_A,
      `SELECT count(*)::int AS n FROM governance.state_transition WHERE entity_id = $1`,
      [standingId],
    );

    await expect(
      svc.renewStanding({
        tenantId: TENANT_A,
        standingId,
        actor: actor([ROLE.renewal]),
        idempotencyKey: randomUUID(),
        reason: 'renewal against a missing head',
        details: {
          pathway: 'continuity',
          effectiveFrom: isoFromNow(0),
          effectiveUntil: isoFromNow(365 * DAY_MS),
        },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.AFFILIATION_STANDING_NOT_FOUND });

    // Nothing was written: no new journal row, no period, no outbox; state unchanged.
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.state_transition WHERE entity_id = $1`,
        [standingId],
      ),
    ).toBe(before);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation_standing.standing_period WHERE standing_id = $1`,
        [standingId],
      ),
    ).toBe(0);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.outbox_message WHERE payload->>'entityId' = $1`,
        [standingId],
      ),
    ).toBe(0);
  });

  it('concurrent expiries are serialized: exactly one succeeds, the other fails closed', async () => {
    const svc = makeService();
    const standingId = randomUUID();
    // Active standing whose term has already ended -> STANDING_TERM_HAS_ENDED holds.
    await seedStandingAt(standingId, 'active', {
      from: isoFromNow(-30 * DAY_MS),
      until: isoFromNow(-1 * DAY_MS),
    });

    const expire = () =>
      svc.expireStanding({
        tenantId: TENANT_A,
        standingId,
        actor: actor([ROLE.lifecycle]),
        idempotencyKey: randomUUID(),
        reason: 'race to expire',
      });
    const results = await Promise.allSettled([expire(), expire()]);
    const executed = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 'executed',
    );
    expect(executed).toHaveLength(1);

    // Exactly one expiry event and a single lapsed state.
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation_standing.standing_event
          WHERE standing_id = $1 AND event_kind = 'expiry'`,
        [standingId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.entity_state
          WHERE entity_id = $1 AND current_state = 'lapsed'`,
        [standingId],
      ),
    ).toBe(1);
  });
});
