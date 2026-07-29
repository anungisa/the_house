import { withTenantTransaction } from '../../db/pool.js';
import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type {
  FinancialObligationQueueItem,
  FinancialReviewerActor,
} from './FinancialObligationReviewTypes.js';

const FINANCIAL_ROLES = new Set([
  'financial_assessor',
  'financial_assessment_reviser',
  'financial_provider',
  'financial_accounting',
  'financial_reconciler',
  'financial_waiver_authority',
  'admin',
  'platform_admin',
]);
const GLOBAL_ROLES = new Set(['admin', 'platform_admin']);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function assertFinancialReviewer(actor: FinancialReviewerActor): void {
  if (!actor.roleKeys.some((role) => FINANCIAL_ROLES.has(role))) {
    throw new AppError(ErrorCode.FORBIDDEN, 'Financial workbench authority is required.');
  }
}

function scopeIds(actor: FinancialReviewerActor): readonly string[] {
  return [
    actor.scopeId,
    actor.organizationId,
    actor.organizationUnitId,
    actor.nationalOrganizationId,
    actor.regionalOrganizationId,
    actor.localOrganizationId,
  ].filter((value): value is string => typeof value === 'string' && UUID.test(value));
}

export class FinancialObligationReviewService {
  async listQueue(
    tenantId: string,
    actor: FinancialReviewerActor,
  ): Promise<readonly FinancialObligationQueueItem[]> {
    assertFinancialReviewer(actor);
    const delegatedScopeIds = scopeIds(actor);
    const global = actor.roleKeys.some((role) => GLOBAL_ROLES.has(role));
    const canReconcile =
      global || actor.roleKeys.some((role) => role === 'financial_reconciler');
    if (!global && delegatedScopeIds.length === 0) {
      throw new AppError(ErrorCode.FORBIDDEN, 'A delegated financial scope is required.');
    }

    return withTenantTransaction(tenantId, async (client) => {
      const rows = await client.query<{
        id: string;
        affiliation_application_id: string;
        season: string;
        obligation_type: string;
        assessment_basis: string;
        assessment_version: number;
        assessed_amount: string;
        currency: string;
        blocking: boolean;
        current_state: string;
        confirmed_amount: string | null;
        confirmed_currency: string | null;
      }>(
        `SELECT fo.id, fo.affiliation_application_id, fo.season, fo.obligation_type,
                fo.assessment_basis, fo.assessment_version, fo.assessed_amount, fo.currency,
                fo.blocking, es.current_state,
                confirmation.amount AS confirmed_amount,
                confirmation.currency AS confirmed_currency
           FROM affiliation_finance.financial_obligation fo
           JOIN affiliation.affiliation_application a
             ON a.tenant_id = fo.tenant_id AND a.id = fo.affiliation_application_id
           JOIN governance.entity_state es
             ON es.tenant_id = fo.tenant_id
            AND es.entity_type = 'AffiliationFinancialObligation'
            AND es.entity_id = fo.id
      LEFT JOIN LATERAL (
             SELECT amount, currency
               FROM affiliation_finance.obligation_external_event
              WHERE obligation_id = fo.id
                AND event_kind = 'accounting_confirmation'
                AND amount IS NOT NULL
              ORDER BY recorded_at DESC, id DESC
              LIMIT 1
           ) confirmation ON true
          WHERE (
            $1::boolean
            OR a.organization_id = ANY($2::uuid[])
            OR a.organization_unit_id = ANY($2::uuid[])
            OR a.national_organization_id = ANY($2::uuid[])
            OR a.regional_organization_id = ANY($2::uuid[])
            OR a.local_organization_id = ANY($2::uuid[])
            OR a.scope_id = ANY($2::uuid[])
          )
          ORDER BY fo.created_at ASC, fo.id ASC`,
        [global, delegatedScopeIds],
      );

      return rows.map((row) => ({
        obligationId: row.id,
        affiliationApplicationId: row.affiliation_application_id,
        season: row.season,
        obligationType: row.obligation_type,
        assessmentBasis: row.assessment_basis,
        assessmentVersion: row.assessment_version,
        assessedAmount: row.assessed_amount,
        currency: row.currency,
        blocking: row.blocking,
        lifecycleState: row.current_state,
        hasAccountingConfirmation: row.confirmed_amount !== null,
        canReconcile,
        ...(row.confirmed_amount !== null ? { confirmedAmount: row.confirmed_amount } : {}),
        ...(row.confirmed_currency !== null ? { confirmedCurrency: row.confirmed_currency } : {}),
      }));
    });
  }
}
