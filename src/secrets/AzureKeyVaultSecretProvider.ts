import type { SecretProvider } from './SecretProvider.js';
import { toSecretName } from './secretNames.js';

/**
 * Minimal structural contract for the Azure Key Vault secrets client. Declaring this locally
 * keeps {@link AzureKeyVaultSecretProvider} testable with an injected fake and avoids importing
 * the Azure SDK in default (hermetic) test runs. The real client (`@azure/keyvault-secrets`
 * `SecretClient`) satisfies this shape.
 */
export interface KeyVaultSecretClient {
  getSecret(name: string): Promise<{ value?: string | undefined }>;
}

export interface AzureKeyVaultSecretProviderOptions {
  /** Vault URI, e.g. `https://my-vault.vault.azure.net/`. */
  readonly keyVaultUri: string;
  /** Optional namespace prefix applied to every secret name (see {@link toSecretName}). */
  readonly secretPrefix?: string;
  /**
   * Optional pre-constructed client. When provided, the Azure SDK is never imported or
   * instantiated — used by tests to inject a fake. When omitted, a real `SecretClient` backed
   * by `DefaultAzureCredential` (managed identity in Azure) is created lazily on first use.
   */
  readonly client?: KeyVaultSecretClient;
}

/**
 * Optional secret provider backed by Azure Key Vault and a managed identity.
 *
 * Vendor isolation: this is the ONLY module that touches the Azure Key Vault / Identity SDKs,
 * and it does so behind a lazy dynamic import so default test runs never load Azure code. The
 * provider resolves a logical config key to a deterministic vault secret name (see
 * {@link toSecretName}) and fetches it. A missing secret resolves to `undefined`; transport or
 * auth failures throw an error that never contains secret material.
 */
export class AzureKeyVaultSecretProvider implements SecretProvider {
  public readonly name = 'key_vault';

  private readonly keyVaultUri: string;
  private readonly secretPrefix: string;
  private readonly injectedClient: KeyVaultSecretClient | undefined;
  private clientPromise: Promise<KeyVaultSecretClient> | undefined;

  public constructor(options: AzureKeyVaultSecretProviderOptions) {
    this.keyVaultUri = options.keyVaultUri;
    this.secretPrefix = options.secretPrefix ?? '';
    this.injectedClient = options.client;
  }

  public async getSecret(key: string): Promise<string | undefined> {
    const secretName = toSecretName(key, this.secretPrefix);
    const client = await this.resolveClient();

    try {
      const result = await client.getSecret(secretName);
      const value = result.value;
      return value === undefined || value === '' ? undefined : value;
    } catch (error: unknown) {
      if (isSecretNotFound(error)) {
        return undefined;
      }
      // Never include the secret value in error output. The secret *name* is safe to surface.
      throw new Error(
        `Key Vault secret retrieval failed for "${secretName}": ${describeError(error)}`,
      );
    }
  }

  private resolveClient(): Promise<KeyVaultSecretClient> {
    if (this.injectedClient !== undefined) {
      return Promise.resolve(this.injectedClient);
    }
    if (this.clientPromise === undefined) {
      this.clientPromise = createDefaultClient(this.keyVaultUri);
    }
    return this.clientPromise;
  }
}

/**
 * Lazily construct a real Key Vault client using a managed-identity-capable credential. The
 * Azure SDKs are imported dynamically so they are only loaded when a deployed runtime actually
 * selects the `key_vault` provider — never during default/local execution or hermetic tests.
 */
async function createDefaultClient(vaultUri: string): Promise<KeyVaultSecretClient> {
  const [{ SecretClient }, { DefaultAzureCredential }] = await Promise.all([
    import('@azure/keyvault-secrets'),
    import('@azure/identity'),
  ]);
  // DefaultAzureCredential prefers a managed identity in Azure and falls back to developer
  // credentials locally. No secrets are read until getSecret() is called.
  const credential = new DefaultAzureCredential();
  return new SecretClient(vaultUri, credential);
}

function isSecretNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { statusCode?: unknown; code?: unknown };
  return candidate.statusCode === 404 || candidate.code === 'SecretNotFound';
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'unknown error';
}
