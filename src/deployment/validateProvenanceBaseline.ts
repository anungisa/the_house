/**
 * Pure, deterministic validator for the signed-provenance / Cosign baseline
 * (image signing, SBOM attestation, and provenance expectations).
 *
 * Like {@link ./validateContainerBaseline}, {@link ./validateMigrationBaseline},
 * and {@link ./validateSupplyChainBaseline}, this is a STATIC checker. It only
 * reads files under a given repo root and reasons about their presence and
 * content. It NEVER:
 *  - signs, attests, pushes, pulls, or verifies a container image,
 *  - calls Cosign, Sigstore, a registry, a transparency log (Rekor), Docker,
 *    Azure, or any network,
 *  - requires credentials, GitHub secrets, OIDC tokens, or a live signer binary,
 *  - mutates anything.
 *
 * It lets CI and developers confirm the signing/provenance contract stays
 * coherent: signing and SBOM attestation are wired as guarded, opt-in,
 * workflow_dispatch-only steps; pull_request workflows never sign or push images;
 * signing is digest-based (never tag-only); the production deploy template carries
 * guarded signature- and attestation-verification placeholders ahead of rollout;
 * no signing config disables controls wholesale; and NO secret-looking values,
 * committed private keys, or sport-specific terminology leak into the committed
 * provenance files.
 *
 * The thin CLI wrapper lives in scripts/validate-provenance-baseline.ts.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { FORBIDDEN_DOMAIN_TERMS, findSecretLikeValues } from './validateDeploymentBaseline.js';

/** A single named check outcome. */
export interface ProvenanceBaselineCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Aggregated validation result. */
export interface ProvenanceBaselineResult {
  readonly ok: boolean;
  readonly checks: readonly ProvenanceBaselineCheck[];
  /** Human-readable messages for every failing check (empty when ok). */
  readonly errors: readonly string[];
}

export const CONTAINER_BUILD_WORKFLOW = '.github/workflows/container-build.yml';
export const DEPLOY_TEMPLATE_WORKFLOW = '.github/workflows/production-deploy-template.yml';
export const PROVENANCE_WORKFLOW = '.github/workflows/provenance-template.yml';
export const PROVENANCE_DOC_REL = 'docs/architecture/signed-provenance-cosign-baseline.md';

/** Files scanned for leaked secrets / sport terminology (only those present). */
const PROVENANCE_SCANNED_FILES: readonly string[] = [
  CONTAINER_BUILD_WORKFLOW,
  DEPLOY_TEMPLATE_WORKFLOW,
  PROVENANCE_WORKFLOW,
  '.github/workflows/ci.yml',
  'Dockerfile',
  'scripts/sign-image.ts',
  'scripts/attest-sbom.ts',
  PROVENANCE_DOC_REL,
];

/** Directories never walked when hunting for committed private-key material. */
const KEY_SCAN_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'legacy',
  '.turbo',
]);

/** Filename suffixes that indicate committed PRIVATE key / signing material. */
const PRIVATE_KEY_SUFFIXES: readonly string[] = ['.pem', '.key', '.p12', '.pfx'];

/** Concept markers indicating signing/provenance is referenced at all. */
const SIGN_REFERENCE = /cosign|sigstore|provenance|signing|signature/i;

/** Active signing/attesting commands (must NOT run on pull_request). */
const ACTIVE_SIGN = /\bcosign\s+(?:sign|attest|sign-blob)\b/i;

/** Image-push markers (must never appear in the build-only PR workflow). */
const PUSH_MARKER = /^\s*push:\s*true\b|docker\s+push\b|--push\b/im;

/** Digest references (signing must bind to a digest, not a mutable tag). */
const DIGEST_MARKER = /@sha256:|\bdigest\b|IMAGE_DIGEST/i;

/** SBOM attestation markers. */
const ATTEST_MARKER = /\battest(?:ation)?\b/i;

/** Keyless / OIDC assumption markers. */
const KEYLESS_MARKER = /keyless|id-token:\s*write|\boidc\b/i;

/** Deploy-template signature-verification placeholder marker. */
const VERIFY_SIG_MARKER = /cosign\s+verify\b(?!-)|verify[^\n]*signature|signature[^\n]*verif/i;

/** Deploy-template SBOM-attestation-verification placeholder marker. */
const VERIFY_ATTEST_MARKER =
  /cosign\s+verify-attestation|verify[^\n]*attestation|attestation[^\n]*verif/i;

/** Markers that would disable signing/verification controls wholesale. */
const CONTROL_BYPASS_MARKERS: readonly RegExp[] = [
  /verif\w*[^\n]*\|\|\s*true/i,
  /--insecure-ignore-tlog/i,
  /--allow-insecure-registry/i,
];

function readIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Strip `#`-style comment tails so checks reason about active YAML lines. */
function activeText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const hashIndex = line.indexOf('#');
      return hashIndex >= 0 ? line.slice(0, hashIndex) : line;
    })
    .join('\n');
}

