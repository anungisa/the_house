/**
 * Pure, deterministic validator for the synthetic tenant-lifecycle test baseline.
 *
 * Like the other src/deployment/validate*.ts checkers, this is STATIC. It only reads files under
 * a given repo root and reasons about their presence and content. It NEVER:
 *  - runs tests, deploys, migrates, or calls Azure / the Azure CLI / a live URL,
 *  - builds, pushes, scans, or signs images,
 *  - touches a database, the network, or any credentials.
 *
 * It confirms the synthetic-lifecycle confidence contract stays coherent: the architecture doc,
 * the scenario test, the harness, and the fixtures all exist; the `synthetic:check` script is
 * wired and chained into `ci:check`; the doc documents its scope/out-of-scope and scenario map;
 * and NO secret-looking values or sport-specific terminology leak into the doc, fixtures, or test.
 *
 * The thin CLI wrapper lives in scripts/validate-synthetic-lifecycle-baseline.ts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FORBIDDEN_DOMAIN_TERMS, findSecretLikeValues } from './validateDeploymentBaseline.js';

/** A single named check outcome. */
export interface SyntheticLifecycleBaselineCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Aggregated validation result. */
export interface SyntheticLifecycleBaselineResult {
  readonly ok: boolean;
  readonly checks: readonly SyntheticLifecycleBaselineCheck[];
  readonly errors: readonly string[];
}

export const SYNTHETIC_DOC_REL =
  'docs/architecture/synthetic-tenant-lifecycle-test-suite.md';
export const SYNTHETIC_TEST_REL =
  'tests/unit/synthetic/synthetic-tenant-lifecycle.test.ts';
export const SYNTHETIC_SUPPORT_DIR_REL = 'tests/support/syntheticTenantLifecycle';
export const SYNTHETIC_VALIDATOR_MODULE =
  'src/deployment/validateSyntheticLifecycleBaseline.ts';
export const SYNTHETIC_VALIDATOR_SCRIPT =
  'scripts/validate-synthetic-lifecycle-baseline.ts';

/** Support fixtures that MUST exist for the suite to be assemble-able. */
const SYNTHETIC_SUPPORT_FILES: readonly string[] = [
  `${SYNTHETIC_SUPPORT_DIR_REL}/SyntheticTenantLifecycleHarness.ts`,
  `${SYNTHETIC_SUPPORT_DIR_REL}/syntheticTenants.ts`,
  `${SYNTHETIC_SUPPORT_DIR_REL}/syntheticActors.ts`,
  `${SYNTHETIC_SUPPORT_DIR_REL}/syntheticPayloads.ts`,
  `${SYNTHETIC_SUPPORT_DIR_REL}/assertions.ts`,
  `${SYNTHETIC_SUPPORT_DIR_REL}/index.ts`,
];

/**
 * Files scanned for leaked secrets (only those present). `assertions.ts` is deliberately
 * excluded everywhere it would matter because it ENUMERATES the banned terms by design.
 */
const SYNTHETIC_SECRET_SCAN_FILES: readonly string[] = [
  SYNTHETIC_DOC_REL,
  SYNTHETIC_VALIDATOR_MODULE,
  SYNTHETIC_VALIDATOR_SCRIPT,
];

/**
 * Files scanned for sport-specific terminology. The harness/fixtures and the doc/test must be
 * clean; `assertions.ts` is excluded because it intentionally names the forbidden terms to ban
 * them.
 */
const SYNTHETIC_DOMAIN_SCAN_FILES: readonly string[] = [
  SYNTHETIC_DOC_REL,
  SYNTHETIC_TEST_REL,
  `${SYNTHETIC_SUPPORT_DIR_REL}/SyntheticTenantLifecycleHarness.ts`,
  `${SYNTHETIC_SUPPORT_DIR_REL}/syntheticTenants.ts`,
  `${SYNTHETIC_SUPPORT_DIR_REL}/syntheticActors.ts`,
  `${SYNTHETIC_SUPPORT_DIR_REL}/syntheticPayloads.ts`,
  `${SYNTHETIC_SUPPORT_DIR_REL}/index.ts`,
];

