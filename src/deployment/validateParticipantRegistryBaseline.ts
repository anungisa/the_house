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
 * participant registry; the read-only HTTP surface (adapter, DTOs, auth, barrel) AND the write
 * surface (create + update + status-transition adapter + DTOs) and their unit tests exist; the
 * server wires the `/v1/participants` read routes plus the create/update handlers, the
 * `POST /v1/participants/:participantId/status-transitions` handler, AND the
 * `POST /v1/organizations/:organizationId/participants` organization-link handler; the
 * authorization catalog defines `participant.read`, `participant.write`, `participant.status.write`,
 * AND `participant.organization_link.write`; NO relationship-STATUS write surface is exposed (still
 * deferred); the doc documents its purpose/scope, the key invariants, and the HTTP read + write
 * surfaces; and NO secret-looking values, sport-specific terminology, or out-of-scope behavior
 * terms leak into the domain code, HTTP surface, doc, test, or migration.
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
/**
 * Design/contract preflight for the (not-yet-implemented) HTTP write surface. It must exist and
 * document the idempotency, RLS, privacy, and test-matrix obligations BEFORE any write endpoint is
 * built. This check intentionally does NOT assert any write code exists — it keeps the
 * "design-before-implementation" invariant coherent.
 */
export const PARTICIPANT_WRITE_PREFLIGHT_DOC_REL =
  'docs/architecture/participant-write-http-preflight.md';
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

// HTTP read surface (this pass): a thin, read-only participant list/detail + organization-
// participant relationship list transport gated by the centralized `participant.read` action.
export const PARTICIPANT_HTTP_DIR_REL = 'src/http/participant';
export const PARTICIPANT_HTTP_ADAPTER_REL =
  'src/http/participant/ParticipantReadHttpAdapter.ts';
export const PARTICIPANT_HTTP_DTO_REL = 'src/http/participant/ParticipantReadHttpDtos.ts';
export const PARTICIPANT_HTTP_INDEX_REL = 'src/http/participant/index.ts';
export const PARTICIPANT_HTTP_AUTH_REL = 'src/http/participant/participantHttpAuth.ts';
export const PARTICIPANT_HTTP_TEST_REL =
  'tests/unit/http/participant/ParticipantReadHttpAdapter.test.ts';
export const PARTICIPANT_HTTP_INTEGRATION_TEST_REL =
  'tests/integration/governance/participant-registry-http.integration.test.ts';
// HTTP write surface (create + update + reference-data status transition): mutation endpoints
// gated by the centralized `participant.write` / `participant.status.write` actions. NO
// organization-link or relationship-status write surface here (deliberately deferred).
export const PARTICIPANT_HTTP_WRITE_ADAPTER_REL =
  'src/http/participant/ParticipantWriteHttpAdapter.ts';
export const PARTICIPANT_HTTP_WRITE_DTO_REL =
  'src/http/participant/ParticipantWriteHttpDtos.ts';
export const PARTICIPANT_HTTP_WRITE_TEST_REL =
  'tests/unit/http/participant/ParticipantWriteHttpAdapter.test.ts';
export const SERVER_MODULE_REL = 'src/http/server.ts';
export const AUTHZ_ACTIONS_MODULE_REL = 'src/authz/AuthorizationActions.ts';

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

/** HTTP read-surface files that MUST exist now that the read endpoints are implemented. */
const PARTICIPANT_HTTP_FILES: readonly string[] = [
  PARTICIPANT_HTTP_ADAPTER_REL,
  PARTICIPANT_HTTP_DTO_REL,
  PARTICIPANT_HTTP_INDEX_REL,
  PARTICIPANT_HTTP_AUTH_REL,
];

/** HTTP write-surface files that MUST exist now that create + update + status-transition exist. */
const PARTICIPANT_HTTP_WRITE_FILES: readonly string[] = [
  PARTICIPANT_HTTP_WRITE_ADAPTER_REL,
  PARTICIPANT_HTTP_WRITE_DTO_REL,
];

/** Files scanned for leaked secrets (only those present). */
const PARTICIPANT_SECRET_SCAN_FILES: readonly string[] = [
  ...PARTICIPANT_DOMAIN_FILES,
  ...PARTICIPANT_HTTP_FILES,
  ...PARTICIPANT_HTTP_WRITE_FILES,
  PARTICIPANT_DOC_REL,
  PARTICIPANT_WRITE_PREFLIGHT_DOC_REL,
  PARTICIPANT_MIGRATION_REL,
  PARTICIPANT_VALIDATOR_MODULE,
  PARTICIPANT_VALIDATOR_SCRIPT,
];

/**
 * Files scanned for sport-specific terminology. The domain code, HTTP read/write surface, doc,
 * test, and migration must all stay NSO-generic.
 */
const PARTICIPANT_DOMAIN_SCAN_FILES: readonly string[] = [
  ...PARTICIPANT_DOMAIN_FILES,
  ...PARTICIPANT_HTTP_FILES,
  ...PARTICIPANT_HTTP_WRITE_FILES,
  PARTICIPANT_DOC_REL,
  PARTICIPANT_WRITE_PREFLIGHT_DOC_REL,
  PARTICIPANT_TEST_REL,
  PARTICIPANT_INTEGRATION_TEST_REL,
  PARTICIPANT_MIGRATION_REL,
];

