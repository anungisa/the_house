/**
 * Secret-provider seam barrel.
 *
 * Vendor-isolated secret delivery for The House v2. The default {@link EnvSecretProvider}
 * preserves existing local behavior (reads `process.env`); the optional
 * {@link AzureKeyVaultSecretProvider} fetches from Azure Key Vault using a managed identity.
 * Selection is driven by {@link SecretsConfig} via {@link createSecretProvider}.
 */
export type { SecretProvider } from './SecretProvider.js';
export { EnvSecretProvider } from './EnvSecretProvider.js';
export {
  AzureKeyVaultSecretProvider,
  type KeyVaultSecretClient,
  type AzureKeyVaultSecretProviderOptions,
} from './AzureKeyVaultSecretProvider.js';
export {
  createSecretProvider,
  type SecretProviderMode,
  type SecretsConfig,
  type CreateSecretProviderOptions,
} from './SecretProviderFactory.js';
export { resolveSecrets } from './SecretResolver.js';
export { toSecretName, SECRET_CONFIG_KEYS } from './secretNames.js';