/** Extract the workflow `on:` trigger block (up to the first `jobs:` key). */
function extractOnSection(text: string): string {
  const active = activeText(text);
  const onMatch = /^on:/m.exec(active);
  if (onMatch === null) return '';
  const start = onMatch.index;
  const jobsMatch = /^jobs:/m.exec(active.slice(start));
  return jobsMatch === null ? active.slice(start) : active.slice(start, start + jobsMatch.index);
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
 * Validate the signed-provenance / Cosign baseline under `repoRoot`. Pure and
 * deterministic: only reads files; never touches Cosign, a registry, a
 * transparency log, the network, Azure, a DB, or credentials.
 */
export function validateProvenanceBaseline(repoRoot: string): ProvenanceBaselineResult {
  const checks: ProvenanceBaselineCheck[] = [];

  // 1. Provenance baseline documentation exists.
  checks.push({
    name: 'signed provenance / Cosign baseline doc exists',
    ok: existsSync(join(repoRoot, PROVENANCE_DOC_REL)),
    detail: PROVENANCE_DOC_REL,
  });

  // 2. package.json exposes the provenance:check script.
  const scripts = parseScripts(readIfExists(join(repoRoot, 'package.json')));
  checks.push({
    name: 'package.json defines provenance:check script',
    ok: typeof scripts['provenance:check'] === 'string',
    detail: 'scripts["provenance:check"]',
  });

  // 3. ci:check chains provenance:check.
  const ciCheck = scripts['ci:check'] ?? '';
  const ciChains = /npm run provenance:check\b/.test(ciCheck);
  checks.push({
    name: 'ci:check includes provenance:check',
    ok: ciChains,
    detail: ciChains ? 'chained in ci:check' : 'not chained in ci:check',
  });

  // 4-6. Container-build (pull_request) references signing but neither signs
  //      nor pushes images.
  const containerBuild = readIfExists(join(repoRoot, CONTAINER_BUILD_WORKFLOW));
  if (containerBuild === undefined) {
    checks.push({
      name: 'container-build.yml references signing/provenance',
      ok: false,
      detail: CONTAINER_BUILD_WORKFLOW,
    });
  } else {
    checks.push({
      name: 'container-build.yml references signing/provenance',
      ok: SIGN_REFERENCE.test(containerBuild),
      detail: SIGN_REFERENCE.test(containerBuild)
        ? 'signing/provenance referenced'
        : 'no signing/provenance reference',
    });
    const cbActive = activeText(containerBuild);
    const signsOnPr = ACTIVE_SIGN.test(cbActive);
    checks.push({
      name: 'container-build.yml does not sign images on pull_request',
      ok: !signsOnPr,
      detail: signsOnPr ? 'found active cosign sign/attest' : 'no active signing on PR',
    });
    const pushesOnPr = PUSH_MARKER.test(cbActive);
    checks.push({
      name: 'container-build.yml does not push images on pull_request',
      ok: !pushesOnPr,
      detail: pushesOnPr ? 'found image push' : 'build-only (no push)',
    });
  }

  // 7-12. The guarded provenance signing workflow.
  const provenance = readIfExists(join(repoRoot, PROVENANCE_WORKFLOW));
  if (provenance === undefined) {
    checks.push({
      name: 'provenance-template.yml exists',
      ok: false,
      detail: PROVENANCE_WORKFLOW,
    });
  } else {
    const onSection = extractOnSection(provenance);
    const dispatchOnly =
      /workflow_dispatch/.test(onSection) &&
      !/^\s*pull_request\s*:/m.test(onSection) &&
      !/^\s*push\s*:/m.test(onSection);
    checks.push({
      name: 'provenance-template.yml is workflow_dispatch-only',
      ok: dispatchOnly,
      detail: dispatchOnly ? 'manual dispatch only' : 'has automatic (push/pull_request) trigger',
    });

    const guarded = /if:\s*\$\{\{[^}]*inputs\.confirm/i.test(provenance);
    checks.push({
      name: 'provenance-template.yml guards live signing behind explicit confirmation',
      ok: guarded,
      detail: guarded ? 'guarded by inputs.confirm' : 'no confirmation guard',
    });

    const signsByDigest = ACTIVE_SIGN.test(activeText(provenance)) && DIGEST_MARKER.test(provenance);
    checks.push({
      name: 'provenance-template.yml signs by digest (not tag-only)',
      ok: signsByDigest,
      detail: signsByDigest ? 'digest-based signing' : 'no digest-bound signing step',
    });

    const attests = ATTEST_MARKER.test(provenance);
    checks.push({
      name: 'provenance-template.yml represents SBOM attestation',
      ok: attests,
      detail: attests ? 'attestation referenced' : 'no SBOM attestation reference',
    });

    const keyless = KEYLESS_MARKER.test(provenance);
    checks.push({
      name: 'provenance-template.yml documents keyless / OIDC assumptions',
      ok: keyless,
      detail: keyless ? 'keyless/OIDC referenced' : 'no keyless/OIDC reference',
    });
  }

  // 13-14. Production deploy template verifies signature + SBOM attestation
  //         before rollout.
  const deployTemplate = readIfExists(join(repoRoot, DEPLOY_TEMPLATE_WORKFLOW));
  if (deployTemplate === undefined) {
    checks.push({
      name: 'production-deploy-template.yml exists',
      ok: false,
      detail: DEPLOY_TEMPLATE_WORKFLOW,
    });
  } else {
    const verifiesSig = VERIFY_SIG_MARKER.test(deployTemplate);
    checks.push({
      name: 'production-deploy-template.yml verifies image signature before deploy',
      ok: verifiesSig,
      detail: verifiesSig ? 'signature verification step present' : 'no signature verification step',
    });
    const verifiesAttest = VERIFY_ATTEST_MARKER.test(deployTemplate);
    checks.push({
      name: 'production-deploy-template.yml verifies SBOM attestation before deploy',
      ok: verifiesAttest,
      detail: verifiesAttest
        ? 'attestation verification step present'
        : 'no attestation verification step',
    });
  }

  // 15. No signing/verification config disables controls wholesale.
  const bypasses = findControlBypasses(repoRoot);
  checks.push({
    name: 'signing/verification controls are not disabled wholesale',
    ok: bypasses.length === 0,
    detail: bypasses.length === 0 ? 'no control bypasses' : bypasses.join('; '),
  });

  // 16. No committed private keys / PEM blocks / Cosign key files.
  const keyMaterial = findCommittedKeyMaterial(repoRoot);
  checks.push({
    name: 'no committed private keys or Cosign key material',
    ok: keyMaterial.length === 0,
    detail: keyMaterial.length === 0 ? 'no private-key material committed' : keyMaterial.join('; '),
  });

  // 17. No secret-like values in any provenance file.
  const secretLeaks = scanFiles(repoRoot, findSecretLikeValuesFor);
  checks.push({
    name: 'no secret-like values in provenance files',
    ok: secretLeaks.length === 0,
    detail: secretLeaks.length === 0 ? 'clean' : secretLeaks.join('; '),
  });

  // 18. No sport-specific terminology in any provenance file.
  const domainLeaks = scanFiles(repoRoot, findDomainTermsFor);
  checks.push({
    name: 'no sport-specific terminology in provenance files',
    ok: domainLeaks.length === 0,
    detail: domainLeaks.length === 0 ? 'clean' : domainLeaks.join('; '),
  });

  return finalize(checks);
}

function scanFiles(repoRoot: string, finder: (rel: string, text: string) => string[]): string[] {
  const leaks: string[] = [];
  for (const rel of PROVENANCE_SCANNED_FILES) {
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
 * Detect configuration that would silently disable signing or verification:
 * `cosign verify ... || true`, `--insecure-ignore-tlog`, or
 * `--allow-insecure-registry`. Only the committed provenance/deploy files are
 * inspected so unrelated `|| true` usage elsewhere never trips this check.
 */
function findControlBypasses(repoRoot: string): string[] {
  const findings: string[] = [];
  for (const rel of [DEPLOY_TEMPLATE_WORKFLOW, PROVENANCE_WORKFLOW]) {
    const text = readIfExists(join(repoRoot, rel));
    if (text === undefined) continue;
    for (const marker of CONTROL_BYPASS_MARKERS) {
      if (marker.test(text)) {
        findings.push(`${rel} disables a control (${marker.source})`);
      }
    }
  }
  return findings;
}

/**
 * Walk the repo (skipping VCS/build/vendor dirs) for committed PRIVATE-key
 * material: `.pem` / `.key` / `.p12` / `.pfx` files, a literal `cosign.key`, or
 * an inline `-----BEGIN ... PRIVATE KEY-----` block in a scanned text file.
 * Public keys (`cosign.pub`) are intentionally NOT flagged.
 */
function findCommittedKeyMaterial(repoRoot: string): string[] {
  const findings: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > 8) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        if (KEY_SCAN_SKIP_DIRS.has(entry)) continue;
        walk(full, depth + 1);
        continue;
      }
      const lower = entry.toLowerCase();
      if (lower === 'cosign.key' || PRIVATE_KEY_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
        findings.push(`committed key material: ${full.slice(repoRoot.length + 1)}`);
      }
    }
  };

  walk(repoRoot, 0);

  // Inline private-key blocks in the scanned provenance files.
  for (const rel of PROVENANCE_SCANNED_FILES) {
    const text = readIfExists(join(repoRoot, rel));
    if (text === undefined) continue;
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) {
      findings.push(`${rel} contains an inline private-key block`);
    }
  }

  return findings;
}

function finalize(checks: ProvenanceBaselineCheck[]): ProvenanceBaselineResult {
  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    errors: failed.map((c) => `${c.name}: ${c.detail}`),
  };
}
