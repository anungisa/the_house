/**
 * PostgreSQL {@link StandingProjectionStore} (integration).
 *
 * Each operation runs inside a tenant-scoped transaction (`withTenantTransaction`) so RLS is
 * enforced: `app.tenant_id` is set transaction-locally before the standing_projection table is
 * touched, and a missing tenant context fails closed at the database. The projection worker already
 * knows the tenant (from cross-tenant discovery), so every write/read here is single-tenant.
 *
 * `record` is an idempotent UPSERT on (tenant_id, affiliation_application_id): immutable identity
 * columns (subject_id / season / standing_id) are set on first insert and preserved on update. This
 * store NEVER mutates governed state — it only maintains reconcilable projection bookkeeping.
 */

import { withTenantTransaction, type QueryClient } from '../../../db/pool.js';
import type {
  StandingProjectionRecord,
  StandingProjectionStatus,
  StandingProjectionStore,
  StandingProjectionUpsert,
} from './StandingProjectionStore.js';

interface ProjectionRow extends Record<string, unknown> {
  tenant_id: string;
  affiliation_application_id: string;
  subject_id: string;
  season: string;
  standing_id: string;
  status: StandingProjectionStatus;
  attempts: number;
  next_attempt_at: Date;
  last_error: string | null;
  state_transition_id: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  projected_at: Date | null;
}

const SELECT_COLUMNS = `
  tenant_id, affiliation_application_id, subject_id, season, standing_id, status, attempts,
  next_attempt_at, last_error, state_transition_id, correlation_id, causation_id, projected_at
`;

function toRecord(row: ProjectionRow): StandingProjectionRecord {
  return {
    tenantId: row.tenant_id,
    affiliationApplicationId: row.affiliation_application_id,
    subjectId: row.subject_id,
    season: row.season,
    standingId: row.standing_id,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAtMs: row.next_attempt_at.getTime(),
    ...(row.last_error !== null ? { lastError: row.last_error } : {}),
    ...(row.state_transition_id !== null ? { stateTransitionId: row.state_transition_id } : {}),
    ...(row.correlation_id !== null ? { correlationId: row.correlation_id } : {}),
    ...(row.causation_id !== null ? { causationId: row.causation_id } : {}),
    ...(row.projected_at !== null ? { projectedAtMs: row.projected_at.getTime() } : {}),
  };
}

export class PgStandingProjectionStore implements StandingProjectionStore {
  record(upsert: StandingProjectionUpsert): Promise<void> {
    return withTenantTransaction(upsert.tenantId, async (client: QueryClient) => {
      await client.query(
        `INSERT INTO affiliation_standing.standing_projection
           (tenant_id, affiliation_application_id, subject_id, season, standing_id, status,
            attempts, next_attempt_at, last_error, state_transition_id, correlation_id,
            causation_id, projected_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8::double precision / 1000.0), $9,
                 $10, $11, $12,
                 CASE WHEN $13::bigint IS NULL THEN NULL
                      ELSE to_timestamp($13::double precision / 1000.0) END,
                 now())
         ON CONFLICT (tenant_id, affiliation_application_id) DO UPDATE SET
           status              = EXCLUDED.status,
           attempts            = EXCLUDED.attempts,
           next_attempt_at     = EXCLUDED.next_attempt_at,
           last_error          = EXCLUDED.last_error,
           state_transition_id = COALESCE(
             affiliation_standing.standing_projection.state_transition_id,
             EXCLUDED.state_transition_id),
           correlation_id      = COALESCE(
             affiliation_standing.standing_projection.correlation_id, EXCLUDED.correlation_id),
           causation_id        = COALESCE(
             affiliation_standing.standing_projection.causation_id, EXCLUDED.causation_id),
           projected_at        = COALESCE(
             affiliation_standing.standing_projection.projected_at, EXCLUDED.projected_at),
           updated_at          = now()`,
        [
          upsert.tenantId,
          upsert.affiliationApplicationId,
          upsert.subjectId,
          upsert.season,
          upsert.standingId,
          upsert.status,
          upsert.attempts,
          upsert.nextAttemptAtMs,
          upsert.lastError ?? null,
          upsert.stateTransitionId ?? null,
          upsert.correlationId ?? null,
          upsert.causationId ?? null,
          upsert.projectedAtMs ?? null,
        ],
      );
    });
  }

  getByApplication(
    tenantId: string,
    affiliationApplicationId: string,
  ): Promise<StandingProjectionRecord | undefined> {
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      const rows = await client.query<ProjectionRow>(
        `SELECT ${SELECT_COLUMNS}
           FROM affiliation_standing.standing_projection
          WHERE affiliation_application_id = $1`,
        [affiliationApplicationId],
      );
      const row = rows[0];
      return row === undefined ? undefined : toRecord(row);
    });
  }

  listUnreconciled(
    tenantId: string,
    limit: number,
  ): Promise<readonly StandingProjectionRecord[]> {
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      const rows = await client.query<ProjectionRow>(
        `SELECT ${SELECT_COLUMNS}
           FROM affiliation_standing.standing_projection
          WHERE status <> 'projected'
          ORDER BY next_attempt_at ASC
          LIMIT $1`,
        [limit],
      );
      return rows.map(toRecord);
    });
  }
}
