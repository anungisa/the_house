/**
 * Barrel for the JWT / Microsoft Entra edge-identity adapter.
 *
 * Exposes the verifier PORT, the pure claim mapper, the resolver, the error helpers, and the
 * network-backed JWKS verifier ADAPTER. Composition selects this resolver when
 * AUTH_MODE=entra_jwt; the rest of the HTTP surface depends only on AuthContextResolver.
 */

export type { JwtClaims, JwtVerifier } from './JwtVerifier.js';
export { JwtAuthReason, jwtUnauthenticated } from './JwtAuthErrors.js';
export { mapJwtClaimsToAuthContext, type JwtClaimMapping } from './JwtClaimMapper.js';
export { EntraJwtAuthContextResolver } from './EntraJwtAuthContextResolver.js';
export {
  EntraJwksJwtVerifier,
  type EntraJwksJwtVerifierOptions,
} from './EntraJwksJwtVerifier.js';
