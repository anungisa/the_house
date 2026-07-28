/**
 * AffiliationFinancialObligation guard repository.
 *
 * The financial guards enforce PERSISTED-FACT preconditions only (never caller payload). Authority
 * (who may act) is enforced separately by the FinancialObligationPermissionChecker. Two guards
 * gate reconciliation, both derived from stored facts:
 *  - FINANCIAL_ACCOUNTING_CONFIRMED : an accounting confirmation exists for the obligation.
 *  - FINANCIAL_AMOUNTS_MATCH/DIFFER : the assessed amount equals / differs from the confirmed amount.
 *
 * The production {@link DomainBackedFinancialGuardRepository} reads a {@link FinancialObligationStore};
 * the {@link PayloadBackedFinancialGuardRepository} is a TEST-ONLY fake reading `payload.facts`.
 */

import type { GuardEvaluationInput } from '../../governance/types/TransitionTypes.js';
import { amountsEqual } from './Money.js';
import type { FinancialObligationStore } from './FinancialObligationStore.js';

/**
 * Read-only data port used by the financial guard handlers. Implementations MUST be
 * side-effect-free and tenant-scoped, and MUST fail CLOSED when facts are missing.
 */
export interface FinancialGuardRepository {
  /** True when at least one accounting confirmation has been recorded for the obligation. */
  hasAccountingConfirmation(input: GuardEvaluationInput): Promise<boolean> | boolean;
  /**
   * Whether the assessed (expected) amount equals the latest confirmed amount. Returns
   * `undefined` when no accounting confirmation exists (so MATCH and DIFFER both fail closed).
   */
  amountsMatch(input: GuardEvaluationInput): Promise<boolean | undefined> | boolean | undefined;
}

export class DomainBackedFinancialGuardRepository implements FinancialGuardRepository {
  constructor(private readonly store: FinancialObligationStore) {}

  hasAccountingConfirmation(input: GuardEvaluationInput): Promise<boolean> {
    return this.store.hasAccountingConfirmation(input.context.tenantId, input.entityId);
  }

  async amountsMatch(input: GuardEvaluationInput): Promise<boolean | undefined> {
    const view = await this.store.getReconciliationView(input.context.tenantId, input.entityId);
    if (view === undefined || view.confirmedAmount === undefined) return undefined;
    return amountsEqual(view.expectedAmount, view.confirmedAmount);
  }
}

interface FinancialFacts {
  readonly accountingConfirmed?: boolean;
  readonly amountsMatch?: boolean;
}

function readFacts(input: GuardEvaluationInput): FinancialFacts {
  const payload = input.payload ?? {};
  const facts = (payload as { facts?: unknown }).facts;
  return (facts ?? {}) as FinancialFacts;
}

/**
 * TEST-ONLY fake backed by `payload.facts`. Do NOT use in production wiring — it treats
 * caller-supplied facts as authoritative. Missing facts default to the fail-closed interpretation.
 */
export class PayloadBackedFinancialGuardRepository implements FinancialGuardRepository {
  hasAccountingConfirmation(input: GuardEvaluationInput): boolean {
    return readFacts(input).accountingConfirmed === true;
  }
  amountsMatch(input: GuardEvaluationInput): boolean | undefined {
    const facts = readFacts(input);
    if (facts.accountingConfirmed !== true) return undefined;
    return facts.amountsMatch === true;
  }
}
