/**
 * Deterministic mapping from logical config keys (canonical environment variable names) to
 * vault-friendly secret names, plus the catalog of config keys that may be sourced from a
 * secret provider.
 *
 * The mapping is pure and stable so that infrastructure operators can pre-populate a Key Vault
 * with predictable secret names. Azure Key Vault secret names accept only alphanumerics and
 * hyphens, so the convention is: lowercase, replace `_` with `-`, and prefix with an optional
 * operator-supplied namespace (also normalized). Example: `DATABASE_URL` with prefix
 * `house-dev` becomes `house-dev-database-url`.
 */

/**
 * Canonical config keys (env var names) that a deployed runtime may resolve through a secret
 * provider. These are the sensitive connection/credential values; non-secret toggles
 * (NODE_ENV, LOG_LEVEL, feature flags) are NOT sourced from the provider.
 *
 * Local/dev (env provider) does NOT require all of these — they are resolved only when present.
 */
export const SECRET_CONFIG_KEYS: readonly string[] = [
  'DATABASE_URL',
  'MIGRATE_DATABASE_URL',
  'SERVICE_BUS_CONNECTION_STRING',
  'EVIDENCE_BLOB_CONNECTION_STRING',
  'ENTRA_ISSUER',
  'ENTRA_AUDIENCE',
  'ENTRA_JWKS_URI',
];

/**
 * Normalize a single path segment to the Key Vault secret-name alphabet (lowercase
 * alphanumerics and single hyphens). Underscores and other separators collapse to hyphens.
 */
function normalizeSegment(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Compute the deterministic vault secret name for a logical config key.
 *
 * @param key Canonical config key (e.g. `DATABASE_URL`).
 * @param prefix Optional operator-supplied namespace (e.g. `house-dev`). Empty/blank means none.
 * @returns A Key-Vault-safe secret name, e.g. `house-dev-database-url` or `database-url`.
 */
export function toSecretName(key: string, prefix = ''): string {
  const base = normalizeSegment(key);
  const ns = normalizeSegment(prefix);
  return ns ? `${ns}-${base}` : base;
}
