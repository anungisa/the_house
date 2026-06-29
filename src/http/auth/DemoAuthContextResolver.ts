/**
 * Demo edge-identity resolver — LOCAL/DEMO ONLY.
 *
 * Derives the trusted {@link AuthContext} from the REQUEST BODY (`tenantId` + `actor`). This
 * trusts the caller to honestly declare who they are, which is acceptable only for local
 * development and demos. It is the default mode and preserves the pre-auth HTTP behavior.
 *
 * Never select this mode for any externally reachable deployment. Use `trusted_headers`
 * (with a verifying edge) instead.
 */

import type { AuthActor, AuthContext } from './AuthContext.js';
import type { AuthContextResolver, AuthResolveInput } from './AuthContextResolver.js';
import type { ScopeType } from '../../governance/types/TransitionTypes.js';

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

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === 'string');
}

function asScopeType(value: unknown): ScopeType | undefined {
  return typeof value === 'string' && SCOPE_TYPES.has(value) ? (value as ScopeType) : undefined;
}

/** Build an {@link AuthActor} from a raw body `actor` object (lenient; blanks fail later in the domain). */
function actorFromBody(raw: Record<string, unknown>): AuthActor {
  const scopeType = asScopeType(raw['scopeType']);
  const scopeId = asString(raw['scopeId']);
  const organizationId = asString(raw['organizationId']);
  const organizationUnitId = asString(raw['organizationUnitId']);
  const nationalOrganizationId = asString(raw['nationalOrganizationId']);
  const regionalOrganizationId = asString(raw['regionalOrganizationId']);
  const localOrganizationId = asString(raw['localOrganizationId']);
  return {
    userId: asString(raw['userId']) ?? '',
    roleKeys: asStringArray(raw['roleKeys']) ?? [],
    permissionKeys: asStringArray(raw['permissionKeys']) ?? [],
    ...(scopeType !== undefined ? { scopeType } : {}),
    ...(scopeId !== undefined ? { scopeId } : {}),
    ...(organizationId !== undefined ? { organizationId } : {}),
    ...(organizationUnitId !== undefined ? { organizationUnitId } : {}),
    ...(nationalOrganizationId !== undefined ? { nationalOrganizationId } : {}),
    ...(regionalOrganizationId !== undefined ? { regionalOrganizationId } : {}),
    ...(localOrganizationId !== undefined ? { localOrganizationId } : {}),
  };
}

export class DemoAuthContextResolver implements AuthContextResolver {
  readonly mode = 'demo' as const;

  resolve(input: AuthResolveInput): AuthContext {
    const body = isPlainObject(input.body) ? input.body : {};
    const actorRaw = isPlainObject(body['actor']) ? body['actor'] : {};
    return {
      tenantId: asString(body['tenantId']) ?? '',
      actor: actorFromBody(actorRaw),
      mode: 'demo',
    };
  }
}
