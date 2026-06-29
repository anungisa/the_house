import { AppError, ErrorCode } from './AppError.js';

/**
 * Thrown by intentionally-stubbed scaffold code paths that will be completed in a later
 * implementation pass. Carries the stable NOT_IMPLEMENTED code.
 */
export class NotImplementedError extends AppError {
  constructor(feature: string, options?: { details?: Record<string, unknown> }) {
    super(ErrorCode.NOT_IMPLEMENTED, `Not implemented yet: ${feature}`, options);
  }
}