/**
 * Out-of-scope BEHAVIOR terms that must NOT appear in the write surface. Their absence is a
 * coherence signal that the create/update/status-transition slice did not opportunistically grow
 * registration, payments, enrollment, or eligibility.
 */
const WRITE_SCOPE_FORBIDDEN_TERMS: readonly string[] = [
  'registration',
  'payment',
  'enrollment',
  'eligibility',
];

/** Write-surface files scanned for out-of-scope behavior terms. */
const PARTICIPANT_HTTP_WRITE_SCAN_FILES: readonly string[] = [
  ...PARTICIPANT_HTTP_WRITE_FILES,
  PARTICIPANT_HTTP_WRITE_TEST_REL,
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
  {
    name: 'doc documents the HTTP read surface',
    marker: /HTTP read surface/i,
    label: 'HTTP read surface',
  },
  {
    name: 'doc documents the HTTP write surface',
    marker: /HTTP write surface/i,
    label: 'HTTP write surface',
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

  // 7a. The HTTP read-surface files exist.
  for (const rel of PARTICIPANT_HTTP_FILES) {
    const present = existsSync(join(repoRoot, rel));
    checks.push({ name: `HTTP read-surface file exists: ${rel}`, ok: present, detail: rel });
  }

  // 7b. The HTTP read-surface tests (unit + gated integration) exist.
  const httpTestPresent = existsSync(join(repoRoot, PARTICIPANT_HTTP_TEST_REL));
  checks.push({
    name: 'participant HTTP read-surface unit test exists',
    ok: httpTestPresent,
    detail: PARTICIPANT_HTTP_TEST_REL,
  });
  const httpIntegrationTestPresent = existsSync(
    join(repoRoot, PARTICIPANT_HTTP_INTEGRATION_TEST_REL),
  );
  checks.push({
    name: 'participant HTTP read-surface integration test exists',
    ok: httpIntegrationTestPresent,
    detail: PARTICIPANT_HTTP_INTEGRATION_TEST_REL,
  });

  // 7c. The server wires the participant read routes.
  const serverText = readIfExists(join(repoRoot, SERVER_MODULE_REL)) ?? '';
  const wiresList = serverText.includes('/v1/participants');
  checks.push({
    name: 'server wires the /v1/participants read routes',
    ok: wiresList,
    detail: wiresList ? 'references /v1/participants' : 'missing /v1/participants route',
  });
  const wiresOrgLinks = serverText.includes('/participants') && serverText.includes('organizations');
  checks.push({
    name: 'server wires the organization participant read route',
    ok: wiresOrgLinks,
    detail: wiresOrgLinks
      ? 'references /v1/organizations/:organizationId/participants'
      : 'missing organization participant route',
  });

  // 7d. The authorization catalog defines participant.read.
  const authzText = readIfExists(join(repoRoot, AUTHZ_ACTIONS_MODULE_REL)) ?? '';
  const definesAction = authzText.includes("'participant.read'");
  checks.push({
    name: 'authz catalog defines participant.read',
    ok: definesAction,
    detail: definesAction ? "defines 'participant.read'" : "missing 'participant.read' action",
  });

  // 7e. The HTTP write-surface files (adapter + DTOs) exist now that the write surface is built.
  for (const rel of PARTICIPANT_HTTP_WRITE_FILES) {
    const present = existsSync(join(repoRoot, rel));
    checks.push({ name: `HTTP write-surface file exists: ${rel}`, ok: present, detail: rel });
  }

  // 7f. The HTTP write-surface unit test exists.
  const httpWriteTestPresent = existsSync(join(repoRoot, PARTICIPANT_HTTP_WRITE_TEST_REL));
  checks.push({
    name: 'participant HTTP write-surface unit test exists',
    ok: httpWriteTestPresent,
    detail: PARTICIPANT_HTTP_WRITE_TEST_REL,
  });

  // 7g. The authorization catalog defines participant.write (distinct from participant.read).
  const definesWriteAction = authzText.includes("'participant.write'");
  checks.push({
    name: 'authz catalog defines participant.write',
    ok: definesWriteAction,
    detail: definesWriteAction
      ? "defines 'participant.write'"
      : "missing 'participant.write' action",
  });

  // 7g2. The authorization catalog defines participant.status.write (a distinct action gating the
  //      reference-data status transition, NOT implied by participant.write).
  const definesStatusWriteAction = authzText.includes("'participant.status.write'");
  checks.push({
    name: 'authz catalog defines participant.status.write',
    ok: definesStatusWriteAction,
    detail: definesStatusWriteAction
      ? "defines 'participant.status.write'"
      : "missing 'participant.status.write' action",
  });

  // 7g3. The authorization catalog defines participant.organization_link.write (a distinct action
  //      gating the organization-link create, NOT implied by participant.write/status.write).
  const definesOrgLinkWriteAction = authzText.includes("'participant.organization_link.write'");
  checks.push({
    name: 'authz catalog defines participant.organization_link.write',
    ok: definesOrgLinkWriteAction,
    detail: definesOrgLinkWriteAction
      ? "defines 'participant.organization_link.write'"
      : "missing 'participant.organization_link.write' action",
  });

  // 7h. The server wires the participant create + update handlers.
  const wiresWrite =
    serverText.includes('handleParticipantCreate') &&
    serverText.includes('handleParticipantUpdate');
  checks.push({
    name: 'server wires the participant create + update handlers',
    ok: wiresWrite,
    detail: wiresWrite
      ? 'references handleParticipantCreate + handleParticipantUpdate'
      : 'missing participant write handler wiring',
  });

  // 7i. The server wires the participant status-transition handler AND route. (This flipped from a
  //     prior "no status route" scope guard now that the reference-data status transition exists.)
  const wiresStatusTransition =
    serverText.includes('handleParticipantStatusTransition') &&
    serverText.includes('status-transitions');
  checks.push({
    name: 'server wires the participant status-transition route',
    ok: wiresStatusTransition,
    detail: wiresStatusTransition
      ? 'references handleParticipantStatusTransition + status-transitions route'
      : 'missing participant status-transition route wiring',
  });

  // 7j. The server wires the organization-link write handler AND route. (This flipped from a prior
  //     "no organization-link write handler" scope guard now that the organization-link create
  //     exists. The organization-participants path now serves GET read + POST link.)
  const wiresOrgLinkWrite =
    serverText.includes('handleOrganizationParticipantLink') &&
    serverText.includes('organizations') &&
    serverText.includes('participants');
  checks.push({
    name: 'server wires the organization-link write route',
    ok: wiresOrgLinkWrite,
    detail: wiresOrgLinkWrite
      ? 'references handleOrganizationParticipantLink + organization-participants route'
      : 'missing organization-link write route wiring',
  });

  // 7k. Scope guard: NO relationship-STATUS write handler is exposed (still deferred). Changing an
  //     existing relationship's status is a later phase.
  const hasRelStatusWrite =
    serverText.includes('handleOrganizationParticipantStatus') ||
    serverText.includes('handleRelationshipStatusTransition');
  checks.push({
    name: 'server exposes NO relationship-status write handler',
    ok: !hasRelStatusWrite,
    detail: hasRelStatusWrite
      ? 'unexpected relationship-status write handler present'
      : 'no relationship-status write handler (still deferred)',
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

  // 12b. No out-of-scope behavior terms in the write surface (scope did not grow registration,
  //      payments, enrollment, or eligibility).
  const writeScopeLeaks = scanFiles(
    repoRoot,
    PARTICIPANT_HTTP_WRITE_SCAN_FILES,
    findWriteScopeTermsFor,
  );
  checks.push({
    name: 'no out-of-scope behavior terms in the participant write surface',
    ok: writeScopeLeaks.length === 0,
    detail: writeScopeLeaks.length === 0 ? 'clean' : writeScopeLeaks.join('; '),
  });

  // 13. The write HTTP preflight design/contract doc exists and stays coherent now that create,
  //     update, and the reference-data status transition are implemented while the organization-
  //     link write surface remains unimplemented.
  const preflight = readIfExists(join(repoRoot, PARTICIPANT_WRITE_PREFLIGHT_DOC_REL));
  checks.push({
    name: 'participant write HTTP preflight doc exists',
    ok: preflight !== undefined,
    detail: PARTICIPANT_WRITE_PREFLIGHT_DOC_REL,
  });
  const preflightMarkers: ReadonlyArray<{ marker: RegExp; label: string }> = [
    { marker: /phase 1/i, label: 'phase 1 scope' },
    { marker: /not implemented/i, label: 'later phases (status/link) not implemented' },
    { marker: /idempotenc/i, label: 'idempotency model' },
    { marker: /\bRLS\b|tenant[- ]isolation/i, label: 'RLS / tenant isolation' },
    { marker: /privacy/i, label: 'privacy / payload safety' },
    { marker: /test matrix/i, label: 'test matrix' },
    // Phase-2 design coherence: the preflight must keep the status-transition + organization-link
    // design (and its "not implemented" status) documented BEFORE any phase-2 code is built.
    { marker: /phase 2/i, label: 'phase 2 scope' },
    { marker: /status[- ]transition/i, label: 'phase 2 status-transition design' },
    { marker: /organization[- ]link/i, label: 'phase 2 organization-link design' },
  ];
  for (const { marker, label } of preflightMarkers) {
    const present = preflight !== undefined && marker.test(preflight);
    checks.push({
      name: `participant write preflight documents ${label}`,
      ok: present,
      detail: present ? `references ${label}` : `preflight missing reference to ${label}`,
    });
  }

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

function findWriteScopeTermsFor(rel: string, text: string): string[] {
  const lowered = text.toLowerCase();
  const leaks: string[] = [];
  for (const term of WRITE_SCOPE_FORBIDDEN_TERMS) {
    if (lowered.includes(term)) {
      leaks.push(`${rel} contains out-of-scope term "${term}"`);
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
