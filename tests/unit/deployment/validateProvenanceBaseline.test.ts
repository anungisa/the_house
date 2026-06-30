import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { validateProvenanceBaseline } from '../../../src/deployment/validateProvenanceBaseline.js';

/**
 * Hermetic tests for the signed-provenance / Cosign baseline validator and the
 * opt-in signing/attestation runner scripts. Fully static: they read repo files,
 * build temp fixtures on disk, and (for the runner scripts) invoke them in
 * DRY-RUN / input-validation paths only. They NEVER sign, attest, push, pull, or
 * verify an image, call Cosign / Sigstore / a registry / a transparency log /
 * Docker / Azure / the network, a database, or require credentials.
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
  'jobs:',
  '  build-images:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: docker/build-push-action@v6',
  '        with:',
  '          push: false',
  '          load: true',
  '      # Image signing / provenance handled only by provenance-template.yml',
  '      # (cosign keyless). A pull_request build is never signed or pushed.',
  '',
].join('\n');

const VALID_PROVENANCE_TEMPLATE = [
  '# Signed provenance template (cosign keyless / OIDC).',
  'name: provenance-template',
  'on:',
  '  workflow_dispatch:',
  '    inputs:',
  '      confirm:',
  '        type: string',
  '      image_digest:',
  '        type: string',
  'permissions:',
  '  contents: read',
  '  id-token: write',
  'jobs:',
  '  sign:',
  "    if: ${{ inputs.confirm == 'SIGN' }}",
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: sigstore/cosign-installer@v3',
  '      - name: Sign image digest (keyless)',
  '        run: cosign sign --yes "${{ inputs.image_digest }}"',
  '      - name: Attest SBOM for image digest (keyless)',
  '        run: cosign attest --yes --type spdxjson --predicate sbom.spdx.json "${{ inputs.image_digest }}"',
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
  '      - name: Verify image signature (placeholder gate)',
  '        run: echo "cosign verify ... @sha256:digest"',
  '      - name: Verify SBOM attestation (placeholder gate)',
  '        run: echo "cosign verify-attestation --type spdxjson"',
  '',
].join('\n');

const VALID_PACKAGE_JSON = JSON.stringify(
  {
    name: 'fixture',
    scripts: {
      'provenance:check': 'tsx scripts/validate-provenance-baseline.ts',
      'ci:check': 'npm run build && npm run provenance:check',
    },
  },
  null,
  2,
);

const VALID_DOC = '# Signed Provenance / Cosign Baseline\n';

/** Base set of files for a passing fixture. Override or set to null to omit. */
function baseFiles(): Record<string, string | null> {
  return {
    '.github/workflows/container-build.yml': VALID_CONTAINER_BUILD,
    '.github/workflows/provenance-template.yml': VALID_PROVENANCE_TEMPLATE,
    '.github/workflows/production-deploy-template.yml': VALID_DEPLOY_TEMPLATE,
    'docs/architecture/signed-provenance-cosign-baseline.md': VALID_DOC,
    'package.json': VALID_PACKAGE_JSON,
  };
}

function writeRepo(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'house-provenance-'));
  tempRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
  return root;
}

function checkOk(root: string, name: string): boolean {
  const result = validateProvenanceBaseline(root);
  return result.checks.find((c) => c.name === name)?.ok ?? false;
}

// --- runner-script helpers (DRY-RUN / input validation only) ----------------

const TSX_CLI = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const VALID_DIGEST = `registry.example/the-house-api@sha256:${'a'.repeat(64)}`;

