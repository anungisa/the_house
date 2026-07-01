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
  OrganizationRead: 'organization.read',
  ParticipantRead: 'participant.read',
  ParticipantWrite: 'participant.write',
  ParticipantStatusWrite: 'participant.status.write',
  ParticipantOrganizationLinkWrite: 'participant.organization_link.write',
  FacilityRead: 'facility.read',
  FacilityWrite: 'facility.write',
  FacilityStatusWrite: 'facility.status.write',
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
 *  - organization_reader: read-only Organization Registry operator surface.
 *  - organization_admin: Organization Registry operator (read-only at the HTTP edge in v1).
 *  - participant_reader: read-only Participant Registry operator surface.
 *  - participant_admin: Participant Registry operator. Reads, plus profile write (create a
 *    participant + update its safe profile fields) via `participant.write`, plus a participant
 *    STATUS transition (`participant.status.write`) — a reference-data status change, NOT a
 *    governed lifecycle transition — plus recording an organization↔participant relationship
 *    (`participant.organization_link.write`). These reference-data write actions are all distinct
 *    (none implies another); none is a governed lifecycle transition.
 *  - facility_reader: read-only Facility Registry operator surface.
 *  - facility_admin: Facility Registry operator. Reads, plus a reference-data profile write (create
 *    a facility + update its safe descriptive fields) via `facility.write`, plus a facility STATUS
 *    transition (`facility.status.write`) — a reference-data status change, NOT a governed lifecycle
 *    transition. These reference-data write actions are distinct: `facility.write` never implies a
 *    status change, and `facility.status.write` never implies a profile write. Neither is a governed
 *    lifecycle transition.
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
  organization_reader: [AuthorizationAction.OrganizationRead],
  organization_admin: [AuthorizationAction.OrganizationRead],
  participant_reader: [AuthorizationAction.ParticipantRead],
  participant_admin: [
    AuthorizationAction.ParticipantRead,
    AuthorizationAction.ParticipantWrite,
    AuthorizationAction.ParticipantStatusWrite,
    AuthorizationAction.ParticipantOrganizationLinkWrite,
  ],
  facility_reader: [AuthorizationAction.FacilityRead],
  facility_admin: [
    AuthorizationAction.FacilityRead,
    AuthorizationAction.FacilityWrite,
    AuthorizationAction.FacilityStatusWrite,
  ],
};

/** Type guard: is `value` a known action string? */
export function isKnownAction(value: string): value is AuthorizationAction {
  return KNOWN_ACTIONS.has(value);
}
