/**
 * Pure, deterministic validator for the Participant Registry domain baseline.
 *
 * Like the other src/deployment/validate*.ts checkers, this is STATIC. It only reads files under
 * a given repo root and reasons about their presence and content. It NEVER:
 *  - runs tests, deploys, migrates, or calls Azure / the Azure CLI / a live URL,
 *  - builds, pushes, scans, or signs images,
 *  - touches a database, the network, or any credentials.
 *
 * It confirms the Participant Registry baseline stays coherent: the domain module, migration,
 * architecture doc, unit tests, and gated integration tests all exist; the `participant:check`
 * script is wired and chained into `ci:check`; the synthetic lifecycle suite references the
 * participant registry; the doc documents its purpose/scope and the key invariants; NO HTTP
 * surface was opportunistically added for participants (out of scope this pass); and NO
 * secret-looking values or sport-specific terminology leak into the domain code, doc, test, or
 * migration.
 *
 * The thin CLI wrapper lives in scripts/validate-participant-registry-baseline.ts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FORBIDDEN_DOMAIN_TERMS, findSecretLikeValues } from './validateDeploymentBaseline.js';

/** A single named check outcome. */
export interface ParticipantRegistryBaselineCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Aggregated validation result. */
export interface ParticipantRegistryBaselineResult {
  readonly ok: boolean;
  readonly checks: readonly ParticipantRegistryBaselineCheck[];
  readonly errors: readonly string[];
}

export const PARTICIPANT_DOMAIN_DIR_REL = 'src/domains/participant-registry';
export const PARTICIPANT_DOC_REL = 'docs/architecture/participant-registry-domain-baseline.md';
export const PARTICIPANT_TEST_REL =
  'tests/unit/domains/participant-registry/ParticipantRegistryService.test.ts';
export const PARTICIPANT_INTEGRATION_TEST_REL =
  'tests/integration/governance/participant-registry.integration.test.ts';
export const PARTICIPANT_MIGRATION_REL = 'db/migrations/0010_participant_registry.sql';
export const PARTICIPANT_VALIDATOR_MODULE =
  'src/deployment/validateParticipantRegistryBaseline.ts';
export const PARTICIPANT_VALIDATOR_SCRIPT =
  'scripts/validate-participant-registry-baseline.ts';
export const SYNTHETIC_TEST_REL = 'tests/unit/synthetic/synthetic-tenant-lifecycle.test.ts';

// This pass is a DOMAIN baseline only: NO HTTP transport is added for participants. The validator
// enforces that scope boundary by asserting this directory does not exist.
export const PARTICIPANT_HTTP_DIR_REL = 'src/http/participant';

/** Domain module files that MUST exist for the baseline to be coherent. */
const PARTICIPANT_DOMAIN_FILES: readonly string[] = [
  `${PARTICIPANT_DOMAIN_DIR_REL}/ParticipantTypes.ts`,
  `${PARTICIPANT_DOMAIN_DIR_REL}/ParticipantRegistryErrors.ts`,
  `${PARTICIPANT_DOMAIN_DIR_REL}/ParticipantRegistryStore.ts`,
  `${PARTICIPANT_DOMAIN_DIR_REL}/InMemoryParticipantRegistryStore.ts`,
  `${PARTICIPANT_DOMAIN_DIR_REL}/PgParticipantRegistryStore.ts`,
  `${PARTICIPANT_DOMAIN_DIR_REL}/ParticipantRegistryService.ts`,
  `${PARTICIPANT_DOMAIN_DIR_REL}/index.ts`,
];

/** Files scanned for leaked secrets (only those present). */
const PARTICIPANT_SECRET_SCAN_FILES: readonly string[] = [
  ...PARTICIPANT_DOMAIN_FILES,
  PARTICIPANT_DOC_REL,
  PARTICIPANT_MIGRATION_REL,
  PARTICIPANT_VALIDATOR_MODULE,
  PARTICIPANT_VALIDATOR_SCRIPT,
];

/**
 * Files scanned for sport-specific terminology. The domain code, doc, test, and migration must
 * all stay NSO-generic.
 */
