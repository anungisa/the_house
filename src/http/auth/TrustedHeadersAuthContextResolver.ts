/**
 * Trusted-headers edge-identity resolver.
 *
 * Derives the trusted {@link AuthContext} from request HEADERS that a verifying edge
 * (reverse proxy / API gateway / identity provider) injects AFTER authenticating the user.
 * Body-supplied identity is rejected: a body `actor` is forbidden, and a body `tenantId`
 * that conflicts with the trusted tenant is forbidden.
 *
 * IMPORTANT: this is NOT token/JWT validation. It assumes the upstream edge is trusted and
 * strips/sets these headers itself. The headers below MUST NOT be acceptable from arbitrary
 * clients — only deploy this behind a trusted edge that overwrites them.
 */

import type { AuthActor, AuthContext } from './AuthContext.js';
import type { AuthContextResolver, AuthResolveInput } from './AuthContextResolver.js';
import { ForbiddenError, UnauthenticatedError } from './AuthErrors.js';
import type { ScopeType } from '../../governance/types/TransitionTypes.js';

/**
 * Fixed trusted header contract (v1). All NSO-generic. Header names are lowercased to match
 * Node's incoming header map.
 */
export const TRUSTED_HEADER_NAMES = {
  tenantId: 'x-house-tenant-id',
  actorUserId: 'x-house-actor-user-id',
  actorRoleKeys: 'x-house-actor-role-keys',
  actorPermissionKeys: 'x-house-actor-permission-keys',
  organizationId: 'x-house-organization-id',
  organizationUnitId: 'x-house-organization-unit-id',
  scopeType: 'x-house-scope-type',
  scopeId: 'x-house-scope-id',
} as const;

const SCOPE_TYPES: ReadonlySet<string> = new Set<ScopeType>([
  'platform',
  'national_organization',
  'regional_organization',
  'local_organization',
  'organization_unit',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  return t.length === 0 ? undefined : t;
}

/** Parse a comma-separated header into a deduped list of non-empty keys. */
function parseList(value: string | undefined): readonly string[] {
  if (value === undefined) return [];
  const parts = value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return Array.from(new Set(parts));
}

function asScopeType(value: string | undefined): ScopeType | undefined {
  return value !== undefined && SCOPE_TYPES.has(value) ? (value as ScopeType) : undefined;
}

export class TrustedHeadersAuthContextResolver implements AuthContextResolver {
  readonly mode = 'trusted_headers' as const;

  resolve(input: AuthResolveInput): AuthContext {
    const h = input.headers;

    const tenantId = trimmed(h[TRUSTED_HEADER_NAMES.tenantId]);
    if (tenantId === undefined) {
      throw new UnauthenticatedError('Missing trusted tenant identity header.', {
        header: TRUSTED_HEADER_NAMES.tenantId,
      });
    }
    const userId = trimmed(h[TRUSTED_HEADER_NAMES.actorUserId]);
    if (userId === undefined) {
      throw new UnauthenticatedError('Missing trusted actor identity header.', {
        header: TRUSTED_HEADER_NAMES.actorUserId,
      });
    }

    // Body must not attempt to supply or override identity in trusted mode.
    if (isPlainObject(input.body)) {
      const body = input.body;
      if (Object.prototype.hasOwnProperty.call(body, 'actor') && body['actor'] !== undefined) {
        throw new ForbiddenError(
          'Request body actor is not accepted in trusted_headers mode; identity is derived from trusted headers.',
        );
      }
      const bodyTenant = typeof body['tenantId'] === 'string' ? body['tenantId'] : undefined;
      if (bodyTenant !== undefined && bodyTenant !== tenantId) {
        throw new ForbiddenError('Request body tenantId conflicts with the trusted tenant identity.');
      }
    }

    const scopeType = asScopeType(trimmed(h[TRUSTED_HEADER_NAMES.scopeType]));
    const scopeId = trimmed(h[TRUSTED_HEADER_NAMES.scopeId]);
    const organizationId = trimmed(h[TRUSTED_HEADER_NAMES.organizationId]);
    const organizationUnitId = trimmed(h[TRUSTED_HEADER_NAMES.organizationUnitId]);

    const actor: AuthActor = {
      userId,
      roleKeys: parseList(h[TRUSTED_HEADER_NAMES.actorRoleKeys]),
      permissionKeys: parseList(h[TRUSTED_HEADER_NAMES.actorPermissionKeys]),
      ...(scopeType !== undefined ? { scopeType } : {}),
      ...(scopeId !== undefined ? { scopeId } : {}),
      ...(organizationId !== undefined ? { organizationId } : {}),
      ...(organizationUnitId !== undefined ? { organizationUnitId } : {}),
    };

    return { tenantId, actor, mode: 'trusted_headers' };
  }
}