/** Markers the architecture doc MUST reference, keyed by a stable check name. */
const DOC_MARKERS: ReadonlyArray<{ name: string; marker: RegExp; label: string }> = [
  { name: 'doc documents purpose', marker: /##\s*Purpose/i, label: 'Purpose' },
  { name: 'doc documents in-scope', marker: /##\s*Scope \(in\)/i, label: 'Scope (in)' },
  {
    name: 'doc documents out-of-scope',
    marker: /out of scope/i,
    label: 'out of scope',
  },
  { name: 'doc includes a scenario map', marker: /scenario map/i, label: 'scenario map' },
  { name: 'doc includes an actor map', marker: /actor map/i, label: 'actor map' },
  {
    name: 'doc documents tenant isolation checks',
    marker: /tenant isolation/i,
    label: 'tenant isolation',
  },
  {
    name: 'doc documents evidence/quarantine checks',
    marker: /quarantine/i,
    label: 'quarantine',
  },
  { name: 'doc documents outbox checks', marker: /outbox/i, label: 'outbox' },
  { name: 'doc documents telemetry checks', marker: /telemetry/i, label: 'telemetry' },
  {
    name: 'doc states it is not a substitute for live smoke',
    marker: /substitute\s+for/i,
    label: 'not a substitute for live smoke',
  },
];

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
 * Validate the synthetic tenant-lifecycle baseline under `repoRoot`. Pure and deterministic:
 * only reads files; never runs tests, deploys, migrates, signs, scans, or touches Azure, a
 * registry, a DB, the network, or credentials.
 */
export function validateSyntheticLifecycleBaseline(
  repoRoot: string,
): SyntheticLifecycleBaselineResult {
  const checks: SyntheticLifecycleBaselineCheck[] = [];

  // 1. Architecture doc exists.
  const doc = readIfExists(join(repoRoot, SYNTHETIC_DOC_REL));
  checks.push({ name: 'synthetic lifecycle doc exists', ok: doc !== undefined, detail: SYNTHETIC_DOC_REL });

  // 2. Scenario test exists.
  const test = readIfExists(join(repoRoot, SYNTHETIC_TEST_REL));
  checks.push({
    name: 'synthetic lifecycle test exists',
    ok: test !== undefined,
    detail: SYNTHETIC_TEST_REL,
  });

  // 3. Support harness + fixtures exist.
  for (const rel of SYNTHETIC_SUPPORT_FILES) {
    const present = existsSync(join(repoRoot, rel));
    checks.push({ name: `support file exists: ${rel}`, ok: present, detail: rel });
  }

  // 4. package.json exposes synthetic:check.
  const scripts = parseScripts(readIfExists(join(repoRoot, 'package.json')));
  const hasSyntheticCheck = typeof scripts['synthetic:check'] === 'string';
  checks.push({
    name: 'package.json defines synthetic:check',
    ok: hasSyntheticCheck,
    detail: hasSyntheticCheck ? 'scripts["synthetic:check"]' : 'missing synthetic:check script',
  });

  // 5. ci:check chains synthetic:check.
  const ciCheck = scripts['ci:check'] ?? '';
  const ciChains = /npm run synthetic:check\b/.test(ciCheck);
  checks.push({
    name: 'ci:check includes synthetic:check',
    ok: ciChains,
    detail: ciChains ? 'chained in ci:check' : 'not chained in ci:check',
  });

  // 6. Doc references every required section / marker.
  for (const { name, marker, label } of DOC_MARKERS) {
    const present = doc !== undefined && marker.test(doc);
    checks.push({
      name,
      ok: present,
      detail: present ? `references ${label}` : `doc missing reference to ${label}`,
    });
  }

  // 7. No secret-like values in scanned files.
  const secretLeaks = scanFiles(repoRoot, SYNTHETIC_SECRET_SCAN_FILES, findSecretLikeValuesFor);
  checks.push({
    name: 'no secret-like values in synthetic files',
    ok: secretLeaks.length === 0,
    detail: secretLeaks.length === 0 ? 'clean' : secretLeaks.join('; '),
  });

  // 8. No sport-specific terminology in doc/fixtures/test.
  const domainLeaks = scanFiles(repoRoot, SYNTHETIC_DOMAIN_SCAN_FILES, findDomainTermsFor);
  checks.push({
    name: 'no sport-specific terminology in synthetic files',
    ok: domainLeaks.length === 0,
    detail: domainLeaks.length === 0 ? 'clean' : domainLeaks.join('; '),
  });

  return finalize(checks);
}

function scanFiles(
  repoRoot: string,
  files: readonly string[],
  finder: (rel: string, text: string) => string[],
): string[] {
  const leaks: string[] = [];
  for (const rel of files) {
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

function finalize(checks: SyntheticLifecycleBaselineCheck[]): SyntheticLifecycleBaselineResult {
  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    errors: failed.map((c) => `${c.name}: ${c.detail}`),
  };
}
