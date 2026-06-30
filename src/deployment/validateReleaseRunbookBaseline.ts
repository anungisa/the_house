/**
 * Pure, deterministic validator for the production release runbook baseline.
 *
 * Like the other src/deployment/validate*.ts checkers, this is STATIC. It only
 * reads files under a given repo root and reasons about their presence and
 * content. It NEVER:
 *  - deploys, runs migrations, or calls Azure / the Azure CLI / a live URL,
 *  - builds, pushes, scans, or signs images (no Docker / registry / Cosign),
 *  - touches a database, the network, or any credentials.
 *
 * It confirms the release-operations contract stays coherent: the production
 * release runbook and the release checklist template exist, the `release:check`
 * script is wired and chained into `ci:check`, the runbook references every
 * required preflight gate and release control (deploy/migration/provenance/smoke
 * workflows and commands, the no-automatic-startup-migration rule, the
 * app-role-must-not-run-migrations rule, and a rollback procedure), the checklist
 * carries the required evidence fields, and NO secret-looking values or
 * sport-specific terminology leak into the release files.
 *
 * The thin CLI wrapper lives in scripts/validate-release-runbook-baseline.ts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FORBIDDEN_DOMAIN_TERMS, findSecretLikeValues } from './validateDeploymentBaseline.js';

/** A single named check outcome. */
export interface ReleaseRunbookBaselineCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Aggregated validation result. */
export interface ReleaseRunbookBaselineResult {
  readonly ok: boolean;
  readonly checks: readonly ReleaseRunbookBaselineCheck[];
  readonly errors: readonly string[];
}

export const RELEASE_RUNBOOK_REL = 'docs/operations/production-release-runbook.md';
export const RELEASE_CHECKLIST_REL =
  'docs/operations/templates/production-release-checklist.md';
export const RELEASE_VALIDATOR_MODULE = 'src/deployment/validateReleaseRunbookBaseline.ts';
export const RELEASE_VALIDATOR_SCRIPT = 'scripts/validate-release-runbook-baseline.ts';

/** Files scanned for leaked secrets / sport terminology (only those present). */
const RELEASE_SCANNED_FILES: readonly string[] = [
  RELEASE_RUNBOOK_REL,
  RELEASE_CHECKLIST_REL,
  RELEASE_VALIDATOR_MODULE,
  RELEASE_VALIDATOR_SCRIPT,
];

/** Markers the runbook MUST reference, keyed by a stable check name. */
const RUNBOOK_MARKERS: ReadonlyArray<{ name: string; marker: RegExp; label: string }> = [
  { name: 'runbook references ci:check gate', marker: /ci:check/, label: 'ci:check' },
  { name: 'runbook references deploy:check gate', marker: /deploy:check/, label: 'deploy:check' },
  {
    name: 'runbook references container:check gate',
    marker: /container:check/,
    label: 'container:check',
  },
  {
    name: 'runbook references migrations:check gate',
    marker: /migrations:check/,
    label: 'migrations:check',
  },
  {
    name: 'runbook references supply-chain:check gate',
    marker: /supply-chain:check/,
    label: 'supply-chain:check',
  },
  {
    name: 'runbook references provenance:check gate',
    marker: /provenance:check/,
    label: 'provenance:check',
  },
  { name: 'runbook references smoke:check gate', marker: /smoke:check/, label: 'smoke:check' },
  { name: 'runbook references migrations:plan', marker: /migrations:plan/, label: 'migrations:plan' },
  {
    name: 'runbook references migrations:apply',
    marker: /migrations:apply/,
    label: 'migrations:apply',
  },
  {
    name: 'runbook references production-deploy-template.yml',
    marker: /production-deploy-template\.yml/,
    label: 'production-deploy-template.yml',
  },
  { name: 'runbook references smoke:azure', marker: /smoke:azure/, label: 'smoke:azure' },
  { name: 'runbook references SBOM', marker: /\bSBOM\b/i, label: 'SBOM' },
  {
    name: 'runbook references vulnerability scan',
    marker: /vulnerability scan/i,
    label: 'vulnerability scan',
  },
  {
    name: 'runbook references Cosign / provenance signing',
    marker: /cosign|provenance/i,
    label: 'Cosign/provenance',
  },
  { name: 'runbook documents a rollback procedure', marker: /rollback/i, label: 'rollback' },
  {
    name: 'runbook warns against automatic startup migrations',
    marker: /startup migration/i,
    label: 'no automatic startup migration',
  },
  {
    name: 'runbook states the app role must not run migrations',
    marker: /application role must not run migrations|app role must not run migrations/i,
    label: 'app role must not run migrations',
  },
];

