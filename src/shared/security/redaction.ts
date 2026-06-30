/**
 * Secret redaction utility (platform observability hardening).
 *
 * Pure, dependency-free, and defensive: produces a deep copy of an arbitrary value with
 * secret-like fields replaced by {@link REDACTED} and URL credentials scrubbed. Used by the
 * structured logger and config diagnostics so operational logs and diagnostic output never
 * leak connection strings, passwords, tokens, or keys.
 *
 * This is NOT encryption and NOT a security boundary — it is a fail-safe to keep secrets out
 * of stdout/stderr and log sinks. Real secret management (Key Vault / managed identity) is
 * out of scope for this pass.
 */

export const REDACTED = '[REDACTED]';

/**
 * Substrings (matched case-insensitively against a normalized key) that mark a field as
 * secret-like. Keys are normalized by lowercasing and stripping `_`/`-`/spaces, so
 * `DATABASE_URL` → `databaseurl` and `SERVICE_BUS_CONNECTION_STRING` →
 * `servicebusconnectionstring`.
 */
const SECRET_KEY_SUBSTRINGS: readonly string[] = [
  'databaseurl',
  'connectionstring',
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'accesskey',
  'privatekey',
  'sharedaccesskey',
  'credential',
  'authorization',
  'bearer',
  'key',
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, '');
}

/**
 * True when a field name looks like it carries a secret. Case-insensitive and
 * substring-aware (e.g. any key containing `password`, `token`, `secret`, `key`, or
 * `connectionString`).
 */
export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SECRET_KEY_SUBSTRINGS.some((needle) => normalized.includes(needle));
}

/**
 * Redact embedded credentials in a URL-like string. `postgres://user:pass@host/db` becomes
 * `postgres://user:[REDACTED]@host/db`. Strings without a `scheme://user:pass@` shape are
 * returned unchanged. Defensive against secrets that arrive under non-sensitive keys.
 */
export function redactUrlCredentials(value: string): string {
  // Match scheme://userinfo@ where userinfo contains a password segment (user:pass).
  return value.replace(
    /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/\s:@]+):[^@\s/]+@/g,
    `$1:${REDACTED}@`,
  );
}

function redactSensitiveValue(value: unknown): unknown {
  // Preserve "absent" markers so diagnostics can still show not-set fields.
  if (value === null || value === undefined) return value;
  if (value === '') return '';
  return REDACTED;
}

/**
 * Deep-copy `value`, redacting secret-like object keys and URL credentials. Never mutates
 * the input. Handles nested objects, arrays, and null/undefined safely.
 */
export function redactSecrets<T>(value: T): T {
  return redactNode(value, new WeakSet<object>()) as T;
}

function redactNode(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return redactUrlCredentials(value);

  if (typeof value !== 'object') return value;

  // Guard against cycles (defensive; logged objects are usually plain data).
  if (seen.has(value)) return REDACTED;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactNode(item, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? redactSensitiveValue(child) : redactNode(child, seen);
  }
  return out;
}
