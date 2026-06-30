/**
 * JWT verification port (auth boundary).
 *
 * The verifier is the seam between the {@link EntraJwtAuthContextResolver} and the real,
 * network-backed JWKS verification. Default unit tests inject a fake verifier so they NEVER
 * contact Microsoft Entra or a JWKS endpoint. The production implementation
 * ({@link ../jwt/EntraJwksJwtVerifier}) isolates all `jose`/network use behind this port,
 * mirroring the Azure Service Bus / Azure Blob adapter pattern.
 */

/** Decoded, VERIFIED JWT claims (signature/issuer/audience/expiry already checked). */
export type JwtClaims = Readonly<Record<string, unknown>>;

export interface JwtVerifier {
  /**
   * Verify a raw bearer token and return its claims, or REJECT when the token is invalid,
   * expired, or fails issuer/audience checks. Implementations must not leak token contents
   * or key material in thrown errors.
   */
  verify(token: string): Promise<JwtClaims>;
}
