/**
 * Pure, deterministic validator for the Facility Registry domain baseline.
 *
 * Like the other src/deployment/validate*.ts checkers, this is STATIC. It only reads files under a
 * given repo root and reasons about their presence and content. It NEVER:
 *  - runs tests, deploys, migrates, or calls Azure / the Azure CLI / a live URL,
 *  - builds, pushes, scans, or signs images,
 *  - touches a database, the network, or any credentials.
 *
 * It confirms the Facility Registry baseline stays coherent: the domain module, migration,
 * architecture doc, unit test, and gated integration test all exist; the `facility:check` script is
 * wired and chained into `ci:check`; the doc documents its purpose/scope and key invariants; and NO
 * secret-looking values, sport-specific terminology, or out-of-scope behavior terms leak into the
 * domain code, doc, test, or migration. It ALSO enforces the backend-only scope of this pass with
 * fail-closed guards: no facility HTTP surface and no facility authorization action may exist yet.
 *
 * The thin CLI wrapper lives in scripts/validate-facility-registry-baseline.ts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FORBIDDEN_DOMAIN_TERMS, findSecretLikeValues } from './validateDeploymentBaseline.js';

/** A single named check outcome. */
export interface FacilityRegistryBaselineCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Aggregated validation result. */
export interface FacilityRegistryBaselineResult {
  readonly ok: boolean;
  readonly checks: readonly FacilityRegistryBaselineCheck[];
  readonly errors: readonly string[];
}

export const FACILITY_DOMAIN_DIR_REL = 'src/domains/facility-registry';
export const FACILITY_DOC_REL = 'docs/architecture/facility-registry-domain-baseline.md';
export const FACILITY_TEST_REL =
  'tests/unit/domains/facility-registry/FacilityRegistryService.test.ts';
export const FACILITY_INTEGRATION_TEST_REL =
  'tests/integration/governance/facility-registry.integration.test.ts';
export const FACILITY_MIGRATION_REL = 'db/migrations/0011_facility_registry.sql';
export const FACILITY_VALIDATOR_MODULE = 'src/deployment/validateFacilityRegistryBaseline.ts';
export const FACILITY_VALIDATOR_SCRIPT = 'scripts/validate-facility-registry-baseline.ts';

/**
 * Backend-only scope guards. The Facility Registry baseline pass deliberately ships NO HTTP surface
 * and NO authorization action. These paths MUST stay absent so the slice does not opportunistically
 * grow an edge/authz surface.
 */
export const FACILITY_HTTP_DIR_REL = 'src/http/facility';
export const AUTHZ_ACTIONS_MODULE_REL = 'src/authz/AuthorizationActions.ts';

/** Domain module files that MUST exist for the baseline to be coherent. */
const FACILITY_DOMAIN_FILES: readonly string[] = [
  `${FACILITY_DOMAIN_DIR_REL}/FacilityTypes.ts`,
  `${FACILITY_DOMAIN_DIR_REL}/FacilityRegistryErrors.ts`,
  `${FACILITY_DOMAIN_DIR_REL}/FacilityRegistryStore.ts`,
  `${FACILITY_DOMAIN_DIR_REL}/InMemoryFacilityRegistryStore.ts`,
  `${FACILITY_DOMAIN_DIR_REL}/PgFacilityRegistryStore.ts`,
  `${FACILITY_DOMAIN_DIR_REL}/FacilityRegistryService.ts`,
  `${FACILITY_DOMAIN_DIR_REL}/index.ts`,
];

/** Files scanned for leaked secrets (only those present). */
const FACILITY_SECRET_SCAN_FILES: readonly string[] = [
  ...FACILITY_DOMAIN_FILES,
  FACILITY_DOC_REL,
  FACILITY_MIGRATION_REL,
  FACILITY_VALIDATOR_MODULE,
  FACILITY_VALIDATOR_SCRIPT,
];

/**
 * Files scanned for sport-specific terminology. The domain code, doc, test, and migration must all
 * stay NSO-generic. The validator module and its test are intentionally excluded (they DEFINE the
 * forbidden vocabulary as fixtures/data).
 */
