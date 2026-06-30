import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSupplyChainBaseline } from '../../../src/deployment/validateSupplyChainBaseline.js';

/**
 * Hermetic tests for the container supply-chain (SBOM + vulnerability scan)
 * baseline validator. Fully static: they read repo files and build temp fixtures
 * on disk. They NEVER build, pull, or scan a container image, call Docker, Syft,
 * Trivy/Grype, a registry, a vulnerability database, Azure, the network, a
 * database, or require credentials.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');

// --- fixture helpers --------------------------------------------------------

const tempRoots: string[] = [];

const VALID_CONTAINER_BUILD = [
  'name: container-build',
  'on:',
  '  pull_request:',
  '    branches: [main]',
  '  workflow_dispatch:',
  'permissions:',
  '  contents: read',
  'jobs:',
  '  build-images:',
  '    runs-on: ubuntu-latest',
  '    strategy:',
  '      matrix:',
  '        target: [api, worker]',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - uses: docker/build-push-action@v6',
  '        with:',
  '          target: ${{ matrix.target }}',
  '          push: false',
  '          load: true',
  '      - name: Generate SBOM',
  '        uses: anchore/sbom-action@v0',
  '        with:',
  '          format: spdx-json',
  '      - name: Vulnerability scan',
  '        uses: aquasecurity/trivy-action@0.24.0',
  '        with:',
  '          trivy-config: trivy.yaml',
  "          exit-code: '0'",
  '',
].join('\n');

const VALID_DEPLOY_TEMPLATE = [
  'name: production-deploy-template',
  'on:',
  '  workflow_dispatch:',
  '    inputs:',
  '      confirm:',
  '        type: string',
  'jobs:',
  '  deploy:',
  "    if: ${{ inputs.confirm == 'DEPLOY' }}",
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - name: Verify image scan / SBOM artifacts (placeholder gate)',
  '        run: echo "verify SBOM + scan artifacts"',
  '',
].join('\n');

const VALID_PACKAGE_JSON = JSON.stringify(
  {
    name: 'fixture',
    scripts: {
      'supply-chain:check': 'tsx scripts/validate-supply-chain-baseline.ts',
      'ci:check': 'npm run build && npm run supply-chain:check',
    },
  },
  null,
  2,
);

const VALID_TRIVY_YAML = ['severity:', '  - HIGH', '  - CRITICAL', ''].join('\n');

const VALID_DOC = '# Image SBOM & Vulnerability Scanning Baseline\n';

/** Base set of files for a passing fixture. Override or set to null to omit. */
function baseFiles(): Record<string, string | null> {
  return {
    Dockerfile: 'FROM node:20-bookworm-slim AS api\nUSER node\n',
    '.github/workflows/container-build.yml': VALID_CONTAINER_BUILD,
    '.github/workflows/production-deploy-template.yml': VALID_DEPLOY_TEMPLATE,
    '.github/workflows/ci.yml': 'name: ci\njobs:\n  validate:\n    steps:\n      - run: npm test\n',
    'docs/architecture/image-sbom-vulnerability-baseline.md': VALID_DOC,
    'package.json': VALID_PACKAGE_JSON,
    'trivy.yaml': VALID_TRIVY_YAML,
  };
}

function writeRepo(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'house-supplychain-'));
  tempRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
  return root;
}

