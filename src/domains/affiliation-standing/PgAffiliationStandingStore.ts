/**
 * PostgreSQL {@link AffiliationStandingStore} (integration, READ-only).
 *
 * Each read runs inside a tenant-scoped transaction (`withTenantTransaction`) so RLS is enforced:
 * `app.tenant_id` is set transaction-locally before any affiliation_standing table access, and a
 * missing tenant context fails closed at the database. Reads are side-effect-free. This store
 * deliberately exposes NO governed-lifecycle mutation and NO fact mutation — standing facts are
 * written exclusively by the kernel's domain effect inside a governed transaction.
 */

import { withTenantTransaction, type QueryClient } from '../../db/pool.js';
import type {
  AffiliationStandingHead,
  AffiliationStandingStore,
} from './AffiliationStandingStore.js';

interface StandingRow extends Record<string, unknown> {
  id: string;
  tenant_id: string;
  affiliation_application_id: string;
  subject_id: string;
  season: string;
  standing_version: number;
  effective_from: string;
  effective_until: string;
  pathway: string;
  established_by: string;
}

function toHead(row: StandingRow): AffiliationStandingHead {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    affiliationApplicationId: row.affiliation_application_id,
    subjectId: row.subject_id,
    season: row.season,
    standingVersion: row.standing_version,
    // Normalize to ISO-8601 so guard clock comparisons are unambiguous regardless of the driver's
    // timestamptz text form.
    effectiveFrom: new Date(row.effective_from).toISOString(),
    effectiveUntil: new Date(row.effective_until).toISOString(),
    pathway: row.pathway,
    establishedBy: row.established_by,
  };
}

export class PgAffiliationStandingStore implements AffiliationStandingStore {
  getStanding(
    tenantId: string,
    standingId: string,
  ): Promise<AffiliationStandingHead | undefined> {
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      const rows = await client.query<StandingRow>(
        `SELECT id, tenant_id, affiliation_application_id, subject_id, season, standing_version,
                effective_from, effective_until, pathway, established_by
           FROM affiliation_standing.affiliation_standing
          WHERE id = $1`,
        [standingId],
      );
      const row = rows[0];
      return row === undefined ? undefined : toHead(row);
    });
  }
}
