/**
 * Pure, deterministic validator for the container supply-chain baseline (image
 * SBOM generation + vulnerability scanning).
 *
 * Like {@link ./validateContainerBaseline} and {@link ./validateMigrationBaseline},
 * this is a STATIC checker. It only reads files under a given repo root and
 * reasons about their presence and content. It NEVER:
 *  - builds, pulls, or scans a container image,
 *  - calls Docker, Syft, Trivy/Grype, a registry, a vulnerability database,
 *    Azure, or any network,
 *  - requires credentials, GitHub secrets, or a live scanner binary,
 *  - mutates anything.
 *
 * It lets CI and developers confirm the supply-chain contract stays coherent: the
 * container-build workflow generates an SBOM and runs a vulnerability scan without
 * pushing images or requiring secrets on pull_request, the production deploy
 * template carries a guarded scan/SBOM verification placeholder, any committed
 * scanner config keeps explicit severity thresholds (and suppresses NOTHING
 * wholesale), and NO secret-looking values or sport-specific terminology leak into
 * the committed supply-chain files.
 *
 * The thin CLI wrapper lives in scripts/validate-supply-chain-baseline.ts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FORBIDDEN_DOMAIN_TERMS, findSecretLikeValues } from './validateDeploymentBaseline.js';

/** A single named check outcome. */
export interface SupplyChainBaselineCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Aggregated validation result. */
export interface SupplyChainBaselineResult {
  readonly ok: boolean;
  readonly checks: readonly SupplyChainBaselineCheck[];
  /** Human-readable messages for every failing check (empty when ok). */
  readonly errors: readonly string[];
}

export const CONTAINER_BUILD_WORKFLOW = '.github/workflows/container-build.yml';
export const DEPLOY_TEMPLATE_WORKFLOW = '.github/workflows/production-deploy-template.yml';
export const SUPPLY_CHAIN_DOC_REL = 'docs/architecture/image-sbom-vulnerability-baseline.md';

/** Files scanned for leaked secrets / sport terminology (only those present). */
const SUPPLY_CHAIN_SCANNED_FILES: readonly string[] = [
  CONTAINER_BUILD_WORKFLOW,
  DEPLOY_TEMPLATE_WORKFLOW,
  '.github/workflows/ci.yml',
  'Dockerfile',
  'trivy.yaml',
  'trivy.yml',
  '.trivyignore',
];

/** SBOM tooling / step markers (any indicates SBOM generation is wired). */
const SBOM_MARKER = /anchore\/sbom-action|\bsyft\b|cyclonedx|\bspdx\b|\bsbom\b/i;

/** Vulnerability scanner markers (any indicates an image scan step is wired). */
const SCAN_MARKER =
  /aquasecurity\/trivy-action|anchore\/scan-action|\btrivy\b|\bgrype\b|vulnerability scan|\bvuln\b/i;

/** Image-push markers (must never appear in the build-only PR workflow). */
const PUSH_MARKER = /^\s*push:\s*true\b|docker\s+push\b|--push\b/im;

/** GitHub secret references (must be absent from the PR build/scan workflow). */
const SECRET_REF_MARKER = /\$\{\{\s*secrets\./;

/** Deploy-template scan/SBOM verification placeholder marker. */
const VERIFY_MARKER = /verify[^\n]*(?:scan|sbom)|(?:scan|sbom)[^\n]*verif/i;

function readIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Strip `#`-style comment tails so checks reason about active YAML/Docker lines. */
function activeText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const hashIndex = line.indexOf('#');
      return hashIndex >= 0 ? line.slice(0, hashIndex) : line;
    })
    .join('\n');
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
 * Validate the container supply-chain baseline under `repoRoot`. Pure and
 * deterministic: only reads files; never touches Docker, a scanner, a registry,
 * the network, Azure, a DB, or credentials.
 */
