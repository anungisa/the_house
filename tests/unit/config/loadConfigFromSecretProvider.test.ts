import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfigFromSecretProvider } from '../../../src/config/index.js';
import type { SecretProvider } from '../../../src/secrets/index.js';

/**
 * Hermetic tests for the async secret-provider config path. A FAKE in-memory provider supplies
 * the required secrets — no Azure, no Key Vault, no network, no DB. process.env is snapshotted
 * and restored because loadConfig reads from it.
 */
const KEYS = ['APP_ENV', 'SECRET_PROVIDER', 'KEY_VAULT_URI', 'DATABASE_URL'] as const;

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

class FakeSecretProvider implements SecretProvider {
  public readonly name = 'fake';
  public constructor(private readonly values: Record<string, string>) {}
  public getSecret(key: string): Promise<string | undefined> {
    return Promise.resolve(this.values[key]);
  }
}

describe('loadConfigFromSecretProvider', () => {
  // (11) A fake provider supplies required secrets to the async loader.
  it('supplies required secrets from the provider so production-like config validates', async () => {
    process.env['APP_ENV'] = 'production';
    const provider = new FakeSecretProvider({
      DATABASE_URL: 'postgres://app:pw@db.internal:5432/house',
    });

    const cfg = await loadConfigFromSecretProvider({ provider });

    expect(cfg.appEnv).toBe('production');
    expect(cfg.databaseUrl).toBe('postgres://app:pw@db.internal:5432/house');
  });

  it('behaves like the sync loader under the default env provider', async () => {
    const cfg = await loadConfigFromSecretProvider();
    expect(cfg.appEnv).toBe('local');
    expect(cfg.secrets.provider).toBe('env');
  });
});