function findCheck(root: string, name: string): boolean {
  const result = validateSupplyChainBaseline(root);
  return result.checks.find((c) => c.name === name)?.ok ?? false;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------

describe('validateSupplyChainBaseline (static checks)', () => {
  // (1) Passes on the current repository.
  it('passes for the current repository', () => {
    const result = validateSupplyChainBaseline(REPO_ROOT);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  // A constructed valid fixture also passes (and needs no committed SBOM file).
  it('passes for a minimal valid fixture', () => {
    const root = writeRepo(baseFiles());
    expect(validateSupplyChainBaseline(root).ok).toBe(true);
  });

  // (2) Fails when the container-build workflow is missing.
  it('fails when container-build.yml is missing', () => {
    const root = writeRepo({ ...baseFiles(), '.github/workflows/container-build.yml': null });
    const result = validateSupplyChainBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'container-build.yml exists')?.ok).toBe(false);
  });

  // (3) Fails when the SBOM step is missing.
  it('fails when the SBOM step is missing', () => {
    const noSbom = VALID_CONTAINER_BUILD.replace(/.*sbom.*\n/gi, '').replace(/.*spdx.*\n/gi, '');
    const root = writeRepo({ ...baseFiles(), '.github/workflows/container-build.yml': noSbom });
    expect(findCheck(root, 'container-build.yml generates an SBOM')).toBe(false);
  });

  // (4) Fails when the vulnerability scan step is missing.
  it('fails when the vulnerability scan step is missing', () => {
    const noScan = VALID_CONTAINER_BUILD.replace(/.*trivy.*\n/gi, '')
      .replace(/.*scan.*\n/gi, '')
      .replace(/.*vuln.*\n/gi, '');
    const root = writeRepo({ ...baseFiles(), '.github/workflows/container-build.yml': noScan });
    expect(findCheck(root, 'container-build.yml runs a vulnerability scan')).toBe(false);
  });

  // (5) Fails when the PR workflow pushes images.
  it('fails when container-build.yml pushes images', () => {
    const pushes = VALID_CONTAINER_BUILD.replace('push: false', 'push: true');
    const root = writeRepo({ ...baseFiles(), '.github/workflows/container-build.yml': pushes });
    expect(findCheck(root, 'container-build.yml does not push images')).toBe(false);
  });

  // (6) Fails when the build/scan workflow requires secrets.
  it('fails when container-build.yml requires secrets', () => {
    const withSecret = VALID_CONTAINER_BUILD.replace(
      "          exit-code: '0'",
      "          exit-code: '0'\n          token: ${{ secrets.SCANNER_TOKEN }}",
    );
    const root = writeRepo({ ...baseFiles(), '.github/workflows/container-build.yml': withSecret });
    expect(findCheck(root, 'container-build.yml requires no secrets')).toBe(false);
  });

  // (7) Fails on obvious secret-like values.
  it('fails on secret-like values in supply-chain files', () => {
    const root = writeRepo({
      ...baseFiles(),
      Dockerfile:
        'FROM node:20-bookworm-slim AS api\nENV DSN=postgres://svc:Hunter2Hunter2@dbhost/app\nUSER node\n',
    });
    expect(findCheck(root, 'no secret-like values in supply-chain files')).toBe(false);
  });

  // (8) Fails on sport-specific terminology.
  it('fails on sport-specific terminology in supply-chain files', () => {
    const tainted = VALID_CONTAINER_BUILD.replace(
      '      - name: Vulnerability scan',
      '      - name: Vulnerability scan for curling images',
    );
    const root = writeRepo({ ...baseFiles(), '.github/workflows/container-build.yml': tainted });
    expect(findCheck(root, 'no sport-specific terminology in supply-chain files')).toBe(false);
  });

  // (9) Fails when the baseline documentation is missing.
  it('fails when the SBOM/vulnerability baseline doc is missing', () => {
    const root = writeRepo({
      ...baseFiles(),
      'docs/architecture/image-sbom-vulnerability-baseline.md': null,
    });
    expect(findCheck(root, 'image SBOM/vulnerability baseline doc exists')).toBe(false);
  });

  // (10) Fails when the package script is missing.
  it('fails when package.json does not define supply-chain:check', () => {
    const pkg = JSON.stringify({ name: 'fixture', scripts: { 'ci:check': 'npm run build' } });
    const root = writeRepo({ ...baseFiles(), 'package.json': pkg });
    expect(findCheck(root, 'package.json defines supply-chain:check script')).toBe(false);
  });

  // (13) Fails when scanner config suppresses all vulnerabilities.
  it('fails when a .trivyignore suppresses all vulnerabilities', () => {
    const root = writeRepo({ ...baseFiles(), '.trivyignore': '# ignore everything\n*\n' });
    expect(findCheck(root, 'scanner config does not suppress all vulnerabilities')).toBe(false);
  });

  it('fails when trivy.yaml sets an empty severity list', () => {
    const root = writeRepo({ ...baseFiles(), 'trivy.yaml': 'severity: []\n' });
    const result = validateSupplyChainBaseline(root);
    const suppress = result.checks.find(
      (c) => c.name === 'scanner config does not suppress all vulnerabilities',
    )?.ok;
    const thresholds = result.checks.find(
      (c) => c.name === 'scanner config declares explicit severity thresholds',
    )?.ok;
    expect(suppress).toBe(false);
    expect(thresholds).toBe(false);
  });
});

describe('supply-chain release wiring (real repo files)', () => {
  function realScripts(): Record<string, string> {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    return pkg.scripts ?? {};
  }

  // (11) ci:check chains supply-chain:check.
  it('includes supply-chain:check in ci:check', () => {
    expect(realScripts()['ci:check']).toContain('npm run supply-chain:check');
  });

  it('exposes supply-chain:check, sbom:generate, and image:scan scripts', () => {
    const scripts = realScripts();
    expect(scripts['supply-chain:check']).toBe('tsx scripts/validate-supply-chain-baseline.ts');
    expect(scripts['sbom:generate']).toBe('tsx scripts/generate-sbom.ts');
    expect(scripts['image:scan']).toBe('tsx scripts/scan-image.ts');
  });

  // (12) Production deploy template includes a scan/SBOM verification placeholder.
  it('includes a scan/SBOM verification placeholder in the production template', () => {
    const template = readFileSync(
      join(REPO_ROOT, '.github', 'workflows', 'production-deploy-template.yml'),
      'utf8',
    );
    expect(template).toMatch(/verify[^\n]*(?:scan|sbom)/i);
    expect(template).toContain("inputs.confirm == 'DEPLOY'");
  });

  // (14) No committed SBOM artifact is required (none is checked in or demanded).
  it('does not require any committed SBOM artifact', () => {
    expect(existsSync(join(REPO_ROOT, 'sbom-api.spdx.json'))).toBe(false);
    expect(existsSync(join(REPO_ROOT, 'sbom-worker.spdx.json'))).toBe(false);
    // The validator still passes for the real repo (proven above) without them, and
    // no check name references a committed SBOM artifact.
    const checkNames = validateSupplyChainBaseline(REPO_ROOT).checks.map((c) => c.name);
    expect(checkNames.some((n) => /artifact committed|committed sbom/i.test(n))).toBe(false);
  });

  // (15) Docker/scanner tooling is opt-in and never part of default `npm test`.
  it('keeps SBOM/scan tooling out of the default test/build pipeline', () => {
    const scripts = realScripts();
    expect(scripts['test']).not.toMatch(/sbom|scan/i);
    expect(scripts['build']).not.toMatch(/sbom|scan/i);
    // ci:check runs the static validator only — never the image-building runners.
    expect(scripts['ci:check']).not.toContain('sbom:generate');
    expect(scripts['ci:check']).not.toContain('image:scan');
  });
});