export function validateSupplyChainBaseline(repoRoot: string): SupplyChainBaselineResult {
  const checks: SupplyChainBaselineCheck[] = [];

  // 1. Dockerfile present (the images we scan are built from it).
  const dockerfile = readIfExists(join(repoRoot, 'Dockerfile'));
  checks.push({ name: 'Dockerfile exists', ok: dockerfile !== undefined, detail: 'Dockerfile' });

  // 2. Container-build workflow present.
  const containerBuild = readIfExists(join(repoRoot, CONTAINER_BUILD_WORKFLOW));
  if (containerBuild === undefined) {
    checks.push({
      name: 'container-build.yml exists',
      ok: false,
      detail: CONTAINER_BUILD_WORKFLOW,
    });
    // Without the workflow, the remaining workflow-scoped checks cannot pass.
    return finalize(appendStaticChecks(checks, repoRoot));
  }

  const containerBuildActive = activeText(containerBuild);

  // 3. Container-build generates an SBOM (or carries an explicit SBOM placeholder).
  const hasSbom = SBOM_MARKER.test(containerBuildActive);
  checks.push({
    name: 'container-build.yml generates an SBOM',
    ok: hasSbom,
    detail: hasSbom ? 'SBOM step present' : 'no SBOM/syft/spdx step',
  });

  // 4. Container-build runs a vulnerability scan (or carries a scan placeholder).
  const hasScan = SCAN_MARKER.test(containerBuildActive);
  checks.push({
    name: 'container-build.yml runs a vulnerability scan',
    ok: hasScan,
    detail: hasScan ? 'scan step present' : 'no trivy/grype/scan step',
  });

  // 5. The build/scan workflow never pushes images.
  const pushes = PUSH_MARKER.test(containerBuildActive);
  checks.push({
    name: 'container-build.yml does not push images',
    ok: !pushes,
    detail: pushes ? 'found image push' : 'build/scan-only (no push)',
  });

  // 6. The PR build/scan workflow requires no GitHub secrets.
  const usesSecrets = SECRET_REF_MARKER.test(containerBuild);
  checks.push({
    name: 'container-build.yml requires no secrets',
    ok: !usesSecrets,
    detail: usesSecrets ? 'found ${{ secrets.* }} reference' : 'no secrets required',
  });

  return finalize(appendStaticChecks(checks, repoRoot));
}

/**
 * Append the repo-wide static checks that do not depend on container-build
 * existing (deploy-template verification, docs, scripts, secret/terminology
 * scans, scanner-config hygiene).
 */
function appendStaticChecks(
  checks: SupplyChainBaselineCheck[],
  repoRoot: string,
): SupplyChainBaselineCheck[] {
  // 7. Production deploy template carries a guarded scan/SBOM verification step.
  const deployTemplate = readIfExists(join(repoRoot, DEPLOY_TEMPLATE_WORKFLOW));
  if (deployTemplate === undefined) {
    checks.push({
      name: 'production-deploy-template.yml exists',
      ok: false,
      detail: DEPLOY_TEMPLATE_WORKFLOW,
    });
  } else {
    const verifies = VERIFY_MARKER.test(activeText(deployTemplate));
    checks.push({
      name: 'production-deploy-template.yml verifies image scan/SBOM before deploy',
      ok: verifies,
      detail: verifies ? 'scan/SBOM verification step present' : 'no scan/SBOM verification step',
    });
  }

  // 8. Supply-chain baseline documentation exists.
  const docExists = existsSync(join(repoRoot, SUPPLY_CHAIN_DOC_REL));
  checks.push({
    name: 'image SBOM/vulnerability baseline doc exists',
    ok: docExists,
    detail: SUPPLY_CHAIN_DOC_REL,
  });

  // 9. package.json exposes the supply-chain:check script.
  const scripts = parseScripts(readIfExists(join(repoRoot, 'package.json')));
  const hasScript = typeof scripts['supply-chain:check'] === 'string';
  checks.push({
    name: 'package.json defines supply-chain:check script',
    ok: hasScript,
    detail: 'scripts["supply-chain:check"]',
  });

  // 10. ci:check chains supply-chain:check.
  const ciCheck = scripts['ci:check'] ?? '';
  const ciChains = /npm run supply-chain:check\b/.test(ciCheck);
  checks.push({
    name: 'ci:check includes supply-chain:check',
    ok: ciChains,
    detail: ciChains ? 'chained in ci:check' : 'not chained in ci:check',
  });

  // 11. No secret-like values in any supply-chain file.
  const secretLeaks = scanFiles(repoRoot, findSecretLikeValuesFor);
  checks.push({
    name: 'no secret-like values in supply-chain files',
    ok: secretLeaks.length === 0,
    detail: secretLeaks.length === 0 ? 'clean' : secretLeaks.join('; '),
  });

  // 12. No sport-specific terminology in any supply-chain file.
  const domainLeaks = scanFiles(repoRoot, findDomainTermsFor);
  checks.push({
    name: 'no sport-specific terminology in supply-chain files',
    ok: domainLeaks.length === 0,
    detail: domainLeaks.length === 0 ? 'clean' : domainLeaks.join('; '),
  });

  // 13. No scanner config suppresses all vulnerabilities.
  const suppressAll = findBlanketSuppressions(repoRoot);
  checks.push({
    name: 'scanner config does not suppress all vulnerabilities',
    ok: suppressAll.length === 0,
    detail: suppressAll.length === 0 ? 'no blanket suppressions' : suppressAll.join('; '),
  });

  // 14. Any committed scanner config declares explicit severity thresholds.
  const severityGaps = findMissingSeverityThresholds(repoRoot);
  checks.push({
    name: 'scanner config declares explicit severity thresholds',
    ok: severityGaps.length === 0,
    detail: severityGaps.length === 0 ? 'explicit thresholds (or no config)' : severityGaps.join('; '),
  });

  return checks;
}

