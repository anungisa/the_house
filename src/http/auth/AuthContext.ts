/**
 * Edge identity context types for the HTTP boundary.
 *
 * An {@link AuthContext} is the TRUSTED identity the platform acts on for a request. It is
 * produced by an {@link AuthContextResolver} (see ./AuthContextResolver.js) and is the only
 * source of `tenantId` + `actor` the HTTP adapter is allowed to use for a governed call.
 *
 * In `demo` mode the resolver derives this from the request body (local/demo trust only).
 * In `trusted_headers` mode the resolver derives it from headers injected by a verifying
 * edge (gateway / reverse proxy / identity provider) and rejects body-supplied identity.
 *
 * These types are NSO-generic: no sport-specific fields (no ptso/club/curler/bonspiel). The
 * affiliation HTTP adapter maps this generic context onto its own DTO.
 */

import type { ScopeType } from '../../governance/types/TransitionTypes.js';

/** The trusted acting principal derived from verified request identity. */
export interface AuthActor {
  readonly userId: string;
  /** Generic role keys driving the kernel permission check (e.g. 'reviewer', 'admin'). */
  readonly roleKeys: readonly string[];
  /** Forward-compat permission keys (carried as workflow metadata in v1). */
  readonly permissionKeys: readonly string[];

  /** Optional generic organizational scope. */
  readonly scopeType?: ScopeType;
  readonly scopeId?: string;

  /** Optional NSO-generic hierarchy references. */
  readonly organizationId?: string;
  readonly organizationUnitId?: string;
  readonly nationalOrganizationId?: string;
  readonly regionalOrganizationId?: string;
  readonly localOrganizationId?: string;
}

/** The trusted identity context the adapter passes to the domain boundary. */
export interface AuthContext {
  readonly tenantId: string;
  readonly actor: AuthActor;
  /** Which resolver produced this context (diagnostics only). */
  readonly mode: 'demo' | 'trusted_headers' | 'entra_jwt';
}