/** Required fields the release checklist MUST carry, keyed by a stable check name. */
const CHECKLIST_MARKERS: ReadonlyArray<{ name: string; marker: RegExp; label: string }> = [
  { name: 'checklist includes Release ID field', marker: /Release ID/i, label: 'Release ID' },
  {
    name: 'checklist includes API image digest field',
    marker: /API image digest/i,
    label: 'API image digest',
  },
  {
    name: 'checklist includes Worker image digest field',
    marker: /Worker image digest/i,
    label: 'Worker image digest',
  },
  {
    name: 'checklist includes go/no-go decision field',
    marker: /go\s*\/\s*no-go/i,
    label: 'go/no-go decision',
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
 * Validate the production release runbook baseline under `repoRoot`. Pure and
 * deterministic: only reads files; never deploys, migrates, signs, scans, or
 * touches Azure, a registry, a DB, the network, or credentials.
 */
export function validateReleaseRunbookBaseline(repoRoot: string): ReleaseRunbookBaselineResult {
  const checks: ReleaseRunbookBaselineCheck[] = [];

  // 1. Production release runbook exists.
  const runbook = readIfExists(join(repoRoot, RELEASE_RUNBOOK_REL));
  checks.push({
    name: 'production release runbook exists',
    ok: runbook !== undefined,
    detail: RELEASE_RUNBOOK_REL,
  });

  // 2. Release checklist template exists.
  const checklist = readIfExists(join(repoRoot, RELEASE_CHECKLIST_REL));
  checks.push({
    name: 'release checklist template exists',
    ok: checklist !== undefined,
    detail: RELEASE_CHECKLIST_REL,
  });

  // 3. package.json exposes release:check.
  const scripts = parseScripts(readIfExists(join(repoRoot, 'package.json')));
  const hasReleaseCheck = typeof scripts['release:check'] === 'string';
  checks.push({
    name: 'package.json defines release:check',
    ok: hasReleaseCheck,
    detail: hasReleaseCheck ? 'scripts["release:check"]' : 'missing release:check script',
  });

  // 4. ci:check chains release:check.
  const ciCheck = scripts['ci:check'] ?? '';
  const ciChains = /npm run release:check\b/.test(ciCheck);
  checks.push({
    name: 'ci:check includes release:check',
    ok: ciChains,
    detail: ciChains ? 'chained in ci:check' : 'not chained in ci:check',
  });

  // 5. Runbook references every required gate / control.
  for (const { name, marker, label } of RUNBOOK_MARKERS) {
    const present = runbook !== undefined && marker.test(runbook);
    checks.push({
      name,
      ok: present,
      detail: present ? `references ${label}` : `runbook missing reference to ${label}`,
    });
  }

  // 6. Checklist carries every required evidence field.
  for (const { name, marker, label } of CHECKLIST_MARKERS) {
    const present = checklist !== undefined && marker.test(checklist);
    checks.push({
      name,
      ok: present,
      detail: present ? `includes ${label}` : `checklist missing ${label}`,
    });
  }

  // 7. No secret-like values in release files.
  const secretLeaks = scanFiles(repoRoot, findSecretLikeValuesFor);
  checks.push({
    name: 'no secret-like values in release files',
    ok: secretLeaks.length === 0,
    detail: secretLeaks.length === 0 ? 'clean' : secretLeaks.join('; '),
  });

  // 8. No sport-specific terminology in release files.
  const domainLeaks = scanFiles(repoRoot, findDomainTermsFor);
  checks.push({
    name: 'no sport-specific terminology in release files',
    ok: domainLeaks.length === 0,
    detail: domainLeaks.length === 0 ? 'clean' : domainLeaks.join('; '),
  });

  return finalize(checks);
}

function scanFiles(repoRoot: string, finder: (rel: string, text: string) => string[]): string[] {
  const leaks: string[] = [];
  for (const rel of RELEASE_SCANNED_FILES) {
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

function finalize(checks: ReleaseRunbookBaselineCheck[]): ReleaseRunbookBaselineResult {
  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    errors: failed.map((c) => `${c.name}: ${c.detail}`),
  };
}
