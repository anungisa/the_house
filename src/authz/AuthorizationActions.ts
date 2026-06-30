/**
 * Centralized authorization ACTION catalog and role→action mappings.
 *
 * An "action" is a NAMED operation an authenticated actor may attempt at an HTTP/admin/security
 * surface (e.g. read pending workflows, record a workflow decision, dispose a quarantined
 * object). Actions are NSO-generic: no sport-specific verbs or entities.
 *
 * This module is the SINGLE SOURCE OF TRUTH for "which roles imply which operations" at the
 * edge. It is DISTINCT from:
 *  - Authentication (resolvers in src/http/auth/*), which establishes tenant + actor.
 *  - Governance lifecycle permission/guard enforcement (the Governance Kernel), which decides
 *    whether a governed STATE TRANSITION may occur. This authorization layer NEVER mutates
 *    governed state and NEVER replaces kernel checks.
 *
 * Authorization precedence (see AuthorizationPolicy): an actor is allowed when its
 * `permissionKeys` contain the exact action (authoritative), OR it holds the platform-admin
 * role, OR one of its `roleKeys` maps to the action here. Otherwise it is denied (fail closed).
 */

/** The catalog of named, NSO-generic operations the policy can authorize. */
export const AuthorizationAction = {
  WorkflowRead: 'workflow.read',
  WorkflowDecide: 'workflow.decide',
  WorkflowExecute: 'workflow.execute',
  EvidenceRead: 'evidence.read',
  EvidenceUpload: 'evidence.upload',
  EvidenceDownload: 'evidence.download',
  EvidenceQuarantineRead: 'evidence.quarantine.read',
  EvidenceQuarantineDisposition: 'evidence.quarantine.disposition',
} as const;

/** Union of the valid action string literals. */
export type AuthorizationAction = (typeof AuthorizationAction)[keyof typeof AuthorizationAction];

/** All known action strings (used to fail closed on unknown actions). */
export const KNOWN_ACTIONS: ReadonlySet<string> = new Set<string>(
  Object.values(AuthorizationAction),
);

/**
 * The platform-wide super-role. Holding this role grants EVERY known action. This is the only
 * wildcard in v1 and is deliberately explicit + tested. (Real platform RBAC may later replace
 * this static map with a DB-backed role catalog — see the out-of-scope notes in the doc.)
 */
export const PLATFORM_ADMIN_ROLE = 'platform_admin';

/**
 * Static role→action mappings. Keys are NSO-generic role keys; values are the actions each role
 * implies. A role absent from this map (and not {@link PLATFORM_ADMIN_ROLE}) implies nothing.
 *
 * Mapping rationale:
 *  - workflow_reader: read-only operator surface.
 *  - regional_reviewer / national_reviewer: two-tier reviewers that read + record decisions.
 *  - reviewer / approver: generic reviewer-class roles (kernel-aligned) that may also drive the
 *    approved-transition execution they are authorized for.
 *  - workflow_admin: full workflow operator (read + decide + execute).
 *  - security_reviewer / security_admin: evidence quarantine review + disposition.
 *  - evidence_admin: evidence object read/upload/download.
 */
export const ROLE_ACTION_MAP: Readonly<Record<string, readonly AuthorizationAction[]>> = {
  workflow_reader: [AuthorizationAction.WorkflowRead],
  regional_reviewer: [AuthorizationAction.WorkflowRead, AuthorizationAction.WorkflowDecide],
  national_reviewer: [AuthorizationAction.WorkflowRead, AuthorizationAction.WorkflowDecide],
  reviewer: [
    AuthorizationAction.WorkflowRead,
    AuthorizationAction.WorkflowDecide,
    AuthorizationAction.WorkflowExecute,
  ],
  approver: [
    AuthorizationAction.WorkflowRead,
    AuthorizationAction.WorkflowDecide,
    AuthorizationAction.WorkflowExecute,
  ],
  workflow_admin: [
    AuthorizationAction.WorkflowRead,
    AuthorizationAction.WorkflowDecide,
    AuthorizationAction.WorkflowExecute,
  ],
  security_reviewer: [
    AuthorizationAction.EvidenceQuarantineRead,
    AuthorizationAction.EvidenceQuarantineDisposition,
  ],
  security_admin: [
    AuthorizationAction.EvidenceQuarantineRead,
    AuthorizationAction.EvidenceQuarantineDisposition,
  ],
  evidence_admin: [
    AuthorizationAction.EvidenceRead,
    AuthorizationAction.EvidenceUpload,
    AuthorizationAction.EvidenceDownload,
  ],
};

/** Type guard: is `value` a known action string? */
export function isKnownAction(value: string): value is AuthorizationAction {
  return KNOWN_ACTIONS.has(value);
}
