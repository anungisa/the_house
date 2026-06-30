/**
 * Shared identity resolution for the workflow HTTP surface (decision + execution).
 *
 * Both workflow endpoints carry identity in the shared `x-house-*` trusted-header contract
 * and NEVER source tenant/actor from the JSON body. This module centralizes that contract so
 * the decision and execution adapters resolve identity identically.
 *
 * Demo mode synthesizes an identity body from the trusted headers (trusted without
 * verification, local/demo only); trusted_headers mode reads the verified headers directly
 * and rejects any identity carried in a JSON body.
 */

import type { AuthContext } from '../auth/AuthContext.js';
import type { AuthContextResolver } from '../auth/AuthContextResolver.js';
import { TRUSTED_HEADER_NAMES } from '../auth/AuthContextResolver.js';
import { UnauthenticatedError } from '../auth/AuthErrors.js';

function trimmedHeader(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function splitList(value: string | undefined): readonly string[] {
  if (value === undefined) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * Synthesize a demo-resolver identity body from the trusted-header contract. The workflow
 * bodies carry no identity, so demo identity is sourced from `x-house-*` headers.
 */
function identityBodyFromHeaders(
  headers: Readonly<Record<string, string | undefined>>,
): Record<string, unknown> {
  const actor: Record<string, unknown> = {
    userId: trimmedHeader(headers[TRUSTED_HEADER_NAMES.actorUserId]) ?? '',
    roleKeys: splitList(headers[TRUSTED_HEADER_NAMES.actorRoleKeys]),
    permissionKeys: splitList(headers[TRUSTED_HEADER_NAMES.actorPermissionKeys]),
  };
  const scopeType = trimmedHeader(headers[TRUSTED_HEADER_NAMES.scopeType]);
  const scopeId = trimmedHeader(headers[TRUSTED_HEADER_NAMES.scopeId]);
  const organizationId = trimmedHeader(headers[TRUSTED_HEADER_NAMES.organizationId]);
  const organizationUnitId = trimmedHeader(headers[TRUSTED_HEADER_NAMES.organizationUnitId]);
  if (scopeType !== undefined) actor['scopeType'] = scopeType;
  if (scopeId !== undefined) actor['scopeId'] = scopeId;
  if (organizationId !== undefined) actor['organizationId'] = organizationId;
  if (organizationUnitId !== undefined) actor['organizationUnitId'] = organizationUnitId;
  return {
    tenantId: trimmedHeader(headers[TRUSTED_HEADER_NAMES.tenantId]) ?? '',
    actor,
  };
}

/**
 * Resolve identity from headers in both modes. Demo reads a synthesized body built from the
 * trusted headers; trusted_headers reads the verified headers directly (an absent JSON-body
 * identity is safe — the trusted resolver only rejects identity carried in a JSON body).
 */
export function resolveWorkflowAuth(
  resolver: AuthContextResolver,
  headers: Readonly<Record<string, string | undefined>>,
): Promise<AuthContext> {
  if (resolver.mode === 'demo') {
    return Promise.resolve(resolver.resolve({ headers, body: identityBodyFromHeaders(headers) }));
  }
  return Promise.resolve(resolver.resolve({ headers, body: undefined }));
}

export function requireTenant(auth: AuthContext): string {
  if (auth.tenantId.trim() === '') {
    throw new UnauthenticatedError('Workflow operations require a tenant identity.');
  }
  return auth.tenantId;
}

export function requireActorUserId(auth: AuthContext): string {
  if (auth.actor.userId.trim() === '') {
    throw new UnauthenticatedError('Workflow operations require an actor identity.');
  }
  return auth.actor.userId;
}
