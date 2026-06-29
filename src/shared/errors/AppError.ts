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
