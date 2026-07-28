import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setTimeout as setNodeTimeout, clearTimeout as clearNodeTimeout } from 'node:timers';
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
import { AffiliationWorkflowPlanner } from '../../../src/governance/workflow/AffiliationWorkflowPlanner.js';
import { PgWorkflowStore } from '../../../src/governance/workflow/PgWorkflowStore.js';
import { WorkflowDecisionService } from '../../../src/governance/workflow/WorkflowDecisionService.js';
import { ApprovedWorkflowExecutionService } from '../../../src/governance/workflow/ApprovedWorkflowExecutionService.js';
import { ErrorCode } from '../../../src/shared/errors/AppError.js';
import { closePool, withTenantTransaction, type QueryClient } from '../../../src/db/pool.js';
import type {
  GovernanceStore,
  GovernanceTx,
  StateTransitionInsert,
  TransitionSerializationInput,
  TransitionSerializationKeyResolver,
} from '../../../src/governance/kernel/ports.js';
import type { TransitionInput } from '../../../src/governance/types/TransitionTypes.js';

/**
 * AUTHORITATIVE CONCURRENCY PROOF for affiliation activation atomicity (Increment 2).
 *
 * These gated integration tests exercise the transaction-scoped advisory lock
 * (`pg_advisory_xact_lock`) that the Governance Kernel acquires — via a domain-supplied
 * {@link TransitionSerializationKeyResolver} — before evaluating guards and mutating state.
 * The business invariant proven here: at most ONE AffiliationApplication may hold ACTIVE
 * standing for the same (tenant, affiliation subject, season). "Exactly-once" here means the
 * institutional effect (one active standing) — NOT exactly-once event transport.
 *
 * Method: two DISTINCT governed transitions race through the REAL kernel against a REAL
 * PostgreSQL database on SEPARATE pooled connections, aligned by an EXPLICIT synchronization
 * barrier installed at the resolver seam (each racer blocks until BOTH have resolved their
 * serialization key and are about to contend for the advisory lock). This maximizes the race
 * window so the database + transaction boundary — not test timing — provide the guarantee.
 *
 * GATED on RUN_DB_TESTS=1 + DATABASE_URL. The runtime role MUST be non-superuser /
 * non-BYPASSRLS so RLS holds. Migrations apply via MIGRATE_DATABASE_URL when provided.
 */
const RUN = process.env.RUN_DB_TESTS === '1' && (process.env.DATABASE_URL ?? '') !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const ENTITY_TYPE = 'AffiliationApplication';
const SEASON = '2025-26';
const OTHER_SEASON = '2024-25';

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

// -----------------------------------------------------------------------------
// Synchronization barrier: releases all parties only once `parties` have arrived.
// A generous timeout resolves the gate defensively so a mis-wired test FAILS on its
// assertions instead of hanging the suite forever.
// -----------------------------------------------------------------------------
interface Barrier {
  arrive(): Promise<void>;
}
function makeBarrier(parties: number, timeoutMs = 10_000): Barrier {
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const timer = setNodeTimeout(() => release(), timeoutMs);
  timer.unref?.();
  return {
    async arrive() {
      arrived += 1;
      if (arrived >= parties) {
        clearNodeTimeout(timer);
        release();
      }
      await gate;
    },
  };
}

/**
 * Wraps the real affiliation resolver so that, for keys it actually returns, each racer
 * blocks at the barrier immediately BEFORE the kernel acquires the advisory lock. This is
 * the explicit synchronization barrier that forces the two transactions to contend.
 */
function barrierResolver(
  inner: TransitionSerializationKeyResolver,
  barrier: Barrier,
): TransitionSerializationKeyResolver {
  return {
    async resolveKeys(input: TransitionSerializationInput): Promise<readonly string[]> {
      const keys = await inner.resolveKeys(input);
      if (keys.length > 0) {
        await barrier.arrive();
      }
      return keys;
    },
  };
}

/**
 * Decorates a store so the FIRST governed state mutation (insertStateTransition) for a
 * "poisoned" entity throws — forcing that transaction to ROLL BACK after it has acquired the
 * advisory lock. Used to prove the lock is released on rollback and that a rolled-back
 * activation claims no active standing.
 */
