/**
 * Local/demo seed for a single AffiliationApplication.
 *
 * Prepares the MINIMAL persisted DOMAIN facts (+ an initial `draft` governed state) needed
 * for a successful `submit` transition, so a developer can exercise the real governed HTTP
 * path locally. It writes:
 *   - affiliation.affiliation_application  (required_fields_complete + documents_verified)
 *   - affiliation.application_document      (one approved required document)
 *   - affiliation.season                    (current season for SEASON_IS_CURRENT)
 *   - governance.entity_state               (initial 'draft' state ONLY)
 *
 * GOVERNANCE RULES honoured:
 *   - Lifecycle state stays owned by governance.entity_state.
 *   - Seeding the INITIAL 'draft' state is allowed for local demo/bootstrap ONLY, and is
 *     written with ON CONFLICT DO NOTHING so it NEVER overwrites/advances a real state.
 *   - This module performs NO transition (it never touches the kernel/service) and seeds
 *     NO future lifecycle state.
 *
 * NSO-GENERIC: demo identifiers and values are sport-agnostic. No Curling Canada data.
 */

import { AFFILIATION_APPLICATION_ENTITY_TYPE } from '../../domains/affiliation/index.js';

export interface DemoIds {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly seasonId: string;
  readonly actorUserId: string;
}

/** Deterministic, NSO-generic demo identifiers (overridable via env). */
export const DEMO_DEFAULTS: DemoIds = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  applicationId: '22222222-2222-2222-2222-222222222222',
  seasonId: '2026',
  actorUserId: '33333333-3333-3333-3333-333333333333',
};

function pick(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
}

/** Resolve demo IDs from the environment, falling back to {@link DEMO_DEFAULTS}. */
export function resolveDemoIds(env: Record<string, string | undefined> = process.env): DemoIds {
  return {
    tenantId: pick(env.DEMO_TENANT_ID, DEMO_DEFAULTS.tenantId),
    applicationId: pick(env.DEMO_APPLICATION_ID, DEMO_DEFAULTS.applicationId),
    seasonId: pick(env.DEMO_SEASON_ID, DEMO_DEFAULTS.seasonId),
    actorUserId: pick(env.DEMO_ACTOR_USER_ID, DEMO_DEFAULTS.actorUserId),
  };
}

export interface SeedStatement {
  readonly label: string;
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * Build the idempotent seed statements (pure — no I/O), given the resolved state machine id
 * for the AffiliationApplication entity type. Tests inspect these without a database.
 *
 * Idempotency strategy uses only SELECT/INSERT/UPDATE (no DELETE) so a least-privilege
 * runtime role can run it:
 *   - application: upsert on the primary key.
 *   - document:    insert only when the required document is absent.
 *   - season:      upsert on (tenant_id, season_id).
 *   - entity_state: insert the INITIAL draft only; DO NOTHING if any state already exists.
 */
export function buildAffiliationDemoStatements(
  ids: DemoIds,
  stateMachineId: string,
): SeedStatement[] {
  return [
    {
      label: 'affiliation_application',
      sql: `INSERT INTO affiliation.affiliation_application
              (id, tenant_id, season_id, required_fields_complete, documents_verified, payment_status)
            VALUES ($1, $2, $3, true, true, 'paid')
            ON CONFLICT (id) DO UPDATE
              SET season_id = EXCLUDED.season_id,
                  required_fields_complete = true,
                  documents_verified = true,
                  payment_status = 'paid',
                  updated_at = now()`,
      params: [ids.applicationId, ids.tenantId, ids.seasonId],
    },
    {
      label: 'application_document',
      sql: `INSERT INTO affiliation.application_document
              (tenant_id, application_id, document_type, required, status, verified_at)
            SELECT $1, $2, 'affiliation_form', true, 'approved', now()
            WHERE NOT EXISTS (
              SELECT 1 FROM affiliation.application_document
               WHERE application_id = $2 AND document_type = 'affiliation_form'
            )`,
      params: [ids.tenantId, ids.applicationId],
    },
    {
      label: 'season',
      sql: `INSERT INTO affiliation.season (tenant_id, season_id, is_current, label)
            VALUES ($1, $2, true, 'Demo season')
            ON CONFLICT (tenant_id, season_id) DO UPDATE SET is_current = true`,
      params: [ids.tenantId, ids.seasonId],
    },
    {
      // Initial governed state ONLY. ON CONFLICT DO NOTHING => never advances/overwrites a
      // real lifecycle state written by the kernel. No transition is performed here.
      label: 'entity_state(draft)',
      sql: `INSERT INTO governance.entity_state
              (tenant_id, entity_type, entity_id, current_state, state_machine_id, created_by)
            VALUES ($1, $2, $3, 'draft', $4, 'demo-seed')
            ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING`,
      params: [ids.tenantId, AFFILIATION_APPLICATION_ENTITY_TYPE, ids.applicationId, stateMachineId],
    },
  ];
}

/** Minimal query surface needed to run the seed (satisfied by db/pool's QueryClient). */
export interface SeedQueryClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
}

/**
 * Resolve the active AffiliationApplication state machine id (definition table; no RLS).
 * Throws if the v1 seed migration has not been applied.
 */
export async function resolveStateMachineId(client: SeedQueryClient): Promise<string> {
  const rows = await client.query<{ id: string }>(
    `SELECT id FROM governance.state_machine
      WHERE entity_type = $1 AND status = 'active'
      ORDER BY version DESC LIMIT 1`,
    [AFFILIATION_APPLICATION_ENTITY_TYPE],
  );
  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error(
      `No active state_machine for ${AFFILIATION_APPLICATION_ENTITY_TYPE}. ` +
        'Run database migrations (npm run db:migrate) before seeding.',
    );
  }
  return id;
}

/** Execute all seed statements in order against a tenant-scoped client. */
export async function runAffiliationDemoSeed(
  client: SeedQueryClient,
  ids: DemoIds,
  log: (message: string) => void = (): void => {},
): Promise<void> {
  const stateMachineId = await resolveStateMachineId(client);
  for (const statement of buildAffiliationDemoStatements(ids, stateMachineId)) {
    await client.query(statement.sql, statement.params);
    log(`seeded ${statement.label}`);
  }
}
