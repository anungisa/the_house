import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/config/index.js';
import { buildConfigDiagnostics } from '../../../src/config/diagnostics.js';

/**
 * Hermetic tests for SECRET_PROVIDER / KEY_VAULT_* config validation. Env is snapshotted and
 * cleared per test. No Azure, no Key Vault, no network — only string validation is exercised.
 */
const KEYS = [
  'APP_ENV',
  'SECRET_PROVIDER',
  'KEY_VAULT_URI',
  'KEY_VAULT_SECRET_PREFIX',
  'DATABASE_URL',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    const original = saved[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

describe('secret-provider config', () => {
  // (5) Defaults to env.
  it('defaults SECRET_PROVIDER to env with no Key Vault settings', () => {
    const cfg = loadConfig();
    expect(cfg.secrets.provider).toBe('env');
    expect(cfg.secrets.keyVaultUri).toBe('');
    expect(cfg.secrets.keyVaultSecretPrefix).toBe('');
  });

  // (10) Env-only behavior is unchanged for the rest of config.
  it('preserves env-only config behavior under the default provider', () => {
    const cfg = loadConfig();
    expect(cfg.appEnv).toBe('local');
    expect(cfg.databaseUrl).toBe('');
  });

  // (6) Unknown provider fails closed.
  it('fails closed on an unknown SECRET_PROVIDER', () => {
    process.env['SECRET_PROVIDER'] = 'vault-of-doom';
    expect(() => loadConfig()).toThrow(/Invalid SECRET_PROVIDER/);
  });

  // (7) key_vault requires KEY_VAULT_URI.
  it('requires KEY_VAULT_URI when SECRET_PROVIDER=key_vault', () => {
    process.env['SECRET_PROVIDER'] = 'key_vault';
    expect(() => loadConfig()).toThrow(/KEY_VAULT_URI is required/);
  });

  // (8) key_vault rejects a non-HTTPS URI.
  it('rejects a non-HTTPS KEY_VAULT_URI', () => {
    process.env['SECRET_PROVIDER'] = 'key_vault';
    process.env['KEY_VAULT_URI'] = 'http://insecure.vault.example/';
    expect(() => loadConfig()).toThrow(/must be an https URL/);
  });

  it('accepts a valid HTTPS KEY_VAULT_URI and optional prefix', () => {
    process.env['SECRET_PROVIDER'] = 'key_vault';
    process.env['KEY_VAULT_URI'] = 'https://house-dev.vault.azure.net/';
    process.env['KEY_VAULT_SECRET_PREFIX'] = 'house-dev';
    const cfg = loadConfig();
    expect(cfg.secrets.provider).toBe('key_vault');
    expect(cfg.secrets.keyVaultUri).toBe('https://house-dev.vault.azure.net/');
    expect(cfg.secrets.keyVaultSecretPrefix).toBe('house-dev');
  });

  // (9) Diagnostics reports the provider mode without exposing secrets.
  it('reports provider mode in diagnostics without secret values', () => {
    process.env['SECRET_PROVIDER'] = 'key_vault';
    process.env['KEY_VAULT_URI'] = 'https://house-dev.vault.azure.net/';
    process.env['DATABASE_URL'] = 'postgres://admin:topsecret@db.internal/house';
    const { summary } = buildConfigDiagnostics(loadConfig());
    const vault = (summary as { vault: Record<string, unknown> }).vault;
    expect(vault.provider).toBe('key_vault');
    expect(vault.uriConfigured).toBe(true);
    // No secret values anywhere in the serialized summary.
    expect(JSON.stringify(summary)).not.toContain('topsecret');
  });
});
