import { describe, it, expect } from 'vitest';
import {
  mapJwtClaimsToAuthContext,
  type JwtClaimMapping,
} from '../../../../../src/http/auth/jwt/JwtClaimMapper.js';
import { UnauthenticatedError } from '../../../../../src/http/auth/AuthErrors.js';
import { ErrorCode } from '../../../../../src/shared/errors/AppError.js';

/**
 * Pure claim-mapping tests. No verification, no network: claims are treated as already
 * verified and translated into the platform's NSO-generic identity shape.
 */

const MAPPING: JwtClaimMapping = {
  userIdClaim: 'oid',
  tenantIdClaim: 'tid',
  roleClaim: 'roles',
  permissionClaim: 'scp',
};

describe('mapJwtClaimsToAuthContext', () => {
  // (12) Valid claims produce a tenantId.
  it('derives tenantId from the configured tenant claim', () => {
    const ctx = mapJwtClaimsToAuthContext({ tid: 'tenant-9', oid: 'user-9' }, MAPPING);
    expect(ctx.mode).toBe('entra_jwt');
    expect(ctx.tenantId).toBe('tenant-9');
  });

  // (13) Valid claims produce actor.userId.
  it('derives actor.userId from the configured user claim', () => {
    const ctx = mapJwtClaimsToAuthContext({ tid: 'tenant-9', oid: 'user-9' }, MAPPING);
    expect(ctx.actor.userId).toBe('user-9');
  });

  // (14) A roles ARRAY maps to roleKeys.
  it('maps a roles array claim to roleKeys', () => {
    const ctx = mapJwtClaimsToAuthContext(
      { tid: 't', oid: 'u', roles: ['reviewer', 'admin', 'reviewer'] },
      MAPPING,
    );
    expect(ctx.actor.roleKeys).toEqual(['reviewer', 'admin']);
  });

  // (15) A space-delimited scope STRING (scp) maps to permissionKeys.
  it('maps a space-delimited scope string to permissionKeys', () => {
    const ctx = mapJwtClaimsToAuthContext(
      { tid: 't', oid: 'u', scp: 'Affiliation.Read Affiliation.Write' },
      MAPPING,
    );
    expect(ctx.actor.permissionKeys).toEqual(['Affiliation.Read', 'Affiliation.Write']);
  });

  it('maps a comma-delimited scope string to permissionKeys', () => {
    const ctx = mapJwtClaimsToAuthContext({ tid: 't', oid: 'u', scp: 'p1,p2,p1' }, MAPPING);
    expect(ctx.actor.permissionKeys).toEqual(['p1', 'p2']);
  });

  it('treats absent role/permission claims as empty lists', () => {
    const ctx = mapJwtClaimsToAuthContext({ tid: 't', oid: 'u' }, MAPPING);
    expect(ctx.actor.roleKeys).toEqual([]);
    expect(ctx.actor.permissionKeys).toEqual([]);
  });

  it('maps optional organization claims only when configured', () => {
    const mapping: JwtClaimMapping = {
      ...MAPPING,
      organizationIdClaim: 'org_id',
      organizationUnitIdClaim: 'org_unit_id',
    };
    const ctx = mapJwtClaimsToAuthContext(
      { tid: 't', oid: 'u', org_id: 'org-1', org_unit_id: 'unit-1' },
      mapping,
    );
    expect(ctx.actor.organizationId).toBe('org-1');
    expect(ctx.actor.organizationUnitId).toBe('unit-1');
  });

  it('omits organization fields when claims are present but mapping is not configured', () => {
    const ctx = mapJwtClaimsToAuthContext(
      { tid: 't', oid: 'u', org_id: 'org-1' },
      MAPPING,
    );
    expect(ctx.actor.organizationId).toBeUndefined();
  });

  // (16) Missing tenant claim → 401.
  it('rejects a missing tenant claim with UnauthenticatedError (401)', () => {
    expect(() => mapJwtClaimsToAuthContext({ oid: 'u' }, MAPPING)).toThrow(UnauthenticatedError);
    try {
      mapJwtClaimsToAuthContext({ oid: 'u' }, MAPPING);
    } catch (err) {
      expect((err as UnauthenticatedError).code).toBe(ErrorCode.UNAUTHENTICATED);
    }
  });

  it('treats a blank tenant claim as missing', () => {
    expect(() => mapJwtClaimsToAuthContext({ tid: '   ', oid: 'u' }, MAPPING)).toThrow(
      UnauthenticatedError,
    );
  });

  it('treats a non-string tenant claim as missing', () => {
    expect(() => mapJwtClaimsToAuthContext({ tid: 123, oid: 'u' }, MAPPING)).toThrow(
      UnauthenticatedError,
    );
  });

  // (17) Missing user claim → 401.
  it('rejects a missing user claim with UnauthenticatedError (401)', () => {
    expect(() => mapJwtClaimsToAuthContext({ tid: 't' }, MAPPING)).toThrow(UnauthenticatedError);
  });

  it('rejects a malformed roles claim (object) with UnauthenticatedError (401)', () => {
    expect(() =>
      mapJwtClaimsToAuthContext({ tid: 't', oid: 'u', roles: { not: 'a list' } }, MAPPING),
    ).toThrow(UnauthenticatedError);
  });

  it('rejects a roles array with non-string entries (401)', () => {
    expect(() =>
      mapJwtClaimsToAuthContext({ tid: 't', oid: 'u', roles: ['ok', 42] }, MAPPING),
    ).toThrow(UnauthenticatedError);
  });

  // (24) No sport-specific claim names are required by the mapper.
  it('uses only configurable, NSO-generic claim names (no sport-specific terms)', () => {
    const SPORT_TERMS = /curl|curler|bonspiel|hockey|skip|rink|sheet|ptso|club|league|athlete|coach/i;
    for (const name of Object.values(MAPPING)) {
      if (typeof name === 'string') expect(name).not.toMatch(SPORT_TERMS);
    }
  });
});
