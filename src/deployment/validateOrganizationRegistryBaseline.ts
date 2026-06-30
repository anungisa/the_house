/**
 * Pure, deterministic validator for the Organization Registry domain baseline.
 *
 * Like the other src/deployment/validate*.ts checkers, this is STATIC. It only reads files under
 * a given repo root and reasons about their presence and content. It NEVER:
 *  - runs tests, deploys, migrates, or calls Azure / the Azure CLI / a live URL,
 *  - builds, pushes, scans, or signs images,
 *  - touches a database, the network, or any credentials.
 *
 * It confirms the Organization Registry baseline stays coherent: the domain module, migration,
 * architecture doc, and unit tests all exist; the `organization:check` script is wired and
 * chained into `ci:check`; the doc documents its purpose/scope and the key invariants; and NO
 * secret-looking values or sport-specific terminology leak into the domain code, doc, test, or
 * migration.
 *
 * The thin CLI wrapper lives in scripts/validate-organization-registry-baseline.ts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FORBIDDEN_DOMAIN_TERMS, findSecretLikeValues } from './validateDeploymentBaseline.js';

/** A single named check outcome. */
export interface OrganizationRegistryBaselineCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Aggregated validation result. */
export interface OrganizationRegistryBaselineResult {
  readonly ok: boolean;
  readonly checks: readonly OrganizationRegistryBaselineCheck[];
  readonly errors: readonly string[];
}

export const ORGANIZATION_DOMAIN_DIR_REL = 'src/domains/organization-registry';
export const ORGANIZATION_DOC_REL =
  'docs/architecture/organization-registry-domain-baseline.md';
export const ORGANIZATION_TEST_REL =
  'tests/unit/domains/organization-registry/OrganizationRegistryService.test.ts';
export const ORGANIZATION_MIGRATION_REL = 'db/migrations/0009_organization_registry.sql';
export const ORGANIZATION_VALIDATOR_MODULE =
  'src/deployment/validateOrganizationRegistryBaseline.ts';
export const ORGANIZATION_VALIDATOR_SCRIPT =
  'scripts/validate-organization-registry-baseline.ts';

/** Domain module files that MUST exist for the baseline to be coherent. */
const ORGANIZATION_DOMAIN_FILES: readonly string[] = [
  `${ORGANIZATION_DOMAIN_DIR_REL}/OrganizationTypes.ts`,
  `${ORGANIZATION_DOMAIN_DIR_REL}/OrganizationRegistryErrors.ts`,
  `${ORGANIZATION_DOMAIN_DIR_REL}/OrganizationRegistryStore.ts`,
  `${ORGANIZATION_DOMAIN_DIR_REL}/InMemoryOrganizationRegistryStore.ts`,
  `${ORGANIZATION_DOMAIN_DIR_REL}/PgOrganizationRegistryStore.ts`,
  `${ORGANIZATION_DOMAIN_DIR_REL}/OrganizationRegistryService.ts`,
  `${ORGANIZATION_DOMAIN_DIR_REL}/index.ts`,
];

/** Files scanned for leaked secrets (only those present). */
const ORGANIZATION_SECRET_SCAN_FILES: readonly string[] = [
  ...ORGANIZATION_DOMAIN_FILES,
  ORGANIZATION_DOC_REL,
  ORGANIZATION_MIGRATION_REL,
  ORGANIZATION_VALIDATOR_MODULE,
  ORGANIZATION_VALIDATOR_SCRIPT,
];

/**
 * Files scanned for sport-specific terminology. The domain code, doc, test, and migration must
 * all stay NSO-generic.
 */
const ORGANIZATION_DOMAIN_SCAN_FILES: readonly string[] = [
  ...ORGANIZATION_DOMAIN_FILES,
  ORGANIZATION_DOC_REL,
  ORGANIZATION_TEST_REL,
  ORGANIZATION_MIGRATION_REL,
];

