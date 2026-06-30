import type { SecretProvider } from './SecretProvider.js';
import { EnvSecretProvider } from './EnvSecretProvider.js';
import {
  AzureKeyVaultSecretProvider,
  type KeyVaultSecretClient,
} from './AzureKeyVaultSecretProvider.js';

/** Supported secret-provider modes. `env` is the safe default; `key_vault` is opt-in. */
export type SecretProviderMode = 'env' | 'key_vault';

/**
 * Resolved secret-provider configuration. Carries only non-secret selection inputs: the mode,
 * the (public) vault URI, and an optional name prefix. No secret values live here.
 */
export interface SecretsConfig {
  readonly provider: SecretProviderMode;
  /** Vault URI when `provider === 'key_vault'`; empty string otherwise. */
  readonly keyVaultUri: string;
  /** Optional deterministic secret-name prefix; empty string when unset. */
  readonly keyVaultSecretPrefix: string;
}

export interface CreateSecretProviderOptions {
  /** Environment snapshot for the env provider (defaults to `process.env`). */
  readonly env?: Record<string, string | undefined>;
  /** Injected Key Vault client (tests/advanced wiring) to avoid constructing the Azure SDK. */
  readonly keyVaultClient?: KeyVaultSecretClient;
}

/**
 * Build a {@link SecretProvider} from validated {@link SecretsConfig}. The provider mode is
 * already constrained to the union by config validation, so the `default` branch is a
 * defensive fail-closed guard against an unexpected value.
 */
export function createSecretProvider(
  config: SecretsConfig,
  options: CreateSecretProviderOptions = {},
): SecretProvider {
  switch (config.provider) {
    case 'env':
      return new EnvSecretProvider(options.env);
    case 'key_vault':
      return new AzureKeyVaultSecretProvider({
        keyVaultUri: config.keyVaultUri,
        secretPrefix: config.keyVaultSecretPrefix,
        ...(options.keyVaultClient !== undefined ? { client: options.keyVaultClient } : {}),
      });
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`Unsupported secret provider: ${String(exhaustive)}`);
    }
  }
}