const FACILITY_DOMAIN_SCAN_FILES: readonly string[] = [
  ...FACILITY_DOMAIN_FILES,
  FACILITY_DOC_REL,
  FACILITY_TEST_REL,
  FACILITY_MIGRATION_REL,
];

/**
 * Out-of-scope BEHAVIOR terms that must NOT appear in the domain CODE. Their absence is a coherence
 * signal that the reference-data slice did not opportunistically grow booking, scheduling,
 * maintenance, inventory, inspection, accreditation, contracts, registration, payments, programs, or
 * competition. Only the domain code files are scanned — the doc and migration legitimately reference
 * these words in prose while documenting what is intentionally NOT built.
 */
const SCOPE_FORBIDDEN_TERMS: readonly string[] = [
  'booking',
  'schedule',
  'calendar',
  'reservation',
  'maintenance',
  'work_order',
  'work order',
  'inventory',
  'inspection',
  'accreditation',
  'registration',
  'payment',
  'enrollment',
  'competition',
];

/** Domain-code files scanned for out-of-scope behavior terms. */
const FACILITY_SCOPE_SCAN_FILES: readonly string[] = [...FACILITY_DOMAIN_FILES];

/**
 * Sport-specific place vocabulary that must never appear, matched on WORD BOUNDARIES so generic
 * words that merely contain these letters (e.g. "office" / "service" contain "ice") are NOT flagged.
 * The broad substring terms (e.g. "rink", "curling") are additionally covered by
 * {@link FORBIDDEN_DOMAIN_TERMS}.
 */
const FACILITY_SPORT_TERMS: readonly string[] = ['sheet', 'ice', 'draw', 'league', 'club'];

