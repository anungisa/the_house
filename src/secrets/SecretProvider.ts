/**
 * Secret-provider seam (managed identity / Key Vault binding baseline).
 *
 * A {@link SecretProvider} resolves a *logical config key* (the canonical environment variable
 * name, e.g. `DATABASE_URL`) to its secret value. Providers are vendor-isolated: the default
 * {@link EnvSecretProvider} reads `process.env`, while the optional Azure Key Vault provider
 * fetches from a vault using a managed identity. This interface is the only contract the config
 * loader depends on, so swapping providers never changes governance, workflow, or RLS semantics.
 *
 * Contract:
 * - `getSecret(key)` returns the resolved value, or `undefined` when the secret is absent.
 * - Implementations MUST NOT log secret values.
 * - Implementations MAY throw on transport/auth failures; callers decide whether a missing
 *   *required* secret should fail closed (see the async config loader).
 */
export interface SecretProvider {
  /** Stable identifier for diagnostics/logging (never includes secret material). */
  readonly name: string;

  /**
   * Resolve a logical config key (canonical env var name) to its secret value.
   * Returns `undefined` when the secret is not set. Never returns an empty-string placeholder
   * in place of a real value.
   */
  getSecret(key: string): Promise<string | undefined>;
}
