/**
 * PostgreSQL {@link AffiliationApplicationStore} (integration).
 *
 * Each read runs inside a tenant-scoped transaction (`withTenantTransaction`) so RLS is
 * enforced: `app.tenant_id` is set transaction-locally before any affiliation table
 * access, and a missing tenant context fails closed at the database.
 *
 * Reads are side-effect-free. This store deliberately exposes NO governed-lifecycle
 * mutation; it only reads persisted domain facts.
 */

import { withTenantTransaction, type QueryClient } from '../../db/pool.js';
import type {
  AffiliationApplicationFacts,
  AffiliationApplicationStore,
} from './AffiliationApplicationStore.js';

interface ApplicationRow extends Record<string, unknown> {
  id: string;
  tenant_id: string;
  season_id: string;
  required_fields_complete: boolean;
  documents_verified: boolean;
  payment_status: string;
  organization_id: string | null;
  organization_unit_id: string | null;
  national_organization_id: string | null;
  regional_organization_id: string | null;
  local_organization_id: string | null;
  scope_type: string | null;
  scope_id: string | null;
  application_type: string | null;
  applicant_user_id: string | null;
}

function toFacts(row: ApplicationRow): AffiliationApplicationFacts {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    seasonId: row.season_id,
    requiredFieldsComplete: row.required_fields_complete,
    documentsVerified: row.documents_verified,
    paymentStatus: row.payment_status,
    ...(row.organization_id !== null ? { organizationId: row.organization_id } : {}),
    ...(row.organization_unit_id !== null ? { organizationUnitId: row.organization_unit_id } : {}),
    ...(row.national_organization_id !== null
      ? { nationalOrganizationId: row.national_organization_id }
      : {}),
    ...(row.regional_organization_id !== null
      ? { regionalOrganizationId: row.regional_organization_id }
      : {}),
    ...(row.local_organization_id !== null
      ? { localOrganizationId: row.local_organization_id }
      : {}),
    ...(row.scope_type !== null ? { scopeType: row.scope_type } : {}),
    ...(row.scope_id !== null ? { scopeId: row.scope_id } : {}),
    ...(row.application_type !== null ? { applicationType: row.application_type } : {}),
    ...(row.applicant_user_id !== null ? { applicantUserId: row.applicant_user_id } : {}),
  };
}

export class PgAffiliationApplicationStore implements AffiliationApplicationStore {
  getApplicationFacts(
    tenantId: string,
    applicationId: string,
  ): Promise<AffiliationApplicationFacts | undefined> {
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      const rows = await client.query<ApplicationRow>(
        `SELECT id, tenant_id, season_id, required_fields_complete, documents_verified,
                payment_status, organization_id, organization_unit_id,
                national_organization_id, regional_organization_id, local_organization_id,
                scope_type, scope_id, application_type, applicant_user_id
           FROM affiliation.affiliation_application
          WHERE id = $1`,
        [applicationId],
      );
      const row = rows[0];
      return row === undefined ? undefined : toFacts(row);
    });
  }

  areRequiredFieldsComplete(tenantId: string, applicationId: string): Promise<boolean> {
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      const rows = await client.query<{ ok: boolean }>(
        `SELECT required_fields_complete AS ok
           FROM affiliation.affiliation_application
          WHERE id = $1`,
        [applicationId],
      );
      return rows[0]?.ok === true;
    });
  }

  areRequiredDocumentsPresent(tenantId: string, applicationId: string): Promise<boolean> {
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      const exists = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM affiliation.affiliation_application WHERE id = $1`,
        [applicationId],
      );
      if ((exists[0]?.n ?? 0) === 0) return false;
      const blocking = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM affiliation.application_document
          WHERE application_id = $1 AND required = true AND status <> 'approved'`,
        [applicationId],
      );
      return (blocking[0]?.n ?? 0) === 0;
    });
  }

  hasOpenComplianceFlags(tenantId: string, applicationId: string): Promise<boolean> {
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      const exists = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM affiliation.affiliation_application WHERE id = $1`,
        [applicationId],
      );
      // Fail closed: a missing application is treated as having open flags (blocks).
      if ((exists[0]?.n ?? 0) === 0) return true;
      const open = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM affiliation.compliance_flag
          WHERE application_id = $1 AND status = 'open'`,
        [applicationId],
      );
      return (open[0]?.n ?? 0) > 0;
    });
  }

  isPaymentSatisfied(tenantId: string, applicationId: string): Promise<boolean> {
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      const exists = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM affiliation.affiliation_application WHERE id = $1`,
        [applicationId],
      );
      if ((exists[0]?.n ?? 0) === 0) return false;
      const unsettled = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM affiliation.payment_obligation
          WHERE application_id = $1 AND status IN ('unpaid', 'failed')`,
        [applicationId],
      );
      return (unsettled[0]?.n ?? 0) === 0;
    });
  }

  isSeasonCurrent(tenantId: string, seasonId: string): Promise<boolean> {
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      const rows = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM affiliation.season
          WHERE season_id = $1 AND is_current = true`,
        [seasonId],
      );
      return (rows[0]?.n ?? 0) > 0;
    });
  }

  hasConflictingActiveAffiliation(tenantId: string, applicationId: string): Promise<boolean> {
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      // Resolve THIS application's subject + season, then count OTHER applications sharing
      // the same subject + season that currently hold ACTIVE governed standing. Active
      // standing is read from governance.entity_state (authoritative, kernel-owned). When
      // the subject is NULL (no scope/organization recorded) no duplicate can be asserted.
      const rows = await client.query<{ n: number }>(
        `WITH me AS (
           SELECT COALESCE(scope_id, local_organization_id, organization_id) AS subject,
                  season_id
             FROM affiliation.affiliation_application
            WHERE id = $1
         )
         SELECT count(*)::int AS n
           FROM me
           JOIN affiliation.affiliation_application a
             ON a.id <> $1
            AND a.season_id = me.season_id
            AND COALESCE(a.scope_id, a.local_organization_id, a.organization_id) = me.subject
           JOIN governance.entity_state es
             ON es.entity_id = a.id
            AND es.entity_type = 'AffiliationApplication'
            AND es.current_state = 'active'
          WHERE me.subject IS NOT NULL`,
        [applicationId],
      );
      return (rows[0]?.n ?? 0) > 0;
    });
  }

  getActiveStandingSubject(
    tenantId: string,
    applicationId: string,
  ): Promise<{ readonly subject: string; readonly seasonId: string } | undefined> {
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      // Subject definition MUST match hasConflictingActiveAffiliation() so the serialization
      // key and the uniqueness guard agree on the governed scope.
      const rows = await client.query<{ subject: string | null; season_id: string }>(
        `SELECT COALESCE(scope_id, local_organization_id, organization_id) AS subject,
                season_id
           FROM affiliation.affiliation_application
          WHERE id = $1`,
        [applicationId],
      );
      const row = rows[0];
      if (row === undefined || row.subject === null) return undefined;
      return { subject: row.subject, seasonId: row.season_id };
    });
  }
}
