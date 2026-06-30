import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { validateAzureSmokeBaseline } from '../../../src/deployment/validateAzureSmokeBaseline.js';
import {
  checkSmokePreconditions,
  loadSmokeConfigFromEnv,
  runAzureSmokeTests,
  type SmokeConfig,
  type SmokeHttpClient,
  type SmokeHttpResponse,
} from '../../../src/deployment/AzureSmokeTestRunner.js';

/**
 * Hermetic tests for the Azure environment smoke-test baseline: the static
 * validator and the read-only live runner. Fully static / in-process: they read
 * repo files, build temp fixtures, and drive the runner with an INJECTED fake
 * HTTP client. They NEVER call Azure, the Azure CLI, a live app URL, the network,
 * a database, Service Bus, Key Vault, Docker, a registry, Cosign, or require
 * credentials, and they never enable live mode against a real environment.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');

// --- static validator fixtures ----------------------------------------------

const tempRoots: string[] = [];

const VALID_DEPLOY_TEMPLATE = [
  'name: production-deploy-template',
  'on:',
  '  workflow_dispatch:',
  '    inputs:',
  '      confirm:',
  '        type: string',
  '      run_smoke_tests:',
  '        type: boolean',
  'jobs:',
  '  deploy:',
  "    if: ${{ inputs.confirm == 'DEPLOY' }}",
  '    steps:',
  '      - name: Post-deploy Azure smoke tests (read-only, manual, guarded)',
  '        if: ${{ inputs.run_smoke_tests == true }}',
  '        run: npm run smoke:azure',
  '',
].join('\n');

const VALID_CI = [
  'name: ci',
  'jobs:',
  '  validate:',
  '    steps:',
  '      - run: npm test',
  '      - run: npm run smoke:check',
  '',
].join('\n');

const VALID_PACKAGE_JSON = JSON.stringify(
  {
    name: 'fixture',
    scripts: {
      'smoke:check': 'tsx scripts/validate-azure-smoke-baseline.ts',
      'smoke:azure': 'tsx scripts/azure-smoke-test.ts',
      'ci:check': 'npm run build && npm run smoke:check',
    },
  },
  null,
  2,
);

const VALID_ENV = ['AZURE_SMOKE_ENABLED=false', 'AZURE_SMOKE_BASE_URL=', ''].join('\n');

function baseFiles(): Record<string, string | null> {
  return {
    'docs/architecture/azure-environment-smoke-test-baseline.md':
      '# Azure Environment Smoke-Test Baseline\n',
    'src/deployment/AzureSmokeTestRunner.ts':
      'export const GUARD = "live mode requires AZURE_SMOKE_ENABLED=true";\n',
    'scripts/azure-smoke-test.ts':
      'if ((process.env.AZURE_SMOKE_ENABLED ?? "") !== "true") process.exit(0);\n',
    'scripts/validate-azure-smoke-baseline.ts': '// smoke:check CLI wrapper\n',
    'src/deployment/validateAzureSmokeBaseline.ts': '// smoke static validator\n',
    '.github/workflows/production-deploy-template.yml': VALID_DEPLOY_TEMPLATE,
    '.github/workflows/ci.yml': VALID_CI,
    'package.json': VALID_PACKAGE_JSON,
    '.env.example': VALID_ENV,
  };
}

function writeRepo(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'house-smoke-'));
  tempRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
  return root;
}

function checkOk(root: string, name: string): boolean {
  const result = validateAzureSmokeBaseline(root);
  return result.checks.find((c) => c.name === name)?.ok ?? false;
}

// --- live-runner fixtures (fake client; no network) -------------------------

interface RecordedCall {
  readonly url: string;
  readonly headers: Record<string, string>;
}

function makeClient(
  handler: (url: string, headers: Record<string, string>) => Promise<SmokeHttpResponse>,
): { client: SmokeHttpClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const client: SmokeHttpClient = {
    async get(url, options): Promise<SmokeHttpResponse> {
      calls.push({ url, headers: options.headers });
      return handler(url, options.headers);
    },
  };
  return { client, calls };
}

function liveConfig(overrides: Partial<SmokeConfig> = {}): SmokeConfig {
  return {
    enabled: true,
    baseUrl: 'https://dev.example',
    expectedEnv: 'dev',
    requireAuth: false,
    authToken: '',
    allowMutation: false,
    timeoutMs: 5000,
    readinessPath: '/readyz',
    healthPath: '/healthz',
    authedReadPath: '/v1/workflows',
    ...overrides,
  };
}

const ok200: SmokeHttpResponse = { status: 200, bodyText: '{"status":"ok"}' };

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------

describe('validateAzureSmokeBaseline (static checks)', () => {
  // (1) Passes on the current repository.
  it('passes on the current repository', () => {
    const result = validateAzureSmokeBaseline(REPO_ROOT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // (2) Passes on a complete valid fixture.
  it('passes on a complete valid fixture', () => {
    const result = validateAzureSmokeBaseline(writeRepo(baseFiles()));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // (3) Fails if the smoke doc is missing.
  it('fails when the smoke-test doc is missing', () => {
    const files = baseFiles();
    files['docs/architecture/azure-environment-smoke-test-baseline.md'] = null;
    const root = writeRepo(files);
    expect(validateAzureSmokeBaseline(root).ok).toBe(false);
    expect(checkOk(root, 'Azure smoke-test baseline doc exists')).toBe(false);
  });

  // (4) Fails if the smoke runner script is missing.
  it('fails when the smoke runner is missing', () => {
    const files = baseFiles();
    files['scripts/azure-smoke-test.ts'] = null;
    const root = writeRepo(files);
    expect(checkOk(root, 'smoke runner module + script exist')).toBe(false);
  });

  // (5) Fails if smoke:check script is missing.
  it('fails when smoke:check script is missing', () => {
    const files = baseFiles();
    files['package.json'] = JSON.stringify({
      scripts: { 'smoke:azure': 'tsx x.ts', 'ci:check': 'npm run build' },
    });
    const root = writeRepo(files);
    expect(checkOk(root, 'package.json defines smoke:check and smoke:azure')).toBe(false);
  });

  // (6) Fails if ci:check does not chain smoke:check.
  it('fails when ci:check omits smoke:check', () => {
    const files = baseFiles();
    files['package.json'] = JSON.stringify({
      scripts: {
        'smoke:check': 'tsx a.ts',
        'smoke:azure': 'tsx b.ts',
        'ci:check': 'npm run build',
      },
    });
    const root = writeRepo(files);
    expect(checkOk(root, 'ci:check includes smoke:check')).toBe(false);
  });

  // (7) Fails if the deploy template lacks the guarded smoke placeholder.
  it('fails when production-deploy-template.yml lacks the smoke placeholder', () => {
    const files = baseFiles();
    files['.github/workflows/production-deploy-template.yml'] = [
      'name: production-deploy-template',
      'on:',
      '  workflow_dispatch:',
      'jobs:',
      '  deploy:',
      "    if: ${{ inputs.confirm == 'DEPLOY' }}",
      '    steps:',
      '      - run: echo deploy',
      '',
    ].join('\n');
    const root = writeRepo(files);
    expect(
      checkOk(root, 'production-deploy-template.yml has a guarded post-deploy smoke placeholder'),
    ).toBe(false);
  });

  // (8) Fails on a secret-like value in a smoke file.
  it('fails on a secret-like value in a smoke file', () => {
    const files = baseFiles();
    files['docs/architecture/azure-environment-smoke-test-baseline.md'] =
      '# Smoke\n\nExample: postgres://svc:Hunter2Hunter2@dbhost/app\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'no secret-like values in smoke files')).toBe(false);
  });

  // (9) Fails on sport-specific terminology in a smoke file.
  it('fails on sport-specific terminology in a smoke file', () => {
    const files = baseFiles();
    files['docs/architecture/azure-environment-smoke-test-baseline.md'] =
      '# Smoke\n\nThis curling bonspiel detail must not appear.\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'no sport-specific terminology in smoke files')).toBe(false);
  });

  // (19) The DEFAULT CI workflow does not call smoke:azure.
  it('confirms the real ci.yml does not call smoke:azure', () => {
    const ci = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain('npm run smoke:check');
    expect(ci).not.toContain('smoke:azure');
    expect(checkOk(REPO_ROOT, 'default CI workflow does not call a live URL')).toBe(true);
    expect(checkOk(REPO_ROOT, 'default CI workflow requires no Azure credentials')).toBe(true);
  });

  // (20) The real deploy-template smoke step is manual/guarded only.
  it('confirms the real deploy template smoke step is guarded by run_smoke_tests', () => {
    const tpl = readFileSync(
      join(REPO_ROOT, '.github/workflows/production-deploy-template.yml'),
      'utf8',
    );
    expect(tpl).toContain('run_smoke_tests');
    expect(tpl).toContain('if: ${{ inputs.run_smoke_tests == true }}');
    expect(tpl).toContain('npm run smoke:azure');
  });
});

describe('AzureSmokeTestRunner (read-only live runner; injected fake client)', () => {
  // (9) Skipped when AZURE_SMOKE_ENABLED is not true.
  it('returns a skipped result when live mode is not enabled', async () => {
    const config = loadSmokeConfigFromEnv({});
    expect(config.enabled).toBe(false);
    const { client, calls } = makeClient(async () => ok200);
    const result = await runAzureSmokeTests(config, client);
    expect(result.skipped).toBe(true);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(0); // never called the client
  });

  // (10) Requires AZURE_SMOKE_BASE_URL when enabled.
  it('precondition fails when base URL is missing in live mode', () => {
    const config = loadSmokeConfigFromEnv({ AZURE_SMOKE_ENABLED: 'true' });
    const pre = checkSmokePreconditions(config);
    expect(pre.ok).toBe(false);
    expect(pre.error).toMatch(/AZURE_SMOKE_BASE_URL is required/);
  });

  // (11) Rejects non-HTTPS base URL except localhost.
  it('precondition rejects non-HTTPS except localhost', () => {
    expect(
      checkSmokePreconditions(liveConfig({ baseUrl: 'http://dev.example' })).ok,
    ).toBe(false);
    expect(
      checkSmokePreconditions(liveConfig({ baseUrl: 'http://localhost:3000' })).ok,
    ).toBe(true);
    expect(checkSmokePreconditions(liveConfig({ baseUrl: 'https://dev.example' })).ok).toBe(true);
  });

  // (12) Redacts the auth token in error details.
  it('redacts the auth token in failure details', async () => {
    const token = 'secrettoken12345';
    const { client } = makeClient(async (url, headers) => {
      if (url.endsWith('/readyz') || url.endsWith('/healthz')) return ok200;
      // Authenticated read: simulate an upstream error that echoes the token.
      if (headers['authorization'] !== undefined) {
        throw new Error(`upstream 500: token=${token} rejected`);
      }
      return { status: 401, bodyText: '' };
    });
    const result = await runAzureSmokeTests(
      liveConfig({ requireAuth: true, authToken: token }),
      client,
    );
    const authedCheck = result.checks.find((c) => c.name.startsWith('authenticated read'));
    expect(authedCheck?.ok).toBe(false);
    expect(authedCheck?.detail).toContain('[REDACTED]');
    expect(JSON.stringify(result.checks)).not.toContain(token);
  });

  // (13) Does not perform mutation checks by default.
  it('performs no mutation checks by default', async () => {
    const { client } = makeClient(async () => ok200);
    const result = await runAzureSmokeTests(liveConfig(), client);
    expect(result.checks.find((c) => c.name === 'mutation checks')).toBeUndefined();
  });

  // (14) Uses the injected fake HTTP client.
  it('drives all checks through the injected client', async () => {
    const { client, calls } = makeClient(async () => ok200);
    await runAzureSmokeTests(liveConfig(), client);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.some((c) => c.url.endsWith('/readyz'))).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/healthz'))).toBe(true);
  });

  // (15) Live readiness success returns pass.
  it('passes readiness/liveness when the environment is healthy', async () => {
    const { client } = makeClient(async () => ok200);
    const result = await runAzureSmokeTests(liveConfig(), client);
    expect(result.skipped).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.checks.find((c) => c.name.startsWith('readiness'))?.ok).toBe(true);
  });

  // (16) Live readiness failure returns fail.
  it('fails readiness when the environment is not ready', async () => {
    const { client } = makeClient(async (url) =>
      url.endsWith('/readyz') ? { status: 503, bodyText: '{"status":"not_ready"}' } : ok200,
    );
    const result = await runAzureSmokeTests(liveConfig(), client);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name.startsWith('readiness'))?.ok).toBe(false);
  });

  // (17) Timeout behaviour is surfaced as a failed check.
  it('records a timeout as a failed readiness check', async () => {
    const { client } = makeClient(async (url) => {
      if (url.endsWith('/readyz')) throw new Error('request timed out after 5000ms');
      return ok200;
    });
    const result = await runAzureSmokeTests(liveConfig(), client);
    const readiness = result.checks.find((c) => c.name.startsWith('readiness'));
    expect(readiness?.ok).toBe(false);
    expect(readiness?.detail).toMatch(/timed out/);
  });

  // Authenticated read passes with a valid token + enforced unauthenticated rejection.
  it('passes authenticated read and unauthenticated rejection with a token', async () => {
    const token = 'valid-token';
    const { client } = makeClient(async (url, headers) => {
      if (url.endsWith('/v1/workflows')) {
        return headers['authorization'] !== undefined
          ? { status: 200, bodyText: '[]' }
          : { status: 401, bodyText: '' };
      }
      return ok200;
    });
    const result = await runAzureSmokeTests(
      liveConfig({ requireAuth: true, authToken: token }),
      client,
    );
    expect(result.ok).toBe(true);
    expect(result.checks.find((c) => c.name.startsWith('authenticated read'))?.ok).toBe(true);
    expect(
      result.checks.find((c) => c.name.startsWith('unauthenticated read rejected'))?.ok,
    ).toBe(true);
  });
});