function poisonedStore(inner: GovernanceStore, poison: ReadonlySet<string>): GovernanceStore {
  return {
    findExistingResult: (...args) => inner.findExistingResult(...args),
    runInTransaction: (tenantId, fn) =>
      inner.runInTransaction(tenantId, (tx) => {
        const wrapped = new Proxy(tx, {
          get(target, prop) {
            const value = Reflect.get(target, prop, target) as unknown;
            if (prop === 'insertStateTransition') {
              return (insert: StateTransitionInsert): Promise<string> => {
                if (poison.has(insert.entityId)) {
                  return Promise.reject(new Error(`POISONED_MUTATION:${insert.entityId}`));
                }
                return (value as (i: StateTransitionInsert) => Promise<string>).call(target, insert);
              };
            }
            if (typeof value === 'function') {
              return (value as (...a: unknown[]) => unknown).bind(target);
            }
            return value;
          },
        }) as GovernanceTx;
        return fn(wrapped);
      }),
  };
}

function makeKernel(
  resolver: TransitionSerializationKeyResolver,
  opts: { poison?: ReadonlySet<string> } = {},
): GovernanceKernel {
  const registry = new GuardRegistry();
  const affiliationStore = new PgAffiliationApplicationStore();
  registerAffiliationGuards(registry, new DomainBackedAffiliationGuardRepository(affiliationStore));
  const base: GovernanceStore = new PgGovernanceStore();
  return new GovernanceKernel({
    store: opts.poison !== undefined ? poisonedStore(base, opts.poison) : base,
    guards: registry,
    workflowPlanner: new AffiliationWorkflowPlanner(),
    serializationKeyResolvers: new Map([[ENTITY_TYPE, resolver]]),
  });
}

/** Fresh real resolver bound to the affiliation store (reads authoritative subject+season). */
function realResolver(): TransitionSerializationKeyResolver {
  return new AffiliationActiveStandingSerializationResolver(new PgAffiliationApplicationStore());
}

function input(
  o: Pick<TransitionInput, 'entityId' | 'trigger' | 'idempotencyKey'> & Partial<TransitionInput>,
): TransitionInput {
  return {
    entityType: ENTITY_TYPE,
    actor: o.actor ?? {
      actorId: 'reviewer-1',
      tenantId: o.context?.tenantId ?? TENANT_A,
      scopeType: 'national_organization',
      roles: ['reviewer'],
    },
    context: o.context ?? { tenantId: TENANT_A, scopeType: 'national_organization' },
    ...o,
  };
}

async function seedApplication(
  entityId: string,
  opts: { tenantId?: string; season?: string; scopeId?: string } = {},
): Promise<void> {
  const tenantId = opts.tenantId ?? TENANT_A;
  const season = opts.season ?? SEASON;
  await withTenantTransaction(tenantId, async (c: QueryClient) => {
    await c.query(
      `INSERT INTO affiliation.affiliation_application
         (id, tenant_id, season_id, required_fields_complete, documents_verified, payment_status, scope_id)
       VALUES ($1,$2,$3,true,true,'paid',$4)`,
      [entityId, tenantId, season, opts.scopeId ?? null],
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
      [tenantId, season],
    );
  });
}

/** Position an entity directly at a given lifecycle state (test fixture). */
async function seedEntityStateAt(
  entityId: string,
  state: string,
  tenantId: string = TENANT_A,
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
      [tenantId, ENTITY_TYPE, entityId, state, sm[0]!.id],
    );
  });
}

async function count(tenantId: string, sql: string, params: readonly unknown[]): Promise<number> {
  const rows = await withTenantTransaction(tenantId, (c: QueryClient) =>
    c.query<{ n: number }>(sql, params),
  );
  return rows[0]!.n;
}

/** Count applications currently ACTIVE for a given tenant + subject (scope) + season. */
async function activeStandingCount(
  tenantId: string,
  subject: string,
  season: string = SEASON,
): Promise<number> {
  return count(
    tenantId,
    `SELECT count(*)::int AS n
       FROM governance.entity_state es
       JOIN affiliation.affiliation_application a ON a.id = es.entity_id
      WHERE es.entity_type = $1
        AND es.current_state = 'active'
        AND a.scope_id = $2
        AND a.season_id = $3`,
    [ENTITY_TYPE, subject, season],
  );
}

