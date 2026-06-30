import { describe, it, expect } from 'vitest';
import { EnvSecretProvider } from '../../../src/secrets/index.js';

/**
 * Hermetic tests for the default env-backed secret provider. No Azure, no network, no DB.
 * The env record is injected, so process.env is never read or mutated.
 */
describe('EnvSecretProvider', () => {
  // (1) Reads values from the injected environment.
  it('reads secret values from the environment record', async () => {
    const provider = new EnvSecretProvider({ DATABASE_URL: 'postgres://u:p@h/db' });
    await expect(provider.getSecret('DATABASE_URL')).resolves.toBe('postgres://u:p@h/db');
    expect(provider.name).toBe('env');
  });

  // (2) Returns undefined for missing / empty values.
  it('returns undefined for unset or empty values', async () => {
    const provider = new EnvSecretProvider({ EMPTY: '' });
    await expect(provider.getSecret('MISSING')).resolves.toBeUndefined();
    await expect(provider.getSecret('EMPTY')).resolves.toBeUndefined();
  });
});
