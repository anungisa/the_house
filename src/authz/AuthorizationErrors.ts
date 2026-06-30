/**
 * Authorization error type.
 *
 * Thrown by {@link assertAuthorized} when an authenticated actor is NOT permitted to perform a
 * named action. Carries the stable, NSO-generic {@link ErrorCode.FORBIDDEN} so HTTP adapters map
 * it to 403 without leaking internals.
 *
 * IMPORTANT: the public message NEVER includes the actor's role list, permission keys, token
 * contents, or claim payloads — only the (non-secret) action name. Detailed decision reasons are
 * available to INTERNAL callers via the {@link AuthorizationDecision} returned by `authorize`.
 */

import { AppError, ErrorCode } from '../shared/errors/AppError.js';

/** An authenticated actor was denied a named action. Maps to HTTP 403. */
export class AuthorizationDeniedError extends AppError {
  /** The action that was denied (non-secret operation name). */
  public readonly action: string;

  constructor(action: string, message?: string) {
    super(
      ErrorCode.FORBIDDEN,
      message ?? `Not authorized to perform '${action}'.`,
    );
    this.action = action;
  }
}
