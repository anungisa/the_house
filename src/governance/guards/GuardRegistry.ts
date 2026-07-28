import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type {
  GuardEvaluationInput,
  GuardEvaluationResult,
  GuardHandler,
} from '../types/TransitionTypes.js';

/**
 * Registry of named TypeScript guard handlers.
 *
 * Architectural rules (do not violate):
 *  - Guards are NAMED handlers, never dynamic JSON expressions.
 *  - Unknown guard codes FAIL CLOSED (lookup throws UNKNOWN_GUARD).
 *  - Handlers are read-only and testable; parameters arrive from
 *    governance.transition_guard.parameters (passed via GuardEvaluationInput).
 *
 * Scaffold scope: registration/lookup/fail-closed behavior only. Real guard logic for
 * the AffiliationApplication guards is implemented in the Governance Kernel pass.
 */
export class GuardRegistry {
  private readonly handlers = new Map<string, GuardHandler>();

  /**
   * Register a guard handler under its code. Throws if the code is already registered
   * (registration must be explicit and unambiguous).
   */
  registerGuard(code: string, handler: GuardHandler): void {
    if (this.handlers.has(code)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `Guard already registered: ${code}`,
        { details: { guardCode: code } },
      );
    }
    this.handlers.set(code, handler);
  }

  /** True if a guard code is registered. */
  hasGuard(code: string): boolean {
    return this.handlers.has(code);
  }

  /**
   * Resolve a guard handler by code. FAILS CLOSED: an unknown guard code throws
   * UNKNOWN_GUARD so the kernel can deny the transition.
   */
  getGuardHandler(code: string): GuardHandler {
    const handler = this.handlers.get(code);
    if (handler === undefined) {
      throw new AppError(ErrorCode.UNKNOWN_GUARD, `Unknown guard code: ${code}`, {
        details: { guardCode: code },
      });
    }
    return handler;
  }

  /** Convenience: evaluate a single guard by code (fails closed on unknown). */
  async evaluate(input: GuardEvaluationInput): Promise<GuardEvaluationResult> {
    const handler = this.getGuardHandler(input.guardCode);
    return handler(input);
  }
}

/**
 * Required AffiliationApplication v1 guard codes.
 *
 * These are placeholders for the implementation pass — the handlers are NOT registered or
 * implemented here. Listing them keeps the catalog visible and ensures the DB
 * guard_definition seed and the registered handlers stay in sync later.
 *
 * TODO(impl): implement and register read-only handlers for each:
 *  - AFFILIATION_REQUIRED_FIELDS_COMPLETE  : required application fields are present
 *  - AFFILIATION_REQUIRED_DOCS_PRESENT     : required supporting documents are attached
 *  - AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS  : no unresolved compliance obligations
 *  - AFFILIATION_FEES_PAID                 : applicable payment obligations are settled
 *  - SEASON_IS_CURRENT                     : the application targets the current season
 *  - ACTOR_HAS_REVIEWER_SCOPE              : actor holds reviewer scope for this entity
 *  - AFFILIATION_UNIQUE_ACTIVE_FOR_SCOPE   : no other application already holds active
 *                                            standing for the same scope and season
 *  - AFFILIATION_FINANCIALLY_CLEARED       : every blocking financial obligation for the
 *                                            application is in a cleared terminal state
 */
export const AFFILIATION_GUARD_CODES = [
  'AFFILIATION_REQUIRED_FIELDS_COMPLETE',
  'AFFILIATION_REQUIRED_DOCS_PRESENT',
  'AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS',
  'AFFILIATION_FEES_PAID',
  'SEASON_IS_CURRENT',
  'ACTOR_HAS_REVIEWER_SCOPE',
  'AFFILIATION_UNIQUE_ACTIVE_FOR_SCOPE',
  'AFFILIATION_FINANCIALLY_CLEARED',
] as const;

export type AffiliationGuardCode = (typeof AFFILIATION_GUARD_CODES)[number];

/**
 * Required AffiliationFinancialObligation v1 guard codes (persisted-fact preconditions only;
 * authority is enforced by the FinancialObligationPermissionChecker, not by guards):
 *  - FINANCIAL_ACCOUNTING_CONFIRMED : an accounting confirmation exists for the obligation
 *  - FINANCIAL_AMOUNTS_MATCH        : the confirmed amount equals the assessed amount
 *  - FINANCIAL_AMOUNTS_DIFFER       : the confirmed amount differs from the assessed amount
 */
export const FINANCIAL_GUARD_CODES = [
  'FINANCIAL_ACCOUNTING_CONFIRMED',
  'FINANCIAL_AMOUNTS_MATCH',
  'FINANCIAL_AMOUNTS_DIFFER',
] as const;

export type FinancialGuardCode = (typeof FINANCIAL_GUARD_CODES)[number];
