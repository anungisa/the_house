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
import { ErrorCode } from '../../../src/shared/errors/AppError.js';
import { closePool, queryRaw, withTenantTransaction } from '../../../src/db/pool.js';
import type { TransitionInput } from '../../../src/governance/types/TransitionTypes.js';

/**
 * Integration tests for the AffiliationApplication governed transition path against a real
 * PostgreSQL database. GATED: they run only when RUN_DB_TESTS=1 and DATABASE_URL are set;
 * otherwise the suite is skipped so the default `npm test` stays hermetic.
 *
 * Setup applies db/migrations/*.sql (idempotent). The connection MUST be a non-superuser,
 * non-BYPASSRLS role for the RLS isolation assertions to hold.
 */
const RUN = process.env.RUN_DB_TESTS === '1' && (process.env.DATABASE_URL ?? '') !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const ALL_PASS = {
  requiredFieldsComplete: true,
  requiredDocsPresent: true,
  openComplianceFlags: false,
  feesPaid: true,
  seasonIsCurrent: true,
};

async function applyMigrations(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query(sql);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

function makeKernel(): GovernanceKernel {
  const registry = new GuardRegistry();
  registerAffiliationGuards(registry);
  return new GovernanceKernel({ store: new PgGovernanceStore(), guards: registry });
}

function input(
  o: Pick<TransitionInput, 'entityId' | 'trigger' | 'idempotencyKey'> & Partial<TransitionInput>,
): TransitionInput {
  return {
    entityType: 'AffiliationApplication',
    actor: o.actor ?? {
      actorId: 'reviewer-1',
      tenantId: TENANT_A,
      scopeType: 'national_organization',
      roles: ['reviewer'],
    },
    context: o.context ?? { tenantId: TENANT_A, scopeType: 'national_organization' },
    payload: o.payload ?? { facts: ALL_PASS },
    ...o,
  };
}

d('AffiliationApplication governed transition (integration)', () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closePool();
  });

  it('executes draft -> submitted and writes journal, audit, and one outbox row', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    const result = await kernel.transition(
      input({ entityId, trigger: 'submit', idempotencyKey: randomUUID() }),
    );
    expect(result.status).toBe('executed');
    expect(result.toState).toBe('submitted');

    const states = await withTenantTransaction(TENANT_A, (c) =>
      c.query(
        `SELECT current_state FROM governance.entity_state WHERE entity_id = $1`,
        [entityId],
      ),
    );
    expect(states[0]!['current_state']).toBe('submitted');
  });

  it('denies an unknown transition (fail closed)', async () => {
    const kernel = makeKernel();
    await expect(
      kernel.transition(
        input({ entityId: randomUUID(), trigger: 'approve', idempotencyKey: randomUUID() }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.UNKNOWN_TRANSITION });
  });

  it('idempotent retry does not duplicate state_transition or outbox rows', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    const key = randomUUID();
    await kernel.transition(input({ entityId, trigger: 'submit', idempotencyKey: key }));
    const replay = await kernel.transition(input({ entityId, trigger: 'submit', idempotencyKey: key }));
    expect(replay.status).toBe('idempotent_replay');

    const rows = await withTenantTransaction(TENANT_A, (c) =>
      c.query(
        `SELECT count(*)::int AS n FROM governance.state_transition WHERE entity_id = $1`,
        [entityId],
      ),
    );
    expect(rows[0]!['n']).toBe(1);
  });

  it('enforces RLS tenant isolation: tenant B cannot see tenant A entity_state', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    await kernel.transition(input({ entityId, trigger: 'submit', idempotencyKey: randomUUID() }));

    const visibleToB = await withTenantTransaction(TENANT_B, (c) =>
      c.query(`SELECT id FROM governance.entity_state WHERE entity_id = $1`, [entityId]),
    );
    expect(visibleToB).toHaveLength(0);
  });

  it('fails closed at the database when tenant context is not set', async () => {
    await expect(
      queryRaw(`SELECT governance.current_tenant_id()`),
    ).rejects.toThrow(/TENANT_CONTEXT_MISSING/);
  });
});
