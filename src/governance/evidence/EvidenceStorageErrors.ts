/**
 * Evidence storage error types.
 *
 * Controlled, NSO-generic {@link AppError}s thrown by storage backends. Messages never
 * include payload bytes, connection strings, or other secrets.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';

/** A requested evidence payload does not exist in storage. */
export class EvidenceNotFoundError extends AppError {
  constructor(message = 'Evidence object not found.', details?: Record<string, unknown>) {
    super(ErrorCode.EVIDENCE_NOT_FOUND, message, details !== undefined ? { details } : undefined);
  }
}

/** A stored/streamed payload's digest does not match the expected SHA-256. */
export class EvidenceHashMismatchError extends AppError {
  constructor(message = 'Evidence object digest mismatch.', details?: Record<string, unknown>) {
    super(
      ErrorCode.EVIDENCE_HASH_MISMATCH,
      message,
      details !== undefined ? { details } : undefined,
    );
  }
}

/** A storage backend operation failed (sanitized; wraps the original cause). */
export class EvidenceStorageError extends AppError {
  constructor(message: string, options?: { details?: Record<string, unknown>; cause?: unknown }) {
    super(ErrorCode.EVIDENCE_STORAGE_ERROR, message, options);
  }
}
