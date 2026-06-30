import { describe, it, expect } from 'vitest';
import { EntraJwtAuthContextResolver } from '../../../../../src/http/auth/jwt/EntraJwtAuthContextResolver.js';
import type {
  JwtClaims,
  JwtVerifier,
} from '../../../../../src/http/auth/jwt/JwtVerifier.js';
import type { JwtClaimMapping } from '../../../../../src/http/auth/jwt/JwtClaimMapper.js';
import { UnauthenticatedError } from '../../../../../src/http/auth/AuthErrors.js';
import { ErrorCode } from '../../../../../src/shared/errors/AppError.js';

/**
 * Entra JWT resolver tests.
 *
 * A FAKE {@link JwtVerifier} is injected for every case, so NO real Microsoft Entra or JWKS
 * endpoint is contacted (test 23). Verifier failures (signature/issuer/audience/expiry) are
 * simulated by throwing — the resolver must collapse them all to a stable 401 that leaks
 * nothing about the token or keys.
 */

const MAPPING: JwtClaimMapping = {
  userIdClaim: 'oid',
  tenantIdClaim: 'tid',
  roleClaim: 'roles',
  permissionClaim: 'scp',
};

/** Verifier that returns fixed claims for ANY token (no real validation). */
class FakeVerifier implements JwtVerifier {
  public tokens: string[] = [];
  constructor(private readonly claims: JwtClaims) {}
  verify(token: string): Promise<JwtClaims> {
    this.tokens.push(token);
    return Promise.resolve(this.claims);
  }
}

/** Verifier that rejects, simulating an invalid/expired/mismatched token. */
class ThrowingVerifier implements JwtVerifier {
  constructor(private readonly error: Error) {}
  verify(): Promise<JwtClaims> {
    return Promise.reject(this.error);
  }
}

const VALID_CLAIMS: JwtClaims = {
  tid: 'tenant-1',
  oid: 'user-1',
  roles: ['reviewer'],
  scp: 'Affiliation.Read',
};

function bearer(token = 'header.payload.signature'): Record<string, string | undefined> {
  return { authorization: `Bearer ${token}` };
}

describe('EntraJwtAuthContextResolver', () => {
  it('reports mode entra_jwt', () => {
    const resolver = new EntraJwtAuthContextResolver(new FakeVerifier(VALID_CLAIMS), MAPPING);
    expect(resolver.mode).toBe('entra_jwt');
  });

  // (7) Missing Authorization header → 401.
  it('rejects a missing Authorization header with 401', async () => {
    const resolver = new EntraJwtAuthContextResolver(new FakeVerifier(VALID_CLAIMS), MAPPING);
    await expect(resolver.resolve({ headers: {}, body: undefined })).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  // (8) Non-Bearer Authorization header → 401.
  it('rejects a non-Bearer Authorization scheme with 401', async () => {
    const resolver = new EntraJwtAuthContextResolver(new FakeVerifier(VALID_CLAIMS), MAPPING);
    await expect(
      resolver.resolve({ headers: { authorization: 'Basic abc123' }, body: undefined }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rejects an empty Bearer token with 401', async () => {
    const resolver = new EntraJwtAuthContextResolver(new FakeVerifier(VALID_CLAIMS), MAPPING);
    await expect(
      resolver.resolve({ headers: { authorization: 'Bearer    ' }, body: undefined }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('accepts a case-insensitive Bearer scheme', async () => {
    const verifier = new FakeVerifier(VALID_CLAIMS);
    const resolver = new EntraJwtAuthContextResolver(verifier, MAPPING);
    const ctx = await resolver.resolve({
      headers: { authorization: 'bearer abc.def.ghi' },
      body: undefined,
    });
    expect(ctx.tenantId).toBe('tenant-1');
    expect(verifier.tokens).toEqual(['abc.def.ghi']);
  });

  // (9) Verifier failure → 401.
  it('maps a verifier failure to 401 without leaking internals', async () => {
    const resolver = new EntraJwtAuthContextResolver(
      new ThrowingVerifier(new Error('JWKSNoMatchingKey: kid mismatch at https://secret/jwks')),
      MAPPING,
    );
    try {
      await resolver.resolve({ headers: bearer(), body: undefined });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthenticatedError);
      const e = err as UnauthenticatedError;
      expect(e.code).toBe(ErrorCode.UNAUTHENTICATED);
      expect(e.message).toBe('Bearer token is invalid or expired.');
      expect(e.message).not.toContain('JWKS');
      expect(e.message).not.toContain('secret');
    }
  });

  // (10) Expired token → 401.
  it('maps an expired-token verifier failure to 401', async () => {
    const resolver = new EntraJwtAuthContextResolver(
      new ThrowingVerifier(new Error('"exp" claim timestamp check failed')),
      MAPPING,
    );
    await expect(resolver.resolve({ headers: bearer(), body: undefined })).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  // (11) Issuer/audience mismatch → 401.
  it('maps an issuer/audience mismatch verifier failure to 401', async () => {
    const resolver = new EntraJwtAuthContextResolver(
      new ThrowingVerifier(new Error('unexpected "iss" claim value')),
      MAPPING,
    );
    await expect(resolver.resolve({ headers: bearer(), body: undefined })).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  // (12)+(13) Valid token produces tenantId + actor.userId.
  it('produces tenant + actor from verified claims, ignoring headers and body', async () => {
    const resolver = new EntraJwtAuthContextResolver(new FakeVerifier(VALID_CLAIMS), MAPPING);
    const ctx = await resolver.resolve({
      headers: {
        ...bearer(),
        // These MUST be ignored: the token is the only identity source.
        'x-house-tenant-id': 'attacker-tenant',
        'x-house-actor-user-id': 'attacker',
      },
      body: { tenantId: 'attacker-tenant', actor: { userId: 'attacker' } },
    });
    expect(ctx.mode).toBe('entra_jwt');
    expect(ctx.tenantId).toBe('tenant-1');
    expect(ctx.actor.userId).toBe('user-1');
    expect(ctx.actor.roleKeys).toEqual(['reviewer']);
    expect(ctx.actor.permissionKeys).toEqual(['Affiliation.Read']);
  });

  // (16) Missing tenant claim → 401 (mapper enforced through the resolver).
  it('rejects a verified token missing the tenant claim with 401', async () => {
    const resolver = new EntraJwtAuthContextResolver(
      new FakeVerifier({ oid: 'user-1' }),
      MAPPING,
    );
    await expect(resolver.resolve({ headers: bearer(), body: undefined })).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  // (17) Missing user claim → 401.
  it('rejects a verified token missing the user claim with 401', async () => {
    const resolver = new EntraJwtAuthContextResolver(
      new FakeVerifier({ tid: 'tenant-1' }),
      MAPPING,
    );
    await expect(resolver.resolve({ headers: bearer(), body: undefined })).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });
});
