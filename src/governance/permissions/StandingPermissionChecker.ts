/**
 * AffiliationStanding permission checker.
 *
 * Standing authority is SEGREGATED by function: the actor must hold the SPECIFIC role for the
 * requested trigger. `admin` is deliberately NOT blanket authority here — separation of duties
 * across establishment, lifecycle, renewal, compliance, and termination is the control. Authority
 * is enforced independently of the persisted-fact/clock guards (which decide WHETHER a transition
 * is allowed, not WHO may perform it).
 *
 * This checker wraps a delegate so a SINGLE shared kernel can serve AffiliationApplication,
 * AffiliationFinancialObligation, and AffiliationStanding: for any other entity type it defers to
 * the delegate unchanged. Fails CLOSED: an unknown standing trigger or a missing role denies.
 */

import { ErrorCode } from '../../shared/errors/AppError.js';
import type { PermissionChecker, PermissionDecision } from '../kernel/ports.js';
import type { TransitionActor } from '../types/TransitionTypes.js';
import { AFFILIATION_STANDING_ENTITY_TYPE } from '../../domains/affiliation-standing/index.js';

/** Trigger → the single role authorized to perform it. Segregated duties, no blanket admin. */
const STANDING_TRIGGER_ROLES: Readonly<Record<string, string>> = {
  open: 'standing_registrar',
  activate: 'standing_registrar',
  expire: 'standing_lifecycle_officer',
  renew: 'standing_renewal_authority',
  renew_active: 'standing_renewal_authority',
  suspend: 'standing_compliance_officer',
  reinstate: 'standing_compliance_officer',
  terminate: 'standing_termination_authority',
};

function actorHasRole(actor: TransitionActor, role: string): boolean {
  return (actor.roles ?? []).includes(role);
}

export class StandingPermissionChecker implements PermissionChecker {
  constructor(private readonly delegate: PermissionChecker) {}

  check(input: {
    readonly actor: TransitionActor;
    readonly entityType: string;
    readonly trigger: string;
    readonly riskLevel: 'low' | 'high';
    readonly approvalRequired: boolean;
  }): PermissionDecision {
    if (input.entityType !== AFFILIATION_STANDING_ENTITY_TYPE) {
      return this.delegate.check(input);
    }

    const requiredRole = STANDING_TRIGGER_ROLES[input.trigger];
    if (requiredRole === undefined) {
      // Fail closed: an unrecognized standing trigger has no authorized role.
      return {
        allowed: false,
        reasonCode: ErrorCode.PERMISSION_DENIED,
        reasonMessage: `No standing authority is defined for '${input.trigger}'.`,
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