/** Markers the architecture doc MUST reference, keyed by a stable check name. */
const DOC_MARKERS: ReadonlyArray<{ name: string; marker: RegExp; label: string }> = [
  { name: 'doc documents purpose', marker: /##\s*Purpose/i, label: 'Purpose' },
  { name: 'doc documents the domain model', marker: /##\s*Domain model/i, label: 'Domain model' },
  { name: 'doc documents tenant isolation', marker: /tenant isolation/i, label: 'tenant isolation' },
  {
    name: 'doc documents the organization dependency',
    marker: /organization registry/i,
    label: 'organization registry',
  },
  { name: 'doc documents outbox signals', marker: /outbox/i, label: 'outbox' },
  { name: 'doc documents telemetry signals', marker: /telemetry/i, label: 'telemetry' },
  { name: 'doc documents privacy stance', marker: /privacy/i, label: 'privacy' },
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
 * Validate the Facility Registry domain baseline under `repoRoot`. Pure and deterministic: only
 * reads files; never runs tests, deploys, migrates, signs, scans, or touches Azure, a registry, a
 * DB, the network, or credentials.
 */
export function validateFacilityRegistryBaseline(repoRoot: string): FacilityRegistryBaselineResult {
  const checks: FacilityRegistryBaselineCheck[] = [];

  // 1. Domain module files exist.
  for (const rel of FACILITY_DOMAIN_FILES) {
    const present = existsSync(join(repoRoot, rel));
    checks.push({ name: `domain file exists: ${rel}`, ok: present, detail: rel });
  }

  // 2. Migration exists.
  const migrationPresent = existsSync(join(repoRoot, FACILITY_MIGRATION_REL));
  checks.push({
    name: 'facility registry migration exists',
    ok: migrationPresent,
    detail: FACILITY_MIGRATION_REL,
  });

  // 3. Architecture doc exists.
  const doc = readIfExists(join(repoRoot, FACILITY_DOC_REL));
  checks.push({
    name: 'facility registry doc exists',
    ok: doc !== undefined,
    detail: FACILITY_DOC_REL,
  });

  // 4. Unit test exists.
  const testPresent = existsSync(join(repoRoot, FACILITY_TEST_REL));
  checks.push({
    name: 'facility registry unit test exists',
    ok: testPresent,
    detail: FACILITY_TEST_REL,
  });

  // 5. Gated integration test exists.
  const integrationTestPresent = existsSync(join(repoRoot, FACILITY_INTEGRATION_TEST_REL));
  checks.push({
    name: 'facility registry integration test exists',
    ok: integrationTestPresent,
    detail: FACILITY_INTEGRATION_TEST_REL,
  });

  // 6. Backend-only scope guard: NO facility HTTP surface exists in this pass.
  const httpAbsent = !existsSync(join(repoRoot, FACILITY_HTTP_DIR_REL));
  checks.push({
    name: 'no facility HTTP surface exists (backend-only scope guard)',
    ok: httpAbsent,
    detail: httpAbsent ? `${FACILITY_HTTP_DIR_REL} absent` : `${FACILITY_HTTP_DIR_REL} unexpectedly present`,
  });

  // 7. Backend-only scope guard: NO facility authorization action is defined in this pass.
  const authzText = readIfExists(join(repoRoot, AUTHZ_ACTIONS_MODULE_REL)) ?? '';
  const noFacilityAction = !authzText.includes("'facility.");
  checks.push({
    name: 'no facility authorization action defined (backend-only scope guard)',
    ok: noFacilityAction,
    detail: noFacilityAction
      ? 'authz catalog defines no facility.* action'
      : 'authz catalog unexpectedly defines a facility.* action',
  });

  // 8. package.json exposes facility:check.
  const scripts = parseScripts(readIfExists(join(repoRoot, 'package.json')));
  const hasCheck = typeof scripts['facility:check'] === 'string';
  checks.push({
    name: 'package.json defines facility:check',
    ok: hasCheck,
    detail: hasCheck ? 'scripts["facility:check"]' : 'missing facility:check script',
  });

  // 9. ci:check chains facility:check.
  const ciCheck = scripts['ci:check'] ?? '';
  const ciChains = /npm run facility:check\b/.test(ciCheck);
  checks.push({
    name: 'ci:check includes facility:check',
    ok: ciChains,
    detail: ciChains ? 'chained in ci:check' : 'not chained in ci:check',
  });

  // 10. Doc references every required section / marker.
  for (const { name, marker, label } of DOC_MARKERS) {
    const present = doc !== undefined && marker.test(doc);
    checks.push({
      name,
      ok: present,
      detail: present ? `references ${label}` : `doc missing reference to ${label}`,
    });
  }

  // 11. No secret-like values in scanned files.
  const secretLeaks = scanFiles(repoRoot, FACILITY_SECRET_SCAN_FILES, findSecretLikeValuesFor);
  checks.push({
    name: 'no secret-like values in facility registry files',
    ok: secretLeaks.length === 0,
    detail: secretLeaks.length === 0 ? 'clean' : secretLeaks.join('; '),
  });

  // 12. No sport-specific terminology in domain code / doc / test / migration.
  const domainLeaks = scanFiles(repoRoot, FACILITY_DOMAIN_SCAN_FILES, findDomainTermsFor);
  checks.push({
    name: 'no sport-specific terminology in facility registry files',
    ok: domainLeaks.length === 0,
    detail: domainLeaks.length === 0 ? 'clean' : domainLeaks.join('; '),
  });

  // 13. No out-of-scope behavior terms in the domain code (scope did not grow booking, scheduling,
  //     maintenance, inventory, inspection, accreditation, registration, payments, or competition).
  const scopeLeaks = scanFiles(repoRoot, FACILITY_SCOPE_SCAN_FILES, findScopeTermsFor);
  checks.push({
    name: 'no out-of-scope behavior terms in the facility domain code',
    ok: scopeLeaks.length === 0,
    detail: scopeLeaks.length === 0 ? 'clean' : scopeLeaks.join('; '),
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
  for (const term of FACILITY_SPORT_TERMS) {
    const pattern = new RegExp(`\\b${term}\\b`, 'i');
    if (pattern.test(text)) {
      leaks.push(`${rel} contains sport term "${term}"`);
    }
  }
  return leaks;
}

function findScopeTermsFor(rel: string, text: string): string[] {
  const lowered = text.toLowerCase();
  const leaks: string[] = [];
  for (const term of SCOPE_FORBIDDEN_TERMS) {
    if (lowered.includes(term)) {
      leaks.push(`${rel} contains out-of-scope term "${term}"`);
    }
  }
  return leaks;
}

function finalize(checks: FacilityRegistryBaselineCheck[]): FacilityRegistryBaselineResult {
  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    errors: failed.map((c) => `${c.name}: ${c.detail}`),
  };
}
