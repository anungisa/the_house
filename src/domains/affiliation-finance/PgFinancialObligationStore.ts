/**
 * PostgreSQL {@link FinancialObligationStore} (integration, READ-only).
 *
 * Each read runs inside a tenant-scoped transaction (`withTenantTransaction`) so RLS is enforced:
 * `app.tenant_id` is set transaction-locally before any affiliation_finance table access, and a
 * missing tenant context fails closed at the database. Reads are side-effect-free. This store
 * deliberately exposes NO governed-lifecycle mutation and NO fact mutation — financial facts are
 * written exclusively by the kernel's domain effect inside a governed transaction.
 */

import { withTenantTransaction, type QueryClient } from '../../db/pool.js';
import type {
  FinancialObligationHead,
  FinancialObligationStore,
  FinancialReconciliationView,
} from './FinancialObligationStore.js';

interface ObligationRow extends Record<string, unknown> {
  id: string;
  tenant_id: string;
  affiliation_application_id: string;
  subject_id: string;
  season: string;
  obligation_type: string;
  assessment_basis: string;
  assessment_version: number;
  assessed_amount: string;
  currency: string;
  blocking: boolean;
  assessed_by: string;
}

function toHead(row: ObligationRow): FinancialObligationHead {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    affiliationApplicationId: row.affiliation_application_id,
    subjectId: row.subject_id,
    season: row.season,
    obligationType: row.obligation_type,
    assessmentBasis: row.assessment_basis,
    assessmentVersion: row.assessment_version,
    assessedAmount: row.assessed_amount,
    currency: row.currency,
    blocking: row.blocking,
    assessedBy: row.assessed_by,
  };
}

export class PgFinancialObligationStore implements FinancialObligationStore {
  getObligation(
    tenantId: string,
    obligationId: string,
  ): Promise<FinancialObligationHead | undefined> {
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      const rows = await client.query<ObligationRow>(
        `SELECT id, tenant_id, affiliation_application_id, subject_id, season, obligation_type,
                assessment_basis, assessment_version, assessed_amount, currency, blocking, assessed_by
           FROM affiliation_finance.financial_obligation
          WHERE id = $1`,
        [obligationId],
      );
      const row = rows[0];
      return row === undefined ? undefined : toHead(row);
    });
  }

  getReconciliationView(
    tenantId: string,
    obligationId: string,
  ): Promise<FinancialReconciliationView | undefined> {
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      const head = await client.query<{ assessed_amount: string; currency: string }>(
        `SELECT assessed_amount, currency
           FROM affiliation_finance.financial_obligation
          WHERE id = $1`,
        [obligationId],
      );
      const row = head[0];
      if (row === undefined) return undefined;
      const confirmation = await client.query<{ amount: string; currency: string }>(
        `SELECT amount, currency
           FROM affiliation_finance.obligation_external_event
          WHERE obligation_id = $1 AND event_kind = 'accounting_confirmation' AND amount IS NOT NULL
          ORDER BY recorded_at DESC, id DESC
          LIMIT 1`,
        [obligationId],
      );
      const conf = confirmation[0];
      return {
        obligationId,
        expectedAmount: row.assessed_amount,
        expectedCurrency: row.currency,
        hasAccountingConfirmation: conf !== undefined,
        ...(conf?.amount !== undefined ? { confirmedAmount: conf.amount } : {}),
        ...(conf?.currency != null ? { confirmedCurrency: conf.currency } : {}),
      };
    });
  }

  hasAccountingConfirmation(tenantId: string, obligationId: string): Promise<boolean> {
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      const rows = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM affiliation_finance.obligation_external_event
          WHERE obligation_id = $1 AND event_kind = 'accounting_confirmation'`,
        [obligationId],
      );
      return (rows[0]?.n ?? 0) > 0;
    });
  }
}
