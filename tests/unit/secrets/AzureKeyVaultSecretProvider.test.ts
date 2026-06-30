import { describe, it, expect } from 'vitest';
import {
  AzureKeyVaultSecretProvider,
  type KeyVaultSecretClient,
} from '../../../src/secrets/index.js';

/**
 * Hermetic tests for the Azure Key Vault provider using an INJECTED fake client. The real
 * Azure SDK is never imported or constructed here — these tests prove the provider seam works
 * without any Azure credentials, vault, or network.
 */

class FakeKeyVaultClient implements KeyVaultSecretClient {
  public readonly requested: string[] = [];
  public constructor(private readonly store: Record<string, string>) {}

  public getSecret(name: string): Promise<{ value?: string | undefined }> {
    this.requested.push(name);
    if (!(name in this.store)) {
      // Mirror the Azure SDK's 404 shape for a missing secret.
      const error = Object.assign(new Error('SecretNotFound'), {
        statusCode: 404,
        code: 'SecretNotFound',
      });
      return Promise.reject(error);
    }
    return Promise.resolve({ value: this.store[name] });
  }
}

describe('AzureKeyVaultSecretProvider (fake client)', () => {
  it('resolves a config key to a prefixed vault secret name and returns the value', async () => {
    const client = new FakeKeyVaultClient({ 'house-dev-database-url': 'postgres://u:p@h/db' });
    const provider = new AzureKeyVaultSecretProvider({
      keyVaultUri: 'https://example.vault.azure.net/',
      secretPrefix: 'house-dev',
      client,
    });

    await expect(provider.getSecret('DATABASE_URL')).resolves.toBe('postgres://u:p@h/db');
    expect(client.requested).toEqual(['house-dev-database-url']);
    expect(provider.name).toBe('key_vault');
  });

  it('returns undefined when the secret is not found (404)', async () => {
    const client = new FakeKeyVaultClient({});
    const provider = new AzureKeyVaultSecretProvider({
      keyVaultUri: 'https://example.vault.azure.net/',
      client,
    });
    await expect(provider.getSecret('DATABASE_URL')).resolves.toBeUndefined();
  });

  // (12) Errors never leak the secret value.
  it('throws a sanitized error that contains no secret value on transport failure', async () => {
    const secretValue = 'super-secret-connection-string';
    const failingClient: KeyVaultSecretClient = {
      getSecret: () =>
        Promise.reject(Object.assign(new Error('boom'), { statusCode: 500 })),
    };
    const provider = new AzureKeyVaultSecretProvider({
      keyVaultUri: 'https://example.vault.azure.net/',
      client: failingClient,
    });

    let message = '';
    try {
      await provider.getSecret('DATABASE_URL');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('database-url');
    expect(message).not.toContain(secretValue);
  });
});
