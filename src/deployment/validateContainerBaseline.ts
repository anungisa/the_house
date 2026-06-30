/**
 * Pure, deterministic validator for the container packaging and CI/CD baseline.
 *
 * Like {@link ./validateDeploymentBaseline}, this is a STATIC checker. It only
 * reads files under a given repo root and reasons about their presence and
 * content. It NEVER:
 *  - builds or runs a container,
 *  - calls Docker, a registry, Azure, or any network,
 *  - requires credentials, a database, or secrets,
 *  - mutates anything.
 *
 * It lets CI and developers confirm the build/release contract stays coherent:
 * container packaging exists, runtime entrypoints are present, GitHub Actions
 * workflows validate without deploying on pull requests, the production deploy
 * template is manual-only and guarded, and NO secret-looking values or
 * sport-specific terminology leak into the committed container/CI files.
 *
 * The thin CLI wrapper lives in scripts/validate-container-baseline.ts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FORBIDDEN_DOMAIN_TERMS, findSecretLikeValues } from './validateDeploymentBaseline.js';

/** A single named check outcome. */
export interface ContainerBaselineCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Aggregated validation result. */
export interface ContainerBaselineResult {
  readonly ok: boolean;
  readonly checks: readonly ContainerBaselineCheck[];
  /** Human-readable messages for every failing check (empty when ok). */
  readonly errors: readonly string[];
}

/** CI gates the ci.yml workflow must invoke (matched as `npm run <name>`). */
export const REQUIRED_CI_GATES: readonly string[] = [
  'typecheck',
  'lint',
  'build',
  'deploy:check',
  'container:check',
];

/** Container/CI files scanned for secrets and sport terminology. */
const SCANNED_RELATIVE_FILES: readonly string[] = [
  'Dockerfile',
  '.dockerignore',
  '.github/workflows/ci.yml',
  '.github/workflows/container-build.yml',
  '.github/workflows/production-deploy-template.yml',
];

const CI_WORKFLOW = '.github/workflows/ci.yml';
const CONTAINER_BUILD_WORKFLOW = '.github/workflows/container-build.yml';
const DEPLOY_TEMPLATE_WORKFLOW = '.github/workflows/production-deploy-template.yml';

function readIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Strip `#`-style comment tails so checks reason about active YAML/Docker lines. */
function activeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const hashIndex = line.indexOf('#');
      return hashIndex >= 0 ? line.slice(0, hashIndex) : line;
    })
    .filter((line) => line.trim().length > 0);
}

/** True when any active (non-comment) line matches `pattern`. */
function activeMatch(text: string, pattern: RegExp): boolean {
  return activeLines(text).some((line) => pattern.test(line));
}

/**
 * Validate the container packaging + CI/CD baseline under `repoRoot`. Pure and
 * deterministic: only reads files; never touches Docker, a registry, the
 * network, Azure, a DB, or credentials.
 */
