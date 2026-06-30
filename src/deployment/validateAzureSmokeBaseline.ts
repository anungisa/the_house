/**
 * Pure, deterministic validator for the Azure environment smoke-test baseline.
 *
 * Like the other src/deployment/validate*.ts checkers, this is STATIC. It only
 * reads files under a given repo root and reasons about their presence and
 * content. It NEVER:
 *  - calls Azure, the Azure CLI, a live app URL, a DB, or any network,
 *  - requires Azure credentials, a token, or AZURE_SMOKE_ENABLED,
 *  - runs the live smoke runner or mutates anything.
 *
 * It confirms the smoke-test contract stays coherent: the runner + CLI + docs
 * exist, the scripts are wired (`smoke:check`, `smoke:azure`) and chained into
 * `ci:check`, the runner is default-off (refuses live calls unless
 * `AZURE_SMOKE_ENABLED=true`), the production deploy template carries a guarded
 * post-deploy smoke placeholder, the DEFAULT CI workflow never calls a live URL
 * or requires Azure credentials, `.env.example` documents the smoke env vars, and
 * NO secret-looking values or sport-specific terminology leak into the smoke
 * files.
 *
 * The thin CLI wrapper lives in scripts/validate-azure-smoke-baseline.ts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FORBIDDEN_DOMAIN_TERMS, findSecretLikeValues } from './validateDeploymentBaseline.js';

/** A single named check outcome. */
export interface AzureSmokeBaselineCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Aggregated validation result. */
export interface AzureSmokeBaselineResult {
  readonly ok: boolean;
  readonly checks: readonly AzureSmokeBaselineCheck[];
  readonly errors: readonly string[];
}

export const SMOKE_DOC_REL = 'docs/architecture/azure-environment-smoke-test-baseline.md';
export const SMOKE_RUNNER_MODULE = 'src/deployment/AzureSmokeTestRunner.ts';
export const SMOKE_RUNNER_SCRIPT = 'scripts/azure-smoke-test.ts';
export const SMOKE_VALIDATOR_SCRIPT = 'scripts/validate-azure-smoke-baseline.ts';
export const DEPLOY_TEMPLATE_WORKFLOW = '.github/workflows/production-deploy-template.yml';
export const CI_WORKFLOW = '.github/workflows/ci.yml';
export const ENV_EXAMPLE_REL = '.env.example';

/** Files scanned for leaked secrets / sport terminology (only those present). */
const SMOKE_SCANNED_FILES: readonly string[] = [
  SMOKE_DOC_REL,
  SMOKE_RUNNER_MODULE,
  SMOKE_RUNNER_SCRIPT,
  SMOKE_VALIDATOR_SCRIPT,
  'src/deployment/validateAzureSmokeBaseline.ts',
  DEPLOY_TEMPLATE_WORKFLOW,
  CI_WORKFLOW,
];

/** Post-deploy smoke placeholder marker (deploy template). */
const SMOKE_STEP_MARKER = /smoke:azure|smoke test|smoke-test/i;

/** Manual guard marker for the deploy-template smoke step. */
const SMOKE_GUARD_MARKER = /run_smoke_tests/i;

/** Live-URL markers that must NOT appear in the default CI workflow. */
const LIVE_URL_MARKER = /smoke:azure|AZURE_SMOKE_BASE_URL|AZURE_SMOKE_ENABLED/i;

/** Azure-credential markers that must NOT appear in the default CI workflow. */
const AZURE_CRED_MARKER = /azure\/login@|secrets\.AZURE_|azure\/cli@/i;

function readIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function parseScripts(pkgText: string | undefined): Record<string, string> {
  if (pkgText === undefined) return {};
  try {
    const pkg = JSON.parse(pkgText) as { scripts?: Record<string, string> };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

/**
 * Validate the Azure smoke-test baseline under `repoRoot`. Pure and
 * deterministic: only reads files; never touches Azure, the Azure CLI, a live
 * URL, the network, a DB, or credentials.
 */
export function validateAzureSmokeBaseline(repoRoot: string): AzureSmokeBaselineResult {
  const checks: AzureSmokeBaselineCheck[] = [];

  // 1. Smoke-test documentation exists.
  checks.push({
    name: 'Azure smoke-test baseline doc exists',
    ok: existsSync(join(repoRoot, SMOKE_DOC_REL)),
    detail: SMOKE_DOC_REL,
  });

  // 2. Smoke runner module + script exist.
  const runnerModule = readIfExists(join(repoRoot, SMOKE_RUNNER_MODULE));
  const runnerScript = readIfExists(join(repoRoot, SMOKE_RUNNER_SCRIPT));
  checks.push({
    name: 'smoke runner module + script exist',
    ok: runnerModule !== undefined && runnerScript !== undefined,
    detail: `${SMOKE_RUNNER_MODULE} + ${SMOKE_RUNNER_SCRIPT}`,
  });

  // 3. package.json exposes smoke:check and smoke:azure.
  const scripts = parseScripts(readIfExists(join(repoRoot, 'package.json')));
  const hasCheck = typeof scripts['smoke:check'] === 'string';
  const hasAzure = typeof scripts['smoke:azure'] === 'string';
  checks.push({
    name: 'package.json defines smoke:check and smoke:azure',
    ok: hasCheck && hasAzure,
    detail: `smoke:check=${String(hasCheck)}, smoke:azure=${String(hasAzure)}`,
  });

  // 4. ci:check chains smoke:check.
  const ciCheck = scripts['ci:check'] ?? '';
  const ciChains = /npm run smoke:check\b/.test(ciCheck);
  checks.push({
    name: 'ci:check includes smoke:check',
    ok: ciChains,
    detail: ciChains ? 'chained in ci:check' : 'not chained in ci:check',
  });

  // 5. Production deploy template carries a guarded post-deploy smoke placeholder.
  const deployTemplate = readIfExists(join(repoRoot, DEPLOY_TEMPLATE_WORKFLOW));
  if (deployTemplate === undefined) {
    checks.push({
      name: 'production-deploy-template.yml exists',
      ok: false,
      detail: DEPLOY_TEMPLATE_WORKFLOW,
    });
  } else {
    const hasSmokeStep = SMOKE_STEP_MARKER.test(deployTemplate);
    const isGuarded = SMOKE_GUARD_MARKER.test(deployTemplate);
    checks.push({
      name: 'production-deploy-template.yml has a guarded post-deploy smoke placeholder',
      ok: hasSmokeStep && isGuarded,
      detail: hasSmokeStep
        ? isGuarded
          ? 'guarded smoke step present'
          : 'smoke step present but not guarded by run_smoke_tests'
        : 'no smoke step',
    });
  }

  // 6. Smoke runner refuses live calls unless AZURE_SMOKE_ENABLED=true.
  const refusesLive =
    runnerModule !== undefined &&
    runnerScript !== undefined &&
    /AZURE_SMOKE_ENABLED/.test(runnerModule) &&
    /AZURE_SMOKE_ENABLED/.test(runnerScript);
  checks.push({
    name: 'smoke runner is default-off (requires AZURE_SMOKE_ENABLED=true)',
    ok: refusesLive,
    detail: refusesLive ? 'guarded by AZURE_SMOKE_ENABLED' : 'missing AZURE_SMOKE_ENABLED guard',
  });

  // 7. .env.example documents the smoke env vars.
  const envExample = readIfExists(join(repoRoot, ENV_EXAMPLE_REL));
  const documentsEnv =
    envExample !== undefined &&
    /AZURE_SMOKE_ENABLED/.test(envExample) &&
    /AZURE_SMOKE_BASE_URL/.test(envExample);
  checks.push({
    name: '.env.example documents smoke env vars',
    ok: documentsEnv,
    detail: documentsEnv ? 'AZURE_SMOKE_* documented' : 'AZURE_SMOKE_* not documented',
  });

  // 8. No secret-like values in smoke files.
  const secretLeaks = scanFiles(repoRoot, findSecretLikeValuesFor);
  checks.push({
    name: 'no secret-like values in smoke files',
    ok: secretLeaks.length === 0,
    detail: secretLeaks.length === 0 ? 'clean' : secretLeaks.join('; '),
  });

  // 9. No sport-specific terminology in smoke files.
  const domainLeaks = scanFiles(repoRoot, findDomainTermsFor);
  checks.push({
    name: 'no sport-specific terminology in smoke files',
    ok: domainLeaks.length === 0,
    detail: domainLeaks.length === 0 ? 'clean' : domainLeaks.join('; '),
  });

  // 10. The DEFAULT CI workflow never calls a live URL / runs smoke:azure.
  const ciWorkflow = readIfExists(join(repoRoot, CI_WORKFLOW));
  if (ciWorkflow === undefined) {
    checks.push({ name: 'ci.yml exists', ok: false, detail: CI_WORKFLOW });
  } else {
    const callsLive = LIVE_URL_MARKER.test(ciWorkflow);
    checks.push({
      name: 'default CI workflow does not call a live URL',
      ok: !callsLive,
      detail: callsLive ? 'found live-smoke reference in ci.yml' : 'no live-smoke reference',
    });

    // 11. The DEFAULT CI workflow requires no Azure credentials.
    const needsAzure = AZURE_CRED_MARKER.test(ciWorkflow);
    checks.push({
      name: 'default CI workflow requires no Azure credentials',
      ok: !needsAzure,
      detail: needsAzure ? 'found Azure credential usage in ci.yml' : 'no Azure credentials',
    });
  }

  return finalize(checks);
}

function scanFiles(repoRoot: string, finder: (rel: string, text: string) => string[]): string[] {
  const leaks: string[] = [];
  for (const rel of SMOKE_SCANNED_FILES) {
    const text = readIfExists(join(repoRoot, rel));
    if (text === undefined) continue;
    leaks.push(...finder(rel, text));
  }
  return leaks;
}

function findSecretLikeValuesFor(rel: string, text: string): string[] {
  return findSecretLikeValues(text).map((rule) => `${rel} (${rule})`);
}

function findDomainTermsFor(rel: string, text: string): string[] {
  const lowered = text.toLowerCase();
  const leaks: string[] = [];
  for (const term of FORBIDDEN_DOMAIN_TERMS) {
    if (lowered.includes(term)) {
      leaks.push(`${rel} contains "${term}"`);
    }
  }
  return leaks;
}

function finalize(checks: AzureSmokeBaselineCheck[]): AzureSmokeBaselineResult {
  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    errors: failed.map((c) => `${c.name}: ${c.detail}`),
  };
}
