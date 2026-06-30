import type { SecretProvider } from './SecretProvider.js';
import { SECRET_CONFIG_KEYS } from './secretNames.js';

/**
 * Resolve a set of logical config keys through a {@link SecretProvider} into a plain record of
 * `key -> value`. Only keys with a present value are included; missing secrets are simply
 * omitted so callers can fall back to existing env/defaults (local/dev must not require every
 * secret). Resolution order follows the provided key list, making the result deterministic.
 *
 * The returned record contains secret material — callers must never log it.
 */
export async function resolveSecrets(
  provider: SecretProvider,
  keys: readonly string[] = SECRET_CONFIG_KEYS,
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  for (const key of keys) {
    const value = await provider.getSecret(key);
    if (value !== undefined) {
      resolved[key] = value;
    }
  }
  return resolved;
}