function scanFiles(
  repoRoot: string,
  finder: (rel: string, text: string) => string[],
): string[] {
  const leaks: string[] = [];
  for (const rel of SUPPLY_CHAIN_SCANNED_FILES) {
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

/**
 * Detect scanner configuration that would suppress vulnerabilities wholesale:
 * a `.trivyignore` wildcard line, or a trivy config with an empty `severity:`.
 */
function findBlanketSuppressions(repoRoot: string): string[] {
  const findings: string[] = [];

  const ignore = readIfExists(join(repoRoot, '.trivyignore'));
  if (ignore !== undefined) {
    for (const raw of ignore.split(/\r?\n/)) {
      const line = raw.split('#')[0]?.trim() ?? '';
      if (line === '') continue;
      // A bare wildcard / CVE wildcard would ignore every finding.
      if (line === '*' || /^cve-\*+$/i.test(line) || /^\*+$/.test(line)) {
        findings.push(`.trivyignore suppresses all vulnerabilities ("${line}")`);
      }
    }
  }

  for (const rel of ['trivy.yaml', 'trivy.yml']) {
    const text = readIfExists(join(repoRoot, rel));
    if (text === undefined) continue;
    // An explicit empty severity list scans/reports nothing.
    if (/severity:\s*\[\s*\]/.test(text)) {
      findings.push(`${rel} sets an empty severity list`);
    }
  }

  return findings;
}

/**
 * Any committed trivy config must declare a non-empty `severity:` threshold so
 * scanning is intentional rather than implicit. A `.trivyignore` alone is not a
 * severity config and does not require thresholds. Absence of any config passes.
 */
function findMissingSeverityThresholds(repoRoot: string): string[] {
  const gaps: string[] = [];
  for (const rel of ['trivy.yaml', 'trivy.yml']) {
    const text = readIfExists(join(repoRoot, rel));
    if (text === undefined) continue;
    const hasSeverity = /severity:\s*(?:\n(?:\s*-\s*\w+)+|\[[^\]]*\w+[^\]]*\])/.test(text);
    if (!hasSeverity) {
      gaps.push(`${rel} declares no explicit severity thresholds`);
    }
  }
  return gaps;
}

function finalize(checks: SupplyChainBaselineCheck[]): SupplyChainBaselineResult {
  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    errors: failed.map((c) => `${c.name}: ${c.detail}`),
  };
}