export function validateContainerBaseline(repoRoot: string): ContainerBaselineResult {
  const checks: ContainerBaselineCheck[] = [];

  // 1. Dockerfile present.
  const dockerfile = readIfExists(join(repoRoot, 'Dockerfile'));
  checks.push({
    name: 'Dockerfile exists',
    ok: dockerfile !== undefined,
    detail: 'Dockerfile',
  });

  // 2. .dockerignore present.
  const dockerignore = readIfExists(join(repoRoot, '.dockerignore'));
  checks.push({
    name: '.dockerignore exists',
    ok: dockerignore !== undefined,
    detail: '.dockerignore',
  });

  // 3. Dockerfile never copies a .env file into the image.
  const copiesEnv =
    dockerfile !== undefined &&
    activeMatch(dockerfile, /^\s*COPY\b[^\n]*(?:^|[\s/])\.env(\b|\.)/im);
  checks.push({
    name: 'Dockerfile does not copy .env into the image',
    ok: dockerfile !== undefined && !copiesEnv,
    detail: copiesEnv ? 'found COPY referencing .env' : 'no .env copy',
  });

  // 4. .dockerignore excludes .env.
  const ignoresEnv =
    dockerignore !== undefined && activeMatch(dockerignore, /^\s*\.env(\b|\.|\*)/m);
  checks.push({
    name: '.dockerignore excludes .env',
    ok: ignoresEnv,
    detail: ignoresEnv ? '.env excluded' : '.env not excluded',
  });

  // 5. API runtime entrypoint present and referenced by the Dockerfile.
  const apiEntrypoint = existsSync(join(repoRoot, 'src', 'server', 'api.ts'));
  const apiReferenced = dockerfile !== undefined && /dist\/src\/server\/api\.js/.test(dockerfile);
  checks.push({
    name: 'API runtime entrypoint present and built',
    ok: apiEntrypoint && apiReferenced,
    detail: `src/server/api.ts=${String(apiEntrypoint)}, dist ref=${String(apiReferenced)}`,
  });

  // 6. Worker runtime entrypoint present and referenced by the Dockerfile.
  const workerEntrypoint = existsSync(join(repoRoot, 'src', 'server', 'worker.ts'));
  const workerReferenced =
    dockerfile !== undefined && /dist\/src\/server\/worker\.js/.test(dockerfile);
  checks.push({
    name: 'worker runtime entrypoint present and built',
    ok: workerEntrypoint && workerReferenced,
    detail: `src/server/worker.ts=${String(workerEntrypoint)}, dist ref=${String(workerReferenced)}`,
  });

  // 7. Dockerfile runs as a non-root user.
  const nonRoot = dockerfile !== undefined && activeMatch(dockerfile, /^\s*USER\s+(?!root\b)\S+/im);
  checks.push({
    name: 'Dockerfile drops to a non-root user',
    ok: nonRoot,
    detail: nonRoot ? 'USER set to non-root' : 'no non-root USER directive',
  });

  // 8. CI workflow present and runs the required validation gates.
  const ci = readIfExists(join(repoRoot, CI_WORKFLOW));
  if (ci === undefined) {
    checks.push({ name: 'ci.yml exists', ok: false, detail: CI_WORKFLOW });
  } else {
    const missingGates = REQUIRED_CI_GATES.filter(
      (gate) => !new RegExp(`npm run ${escapeRegExp(gate)}\\b`).test(ci),
    );
    checks.push({
      name: 'ci.yml runs required validation gates',
      ok: missingGates.length === 0,
      detail: missingGates.length === 0 ? 'all gates present' : `missing: ${missingGates.join(', ')}`,
    });
    // ci.yml must also run the hermetic test suite.
    const runsTests = /npm test\b/.test(ci) || /npm run test\b/.test(ci);
    checks.push({
      name: 'ci.yml runs the test suite',
      ok: runsTests,
      detail: runsTests ? 'npm test present' : 'no test invocation',
    });
  }

  // 9. CI workflow performs no Azure login / deployment.
  if (ci !== undefined) {
    const deploys = mentionsAzureDeploy(ci);
    checks.push({
      name: 'ci.yml does not authenticate to or deploy on Azure',
      ok: !deploys,
      detail: deploys ? 'found Azure login/deploy reference' : 'validation-only',
    });
  }

  // 10. Container build workflow present and never pushes images by default.
  const containerBuild = readIfExists(join(repoRoot, CONTAINER_BUILD_WORKFLOW));
  if (containerBuild === undefined) {
    checks.push({
      name: 'container-build.yml exists',
      ok: false,
      detail: CONTAINER_BUILD_WORKFLOW,
    });
  } else {
    const pushesByDefault =
      activeMatch(containerBuild, /^\s*push:\s*true\b/im) ||
      activeMatch(containerBuild, /docker\s+push\b/i);
    checks.push({
      name: 'container-build.yml does not push images by default',
      ok: !pushesByDefault,
      detail: pushesByDefault ? 'found unguarded image push' : 'build-only (push disabled)',
    });
    const buildsOnPr = /pull_request\b/.test(containerBuild);
    checks.push({
      name: 'container-build.yml validates image builds on pull_request',
      ok: buildsOnPr,
      detail: buildsOnPr ? 'pull_request trigger present' : 'no pull_request trigger',
    });
  }

  // 11. Production deploy template is manual-only (workflow_dispatch).
  const deployTemplate = readIfExists(join(repoRoot, DEPLOY_TEMPLATE_WORKFLOW));
  if (deployTemplate === undefined) {
    checks.push({
      name: 'production-deploy-template.yml exists',
      ok: false,
      detail: DEPLOY_TEMPLATE_WORKFLOW,
    });
  } else {
    const manualOnly =
      /workflow_dispatch\b/.test(deployTemplate) &&
      !triggersOn(deployTemplate, 'push') &&
      !triggersOn(deployTemplate, 'pull_request');
    checks.push({
      name: 'production-deploy-template.yml is manual-only (workflow_dispatch)',
      ok: manualOnly,
      detail: manualOnly ? 'workflow_dispatch only' : 'has automatic triggers',
    });

    // 12. Deploy template is explicitly guarded against accidental execution.
    const guarded =
      activeMatch(deployTemplate, /^\s*if:\s*false\b/im) ||
      (/\bconfirm\b/i.test(deployTemplate) && /if:\s*\$\{\{[^}]*confirm/i.test(deployTemplate));
    checks.push({
      name: 'production-deploy-template.yml guards live deployment',
      ok: guarded,
      detail: guarded ? 'explicit deploy guard present' : 'no deploy confirmation guard',
    });
  }

  // 13. No secret-like values in any container/CI file.
  const secretLeaks = scanFilesForSecrets(repoRoot);
  checks.push({
    name: 'no secret-like values in container/CI files',
    ok: secretLeaks.length === 0,
    detail: secretLeaks.length === 0 ? 'clean' : secretLeaks.join('; '),
  });

  // 14. No sport-specific terminology in any container/CI file.
  const domainLeaks = scanFilesForDomainTerms(repoRoot);
  checks.push({
    name: 'no sport-specific terminology in container/CI files',
    ok: domainLeaks.length === 0,
    detail: domainLeaks.length === 0 ? 'clean' : domainLeaks.join('; '),
  });

  // 15. package.json exposes the container:check and ci:check scripts.
  const pkgText = readIfExists(join(repoRoot, 'package.json'));
  const scripts = parseScripts(pkgText);
  for (const scriptName of ['container:check', 'ci:check'] as const) {
    checks.push({
      name: `package.json defines ${scriptName} script`,
      ok: typeof scripts[scriptName] === 'string',
      detail: `scripts["${scriptName}"]`,
    });
  }

  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    errors: failed.map((c) => `${c.name}: ${c.detail}`),
  };
}

