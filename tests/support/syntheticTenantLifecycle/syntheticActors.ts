/**
 * Synthetic actors for the tenant-lifecycle confidence suite.
 *
 * Every actor is NSO-GENERIC: an opaque user id plus role keys drawn from the centralized
 * authorization role map (src/authz). No sport, club, or real person is referenced. The same
 * actor identity is projected into the two shapes the platform uses:
 *  - {@link AuthActor}: the authenticated identity the centralized `authorize` policy reasons
 *    about (role keys + permission keys), used by the HTTP read/quarantine surfaces.
 *  - {@link TransitionActor}: the governance actor the kernel enforces transition permission and
 *    scope against.
 *
 * Authorization is ALWAYS decided by the centralized policy / kernel from these role keys — the
 * tests never bypass authorization by calling privileged service methods with a forged identity.
 */

import type { AuthActor } from '../../../src/http/auth/AuthContext.js';
import type { TransitionActor } from '../../../src/governance/types/TransitionTypes.js';

/** A synthetic actor described once, projected into the platform's identity shapes on demand. */
export interface SyntheticActor {
  /** Opaque, NSO-generic user id. */
  readonly userId: string;
  /** Role keys understood by the centralized authorization role map. */
  readonly roleKeys: readonly string[];
  /** Optional explicit permission keys (none by default; roles carry the grants). */
  readonly permissionKeys?: readonly string[];
}

/** Applicant organization operator: submits applications; holds NO review/admin authority. */
export const applicantActor: SyntheticActor = {
  userId: 'applicant-user-1',
  roleKeys: ['applicant'],
};

/** Read-only workflow auditor: may list/read workflow admin surfaces, nothing more. */
export const workflowReaderActor: SyntheticActor = {
  userId: 'workflow-reader-1',
  roleKeys: ['workflow_reader'],
};

/** First-tier (regional) reviewer: may read workflows and record a regional decision. */
export const regionalReviewerActor: SyntheticActor = {
  userId: 'regional-reviewer-1',
  roleKeys: ['regional_reviewer'],
};

/** Second-tier (national) reviewer: may read workflows and record a national decision. */
export const nationalReviewerActor: SyntheticActor = {
  userId: 'national-reviewer-1',
  roleKeys: ['national_reviewer'],
};

/** Workflow administrator: may read, decide, and execute approved workflows. */
export const workflowAdminActor: SyntheticActor = {
  userId: 'workflow-admin-1',
  roleKeys: ['workflow_admin'],
};

/** Security reviewer: may read quarantine events and record a disposition. */
export const securityReviewerActor: SyntheticActor = {
  userId: 'security-reviewer-1',
  roleKeys: ['security_reviewer'],
};

/** An authenticated actor with NO granted roles — every governed action must fail closed. */
export const unauthorizedActor: SyntheticActor = {
  userId: 'unauthorized-user-1',
  roleKeys: [],
};

/** Project a synthetic actor into the authenticated {@link AuthActor} the authz policy reasons on. */
export function toAuthActor(actor: SyntheticActor): AuthActor {
  return {
    userId: actor.userId,
    roleKeys: [...actor.roleKeys],
    permissionKeys: [...(actor.permissionKeys ?? [])],
  };
}

/** Project a synthetic actor into the governance {@link TransitionActor} the kernel enforces. */
export function toTransitionActor(actor: SyntheticActor, tenantId: string): TransitionActor {
  return {
    actorId: actor.userId,
    tenantId,
    scopeType: 'national_organization',
    scopeId: 'org-1',
    roles: [...actor.roleKeys],
  };
}
