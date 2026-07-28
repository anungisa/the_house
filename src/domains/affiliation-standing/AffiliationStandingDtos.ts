/**
 * AffiliationStanding domain API boundary — caller-facing DTOs.
 *
 * These DTOs are the ONLY shapes a consumer should construct/consume. They are NSO-generic, are
 * decoupled from the kernel's internal {@link TransitionInput}/{@link TransitionResult}, and never
 * leak raw database rows. The boundary does NOT own lifecycle rules — every governed change is
 * executed by the Governance Kernel; this layer translates a typed request into a kernel call and
 * the kernel result back into a typed response.
 *
 * A single request envelope carries an optional, command-specific `details` object; each command
 * validates and consumes only the details it needs (fail closed on the rest).
 */

import type { ScopeType } from '../../governance/types/TransitionTypes.js';

/** The acting principal for a governed standing request. `roleKeys` drive the per-trigger
 *  standing authority in `StandingPermissionChecker`. */
export interface StandingActorDto {
  readonly userId: string;
  readonly roleKeys?: readonly string[];
  readonly scopeType?: ScopeType;
  readonly scopeId?: string;
  readonly organizationId?: string;
  readonly nationalOrganizationId?: string;
  readonly regionalOrganizationId?: string;
  readonly localOrganizationId?: string;
}

/** `openStanding` details — establish the standing head from an activated affiliation. */
export interface OpenStandingDetails {
  readonly affiliationApplicationId: string;
  readonly subjectId: string;
  readonly season: string;
  /** One of the governed pathways: continuity | renewal_with_remediation | new_affiliation. */
  readonly pathway: string;
  /** ISO-8601 UTC instant when the standing period begins. */
  readonly effectiveFrom: string;
  /** ISO-8601 UTC instant when the standing period ends (exclusive). */
  readonly effectiveUntil: string;
}

/** `renewStanding` / `renewActiveStanding` details — the next effective period (appends a version). */
export interface RenewStandingDetails {
  readonly pathway: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string;
  readonly renewalReason?: string;
}

/** The union of all command-specific detail shapes carried on a request. */
export type StandingDetails =
  | OpenStandingDetails
  | RenewStandingDetails
  | Readonly<Record<string, unknown>>;

/**
 * A request to perform ONE governed AffiliationStanding transition. The trigger is selected by the
 * named command; callers never pass a raw trigger string.
 */
export interface StandingTransitionRequest {
  readonly tenantId: string;
  /** The governed entity id = the standing id (a fresh UUID the caller mints for `open`). */
  readonly standingId: string;
  readonly actor: StandingActorDto;
  /** REQUIRED idempotency key; the service never fabricates one for governed actions. */
  readonly idempotencyKey: string;
  /** Operational reason; required for high-risk triggers (carried as audit metadata). */
  readonly reason?: string;
  /** Command-specific inputs (validated per command). */
  readonly details?: StandingDetails;
  readonly correlationId?: string;
  readonly causationId?: string;
}

/** Successful (or replayed) governed execution. */
export interface StandingExecutedResponse {
  readonly status: 'executed';
  readonly standingId: string;
  readonly fromState?: string;
  readonly toState?: string;
  readonly transitionId?: string;
  readonly auditEventId?: string;
  readonly evidenceObjectId?: string;
  readonly replayed?: boolean;
}

/** Transition accepted but withheld pending approval (no state mutation occurred). */
export interface StandingApprovalRequiredResponse {
  readonly status: 'approval_required';
  readonly standingId: string;
  readonly transitionRequestId?: string;
  readonly currentState?: string;
  readonly requestedToState?: string;
  readonly replayed?: boolean;
}

/** Transition denied (permission failure, guard failure, etc.). No state mutation occurred. */
export interface StandingRejectedResponse {
  readonly status: 'rejected';
  readonly standingId: string;
  readonly code: string;
  readonly message: string;
  readonly failedGuards?: readonly string[];
}

export type StandingTransitionResponse =
  | StandingExecutedResponse
  | StandingApprovalRequiredResponse
  | StandingRejectedResponse;
