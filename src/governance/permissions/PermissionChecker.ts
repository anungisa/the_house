/**
 * Permission checking for governed transitions.
 *
 * Fails CLOSED: the kernel denies a transition when `check()` returns `allowed: false`.
 * This is a deliberately small, NSO-generic v1 policy — NOT a duplicate permission system.
 * Real platform RBAC integrates by implementing {@link PermissionChecker}.
 *
 * v1 policy (DefaultPermissionChecker):
 *  - low-risk transitions: allowed for any authenticated actor.
 *  - high-risk OR approval-required transitions: actor must hold a reviewer-class role
 *    ('reviewer', 'approver', or 'admin').
 */

import { ErrorCode } from '../../shared/errors/AppError.js';
import type { PermissionChecker, PermissionDecision } from '../kernel/ports.js';
import type { TransitionActor } from '../types/TransitionTypes.js';

const REVIEWER_ROLES: ReadonlySet<string> = new Set(['reviewer', 'approver', 'admin']);

function actorHasReviewerRole(actor: TransitionActor): boolean {
  const roles = actor.roles ?? [];
  return roles.some((r) => REVIEWER_ROLES.has(r));
}

export class DefaultPermissionChecker implements PermissionChecker {
  check(input: {
    readonly actor: TransitionActor;
    readonly entityType: string;
    readonly trigger: string;
    readonly riskLevel: 'low' | 'high';
    readonly approvalRequired: boolean;
  }): PermissionDecision {
    const elevated = input.riskLevel === 'high' || input.approvalRequired;
    if (!elevated) {
      return { allowed: true };
    }
    if (actorHasReviewerRole(input.actor)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reasonCode: ErrorCode.PERMISSION_DENIED,
      reasonMessage: `Actor lacks reviewer scope for '${input.trigger}' on ${input.entityType}.`,
    };
  }
}
