import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/config/index.js';

/**
 * Unit tests for the entra_jwt auth-mode configuration (src/config/index.ts).
 *
 * Env is isolated per test. No network, no Microsoft Entra, no JWKS endpoint is contacted —
 * the loader only parses/validates strings.
 */

const CONFIG_KEYS = [
  'AUTH_MODE',
  'ENTRA_TENANT_ID',
  'ENTRA_ISSUER',
  'ENTRA_AUDIENCE',
  'ENTRA_JWKS_URI',
  'ENTRA_ROLE_CLAIM',
  'ENTRA_PERMISSION_CLAIM',
  'ENTRA_USER_ID_CLAIM',
  'ENTRA_TENANT_ID_CLAIM',
  'ENTRA_ORGANIZATION_ID_CLAIM',
  'ENTRA_ORGANIZATION_UNIT_ID_CLAIM',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of CONFIG_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of CONFIG_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function setValidEntraEnv(): void {
  process.env['AUTH_MODE'] = 'entra_jwt';
  process.env['ENTRA_ISSUER'] = 'https://login.microsoftonline.com/tenant/v2.0';
  process.env['ENTRA_AUDIENCE'] = 'api://house-v2';
  process.env['ENTRA_JWKS_URI'] = 'https://login.microsoftonline.com/tenant/discovery/v2.0/keys';
}

describe('entra_jwt config', () => {
  // (1) demo mode requires no Entra config.
  it('accepts demo mode without Entra config', () => {
    process.env['AUTH_MODE'] = 'demo';
    expect(loadConfig().auth.mode).toBe('demo');
    expect(loadConfig().auth.entra).toBeUndefined();
  });

  // (2) trusted_headers mode requires no Entra config.
  it('accepts trusted_headers mode without Entra config', () => {
    process.env['AUTH_MODE'] = 'trusted_headers';
    expect(loadConfig().auth.mode).toBe('trusted_headers');
    expect(loadConfig().auth.entra).toBeUndefined();
  });

  it('loads a full valid entra_jwt config with claim defaults', () => {
    setValidEntraEnv();
    const { auth } = loadConfig();
    expect(auth.mode).toBe('entra_jwt');
    expect(auth.entra).toBeDefined();
    expect(auth.entra?.issuer).toBe('https://login.microsoftonline.com/tenant/v2.0');
    expect(auth.entra?.audience).toBe('api://house-v2');
    expect(auth.entra?.userIdClaim).toBe('oid');
    expect(auth.entra?.tenantIdClaim).toBe('tid');
    expect(auth.entra?.roleClaim).toBe('roles');
    expect(auth.entra?.permissionClaim).toBe('scp');
  });

  it('honors overridden claim names', () => {
    setValidEntraEnv();
    process.env['ENTRA_USER_ID_CLAIM'] = 'sub';
    process.env['ENTRA_TENANT_ID_CLAIM'] = 'house_tid';
    process.env['ENTRA_ROLE_CLAIM'] = 'app_roles';
    process.env['ENTRA_PERMISSION_CLAIM'] = 'permissions';
    const entra = loadConfig().auth.entra;
    expect(entra?.userIdClaim).toBe('sub');
    expect(entra?.tenantIdClaim).toBe('house_tid');
    expect(entra?.roleClaim).toBe('app_roles');
    expect(entra?.permissionClaim).toBe('permissions');
  });

  // (3) entra_jwt without issuer fails closed.
  it('rejects entra_jwt without an issuer', () => {
    setValidEntraEnv();
    delete process.env['ENTRA_ISSUER'];
    expect(() => loadConfig()).toThrow(/ENTRA_ISSUER is required/);
  });

  // (4) entra_jwt without audience fails closed.
  it('rejects entra_jwt without an audience', () => {
    setValidEntraEnv();
    delete process.env['ENTRA_AUDIENCE'];
    expect(() => loadConfig()).toThrow(/ENTRA_AUDIENCE is required/);
  });

  // (5) entra_jwt without JWKS URI fails closed.
  it('rejects entra_jwt without a JWKS URI', () => {
    setValidEntraEnv();
    delete process.env['ENTRA_JWKS_URI'];
    expect(() => loadConfig()).toThrow(/ENTRA_JWKS_URI is required/);
  });

  // (6) entra_jwt with a malformed JWKS URI fails closed.
  it('rejects entra_jwt with a malformed JWKS URI', () => {
    setValidEntraEnv();
    process.env['ENTRA_JWKS_URI'] = 'not-a-url';
    expect(() => loadConfig()).toThrow(/Invalid ENTRA_JWKS_URI/);
  });

  it('rejects entra_jwt with a malformed issuer URL', () => {
    setValidEntraEnv();
    process.env['ENTRA_ISSUER'] = ':::::';
    expect(() => loadConfig()).toThrow(/Invalid ENTRA_ISSUER/);
  });
});