/** True when `text` declares `trigger` as an `on:` event. */
function triggersOn(text: string, trigger: string): boolean {
  return activeMatch(text, new RegExp(`^\\s*${escapeRegExp(trigger)}:`, 'm'));
}

/** True when a workflow references Azure authentication or deployment actions. */
function mentionsAzureDeploy(text: string): boolean {
  const patterns: readonly RegExp[] = [
    /azure\/login@/i,
    /\baz\s+(?:login|deployment|containerapp|acr|webapp)\b/i,
    /azure\/arm-deploy@/i,
    /azure\/cli@/i,
  ];
  return activeLines(text).some((line) => patterns.some((p) => p.test(line)));
}

function scanFilesForSecrets(repoRoot: string): string[] {
  const leaks: string[] = [];
  for (const rel of SCANNED_RELATIVE_FILES) {
    const text = readIfExists(join(repoRoot, rel));
    if (text === undefined) continue;
    const findings = findSecretLikeValues(text);
    for (const rule of findings) {
      leaks.push(`${rel} (${rule})`);
    }
  }
  return leaks;
}

function scanFilesForDomainTerms(repoRoot: string): string[] {
  const leaks: string[] = [];
  for (const rel of SCANNED_RELATIVE_FILES) {
    const text = readIfExists(join(repoRoot, rel));
    if (text === undefined) continue;
    const lowered = text.toLowerCase();
    for (const term of FORBIDDEN_DOMAIN_TERMS) {
      if (lowered.includes(term)) {
        leaks.push(`${rel} contains "${term}"`);
      }
    }
  }
  return leaks;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