const PARTICIPANT_DOMAIN_SCAN_FILES: readonly string[] = [
  ...PARTICIPANT_DOMAIN_FILES,
  PARTICIPANT_DOC_REL,
  PARTICIPANT_TEST_REL,
  PARTICIPANT_INTEGRATION_TEST_REL,
  PARTICIPANT_MIGRATION_REL,
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
 * Validate the Participant Registry domain baseline under `repoRoot`. Pure and deterministic:
 * only reads files; never runs tests, deploys, migrates, signs, scans, or touches Azure, a
 * registry, a DB, the network, or credentials.
 */
export function validateParticipantRegistryBaseline(
  repoRoot: string,
): ParticipantRegistryBaselineResult {
  const checks: ParticipantRegistryBaselineCheck[] = [];

  // 1. Domain module files exist.
  for (const rel of PARTICIPANT_DOMAIN_FILES) {
    const present = existsSync(join(repoRoot, rel));
    checks.push({ name: `domain file exists: ${rel}`, ok: present, detail: rel });
  }

  // 2. Migration exists.
  const migrationPresent = existsSync(join(repoRoot, PARTICIPANT_MIGRATION_REL));
  checks.push({
    name: 'participant registry migration exists',
    ok: migrationPresent,
    detail: PARTICIPANT_MIGRATION_REL,
  });

  // 3. Architecture doc exists.
  const doc = readIfExists(join(repoRoot, PARTICIPANT_DOC_REL));
  checks.push({
    name: 'participant registry doc exists',
    ok: doc !== undefined,
    detail: PARTICIPANT_DOC_REL,
  });

  // 4. Unit test exists.
  const testPresent = existsSync(join(repoRoot, PARTICIPANT_TEST_REL));
  checks.push({
    name: 'participant registry unit test exists',
    ok: testPresent,
    detail: PARTICIPANT_TEST_REL,
  });

  // 5. Gated integration test exists.
  const integrationTestPresent = existsSync(join(repoRoot, PARTICIPANT_INTEGRATION_TEST_REL));
  checks.push({
    name: 'participant registry integration test exists',
    ok: integrationTestPresent,
    detail: PARTICIPANT_INTEGRATION_TEST_REL,
  });

  // 6. The synthetic lifecycle suite references the participant registry.
  const syntheticText = readIfExists(join(repoRoot, SYNTHETIC_TEST_REL));
  const syntheticReferences =
    syntheticText !== undefined && /participant.registry|participant-registry/i.test(syntheticText);
  checks.push({
    name: 'synthetic lifecycle suite references the participant registry',
    ok: syntheticReferences,
    detail: syntheticReferences
      ? 'referenced in synthetic-tenant-lifecycle.test.ts'
      : 'missing participant registry reference in synthetic suite',
  });

  // 7. NO participant HTTP surface was added (domain baseline only this pass).
  const httpDirAbsent = !existsSync(join(repoRoot, PARTICIPANT_HTTP_DIR_REL));
  checks.push({
    name: 'no participant HTTP surface added (out of scope this pass)',
    ok: httpDirAbsent,
    detail: httpDirAbsent
      ? `${PARTICIPANT_HTTP_DIR_REL} absent`
      : `${PARTICIPANT_HTTP_DIR_REL} unexpectedly present`,
  });

  // 8. package.json exposes participant:check.
  const scripts = parseScripts(readIfExists(join(repoRoot, 'package.json')));
  const hasCheck = typeof scripts['participant:check'] === 'string';
  checks.push({
    name: 'package.json defines participant:check',
    ok: hasCheck,
    detail: hasCheck ? 'scripts["participant:check"]' : 'missing participant:check script',
  });

  // 9. ci:check chains participant:check.
  const ciCheck = scripts['ci:check'] ?? '';
  const ciChains = /npm run participant:check\b/.test(ciCheck);
  checks.push({
    name: 'ci:check includes participant:check',
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
  const secretLeaks = scanFiles(repoRoot, PARTICIPANT_SECRET_SCAN_FILES, findSecretLikeValuesFor);
  checks.push({
    name: 'no secret-like values in participant registry files',
    ok: secretLeaks.length === 0,
    detail: secretLeaks.length === 0 ? 'clean' : secretLeaks.join('; '),
  });

  // 12. No sport-specific terminology in domain code / doc / test / migration.
  const domainLeaks = scanFiles(repoRoot, PARTICIPANT_DOMAIN_SCAN_FILES, findDomainTermsFor);
  checks.push({
    name: 'no sport-specific terminology in participant registry files',
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
  checks: ParticipantRegistryBaselineCheck[],
): ParticipantRegistryBaselineResult {
  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    errors: failed.map((c) => `${c.name}: ${c.detail}`),
  };
}
