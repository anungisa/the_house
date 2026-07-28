/**
 * AffiliationFinancialObligation permission checker.
 *
 * Financial authority is SEGREGATED by function: the actor must hold the SPECIFIC role for the
 * requested trigger. `admin` is deliberately NOT blanket authority here — separation of duties is
 * the whole point of a financial-reconciliation control. Authority is enforced independently of the
 * persisted-fact guards (which decide WHETHER a transition is allowed, not WHO may perform it).
 *
 * This checker wraps a delegate ({@link DefaultPermissionChecker} in production wiring) so a SINGLE
 * shared kernel can serve both AffiliationApplication and AffiliationFinancialObligation: for any
 * other entity type it defers to the delegate unchanged. Fails CLOSED: an unknown financial trigger
 * or a missing role denies.
 */

import { ErrorCode } from '../../shared/errors/AppError.js';
import type { PermissionChecker, PermissionDecision } from '../kernel/ports.js';
import type { TransitionActor } from '../types/TransitionTypes.js';
import { AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE } from '../../domains/affiliation-finance/index.js';

/** Trigger → the single role authorized to perform it. Segregated duties, no blanket admin. */
const FINANCIAL_TRIGGER_ROLES: Readonly<Record<string, string>> = {
  assess: 'financial_assessor',
  revise_assessment: 'financial_assessment_reviser',
  acknowledge: 'financial_provider',
  confirm: 'financial_accounting',
  reconcile: 'financial_reconciler',
  record_mismatch: 'financial_reconciler',
  resolve_mismatch: 'financial_reconciler',
  close: 'financial_reconciler',
  waive: 'financial_waiver_authority',
  exempt: 'financial_exemption_authority',
};

function actorHasRole(actor: TransitionActor, role: string): boolean {
  return (actor.roles ?? []).includes(role);
}

export class FinancialObligationPermissionChecker implements PermissionChecker {
  constructor(private readonly delegate: PermissionChecker) {}

  check(input: {
    readonly actor: TransitionActor;
    readonly entityType: string;
    readonly trigger: string;
    readonly riskLevel: 'low' | 'high';
    readonly approvalRequired: boolean;
  }): PermissionDecision {
    if (input.entityType !== AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE) {
      return this.delegate.check(input);
    }

    const requiredRole = FINANCIAL_TRIGGER_ROLES[input.trigger];
    if (requiredRole === undefined) {
      // Fail closed: an unrecognized financial trigger has no authorized role.
      return {
        allowed: false,
        reasonCode: ErrorCode.PERMISSION_DENIED,
        reasonMessage: `No financial authority is defined for '${input.trigger}'.`,
      };
    }
    if (actorHasRole(input.actor, requiredRole)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reasonCode: ErrorCode.PERMISSION_DENIED,
      reasonMessage: `Actor lacks '${requiredRole}' authority for '${input.trigger}'.`,
    };
  }
}
