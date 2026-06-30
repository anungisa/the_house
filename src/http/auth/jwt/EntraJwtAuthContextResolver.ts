/**
 * Microsoft Entra (JWT) edge-identity resolver.
 *
 * Establishes the TRUSTED {@link AuthContext} from a validated `Authorization: Bearer <token>`
 * JWT. The token is the identity boundary: this resolver IGNORES request-body identity and
 * does NOT read `x-house-*` headers. Verification (signature/issuer/audience/expiry) is
 * delegated to an injected {@link JwtVerifier}, so default tests stay hermetic (no JWKS
 * network call). Claim → context translation is delegated to {@link mapJwtClaimsToAuthContext}.
 *
 * Producing context is NOT authorization — the Governance Kernel still performs every
 * permission check for the governed action.
 */

import type { AuthContext } from '../AuthContext.js';
import type { AuthContextResolver, AuthResolveInput } from '../AuthContextResolver.js';
import { JwtAuthReason, jwtUnauthenticated } from './JwtAuthErrors.js';
import { mapJwtClaimsToAuthContext, type JwtClaimMapping } from './JwtClaimMapper.js';
import type { JwtClaims, JwtVerifier } from './JwtVerifier.js';

/** Extract the raw token from an `Authorization: Bearer <token>` header (scheme is case-insensitive). */
function extractBearerToken(authorization: string | undefined): string {
  if (authorization === undefined) {
    throw jwtUnauthenticated(JwtAuthReason.MissingBearerToken, 'Missing bearer token.');
  }
  const match = /^Bearer[ \t]+(.+)$/i.exec(authorization.trim());
  if (match === null) {
    throw jwtUnauthenticated(
      JwtAuthReason.MalformedAuthorizationHeader,
      'Authorization header must be a Bearer token.',
    );
  }
  const token = (match[1] ?? '').trim();
  if (token === '') {
    throw jwtUnauthenticated(
      JwtAuthReason.MalformedAuthorizationHeader,
      'Authorization header must be a Bearer token.',
    );
  }
  return token;
}

export class EntraJwtAuthContextResolver implements AuthContextResolver {
  readonly mode = 'entra_jwt' as const;

  constructor(
    private readonly verifier: JwtVerifier,
    private readonly mapping: JwtClaimMapping,
  ) {}

  async resolve(input: AuthResolveInput): Promise<AuthContext> {
    const token = extractBearerToken(input.headers['authorization']);
    let claims: JwtClaims;
    try {
      claims = await this.verifier.verify(token);
    } catch {
      // Never surface verifier/JWKS internals or token contents.
      throw jwtUnauthenticated(
        JwtAuthReason.TokenVerificationFailed,
        'Bearer token is invalid or expired.',
      );
    }
    return mapJwtClaimsToAuthContext(claims, this.mapping);
  }
}
