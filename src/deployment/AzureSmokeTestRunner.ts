/**
 * Optional Azure environment smoke-test runner (DEFAULT-OFF, READ-ONLY).
 *
 * This is an environment VERIFICATION layer, not deployment automation. It probes
 * a *already-deployed* dev/test environment over HTTP to confirm it is reachable,
 * ready, and enforcing authentication — nothing more. It is invoked only by the
 * opt-in `npm run smoke:azure` script (scripts/azure-smoke-test.ts) and the
 * guarded, manual production-deploy-template workflow.
 *
 * Safety guarantees:
 *  - LIVE mode is refused unless `AZURE_SMOKE_ENABLED=true`; otherwise the runner
 *    reports a skipped result and the caller exits 0.
 *  - Only HTTPS base URLs are accepted (localhost may use http for local tests).
 *  - All checks are READ-ONLY GETs. It NEVER creates or transitions a domain
 *    record, uploads evidence bytes, applies migrations, or mutates any state.
 *  - Mutation checks are out of scope even when `AZURE_SMOKE_ALLOW_MUTATION=true`.
 *  - The bearer token is never logged; it is redacted from every result detail.
 *  - The HTTP client is INJECTED, so the unit tests exercise this logic with a
 *    fake client and never touch the network, Azure, a DB, or a real app URL.
 */

import { REDACTED } from '../shared/security/redaction.js';
import { URL } from 'node:url';

/** Resolved, validated smoke-test configuration. */
export interface SmokeConfig {
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly expectedEnv: string;
  readonly requireAuth: boolean;
  readonly authToken: string;
  readonly allowMutation: boolean;
  readonly timeoutMs: number;
  readonly readinessPath: string;
  readonly healthPath: string;
  readonly authedReadPath: string;
}

/** A single smoke-check outcome. */
export interface SmokeCheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Aggregated smoke-run outcome. */
export interface SmokeRunResult {
  readonly ok: boolean;
  /** True when the run was skipped (live mode not enabled). */
  readonly skipped: boolean;
  readonly checks: readonly SmokeCheckResult[];
}

/** Minimal HTTP response shape the runner reasons about. */
export interface SmokeHttpResponse {
  readonly status: number;
  readonly bodyText: string;
}

/** Injected read-only HTTP client (real impl in scripts/azure-smoke-test.ts). */
export interface SmokeHttpClient {
  get(
    url: string,
    options: { readonly headers: Record<string, string>; readonly timeoutMs: number },
  ): Promise<SmokeHttpResponse>;
}

export const DEFAULT_SMOKE_TIMEOUT_MS = 10000;
const DEFAULT_READINESS_PATH = '/readyz';
const DEFAULT_HEALTH_PATH = '/healthz';
const DEFAULT_AUTHED_READ_PATH = '/v1/workflows';

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePath(raw: string | undefined, fallback: string): string {
  const value = (raw ?? '').trim();
  if (value === '') return fallback;
  return value.startsWith('/') ? value : `/${value}`;
}

/**
 * Build a {@link SmokeConfig} from an environment bag. Pure: reads only the
 * provided record, performs no I/O, and never logs. `AZURE_SMOKE_ENABLED` must be
 * exactly `"true"` to enable live mode (anything else stays disabled / hermetic).
 */
export function loadSmokeConfigFromEnv(env: Record<string, string | undefined>): SmokeConfig {
  return {
    enabled: (env['AZURE_SMOKE_ENABLED'] ?? '').trim().toLowerCase() === 'true',
    baseUrl: (env['AZURE_SMOKE_BASE_URL'] ?? '').trim(),
    expectedEnv: (env['AZURE_SMOKE_EXPECTED_ENV'] ?? 'dev').trim(),
    // Default-on: authenticated behaviour is verified unless explicitly disabled.
    requireAuth: (env['AZURE_SMOKE_REQUIRE_AUTH'] ?? 'true').trim().toLowerCase() !== 'false',
    authToken: (env['AZURE_SMOKE_AUTH_TOKEN'] ?? '').trim(),
    allowMutation: (env['AZURE_SMOKE_ALLOW_MUTATION'] ?? '').trim().toLowerCase() === 'true',
    timeoutMs: parsePositiveInt(env['AZURE_SMOKE_TIMEOUT_MS'], DEFAULT_SMOKE_TIMEOUT_MS),
    readinessPath: normalizePath(env['AZURE_SMOKE_READINESS_PATH'], DEFAULT_READINESS_PATH),
    healthPath: normalizePath(env['AZURE_SMOKE_HEALTH_PATH'], DEFAULT_HEALTH_PATH),
    authedReadPath: normalizePath(env['AZURE_SMOKE_AUTHED_READ_PATH'], DEFAULT_AUTHED_READ_PATH),
  };
}

/** True when the URL host is a loopback address (http permitted for local tests). */
function isLocalhost(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
}

