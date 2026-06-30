/**
 * Network-backed JWT verifier (Microsoft Entra / OIDC JWKS).
 *
 * This is the ONLY file that performs real JWKS network I/O and depends on `jose`, mirroring
 * the Azure Service Bus / Azure Blob adapter isolation pattern. Default unit tests inject a
 * fake {@link JwtVerifier} instead and never reach this file, so no JWKS endpoint is called.
 *
 * `createRemoteJWKSet` lazily fetches and caches signing keys (and handles key rotation), so
 * construction performs no network call; the first `verify()` triggers the initial fetch.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { URL } from 'node:url';
import type { JwtClaims, JwtVerifier } from './JwtVerifier.js';

export interface EntraJwksJwtVerifierOptions {
  /** Expected issuer (`iss`). */
  readonly issuer: string;
  /** Expected audience (`aud`). */
  readonly audience: string;
  /** JWKS endpoint (public). */
  readonly jwksUri: string;
}

export class EntraJwksJwtVerifier implements JwtVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(options: EntraJwksJwtVerifierOptions) {
    this.jwks = createRemoteJWKSet(new URL(options.jwksUri));
    this.issuer = options.issuer;
    this.audience = options.audience;
  }

  async verify(token: string): Promise<JwtClaims> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: this.audience,
    });
    return payload as JwtClaims;
  }
}
