import { describe, it, expect } from 'vitest';
import { toSecretName, SECRET_CONFIG_KEYS } from '../../../src/secrets/index.js';

/**
 * Hermetic tests for the deterministic config-key -> vault-secret-name mapping.
 */
describe('toSecretName', () => {
  // (3) Mapping is deterministic and vault-safe (lowercase, hyphenated).
  it('maps a config key to a deterministic lowercase hyphenated name', () => {
    expect(toSecretName('DATABASE_URL')).toBe('database-url');
    expect(toSecretName('SERVICE_BUS_CONNECTION_STRING')).toBe('service-bus-connection-string');
    // Stable across calls.
    expect(toSecretName('ENTRA_JWKS_URI')).toBe(toSecretName('ENTRA_JWKS_URI'));
  });

  // (4) Prefix is applied deterministically and normalized.
  it('applies an optional prefix deterministically', () => {
    expect(toSecretName('DATABASE_URL', 'house-dev')).toBe('house-dev-database-url');
    expect(toSecretName('DATABASE_URL', 'House_Dev')).toBe('house-dev-database-url');
    // Empty/blank prefix is a no-op.
    expect(toSecretName('DATABASE_URL', '')).toBe('database-url');
    expect(toSecretName('DATABASE_URL', '   ')).toBe('database-url');
  });

  it('produces only Key-Vault-safe characters for every catalog key', () => {
    for (const key of SECRET_CONFIG_KEYS) {
      expect(toSecretName(key, 'house-prod')).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
