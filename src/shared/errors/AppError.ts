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
