import { describe, it, expect } from 'vitest';
import { DemoAuthContextResolver } from '../../../../src/http/auth/DemoAuthContextResolver.js';
import {
  TrustedHeadersAuthContextResolver,
  TRUSTED_HEADER_NAMES,
} from '../../../../src/http/auth/TrustedHeadersAuthContextResolver.js';
import { createAuthContextResolver } from '../../../../src/http/auth/AuthContextResolver.js';
import { UnauthenticatedError, ForbiddenError } from '../../../../src/http/auth/AuthErrors.js';
import { ErrorCode } from '../../../../src/shared/errors/AppError.js';
import type { AppConfig, AuthMode } from '../../../../src/config/index.js';

/**
 * Edge-identity resolver tests.
 *
 * Prove that identity at the HTTP boundary is derived from the TRUSTED source per mode:
 *  - demo: from the request body (local/demo only), preserving pre-auth behavior;
 *  - trusted_headers: from trusted x-house-* headers, rejecting body-supplied identity.
 */

function makeAppConfig(mode: AuthMode): AppConfig {
  // Only `.auth` matters to the factory; the rest is a minimal valid shape.
  return {
    appEnv: 'local',
    appRegion: 'canada',
    logLevel: 'info',
    databaseUrl: '',
    serviceBus: {
      enabled: false,
      connectionString: '',
      queueName: '',
      topicName: '',
      publishTarget: 'queue',
    },
    outbox: { batchSize: 25, lockSeconds: 120, baseDelayMs: 1000, maxDelayMs: 300_000, maxRetries: 10 },
    api: { host: '127.0.0.1', port: 3000 },
    outboxWorker: {
      enabled: true,
      intervalMs: 5000,
      batchSize: 25,
      workerId: 'local-outbox-worker',
      lockSeconds: 60,
      runOnce: false,
    },
    auth: { mode },
  };
}

describe('DemoAuthContextResolver', () => {
  const resolver = new DemoAuthContextResolver();

  // (1) Demo mode preserves the pre-auth behavior: tenant + actor come from the body.
  it('derives tenant and actor from the request body', () => {
    const ctx = resolver.resolve({
      headers: {},
      body: {
        tenantId: 'tenant-1',
        actor: { userId: 'user-1', roleKeys: ['reviewer'], permissionKeys: ['p1'] },
      },
    });
    expect(ctx.mode).toBe('demo');
    expect(ctx.tenantId).toBe('tenant-1');
    expect(ctx.actor.userId).toBe('user-1');
    expect(ctx.actor.roleKeys).toEqual(['reviewer']);
    expect(ctx.actor.permissionKeys).toEqual(['p1']);
  });

  // Demo mode lets blanks flow through (the domain boundary rejects them later).
  it('produces blanks when the body omits identity (domain validates later)', () => {
    const ctx = resolver.resolve({ headers: {}, body: {} });
    expect(ctx.tenantId).toBe('');
    expect(ctx.actor.userId).toBe('');
    expect(ctx.actor.roleKeys).toEqual([]);
    expect(ctx.actor.permissionKeys).toEqual([]);
  });

  it('ignores headers entirely in demo mode', () => {
    const ctx = resolver.resolve({
      headers: { [TRUSTED_HEADER_NAMES.tenantId]: 'header-tenant' },
      body: { tenantId: 'body-tenant', actor: { userId: 'u' } },
    });
    expect(ctx.tenantId).toBe('body-tenant');
  });
});

