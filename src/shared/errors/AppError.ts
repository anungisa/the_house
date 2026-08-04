/**
 * Stable governance/platform error codes.
 *
 * These codes are part of the platform contract: they are stable, NSO-generic, and safe
 * to surface to callers and logs. Add new codes deliberately.
 */
export const ErrorCode = {
  UNKNOWN_TRANSITION: 'UNKNOWN_TRANSITION',
  UNKNOWN_GUARD: 'UNKNOWN_GUARD',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  GUARD_FAILED: 'GUARD_FAILED',
  TENANT_CONTEXT_MISSING: 'TENANT_CONTEXT_MISSING',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  INVALID_INPUT: 'INVALID_INPUT',
  CONFIG_ERROR: 'CONFIG_ERROR',
  /** Edge identity could not be established (missing/invalid verified identity). Maps to 401. */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** Identity established but the request is not permitted at the edge boundary. Maps to 403. */
  FORBIDDEN: 'FORBIDDEN',
  /** A requested evidence object payload does not exist in storage. */
  EVIDENCE_NOT_FOUND: 'EVIDENCE_NOT_FOUND',
  /** A stored evidence payload's digest does not match the expected SHA-256. */
  EVIDENCE_HASH_MISMATCH: 'EVIDENCE_HASH_MISMATCH',
  /** An evidence storage backend operation failed (controlled, sanitized). */
  EVIDENCE_STORAGE_ERROR: 'EVIDENCE_STORAGE_ERROR',
  /** An evidence upload was rejected because malware was positively detected in the payload. */
  EVIDENCE_MALWARE_DETECTED: 'EVIDENCE_MALWARE_DETECTED',
  /** Malware scanning is required but the scanner could not complete (transient/internal). */
  EVIDENCE_MALWARE_SCAN_FAILED: 'EVIDENCE_MALWARE_SCAN_FAILED',
  /** Malware scanning is required but no scan was performed (scanner skipped / unavailable). */
  EVIDENCE_MALWARE_SCAN_REQUIRED: 'EVIDENCE_MALWARE_SCAN_REQUIRED',
  /** A referenced evidence quarantine event does not exist for the tenant. */
  EVIDENCE_QUARANTINE_NOT_FOUND: 'EVIDENCE_QUARANTINE_NOT_FOUND',
  /** A quarantine disposition value is not one of the allowed dispositions. */
  EVIDENCE_QUARANTINE_INVALID_DISPOSITION: 'EVIDENCE_QUARANTINE_INVALID_DISPOSITION',
  /**
   * The requested quarantine disposition is not a legal transition from the event's current
   * status (e.g. a terminal released/discarded event, or an illegal status change).
   */
  EVIDENCE_QUARANTINE_DISPOSITION_CONFLICT: 'EVIDENCE_QUARANTINE_DISPOSITION_CONFLICT',
  /** A referenced review workflow instance does not exist for the tenant. */
  WORKFLOW_NOT_FOUND: 'WORKFLOW_NOT_FOUND',
  /** A workflow step code is unknown or not the step currently awaiting a decision. */
  WORKFLOW_STEP_UNKNOWN: 'WORKFLOW_STEP_UNKNOWN',
  /** A workflow step decision value is not one of the allowed decisions. */
  WORKFLOW_INVALID_DECISION: 'WORKFLOW_INVALID_DECISION',
  /** The workflow (or step) has already reached a terminal decision and cannot change. */
  WORKFLOW_ALREADY_DECIDED: 'WORKFLOW_ALREADY_DECIDED',
  /** An approved-workflow execution was requested but the workflow is not in an approved state. */
  WORKFLOW_NOT_APPROVED: 'WORKFLOW_NOT_APPROVED',
  /** A referenced governed transition request does not exist for the tenant. */
  TRANSITION_REQUEST_NOT_FOUND: 'TRANSITION_REQUEST_NOT_FOUND',
  /** The entity's current governed state no longer matches the approved transition's expected source. */
  TRANSITION_STATE_CONFLICT: 'TRANSITION_STATE_CONFLICT',
  /** A referenced organization does not exist for the tenant. */
  ORGANIZATION_NOT_FOUND: 'ORGANIZATION_NOT_FOUND',
  /** A referenced parent organization does not exist for the tenant (covers cross-tenant parents). */
  ORGANIZATION_PARENT_NOT_FOUND: 'ORGANIZATION_PARENT_NOT_FOUND',
  /** The requested parent relationship would introduce a hierarchy cycle. */
  ORGANIZATION_PARENT_CYCLE: 'ORGANIZATION_PARENT_CYCLE',
  /** An organization with the same tenant-scoped id already exists (idempotency conflict). */
  ORGANIZATION_ALREADY_EXISTS: 'ORGANIZATION_ALREADY_EXISTS',
  /** A required source-entity reference is missing (e.g. active affiliation-sourced organization). */
  ORGANIZATION_SOURCE_REFERENCE_REQUIRED: 'ORGANIZATION_SOURCE_REFERENCE_REQUIRED',
  /** A referenced participant does not exist for the tenant. */
  PARTICIPANT_NOT_FOUND: 'PARTICIPANT_NOT_FOUND',
  /** A participant with the same tenant-scoped id already exists (idempotency conflict). */
  PARTICIPANT_ALREADY_EXISTS: 'PARTICIPANT_ALREADY_EXISTS',
  /** A provided contact email is not a syntactically valid address. */
  PARTICIPANT_INVALID_EMAIL: 'PARTICIPANT_INVALID_EMAIL',
  /** An archived participant cannot receive a new active organization relationship. */
  PARTICIPANT_ARCHIVED_NO_ACTIVE_LINK: 'PARTICIPANT_ARCHIVED_NO_ACTIVE_LINK',
  /** A referenced organization-participant relationship does not exist for the tenant. */
  ORGANIZATION_PARTICIPANT_NOT_FOUND: 'ORGANIZATION_PARTICIPANT_NOT_FOUND',
  /** An organization-participant relationship with the same id already exists (idempotency conflict). */
  ORGANIZATION_PARTICIPANT_ALREADY_EXISTS: 'ORGANIZATION_PARTICIPANT_ALREADY_EXISTS',
  /** A referenced facility does not exist for the tenant. */
  FACILITY_NOT_FOUND: 'FACILITY_NOT_FOUND',
  /** A facility with the same tenant-scoped id already exists (idempotency conflict). */
  FACILITY_ALREADY_EXISTS: 'FACILITY_ALREADY_EXISTS',
  /** A facility's referenced organization does not exist for the tenant (covers cross-tenant orgs). */
  FACILITY_ORGANIZATION_NOT_FOUND: 'FACILITY_ORGANIZATION_NOT_FOUND',
  /** A referenced financial obligation does not exist for the tenant. */
  FINANCIAL_OBLIGATION_NOT_FOUND: 'FINANCIAL_OBLIGATION_NOT_FOUND',
  /** A referenced affiliation standing does not exist for the tenant. */
  AFFILIATION_STANDING_NOT_FOUND: 'AFFILIATION_STANDING_NOT_FOUND',
  /**
   * A referenced affiliation application does not exist for the tenant OR the representative is
   * not authorized for it. Deliberately conflates both to avoid cross-tenant existence disclosure.
   * Maps to 404.
   */
  AFFILIATION_APPLICATION_NOT_FOUND: 'AFFILIATION_APPLICATION_NOT_FOUND',
  /** A draft save was rejected because the optimistic-concurrency token was stale. Maps to 409. */
  AFFILIATION_DRAFT_VERSION_CONFLICT: 'AFFILIATION_DRAFT_VERSION_CONFLICT',
  /** Submission was attempted before every applicable requirement was complete. Maps to 409. */
  AFFILIATION_SUBMISSION_NOT_READY: 'AFFILIATION_SUBMISSION_NOT_READY',
  /** A referenced correction request does not exist or is not visible to the tenant. Maps to 404. */
  AFFILIATION_CORRECTION_NOT_FOUND: 'AFFILIATION_CORRECTION_NOT_FOUND',
  /** A correction request conflicts with the current application/correction posture. Maps to 409. */
  AFFILIATION_CORRECTION_CONFLICT: 'AFFILIATION_CORRECTION_CONFLICT',
  /** Review assignment/start conflicts with the application's current governed posture. */
  AFFILIATION_REVIEW_CONFLICT: 'AFFILIATION_REVIEW_CONFLICT',
  /** A referenced requirement is not bound to (applicable for) the application. Maps to 404. */
  AFFILIATION_REQUIREMENT_UNKNOWN: 'AFFILIATION_REQUIREMENT_UNKNOWN',
  /**
   * An evidence reference could not be validated for the tenant (missing payload, digest mismatch,
   * or a cross-tenant reference). Deliberately generic to avoid existence disclosure. Maps to 400.
   */
  AFFILIATION_EVIDENCE_REFERENCE_INVALID: 'AFFILIATION_EVIDENCE_REFERENCE_INVALID',
  /** A referenced representative authority does not exist for the tenant. Maps to 404. */
  REPRESENTATIVE_AUTHORITY_NOT_FOUND: 'REPRESENTATIVE_AUTHORITY_NOT_FOUND',
  /**
   * A representative authority command conflicts with current state: a live active grant already
   * exists for the subject+organization, or the optimistic-concurrency version was stale. Maps to 409.
   */
  REPRESENTATIVE_AUTHORITY_CONFLICT: 'REPRESENTATIVE_AUTHORITY_CONFLICT',
  /** A referenced season does not exist for the tenant. Maps to 404. */
  SEASON_NOT_FOUND: 'SEASON_NOT_FOUND',
  /**
   * A governed season command conflicts with current state: the season key already exists, the
   * head is not in a state that permits the transition, or the optimistic-concurrency version was
   * stale. Maps to 409.
   */
  SEASON_CONFLICT: 'SEASON_CONFLICT',
  /**
   * A representative-facing season selection is not usable: the season key is unknown, a draft, a
   * retired season, or (on initiation) not the current season with an open application window.
   * Deliberately generic to avoid catalog/existence disclosure. Maps to 409.
   */
  SEASON_UNAVAILABLE: 'SEASON_UNAVAILABLE',
  /** A referenced jurisdiction (catalog entry or assignment) does not exist for the tenant. Maps to 404. */
  JURISDICTION_NOT_FOUND: 'JURISDICTION_NOT_FOUND',
  /**
   * A governed jurisdiction command conflicts with current state: the jurisdiction code already
   * exists, an active primary assignment already exists for the organization, the head is not in a
   * state that permits the transition, or the optimistic-concurrency version was stale. Maps to 409.
   */
  JURISDICTION_CONFLICT: 'JURISDICTION_CONFLICT',
  /**
   * A representative-facing organization has no governed jurisdiction that resolves right now: no
   * active primary assignment (direct or inherited), an ambiguous resolution, or a broken/cyclic
   * organization hierarchy. Deliberately generic to avoid hierarchy/existence disclosure. Maps to 409.
   */
  JURISDICTION_UNAVAILABLE: 'JURISDICTION_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Base application error carrying a stable {@link ErrorCode} and optional structured
 * details. All domain/governance errors should extend this so callers can branch on
 * `code` rather than message text.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    if (options?.details !== undefined) {
      this.details = options.details;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
