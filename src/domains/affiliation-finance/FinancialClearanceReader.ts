/**
 * Financial clearance reader — the affiliation-side derived-fact source for the
 * AFFILIATION_FINANCIALLY_CLEARED guard.
 *
 * The affiliation `activate`/`reinstate` guard must reject an application that still has an
 * UNCLEARED blocking financial obligation. "Cleared" is DERIVED from the governed obligation
 * state (reconciled / waived / exempt) — it is never set directly and never equals activation
 * authorization. This reader answers the single question the guard needs and performs NO
 * mutation.
 *
 * Read from `governance.entity_state` (kernel-owned, authoritative) joined to the obligation head,
 * so a blocking obligation that has NOT reached a cleared terminal state blocks activation. An
 * application with NO blocking obligations is vacuously cleared.
 */

import { withTenantTransaction, type QueryClient } from '../../db/pool.js';
import { FINANCIAL_CLEARED_STATES } from './index.js';

/** Read-only port consulted by the affiliation guard repository. Fails CLOSED. */
export interface FinancialClearanceReader {
  /**
   * True when the affiliation application has AT LEAST ONE blocking financial obligation whose
   * governed current state is NOT a cleared terminal state (reconciled / waived / exempt), OR a
   * blocking obligation with no governed state yet. False when every blocking obligation is
   * cleared, or when there are no blocking obligations at all.
   */
  hasUnclearedBlockingObligation(
    tenantId: string,
    affiliationApplicationId: string,
  ): Promise<boolean>;
}

export class PgFinancialClearanceReader implements FinancialClearanceReader {
  hasUnclearedBlockingObligation(
    tenantId: string,
    affiliationApplicationId: string,
  ): Promise<boolean> {
    const cleared = [...FINANCIAL_CLEARED_STATES];
    return withTenantTransaction(tenantId, async (client: QueryClient) => {
      const rows = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM affiliation_finance.financial_obligation fo
           LEFT JOIN governance.entity_state es
             ON es.entity_id = fo.id
            AND es.entity_type = 'AffiliationFinancialObligation'
          WHERE fo.affiliation_application_id = $1
            AND fo.blocking = true
            AND (es.current_state IS NULL OR es.current_state <> ALL($2::text[]))`,
        [affiliationApplicationId, cleared],
      );
      return (rows[0]?.n ?? 0) > 0;
    });
  }
}
