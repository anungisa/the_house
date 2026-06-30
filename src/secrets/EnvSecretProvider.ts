import type { SecretProvider } from './SecretProvider.js';

/**
 * Default secret provider: resolves logical config keys directly from a process environment
 * snapshot. This preserves the existing local/default behavior exactly — `getSecret('DATABASE_URL')`
 * returns `process.env.DATABASE_URL`. No network, no credentials, no Azure.
 */
export class EnvSecretProvider implements SecretProvider {
  public readonly name = 'env';

  /**
   * @param env Environment record to read from. Defaults to `process.env`. Injectable for tests.
   */
  public constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  public getSecret(key: string): Promise<string | undefined> {
    const value = this.env[key];
    // Treat unset and empty-string identically as "absent" so callers fall back to defaults.
    if (value === undefined || value === '') {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(value);
  }
}