/** Markers the architecture doc MUST reference, keyed by a stable check name. */
const DOC_MARKERS: ReadonlyArray<{ name: string; marker: RegExp; label: string }> = [
  { name: 'doc documents purpose', marker: /##\s*Purpose/i, label: 'Purpose' },
  { name: 'doc documents the domain model', marker: /##\s*Domain model/i, label: 'Domain model' },
  {
    name: 'doc documents tenant isolation',
    marker: /tenant isolation/i,
    label: 'tenant isolation',
  },
  {
    name: 'doc documents the affiliation projection seam',
    marker: /one-way projection/i,
    label: 'one-way projection',
  },
  { name: 'doc documents outbox signals', marker: /outbox/i, label: 'outbox' },
  { name: 'doc documents telemetry signals', marker: /telemetry/i, label: 'telemetry' },
  {
    name: 'doc documents HTTP surfaces are deferred',
    marker: /HTTP surfaces .* deferred|deferred .* HTTP/i,
    label: 'HTTP surfaces deferred',
  },
  { name: 'doc documents out-of-scope', marker: /out of scope/i, label: 'out of scope' },
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
 * Validate the Organization Registry domain baseline under `repoRoot`. Pure and deterministic:
 * only reads files; never runs tests, deploys, migrates, signs, scans, or touches Azure, a
 * registry, a DB, the network, or credentials.
 */
export function validateOrganizationRegistryBaseline(
  repoRoot: string,
): OrganizationRegistryBaselineResult {
  const checks: OrganizationRegistryBaselineCheck[] = [];

  // 1. Domain module files exist.
  for (const rel of ORGANIZATION_DOMAIN_FILES) {
    const present = existsSync(join(repoRoot, rel));
    checks.push({ name: `domain file exists: ${rel}`, ok: present, detail: rel });
  }

  // 2. Migration exists.
  const migrationPresent = existsSync(join(repoRoot, ORGANIZATION_MIGRATION_REL));
  checks.push({
    name: 'organization registry migration exists',
    ok: migrationPresent,
    detail: ORGANIZATION_MIGRATION_REL,
  });

  // 3. Architecture doc exists.
  const doc = readIfExists(join(repoRoot, ORGANIZATION_DOC_REL));
  checks.push({
    name: 'organization registry doc exists',
    ok: doc !== undefined,
    detail: ORGANIZATION_DOC_REL,
  });

  // 4. Unit test exists.
  const testPresent = existsSync(join(repoRoot, ORGANIZATION_TEST_REL));
  checks.push({
    name: 'organization registry test exists',
    ok: testPresent,
    detail: ORGANIZATION_TEST_REL,
  });

  // 5. package.json exposes organization:check.
  const scripts = parseScripts(readIfExists(join(repoRoot, 'package.json')));
  const hasCheck = typeof scripts['organization:check'] === 'string';
  checks.push({
    name: 'package.json defines organization:check',
    ok: hasCheck,
    detail: hasCheck ? 'scripts["organization:check"]' : 'missing organization:check script',
  });

  // 6. ci:check chains organization:check.
  const ciCheck = scripts['ci:check'] ?? '';
  const ciChains = /npm run organization:check\b/.test(ciCheck);
  checks.push({
    name: 'ci:check includes organization:check',
    ok: ciChains,
    detail: ciChains ? 'chained in ci:check' : 'not chained in ci:check',
  });

  // 7. Doc references every required section / marker.
  for (const { name, marker, label } of DOC_MARKERS) {
    const present = doc !== undefined && marker.test(doc);
    checks.push({
      name,
      ok: present,
      detail: present ? `references ${label}` : `doc missing reference to ${label}`,
    });
  }

  // 8. No secret-like values in scanned files.
  const secretLeaks = scanFiles(repoRoot, ORGANIZATION_SECRET_SCAN_FILES, findSecretLikeValuesFor);
  checks.push({
    name: 'no secret-like values in organization registry files',
    ok: secretLeaks.length === 0,
    detail: secretLeaks.length === 0 ? 'clean' : secretLeaks.join('; '),
  });

  // 9. No sport-specific terminology in domain code / doc / test / migration.
  const domainLeaks = scanFiles(repoRoot, ORGANIZATION_DOMAIN_SCAN_FILES, findDomainTermsFor);
  checks.push({
    name: 'no sport-specific terminology in organization registry files',
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

function finalize(
  checks: OrganizationRegistryBaselineCheck[],
): OrganizationRegistryBaselineResult {
  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    errors: failed.map((c) => `${c.name}: ${c.detail}`),
  };
}
