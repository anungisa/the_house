/**
 * Pure mapping from VERIFIED JWT claims to a House {@link AuthContext}.
 *
 * No network, no verification, no authorization decisions: this only translates already-
 * verified claims into the platform's NSO-generic identity shape. Claim NAMES are
 * configurable (no sport-specific claim names). Missing required identity claims fail closed
 * (401); a roles/permissions claim that is present but not a string or array of strings is
 * rejected as malformed (401).
 *
 * Producing context is NOT authorization — the Governance Kernel still performs all
 * permission checks for the governed action.
 */

import type { AuthActor, AuthContext } from '../AuthContext.js';
import { JwtAuthReason, jwtUnauthenticated } from './JwtAuthErrors.js';
import type { JwtClaims } from './JwtVerifier.js';

/** Configurable claim names used to read identity from a verified token. */
export interface JwtClaimMapping {
  readonly userIdClaim: string;
  readonly tenantIdClaim: string;
  readonly roleClaim: string;
  readonly permissionClaim: string;
  readonly organizationIdClaim?: string;
  readonly organizationUnitIdClaim?: string;
}

function readStringClaim(claims: JwtClaims, name: string): string | undefined {
  const value = claims[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Read a claim as a list of keys. Accepts a whitespace/comma-separated string (e.g. the
 * space-delimited `scp` scope claim) or an array of strings (e.g. the `roles` claim). A
 * present claim of any other shape (number, object, or array with non-string entries) is
 * rejected as malformed.
 */
function readKeyListClaim(claims: JwtClaims, name: string): readonly string[] {
  const value = claims[name];
  if (value === undefined || value === null) return [];

  if (Array.isArray(value)) {
    if (!value.every((item) => typeof item === 'string')) {
      throw jwtUnauthenticated(JwtAuthReason.MalformedClaim, 'A token claim is malformed.');
    }
    return dedupe(value.map((item) => (item as string).trim()).filter((item) => item !== ''));
  }

  if (typeof value === 'string') {
    return dedupe(
      value
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter((part) => part !== ''),
    );
  }

  throw jwtUnauthenticated(JwtAuthReason.MalformedClaim, 'A token claim is malformed.');
}

function dedupe(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

/**
 * Map verified claims to a trusted {@link AuthContext}. Throws an Unauthenticated (401) error
 * when the tenant or user identity claim is absent, or when a roles/permissions claim is
 * malformed.
 */
export function mapJwtClaimsToAuthContext(
  claims: JwtClaims,
  mapping: JwtClaimMapping,
): AuthContext {
  const tenantId = readStringClaim(claims, mapping.tenantIdClaim);
  if (tenantId === undefined) {
    throw jwtUnauthenticated(JwtAuthReason.MissingTenantClaim, 'Token is missing a tenant claim.');
  }
  const userId = readStringClaim(claims, mapping.userIdClaim);
  if (userId === undefined) {
    throw jwtUnauthenticated(JwtAuthReason.MissingUserClaim, 'Token is missing a user claim.');
  }

  const organizationId =
    mapping.organizationIdClaim !== undefined
      ? readStringClaim(claims, mapping.organizationIdClaim)
      : undefined;
  const organizationUnitId =
    mapping.organizationUnitIdClaim !== undefined
      ? readStringClaim(claims, mapping.organizationUnitIdClaim)
      : undefined;

  const actor: AuthActor = {
    userId,
    roleKeys: readKeyListClaim(claims, mapping.roleClaim),
    permissionKeys: readKeyListClaim(claims, mapping.permissionClaim),
    ...(organizationId !== undefined ? { organizationId } : {}),
    ...(organizationUnitId !== undefined ? { organizationUnitId } : {}),
  };

  return { tenantId, actor, mode: 'entra_jwt' };
}
