/**
 * Azure environment smoke-test entrypoint (`npm run smoke:azure`).
 *
 * DEFAULT-OFF and READ-ONLY. With `AZURE_SMOKE_ENABLED` unset/!= "true" this
 * prints a skipped result and exits 0 — so it is safe to wire anywhere without
 * cloud access. In LIVE mode (opt-in) it probes an ALREADY-DEPLOYED dev/test
 * environment over HTTPS for readiness, liveness, and authenticated/
 * unauthenticated read behaviour, then exits non-zero on any failure.
 *
 *   AZURE_SMOKE_ENABLED=true AZURE_SMOKE_BASE_URL=https://dev.example \
 *     AZURE_SMOKE_AUTH_TOKEN=<token> npm run smoke:azure
 *
 * It NEVER deploys, mutates governed state, uploads evidence, applies migrations,
 * pushes/signs images, or logs the bearer token. The only network access happens
 * in LIVE mode, against the explicitly-configured base URL.
 */

import { setTimeout, clearTimeout } from 'node:timers';

import {
  checkSmokePreconditions,
  loadSmokeConfigFromEnv,
  runAzureSmokeTests,
  type SmokeHttpClient,
  type SmokeHttpResponse,
} from '../src/deployment/AzureSmokeTestRunner.js';

/** Real HTTP client: a timeout-bounded GET over the global fetch. Read-only. */
const fetchClient: SmokeHttpClient = {
  async get(url, options): Promise<SmokeHttpResponse> {
    const controller = new globalThis.AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const res = await globalThis.fetch(url, {
        method: 'GET',
        headers: options.headers,
        signal: controller.signal,
      });
      const bodyText = await res.text();
      return { status: res.status, bodyText };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`request timed out after ${options.timeoutMs}ms`);
      }
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timer);
    }
  },
};

async function main(): Promise<void> {
  const config = loadSmokeConfigFromEnv(process.env);

  if (!config.enabled) {
    console.log(
      '[smoke] SKIPPED — AZURE_SMOKE_ENABLED is not "true". Live smoke checks are opt-in; ' +
        'default validation stays hermetic (no Azure / network / live URL).',
    );
    process.exit(0);
  }

  const preconditions = checkSmokePreconditions(config);
  if (!preconditions.ok) {
    console.error(`[smoke] configuration error: ${preconditions.error ?? 'invalid configuration'}`);
    process.exit(1);
  }

  console.log(
    `[smoke] LIVE mode against ${config.baseUrl} (expected env: ${config.expectedEnv}, ` +
      `timeout: ${String(config.timeoutMs)}ms). Read-only checks only.`,
  );

  const result = await runAzureSmokeTests(config, fetchClient);

  for (const check of result.checks) {
    const mark = check.ok ? 'PASS' : 'FAIL';
    console.log(`[${mark}] ${check.name} — ${check.detail}`);
  }

  if (result.ok) {
    console.log('\nAzure smoke checks OK.');
    process.exit(0);
  }

  const failures = result.checks.filter((c) => !c.ok);
  console.error(`\nAzure smoke checks FAILED (${String(failures.length)} problem(s)).`);
  process.exit(1);
}

void main();
