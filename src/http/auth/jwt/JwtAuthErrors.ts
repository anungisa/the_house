/**
 * JWT auth error helpers.
 *
 * Public errors stay stable ({@link UnauthenticatedError} → HTTP 401). JWT-specific reasons
 * are carried as a coarse, NON-sensitive `reason` code in error details for diagnostics —
 * NEVER the token, claims, header values, or key material. Authorization beyond identity
 * (insufficient domain permission → 403) remains the kernel/domain's job and uses the
 * existing {@link ForbiddenError} path; it is not produced here.
 */

import { UnauthenticatedError } from '../AuthErrors.js';

/** Coarse, non-sensitive reason codes for failed JWT authentication (diagnostics only). */
export const JwtAuthReason = {
  MissingBearerToken: 'missing_bearer_token',
  MalformedAuthorizationHeader: 'malformed_authorization_header',
  TokenVerificationFailed: 'token_verification_failed',
  MissingTenantClaim: 'missing_tenant_claim',
  MissingUserClaim: 'missing_user_claim',
  MalformedClaim: 'malformed_claim',
} as const;

export type JwtAuthReason = (typeof JwtAuthReason)[keyof typeof JwtAuthReason];

/**
 * Build a 401 with a stable public message and a coarse internal reason. The message and
 * details never include token contents, claims, or JWKS internals.
 */
export function jwtUnauthenticated(reason: JwtAuthReason, message: string): UnauthenticatedError {
  return new UnauthenticatedError(message, { reason });
}