/**
 * Validate live-mode preconditions WITHOUT making any request. Returns the first
 * problem (if any) so the caller can refuse to run a misconfigured live smoke.
 */
export function checkSmokePreconditions(config: SmokeConfig): { ok: boolean; error?: string } {
  if (config.baseUrl === '') {
    return { ok: false, error: 'AZURE_SMOKE_BASE_URL is required when AZURE_SMOKE_ENABLED=true.' };
  }

  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    return { ok: false, error: `AZURE_SMOKE_BASE_URL is not a valid URL: ${config.baseUrl}` };
  }

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost(url))) {
    return {
      ok: false,
      error: `AZURE_SMOKE_BASE_URL must be https (http allowed only for localhost): ${config.baseUrl}`,
    };
  }

  if (config.requireAuth && config.authToken === '') {
    return {
      ok: false,
      error:
        'AZURE_SMOKE_REQUIRE_AUTH=true but AZURE_SMOKE_AUTH_TOKEN is not set. Provide a token or ' +
        'set AZURE_SMOKE_REQUIRE_AUTH=false to skip authenticated checks.',
    };
  }

  return { ok: true };
}

/** Replace any occurrence of the bearer token with the redaction marker. */
function redactToken(text: string, token: string): string {
  return token === '' ? text : text.split(token).join(REDACTED);
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

/**
 * Execute the read-only smoke checks against the configured environment using the
 * injected HTTP client. Assumes {@link checkSmokePreconditions} already passed.
 * NEVER mutates anything: readiness, liveness, and (when a token is supplied)
 * authenticated/unauthenticated read behaviour only.
 */
export async function runAzureSmokeTests(
  config: SmokeConfig,
  client: SmokeHttpClient,
): Promise<SmokeRunResult> {
  if (!config.enabled) {
    return {
      ok: true,
      skipped: true,
      checks: [
        {
          name: 'live smoke disabled',
          ok: true,
          detail: 'AZURE_SMOKE_ENABLED is not "true"; skipping live checks (hermetic).',
        },
      ],
    };
  }

  const checks: SmokeCheckResult[] = [];
  const redact = (text: string): string => redactToken(text, config.authToken);

  const record = async (
    name: string,
    run: () => Promise<string>,
  ): Promise<void> => {
    try {
      const detail = await run();
      checks.push({ name, ok: true, detail: redact(detail) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checks.push({ name, ok: false, detail: redact(message) });
    }
  };

  // Readiness — bounded dependency probe; 200 + status "ok" expected.
  await record(`readiness GET ${config.readinessPath}`, async () => {
    const res = await client.get(joinUrl(config.baseUrl, config.readinessPath), {
      headers: {},
      timeoutMs: config.timeoutMs,
    });
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    return 'ready (200)';
  });

  // Liveness — shallow, unauthenticated, safe.
  await record(`liveness GET ${config.healthPath}`, async () => {
    const res = await client.get(joinUrl(config.baseUrl, config.healthPath), {
      headers: {},
      timeoutMs: config.timeoutMs,
    });
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    return 'alive (200)';
  });

  // Authenticated + unauthenticated read behaviour — only when a token is supplied.
  if (config.authToken !== '') {
    await record(`authenticated read GET ${config.authedReadPath}`, async () => {
      const res = await client.get(joinUrl(config.baseUrl, config.authedReadPath), {
        headers: { authorization: `Bearer ${config.authToken}` },
        timeoutMs: config.timeoutMs,
      });
      if (res.status !== 200) throw new Error(`expected 200 with a valid token, got ${res.status}`);
      return 'authenticated read returned 200';
    });

    await record(`unauthenticated read rejected GET ${config.authedReadPath}`, async () => {
      const res = await client.get(joinUrl(config.baseUrl, config.authedReadPath), {
        headers: {},
        timeoutMs: config.timeoutMs,
      });
      if (res.status !== 401 && res.status !== 403) {
        throw new Error(`expected 401/403 without a token, got ${res.status}`);
      }
      return `unauthenticated read rejected (${res.status})`;
    });
  } else if (config.requireAuth) {
    checks.push({
      name: 'authenticated read',
      ok: false,
      detail: 'AZURE_SMOKE_REQUIRE_AUTH=true but no AZURE_SMOKE_AUTH_TOKEN supplied.',
    });
  } else {
    checks.push({
      name: 'authenticated read',
      ok: true,
      detail: 'skipped (no token; AZURE_SMOKE_REQUIRE_AUTH=false).',
    });
  }

  // Mutation checks are intentionally NOT implemented; this is a read-only baseline.
  if (config.allowMutation) {
    checks.push({
      name: 'mutation checks',
      ok: true,
      detail:
        'AZURE_SMOKE_ALLOW_MUTATION=true, but mutation smoke checks are intentionally OUT OF ' +
        'SCOPE — this baseline never creates or transitions governed records.',
    });
  }

  return { ok: checks.every((c) => c.ok), skipped: false, checks };
}
