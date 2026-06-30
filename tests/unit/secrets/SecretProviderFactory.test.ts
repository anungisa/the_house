import { describe, it, expect } from 'vitest';
import {
  createSecretProvider,
  EnvSecretProvider,
  AzureKeyVaultSecretProvider,
  type KeyVaultSecretClient,
} from '../../../src/secrets/index.js';

/**
 * Hermetic tests for the secret-provider factory. No Azure SDK is constructed for the env
 * path, and the key_vault path is exercised only with an injected fake client.
 */
describe('createSecretProvider', () => {
  // (15) The default/env mode never constructs the Azure provider.
  it('returns the env provider for provider=env', () => {
    const provider = createSecretProvider(
      { provider: 'env', keyVaultUri: '', keyVaultSecretPrefix: '' },
      { env: { DATABASE_URL: 'x' } },
    );
    expect(provider).toBeInstanceOf(EnvSecretProvider);
    expect(provider.name).toBe('env');
  });

  it('returns the Azure Key Vault provider for provider=key_vault using an injected client', async () => {
    const client: KeyVaultSecretClient = {
      getSecret: (name) =>
        Promise.resolve({ value: name === 'database-url' ? 'from-vault' : undefined }),
    };
    const provider = createSecretProvider(
      { provider: 'key_vault', keyVaultUri: 'https://v.vault.azure.net/', keyVaultSecretPrefix: '' },
      { keyVaultClient: client },
    );
    expect(provider).toBeInstanceOf(AzureKeyVaultSecretProvider);
    await expect(provider.getSecret('DATABASE_URL')).resolves.toBe('from-vault');
  });
});