describe('TrustedHeadersAuthContextResolver', () => {
  const resolver = new TrustedHeadersAuthContextResolver();

  function headers(over: Record<string, string | undefined> = {}): Record<string, string | undefined> {
    return {
      [TRUSTED_HEADER_NAMES.tenantId]: 'tenant-1',
      [TRUSTED_HEADER_NAMES.actorUserId]: 'user-1',
      ...over,
    };
  }

  // (2) Derives tenantId from the trusted header.
  it('derives tenantId from x-house-tenant-id', () => {
    const ctx = resolver.resolve({ headers: headers(), body: undefined });
    expect(ctx.mode).toBe('trusted_headers');
    expect(ctx.tenantId).toBe('tenant-1');
  });

  // (3) Derives actor.userId from the trusted header.
  it('derives actor.userId from x-house-actor-user-id', () => {
    const ctx = resolver.resolve({ headers: headers(), body: undefined });
    expect(ctx.actor.userId).toBe('user-1');
  });

  // (4) Parses role keys from a comma-separated header.
  it('parses role keys from x-house-actor-role-keys', () => {
    const ctx = resolver.resolve({
      headers: headers({ [TRUSTED_HEADER_NAMES.actorRoleKeys]: 'reviewer, admin , reviewer' }),
      body: undefined,
    });
    expect(ctx.actor.roleKeys).toEqual(['reviewer', 'admin']);
  });

  // (5) Parses permission keys from a comma-separated header.
  it('parses permission keys from x-house-actor-permission-keys', () => {
    const ctx = resolver.resolve({
      headers: headers({ [TRUSTED_HEADER_NAMES.actorPermissionKeys]: 'p1,p2' }),
      body: undefined,
    });
    expect(ctx.actor.permissionKeys).toEqual(['p1', 'p2']);
  });

  it('carries optional scope and organization headers when present', () => {
    const ctx = resolver.resolve({
      headers: headers({
        [TRUSTED_HEADER_NAMES.scopeType]: 'national_organization',
        [TRUSTED_HEADER_NAMES.scopeId]: 'scope-9',
        [TRUSTED_HEADER_NAMES.organizationId]: 'org-9',
        [TRUSTED_HEADER_NAMES.organizationUnitId]: 'unit-9',
      }),
      body: undefined,
    });
    expect(ctx.actor.scopeType).toBe('national_organization');
    expect(ctx.actor.scopeId).toBe('scope-9');
    expect(ctx.actor.organizationId).toBe('org-9');
    expect(ctx.actor.organizationUnitId).toBe('unit-9');
  });

  it('omits an invalid scope type rather than trusting it', () => {
    const ctx = resolver.resolve({
      headers: headers({ [TRUSTED_HEADER_NAMES.scopeType]: 'galaxy' }),
      body: undefined,
    });
    expect(ctx.actor.scopeType).toBeUndefined();
  });

  // (6) Missing tenant header → 401 (unauthenticated).
  it('rejects a missing tenant header with UnauthenticatedError', () => {
    expect(() =>
      resolver.resolve({
        headers: { [TRUSTED_HEADER_NAMES.actorUserId]: 'user-1' },
        body: undefined,
      }),
    ).toThrow(UnauthenticatedError);
    try {
      resolver.resolve({ headers: { [TRUSTED_HEADER_NAMES.actorUserId]: 'u' }, body: undefined });
    } catch (err) {
      expect((err as UnauthenticatedError).code).toBe(ErrorCode.UNAUTHENTICATED);
    }
  });

  // (7) Missing actor user header → 401.
  it('rejects a missing actor user header with UnauthenticatedError', () => {
    expect(() =>
      resolver.resolve({
        headers: { [TRUSTED_HEADER_NAMES.tenantId]: 'tenant-1' },
        body: undefined,
      }),
    ).toThrow(UnauthenticatedError);
  });

  it('treats whitespace-only identity headers as missing', () => {
    expect(() =>
      resolver.resolve({
        headers: headers({ [TRUSTED_HEADER_NAMES.tenantId]: '   ' }),
        body: undefined,
      }),
    ).toThrow(UnauthenticatedError);
  });

  // (8) Body actor override → 403 (forbidden).
  it('rejects a body-supplied actor with ForbiddenError', () => {
    expect(() =>
      resolver.resolve({ headers: headers(), body: { actor: { userId: 'evil' } } }),
    ).toThrow(ForbiddenError);
  });

  // (9) Conflicting body tenantId → 403.
  it('rejects a body tenantId that conflicts with the trusted tenant', () => {
    expect(() =>
      resolver.resolve({ headers: headers(), body: { tenantId: 'other-tenant' } }),
    ).toThrow(ForbiddenError);
  });

  it('allows a body tenantId that matches the trusted tenant', () => {
    const ctx = resolver.resolve({ headers: headers(), body: { tenantId: 'tenant-1' } });
    expect(ctx.tenantId).toBe('tenant-1');
  });
});

describe('createAuthContextResolver', () => {
  it('selects the demo resolver for AUTH_MODE=demo', () => {
    expect(createAuthContextResolver(makeAppConfig('demo')).mode).toBe('demo');
  });

  it('selects the trusted-headers resolver for AUTH_MODE=trusted_headers', () => {
    expect(createAuthContextResolver(makeAppConfig('trusted_headers')).mode).toBe('trusted_headers');
  });
});

describe('trusted header contract (platform-core neutrality)', () => {
  // (18) No sport-specific terminology may leak into the platform-core identity contract.
  it('uses only NSO-generic header names (no sport-specific terms)', () => {
    const SPORT_TERMS =
      /curl|curler|bonspiel|hockey|skip|rink|sheet|ptso|club|league|team|athlete|coach/i;
    for (const name of Object.values(TRUSTED_HEADER_NAMES)) {
      expect(name).toMatch(/^x-house-[a-z-]+$/);
      expect(name).not.toMatch(SPORT_TERMS);
    }
  });
});