interface RunResult {
  readonly code: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

function runScript(relScript: string, env: Record<string, string>): RunResult {
  const result = spawnSync(process.execPath, [TSX_CLI, join(REPO_ROOT, relScript)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    // Strip inherited provenance env so tests are deterministic.
    env: { ...process.env, IMAGE_DIGEST: '', SBOM_PATH: '', ...env },
  });
  return { code: result.status, stderr: result.stderr, stdout: result.stdout };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------

describe('validateProvenanceBaseline (static checks)', () => {
  // (1) Passes on the current repository.
  it('passes on the current repository', () => {
    const result = validateProvenanceBaseline(REPO_ROOT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // (2) Passes on a complete valid fixture.
  it('passes on a complete valid fixture', () => {
    const result = validateProvenanceBaseline(writeRepo(baseFiles()));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // (3) Fails if the provenance doc is missing.
  it('fails when the provenance baseline doc is missing', () => {
    const files = baseFiles();
    files['docs/architecture/signed-provenance-cosign-baseline.md'] = null;
    const root = writeRepo(files);
    expect(validateProvenanceBaseline(root).ok).toBe(false);
    expect(checkOk(root, 'signed provenance / Cosign baseline doc exists')).toBe(false);
  });

  // (4) Fails if package.json omits provenance:check.
  it('fails when provenance:check script is missing', () => {
    const files = baseFiles();
    files['package.json'] = JSON.stringify({ scripts: { 'ci:check': 'npm run build' } });
    const root = writeRepo(files);
    expect(checkOk(root, 'package.json defines provenance:check script')).toBe(false);
  });

  // (5) Fails if ci:check does not chain provenance:check.
  it('fails when ci:check omits provenance:check', () => {
    const files = baseFiles();
    files['package.json'] = JSON.stringify({
      scripts: { 'provenance:check': 'tsx x.ts', 'ci:check': 'npm run build' },
    });
    const root = writeRepo(files);
    expect(checkOk(root, 'ci:check includes provenance:check')).toBe(false);
  });

  // (6) Fails if the pull_request build workflow actively signs images.
  it('fails when container-build.yml signs images on pull_request', () => {
    const files = baseFiles();
    files['.github/workflows/container-build.yml'] =
      VALID_CONTAINER_BUILD + '\n      - run: cosign sign --yes the-house-api:ci\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'container-build.yml does not sign images on pull_request')).toBe(false);
  });

  // (7) Fails if the pull_request build workflow pushes images.
  it('fails when container-build.yml pushes images on pull_request', () => {
    const files = baseFiles();
    files['.github/workflows/container-build.yml'] = VALID_CONTAINER_BUILD.replace(
      'push: false',
      'push: true',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'container-build.yml does not push images on pull_request')).toBe(false);
  });

  // (8) Fails if the provenance workflow is missing.
  it('fails when provenance-template.yml is missing', () => {
    const files = baseFiles();
    files['.github/workflows/provenance-template.yml'] = null;
    const root = writeRepo(files);
    expect(checkOk(root, 'provenance-template.yml exists')).toBe(false);
  });

  // (9) Fails if the provenance workflow has an automatic trigger.
  it('fails when provenance-template.yml has a pull_request trigger', () => {
    const files = baseFiles();
    files['.github/workflows/provenance-template.yml'] = VALID_PROVENANCE_TEMPLATE.replace(
      'on:\n  workflow_dispatch:',
      'on:\n  pull_request:\n    branches: [main]\n  workflow_dispatch:',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'provenance-template.yml is workflow_dispatch-only')).toBe(false);
  });

  // (10) Fails if live signing is not guarded by an explicit confirmation.
  it('fails when provenance-template.yml does not guard signing', () => {
    const files = baseFiles();
    files['.github/workflows/provenance-template.yml'] = VALID_PROVENANCE_TEMPLATE.replace(
      "    if: ${{ inputs.confirm == 'SIGN' }}\n",
      '',
    );
    const root = writeRepo(files);
    expect(
      checkOk(root, 'provenance-template.yml guards live signing behind explicit confirmation'),
    ).toBe(false);
  });

  // (11) Fails if signing is tag-only (no digest binding).
  it('fails when provenance-template.yml signs without a digest', () => {
    const files = baseFiles();
    files['.github/workflows/provenance-template.yml'] = [
      'name: provenance-template',
      'on:',
      '  workflow_dispatch:',
      'permissions:',
      '  id-token: write',
      'jobs:',
      '  sign:',
      "    if: ${{ inputs.confirm == 'SIGN' }}",
      '    steps:',
      '      - run: cosign sign --yes the-house-api:latest  # keyless',
      '      - run: cosign attest --yes the-house-api:latest',
      '',
    ].join('\n');
    const root = writeRepo(files);
    expect(checkOk(root, 'provenance-template.yml signs by digest (not tag-only)')).toBe(false);
  });

  // (12) Fails if the deploy template lacks signature verification.
  it('fails when production-deploy-template.yml lacks signature verification', () => {
    const files = baseFiles();
    files['.github/workflows/production-deploy-template.yml'] = VALID_DEPLOY_TEMPLATE.replace(
      '      - name: Verify image signature (placeholder gate)\n' +
        '        run: echo "cosign verify ... @sha256:digest"\n',
      '',
    );
    const root = writeRepo(files);
    expect(
      checkOk(root, 'production-deploy-template.yml verifies image signature before deploy'),
    ).toBe(false);
  });

  // (13) Fails if the deploy template lacks SBOM attestation verification.
  it('fails when production-deploy-template.yml lacks attestation verification', () => {
    const files = baseFiles();
    files['.github/workflows/production-deploy-template.yml'] = VALID_DEPLOY_TEMPLATE.replace(
      '      - name: Verify SBOM attestation (placeholder gate)\n' +
        '        run: echo "cosign verify-attestation --type spdxjson"\n',
      '',
    );
    const root = writeRepo(files);
    expect(
      checkOk(root, 'production-deploy-template.yml verifies SBOM attestation before deploy'),
    ).toBe(false);
  });

  // (14) Fails if a verification control is bypassed wholesale.
  it('fails when a verification step is bypassed with || true', () => {
    const files = baseFiles();
    files['.github/workflows/production-deploy-template.yml'] = VALID_DEPLOY_TEMPLATE.replace(
      '        run: echo "cosign verify ... @sha256:digest"',
      '        run: cosign verify the-house-api@sha256:x || true',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'signing/verification controls are not disabled wholesale')).toBe(false);
  });

  // (15) Fails if a private key / Cosign key file is committed.
  it('fails when a private-key file is committed', () => {
    const files = baseFiles();
    files['cosign.key'] = 'fake-key-material';
    const root = writeRepo(files);
    expect(checkOk(root, 'no committed private keys or Cosign key material')).toBe(false);
  });

  // (16) Fails on an inline PRIVATE KEY block in a scanned provenance file.
  it('fails on an inline private-key block in a scanned file', () => {
    const files = baseFiles();
    files['.github/workflows/provenance-template.yml'] =
      VALID_PROVENANCE_TEMPLATE +
      '\n# -----BEGIN OPENSSH PRIVATE KEY-----\n# abc\n# -----END OPENSSH PRIVATE KEY-----\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'no committed private keys or Cosign key material')).toBe(false);
  });

  // (17) Fails on a secret-like value in a provenance file.
  it('fails on a secret-like value in a provenance file', () => {
    const files = baseFiles();
    files['.github/workflows/provenance-template.yml'] =
      VALID_PROVENANCE_TEMPLATE +
      '\n      - run: echo postgres://svc:Hunter2Hunter2@dbhost/app\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'no secret-like values in provenance files')).toBe(false);
  });

  // (18) Fails on sport-specific terminology in a provenance file.
  it('fails on sport-specific terminology in a provenance file', () => {
    const files = baseFiles();
    files['docs/architecture/signed-provenance-cosign-baseline.md'] =
      VALID_DOC + '\nThis curling bonspiel detail must not appear.\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'no sport-specific terminology in provenance files')).toBe(false);
  });
});

describe('sign-image / attest-sbom runners (input validation, no Cosign/network)', () => {
  // (19) sign-image refuses a missing digest.
  it('sign-image rejects a missing IMAGE_DIGEST', () => {
    const result = runScript('scripts/sign-image.ts', {});
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/IMAGE_DIGEST is required/);
  });

  // (20) sign-image refuses a tag-only reference.
  it('sign-image rejects a tag-only reference', () => {
    const result = runScript('scripts/sign-image.ts', { IMAGE_DIGEST: 'the-house-api:latest' });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/tag-only reference/);
  });

  // (21) sign-image dry-runs a valid digest with NO Cosign / registry / network.
  it('sign-image dry-runs a valid digest without Cosign or network', () => {
    const result = runScript('scripts/sign-image.ts', { IMAGE_DIGEST: VALID_DIGEST });
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/DRY RUN/);
    expect(result.stdout).toMatch(/cosign sign/);
  });

  // (22) attest-sbom refuses a missing SBOM path.
  it('attest-sbom rejects a missing SBOM_PATH', () => {
    const result = runScript('scripts/attest-sbom.ts', { IMAGE_DIGEST: VALID_DIGEST });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/SBOM_PATH is required/);
  });

  // (23) attest-sbom refuses a non-existent SBOM artifact.
  it('attest-sbom rejects a non-existent SBOM artifact', () => {
    const result = runScript('scripts/attest-sbom.ts', {
      IMAGE_DIGEST: VALID_DIGEST,
      SBOM_PATH: 'does-not-exist.spdx.json',
    });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/does not exist/);
  });
});
