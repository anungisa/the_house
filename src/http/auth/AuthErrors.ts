/**
 * Edge-identity error types.
 *
 * These are thrown by {@link AuthContextResolver}s at the HTTP boundary and carry stable,
 * NSO-generic {@link ErrorCode}s so the adapter maps them to 401/403 without leaking
 * internals. They never include secrets, header values, or stack detail in their messages.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';

/** No trusted identity could be established (missing/invalid identity). Maps to HTTP 401. */
export class UnauthenticatedError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.UNAUTHENTICATED, message, details !== undefined ? { details } : undefined);
  }
}

/** Identity was established but the request is not permitted at the edge. Maps to HTTP 403. */
export class ForbiddenError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.FORBIDDEN, message, details !== undefined ? { details } : undefined);
  }
}
