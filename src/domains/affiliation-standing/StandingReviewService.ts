/**
 * Standing REVIEW/READ service — the tenant- and scope-bounded read model that powers The Button's
 * representative "Standing & Renewal" experience (Slice F, read-only).
 *
 * This service NEVER mutates governed lifecycle state and NEVER invokes the kernel. It exposes the
 * standing FACTS (current effective period, pathway, version) joined to the kernel-owned lifecycle
 * state (`governance.entity_state`) so a representative can SEE the standing of the organization(s)
 * they represent. Governed lifecycle state remains the single source of truth for `status`; this
 * service only reads it.
 *
 * Scope isolation is enforced two ways, both fail-closed:
 *   1) RLS on `affiliation_standing.*` (tenant) — enforced by {@link withTenantTransaction}.
 *   2) The caller (the Button standing HTTP adapter) resolves the actor's ACTIVE representative
 *      authority server-side and passes ONLY the authorized organization ids here. This service
 *      further constrains every row to those organization ids across the affiliation application's
 *      organizational references, so a standing outside the representative's active scope is never
 *      returned (opaque — it simply does not appear / resolves to undefined).
 *
 * NSO-GENERIC: no sport-specific vocabulary.
 */

import { withTenantTransaction } from '../../db/pool.js';

/**
 * A representative-scoped standing read record. `organizationId` is the affiliation application's
 * primary organization (for display/labeling); scope authorization is performed by the caller and
 * re-constrained in SQL, so this record is only ever produced for an authorized organization.
 */
export interface StandingReviewRecord {
  readonly standingId: string;
  readonly affiliationApplicationId: string;
  readonly organizationId: string;
  readonly season: string;
  /** Monotonic effective-period version (>= 1); advances on each governed renewal. */
  readonly standingVersion: number;
  /** ISO-8601 UTC instant the current effective period begins. */
  readonly effectiveFrom: string;
  /** ISO-8601 UTC instant the current effective period ends (exclusive). */
  readonly effectiveUntil: string;
  /** Pathway under which the current period was granted/renewed. */
  readonly pathway: string;
  /** Kernel-owned governed lifecycle state (e.g. pending, active, suspended, lapsed, terminated). */
  readonly lifecycleState: string;
}

type StandingRow = {
  readonly id: string;
  readonly affiliation_application_id: string;
  readonly organization_id: string;
  readonly season: string;
  readonly standing_version: number;
  readonly effective_from: Date | string;
  readonly effective_until: Date | string;
  readonly pathway: string;
  readonly current_state: string;
};
function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toRecord(row: StandingRow): StandingReviewRecord {
  return {
    standingId: row.id,
    affiliationApplicationId: row.affiliation_application_id,
    organizationId: row.organization_id,
    season: row.season,
    standingVersion: row.standing_version,
    effectiveFrom: toIso(row.effective_from),
    effectiveUntil: toIso(row.effective_until),
    pathway: row.pathway,
    lifecycleState: row.current_state,
  };
}

const SELECT_STANDING = `
  SELECT s.id, s.affiliation_application_id, a.organization_id, s.season,
         s.standing_version, s.effective_from, s.effective_until, s.pathway,
         es.current_state
    FROM affiliation_standing.affiliation_standing s
    JOIN affiliation.affiliation_application a
      ON a.tenant_id = s.tenant_id AND a.id = s.affiliation_application_id
    JOIN governance.entity_state es
      ON es.tenant_id = s.tenant_id
     AND es.entity_type = 'AffiliationStanding'
     AND es.entity_id = s.id`;

const SCOPE_PREDICATE = `(
    a.organization_id = ANY($1::uuid[])
    OR a.organization_unit_id = ANY($1::uuid[])
    OR a.national_organization_id = ANY($1::uuid[])
    OR a.regional_organization_id = ANY($1::uuid[])
    OR a.local_organization_id = ANY($1::uuid[])
    OR a.scope_id = ANY($1::uuid[])
  )`;

export class StandingReviewService {
  /**
   * List the standings visible to a representative whose ACTIVE authority covers
   * `organizationIds`. Returns an empty list when no organization ids are supplied (fail closed).
   */
  async listForOrganizations(
    tenantId: string,
    organizationIds: readonly string[],
  ): Promise<readonly StandingReviewRecord[]> {
    if (organizationIds.length === 0) return [];
    return withTenantTransaction(tenantId, async (client) => {
      const rows = await client.query<StandingRow>(
        `${SELECT_STANDING}
          WHERE ${SCOPE_PREDICATE}
          ORDER BY s.created_at DESC, s.id DESC`,
        [organizationIds],
      );
      return rows.map(toRecord);
    });
  }

  /**
   * Fetch a single standing by id, constrained to the representative's ACTIVE-authority
   * organization scope. Resolves to undefined (opaque 404 at the transport) when the standing does
   * not exist for the tenant OR falls outside the supplied organization scope.
   */
  async getStanding(
    tenantId: string,
    standingId: string,
    organizationIds: readonly string[],
  ): Promise<StandingReviewRecord | undefined> {
    if (organizationIds.length === 0) return undefined;
    return withTenantTransaction(tenantId, async (client) => {
      const rows = await client.query<StandingRow>(
        `${SELECT_STANDING}
          WHERE s.id = $2::uuid
            AND ${SCOPE_PREDICATE}
          LIMIT 1`,
        [organizationIds, standingId],
      );
      const row = rows[0];
      return row === undefined ? undefined : toRecord(row);
    });
  }
}