/** Record both tier sign-offs so a review workflow becomes approved (execution-ready). */
async function approveWorkflow(workflowInstanceId: string): Promise<void> {
  const decisions = new WorkflowDecisionService(new PgWorkflowStore());
  await decisions.recordDecision({
    tenantId: TENANT_A,
    workflowInstanceId,
    stepCode: 'regional_signoff',
    decision: 'approve',
    actorUserId: randomUUID(),
  });
  await decisions.recordDecision({
    tenantId: TENANT_A,
    workflowInstanceId,
    stepCode: 'national_signoff',
    decision: 'approve',
    actorUserId: randomUUID(),
  });
}

d('AffiliationApplication activation atomicity — concurrency (integration)', () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closePool();
  });

  it('two concurrent activations for the SAME tenant+subject+season: exactly one obtains ACTIVE standing', async () => {
    const subject = randomUUID();
    const appOne = randomUUID();
    const appTwo = randomUUID();
    await seedApplication(appOne, { scopeId: subject });
    await seedApplication(appTwo, { scopeId: subject });
    await seedEntityStateAt(appOne, 'approved');
    await seedEntityStateAt(appTwo, 'approved');

    const barrier = makeBarrier(2);
    const kernel = makeKernel(barrierResolver(realResolver(), barrier));

    const [r1, r2] = await Promise.all([
      kernel.transition(input({ entityId: appOne, trigger: 'activate', idempotencyKey: randomUUID() })),
      kernel.transition(input({ entityId: appTwo, trigger: 'activate', idempotencyKey: randomUUID() })),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual(['executed', 'rejected']);

    // EXACTLY ONE active standing exists for the governed scope.
    expect(await activeStandingCount(TENANT_A, subject)).toBe(1);

    // Only the winner wrote a state_transition to 'active' and an outbox message.
    const winner = r1.status === 'executed' ? appOne : appTwo;
    const loser = winner === appOne ? appTwo : appOne;
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.state_transition
          WHERE entity_id = $1 AND to_state = 'active'`,
        [winner],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.state_transition
          WHERE entity_id = $1 AND to_state = 'active'`,
        [loser],
      ),
    ).toBe(0);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.entity_state
          WHERE entity_id = $1 AND current_state = 'active'`,
        [loser],
      ),
    ).toBe(0);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.outbox_message
          WHERE payload->>'entityId' = $1 AND payload->>'toState' = 'active'`,
        [winner],
      ),
    ).toBe(1);
  });

  it('concurrent activations for DIFFERENT seasons both succeed (distinct governed scopes)', async () => {
    const subject = randomUUID();
    const appCurrent = randomUUID();
    const appOther = randomUUID();
    await seedApplication(appCurrent, { scopeId: subject, season: SEASON });
    await seedApplication(appOther, { scopeId: subject, season: OTHER_SEASON });
    await seedEntityStateAt(appCurrent, 'approved');
    await seedEntityStateAt(appOther, 'approved');

    const barrier = makeBarrier(2);
    const kernel = makeKernel(barrierResolver(realResolver(), barrier));

    const [r1, r2] = await Promise.all([
      kernel.transition(input({ entityId: appCurrent, trigger: 'activate', idempotencyKey: randomUUID() })),
      kernel.transition(input({ entityId: appOther, trigger: 'activate', idempotencyKey: randomUUID() })),
    ]);

    expect(r1.status).toBe('executed');
    expect(r2.status).toBe('executed');
    expect(await activeStandingCount(TENANT_A, subject, SEASON)).toBe(1);
    expect(await activeStandingCount(TENANT_A, subject, OTHER_SEASON)).toBe(1);
  });

  it('concurrent activations for DIFFERENT subjects both succeed (distinct governed scopes)', async () => {
    const subjectA = randomUUID();
    const subjectB = randomUUID();
    const appA = randomUUID();
    const appB = randomUUID();
    await seedApplication(appA, { scopeId: subjectA });
    await seedApplication(appB, { scopeId: subjectB });
    await seedEntityStateAt(appA, 'approved');
    await seedEntityStateAt(appB, 'approved');

    const barrier = makeBarrier(2);
    const kernel = makeKernel(barrierResolver(realResolver(), barrier));

    const [r1, r2] = await Promise.all([
      kernel.transition(input({ entityId: appA, trigger: 'activate', idempotencyKey: randomUUID() })),
      kernel.transition(input({ entityId: appB, trigger: 'activate', idempotencyKey: randomUUID() })),
    ]);

    expect(r1.status).toBe('executed');
    expect(r2.status).toBe('executed');
    expect(await activeStandingCount(TENANT_A, subjectA)).toBe(1);
    expect(await activeStandingCount(TENANT_A, subjectB)).toBe(1);
  });

  it('concurrent activations across DIFFERENT tenants (same subject+season) both succeed; lock is tenant-scoped', async () => {
    const subject = randomUUID();
    const appA = randomUUID();
    const appB = randomUUID();
    await seedApplication(appA, { tenantId: TENANT_A, scopeId: subject });
    await seedApplication(appB, { tenantId: TENANT_B, scopeId: subject });
    await seedEntityStateAt(appA, 'approved', TENANT_A);
    await seedEntityStateAt(appB, 'approved', TENANT_B);

    const barrier = makeBarrier(2);
    const kernel = makeKernel(barrierResolver(realResolver(), barrier));

    const [r1, r2] = await Promise.all([
      kernel.transition(
        input({
          entityId: appA,
          trigger: 'activate',
          idempotencyKey: randomUUID(),
          context: { tenantId: TENANT_A, scopeType: 'national_organization' },
          actor: { actorId: 'reviewer-a', tenantId: TENANT_A, scopeType: 'national_organization', roles: ['reviewer'] },
        }),
      ),
      kernel.transition(
        input({
          entityId: appB,
          trigger: 'activate',
          idempotencyKey: randomUUID(),
          context: { tenantId: TENANT_B, scopeType: 'national_organization' },
          actor: { actorId: 'reviewer-b', tenantId: TENANT_B, scopeType: 'national_organization', roles: ['reviewer'] },
        }),
      ),
    ]);

    expect(r1.status).toBe('executed');
    expect(r2.status).toBe('executed');
    expect(await activeStandingCount(TENANT_A, subject)).toBe(1);
    expect(await activeStandingCount(TENANT_B, subject)).toBe(1);
  });

  it('a successful activation is idempotent on retry: one active standing, one journal row, one outbox message', async () => {
    const subject = randomUUID();
    const entityId = randomUUID();
    await seedApplication(entityId, { scopeId: subject });
    await seedEntityStateAt(entityId, 'approved');

    const key = randomUUID();
    const kernel = makeKernel(realResolver());

    const first = await kernel.transition(input({ entityId, trigger: 'activate', idempotencyKey: key }));
    const retry = await kernel.transition(input({ entityId, trigger: 'activate', idempotencyKey: key }));

    expect(first.status).toBe('executed');
    // A retry of the same successful command is a safe replay — never a second mutation.
    expect(retry.status).toBe('idempotent_replay');

    expect(await activeStandingCount(TENANT_A, subject)).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.state_transition
          WHERE entity_id = $1 AND to_state = 'active'`,
        [entityId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.outbox_message
          WHERE payload->>'entityId' = $1 AND payload->>'toState' = 'active'`,
        [entityId],
      ),
    ).toBe(1);
  });

  it('a rolled-back activation releases the lock and claims NO active standing; the contending activation wins', async () => {
    const subject = randomUUID();
    const poisoned = randomUUID();
    const healthy = randomUUID();
    await seedApplication(poisoned, { scopeId: subject });
    await seedApplication(healthy, { scopeId: subject });
    await seedEntityStateAt(poisoned, 'approved');
    await seedEntityStateAt(healthy, 'approved');

    const barrier = makeBarrier(2);
    // The poisoned entity's mutation throws → its transaction rolls back (releasing the lock).
    const kernel = makeKernel(barrierResolver(realResolver(), barrier), {
      poison: new Set([poisoned]),
    });

    const results = await Promise.allSettled([
      kernel.transition(input({ entityId: poisoned, trigger: 'activate', idempotencyKey: randomUUID() })),
      kernel.transition(input({ entityId: healthy, trigger: 'activate', idempotencyKey: randomUUID() })),
    ]);

    // The healthy application obtains the sole active standing regardless of lock-acquisition order:
    // if the poisoned racer won the lock, its rollback frees it for the healthy racer; if the healthy
    // racer won, the poisoned racer is guard-rejected (or rolls back) and never activates.
    expect(await activeStandingCount(TENANT_A, subject)).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.entity_state
          WHERE entity_id = $1 AND current_state = 'active'`,
        [healthy],
      ),
    ).toBe(1);
    // The poisoned application never committed ACTIVE standing.
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.entity_state
          WHERE entity_id = $1 AND current_state = 'active'`,
        [poisoned],
      ),
    ).toBe(0);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.state_transition
          WHERE entity_id = $1 AND to_state = 'active'`,
        [poisoned],
      ),
    ).toBe(0);

    const healthyResult = results[1];
    expect(healthyResult.status).toBe('fulfilled');
  });

  it('a reinstate execution and an activation contend on the same governed key: exactly one active standing', async () => {
    const subject = randomUUID();
    // App to be reinstated: seeded directly at 'suspended', then driven to an approved,
    // execution-ready reinstate request.
    const toReinstate = randomUUID();
    await seedApplication(toReinstate, { scopeId: subject });
    await seedEntityStateAt(toReinstate, 'suspended');

    // A competing application ready to activate for the SAME scope+season.
    const toActivate = randomUUID();
    await seedApplication(toActivate, { scopeId: subject });
    await seedEntityStateAt(toActivate, 'approved');

    const barrier = makeBarrier(2);
    const resolver = barrierResolver(realResolver(), barrier);
    const kernel = makeKernel(resolver);
    const executor = new ApprovedWorkflowExecutionService(kernel, new PgWorkflowStore());

    // Setup: create the reinstate request (approval-required, no mutation, no lock/barrier),
    // then approve its review workflow so it is execution-ready.
    const requested = await kernel.transition(
      input({ entityId: toReinstate, trigger: 'reinstate', idempotencyKey: randomUUID() }),
    );
    expect(requested.status).toBe('approval_required');
    expect(requested.workflowInstanceId).toBeDefined();
    await approveWorkflow(requested.workflowInstanceId!);

    // Race: the reinstate EXECUTION (authoritative mutation) vs the activation.
    const [reinstateResult, activateResult] = await Promise.allSettled([
      executor.execute({
        tenantId: TENANT_A,
        workflowInstanceId: requested.workflowInstanceId!,
        actor: { actorId: 'reviewer-1', tenantId: TENANT_A, scopeType: 'national_organization', roles: ['reviewer'] },
        idempotencyKey: randomUUID(),
      }),
      kernel.transition(input({ entityId: toActivate, trigger: 'activate', idempotencyKey: randomUUID() })),
    ]);

    // EXACTLY ONE application holds active standing for the governed scope, regardless of
    // which racer won the advisory lock.
    expect(await activeStandingCount(TENANT_A, subject)).toBe(1);
    const reinstateActive = await count(
      TENANT_A,
      `SELECT count(*)::int AS n FROM governance.entity_state
        WHERE entity_id = $1 AND current_state = 'active'`,
      [toReinstate],
    );
    const activateActive = await count(
      TENANT_A,
      `SELECT count(*)::int AS n FROM governance.entity_state
        WHERE entity_id = $1 AND current_state = 'active'`,
      [toActivate],
    );
    expect(reinstateActive + activateActive).toBe(1);

    // The loser is fail-closed: the direct path returns a 'rejected' result; the approved-
    // execution path throws GUARD_FAILED. Exactly one racer is denied.
    if (reinstateActive === 1) {
      // Reinstate won → the activation was guard-rejected (no mutation).
      expect(reinstateResult.status).toBe('fulfilled');
      expect(activateResult.status).toBe('fulfilled');
      if (activateResult.status === 'fulfilled') {
        expect(activateResult.value.status).toBe('rejected');
      }
    } else {
      // Activation won → the reinstate execution failed closed by throwing GUARD_FAILED.
      expect(activateResult.status).toBe('fulfilled');
      if (activateResult.status === 'fulfilled') {
        expect(activateResult.value.status).toBe('executed');
      }
      expect(reinstateResult.status).toBe('rejected');
      if (reinstateResult.status === 'rejected') {
        expect(String((reinstateResult.reason as { code?: string }).code)).toBe(ErrorCode.GUARD_FAILED);
      }
    }
  });
});
