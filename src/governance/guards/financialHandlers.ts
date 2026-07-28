/**
 * AffiliationFinancialObligation v1 guard handlers.
 *
 * NAMED, READ-ONLY handlers (never dynamic JSON expressions) dependency-injected with a
 * {@link FinancialGuardRepository}. They enforce PERSISTED-FACT reconciliation preconditions only;
 * WHO may act is enforced separately by the FinancialObligationPermissionChecker.
 *
 * Fail-closed semantics:
 *  - FINANCIAL_ACCOUNTING_CONFIRMED passes only when an accounting confirmation is persisted.
 *  - FINANCIAL_AMOUNTS_MATCH passes only when a confirmation exists AND amounts are equal.
 *  - FINANCIAL_AMOUNTS_DIFFER passes only when a confirmation exists AND amounts differ.
 * When no confirmation exists, MATCH and DIFFER both FAIL (the repository returns undefined), so a
 * reconciliation cannot be driven to a definite outcome without a persisted confirmation.
 *
 * PRODUCTION wiring binds the domain's `DomainBackedFinancialGuardRepository`. The
 * `PayloadBackedFinancialGuardRepository` fake is TEST-ONLY.
 */

import type {
  GuardEvaluationInput,
  GuardEvaluationResult,
} from '../types/TransitionTypes.js';
import type { GuardRegistry } from './GuardRegistry.js';
import { FINANCIAL_GUARD_CODES } from './GuardRegistry.js';
import type { FinancialGuardRepository } from '../../domains/affiliation-finance/FinancialObligationGuardRepository.js';

function pass(code: string): GuardEvaluationResult {
  return { guardCode: code, passed: true };
}

function fail(code: string, message: string): GuardEvaluationResult {
  return { guardCode: code, passed: false, message };
}

export function createFinancialObligationGuardHandlers(
  repo: FinancialGuardRepository,
): Record<
  (typeof FINANCIAL_GUARD_CODES)[number],
  (input: GuardEvaluationInput) => Promise<GuardEvaluationResult>
> {
  return {
    FINANCIAL_ACCOUNTING_CONFIRMED: async (input) =>
      (await repo.hasAccountingConfirmation(input))
        ? pass('FINANCIAL_ACCOUNTING_CONFIRMED')
        : fail(
            'FINANCIAL_ACCOUNTING_CONFIRMED',
            'No accounting confirmation has been recorded for this obligation.',
          ),

    FINANCIAL_AMOUNTS_MATCH: async (input) => {
      const match = await repo.amountsMatch(input);
      return match === true
        ? pass('FINANCIAL_AMOUNTS_MATCH')
        : fail(
            'FINANCIAL_AMOUNTS_MATCH',
            'The confirmed amount does not match the assessed amount.',
          );
    },

    FINANCIAL_AMOUNTS_DIFFER: async (input) => {
      const match = await repo.amountsMatch(input);
      return match === false
        ? pass('FINANCIAL_AMOUNTS_DIFFER')
        : fail(
            'FINANCIAL_AMOUNTS_DIFFER',
            'The confirmed amount matches the assessed amount; no discrepancy to record.',
          );
    },
  };
}

/**
 * Register all AffiliationFinancialObligation guards on a registry. `repo` is REQUIRED and
 * explicit: production passes `DomainBackedFinancialGuardRepository`; tests may pass the fake.
 */
export function registerFinancialObligationGuards(
  registry: GuardRegistry,
  repo: FinancialGuardRepository,
): void {
  const handlers = createFinancialObligationGuardHandlers(repo);
  for (const code of FINANCIAL_GUARD_CODES) {
    registry.registerGuard(code, handlers[code]);
  }
}
