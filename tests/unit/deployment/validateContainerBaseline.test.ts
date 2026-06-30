import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateContainerBaseline,
  REQUIRED_CI_GATES,
} from '../../../src/deployment/validateContainerBaseline.js';

/**
 * Hermetic tests for the container/CI baseline validator. Fully static: they read
 * repo files and build temp fixtures on disk. They NEVER build or run a container,
 * call Docker, a registry, Azure, the network, a database, or require credentials.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');

const DOCKERFILE = [
  'FROM node:20-bookworm-slim AS builder',
  'WORKDIR /app',
  'COPY package.json package-lock.json ./',
  'RUN npm ci',
  'COPY src ./src',
  'RUN npm run build',
  '',
  'FROM node:20-bookworm-slim AS runtime-base',
  'WORKDIR /app',
  'COPY --from=builder /app/dist ./dist',
  'USER node',
  '',
  'FROM runtime-base AS api',
  'EXPOSE 3000',
  'CMD ["node", "dist/src/server/api.js"]',
  '',
  'FROM runtime-base AS worker',
  'CMD ["node", "dist/src/server/worker.js"]',
  '',
].join('\n');

const DOCKERIGNORE = ['node_modules', 'dist', '.env', '.env.*', '!.env.example', ''].join('\n');

const CI_YML = [
  'name: ci',
  'on:',
  '  pull_request:',
  '    branches: [main]',
  'permissions:',
  '  contents: read',
  'jobs:',
  '  validate:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: npm ci',
  '      - run: npm run typecheck',
  '      - run: npm run lint',
  '      - run: npm test',
  '      - run: npm run build',
  '      - run: npm run deploy:check',
  '      - run: npm run container:check',
  '',
].join('\n');

const CONTAINER_BUILD_YML = [
  'name: container-build',
  'on:',
  '  pull_request:',
  '    branches: [main]',
  '  workflow_dispatch:',
  'jobs:',
  '  build:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: docker/build-push-action@v6',
  '        with:',
  '          target: api',
  '          push: false',
  '',
].join('\n');

const DEPLOY_TEMPLATE_YML = [
  'name: production-deploy-template',
  'on:',
  '  workflow_dispatch:',
  '    inputs:',
  '      confirm:',
  '        required: true',
  '        default: ""',
  'jobs:',
  '  deploy:',
  "    if: ${{ inputs.confirm == 'DEPLOY' }}",
  '    runs-on: ubuntu-latest',
  '    environment: production',
  '    steps:',
  '      - uses: azure/login@v2',
  '',
].join('\n');

const PKG_JSON = JSON.stringify({
  scripts: {
    'container:check': 'tsx scripts/validate-container-baseline.ts',
    'ci:check': 'npm run typecheck && npm run container:check',
  },
});

/** Build a minimal, VALID container/CI baseline fixture under a temp dir. */
function buildValidFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'container-baseline-'));
  mkdirSync(join(root, 'src', 'server'), { recursive: true });
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });

  writeFileSync(join(root, 'Dockerfile'), DOCKERFILE);
  writeFileSync(join(root, '.dockerignore'), DOCKERIGNORE);
  writeFileSync(join(root, 'src', 'server', 'api.ts'), '// api entrypoint\n');
  writeFileSync(join(root, 'src', 'server', 'worker.ts'), '// worker entrypoint\n');
  writeFileSync(join(root, '.github', 'workflows', 'ci.yml'), CI_YML);
  writeFileSync(join(root, '.github', 'workflows', 'container-build.yml'), CONTAINER_BUILD_YML);
  writeFileSync(
    join(root, '.github', 'workflows', 'production-deploy-template.yml'),
    DEPLOY_TEMPLATE_YML,
  );
  writeFileSync(join(root, 'package.json'), PKG_JSON);
  return root;
}

const tempDirs: string[] = [];
function track(dir: string): string {
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('container/CI baseline validator', () => {
  // (1) passes on the current repository.
  it('(1) passes on the current repository', () => {
    const result = validateContainerBaseline(REPO_ROOT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('(1b) passes on a minimal valid fixture', () => {
    const root = track(buildValidFixture());
    const result = validateContainerBaseline(root);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // (2) fails when the Dockerfile is missing.
  it('(2) fails when the Dockerfile is missing', () => {
    const root = track(buildValidFixture());
    rmSync(join(root, 'Dockerfile'));
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('Dockerfile exists'))).toBe(true);
  });

  // (3) fails when the Dockerfile copies a .env file into the image.
  it('(3) fails when the Dockerfile copies .env into the image', () => {
    const root = track(buildValidFixture());
    writeFileSync(join(root, 'Dockerfile'), `${DOCKERFILE}\nCOPY .env ./.env\n`);
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('does not copy .env'))).toBe(true);
  });

  // (4) detects secret-like values committed in container/CI files.
  it('(4) detects secret-like values in scanned files', () => {
    const root = track(buildValidFixture());
    writeFileSync(
      join(root, 'Dockerfile'),
      `${DOCKERFILE}\nENV CONN="SharedAccessKey=abcd1234efgh5678ijkl90MNOPqrst=="\n`,
    );
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('no secret-like values'))).toBe(true);
  });

  // (5) checks the API runtime entrypoint.
  it('(5) fails when the API runtime entrypoint is missing', () => {
    const root = track(buildValidFixture());
    rmSync(join(root, 'src', 'server', 'api.ts'));
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('API runtime entrypoint'))).toBe(true);
  });

  // (6) checks the worker runtime entrypoint.
  it('(6) fails when the worker runtime entrypoint is missing', () => {
    const root = track(buildValidFixture());
    rmSync(join(root, 'src', 'server', 'worker.ts'));
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('worker runtime entrypoint'))).toBe(true);
  });

  // (7) checks that .dockerignore exists.
  it('(7) fails when .dockerignore is missing', () => {
    const root = track(buildValidFixture());
    rmSync(join(root, '.dockerignore'));
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('.dockerignore exists'))).toBe(true);
  });

  // (8) checks that .dockerignore excludes .env.
  it('(8) fails when .dockerignore does not exclude .env', () => {
    const root = track(buildValidFixture());
    writeFileSync(join(root, '.dockerignore'), 'node_modules\ndist\n');
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('.dockerignore excludes .env'))).toBe(true);
  });

  // (9) ci.yml must not authenticate to or deploy on Azure.
  it('(9) fails when ci.yml authenticates to Azure', () => {
    const root = track(buildValidFixture());
    writeFileSync(
      join(root, '.github', 'workflows', 'ci.yml'),
      `${CI_YML}      - uses: azure/login@v2\n`,
    );
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('does not authenticate to or deploy'))).toBe(true);
  });

  // (10) ci.yml must run all required validation gates.
  it('(10) fails when ci.yml omits a required gate', () => {
    const root = track(buildValidFixture());
    const stripped = CI_YML.replace('      - run: npm run container:check\n', '');
    writeFileSync(join(root, '.github', 'workflows', 'ci.yml'), stripped);
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('required validation gates'))).toBe(true);
  });

  it('(10b) REQUIRED_CI_GATES covers the static validators', () => {
    expect(REQUIRED_CI_GATES).toContain('deploy:check');
    expect(REQUIRED_CI_GATES).toContain('container:check');
  });

  // (11) container-build.yml must not push images by default.
  it('(11) fails when container-build.yml pushes images by default', () => {
    const root = track(buildValidFixture());
    writeFileSync(
      join(root, '.github', 'workflows', 'container-build.yml'),
      CONTAINER_BUILD_YML.replace('          push: false', '          push: true'),
    );
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('does not push images by default'))).toBe(true);
  });

  // (12) production deploy template must be manual-only.
  it('(12) fails when the deploy template has an automatic trigger', () => {
    const root = track(buildValidFixture());
    writeFileSync(
      join(root, '.github', 'workflows', 'production-deploy-template.yml'),
      DEPLOY_TEMPLATE_YML.replace('  workflow_dispatch:', '  push:\n    branches: [main]\n  workflow_dispatch:'),
    );
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('manual-only'))).toBe(true);
  });

  // (13) deploy template must guard live deployment.
  it('(13) fails when the deploy template has no confirmation guard', () => {
    const root = track(buildValidFixture());
    writeFileSync(
      join(root, '.github', 'workflows', 'production-deploy-template.yml'),
      DEPLOY_TEMPLATE_YML.replace("    if: ${{ inputs.confirm == 'DEPLOY' }}\n", ''),
    );
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('guards live deployment'))).toBe(true);
  });

  // (14) package.json must expose container:check and ci:check.
  it('(14) fails when package.json omits container:check / ci:check', () => {
    const root = track(buildValidFixture());
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: {} }));
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('container:check script'))).toBe(true);
    expect(result.errors.some((e) => e.includes('ci:check script'))).toBe(true);
  });

  // (15) no sport-specific terminology in container/CI files.
  it('(15) fails when a scanned file leaks sport terminology', () => {
    const root = track(buildValidFixture());
    writeFileSync(join(root, 'Dockerfile'), `${DOCKERFILE}\n# bonspiel scheduler image\n`);
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('sport-specific terminology'))).toBe(true);
  });

  // (16) no committed secret values in workflow files.
  it('(16) detects secret-like values committed in a workflow file', () => {
    const root = track(buildValidFixture());
    writeFileSync(
      join(root, '.github', 'workflows', 'ci.yml'),
      `${CI_YML}      - run: echo "AccountKey=ZZZZ1234abcd5678EFGH90ijklMNOP=="\n`,
    );
    const result = validateContainerBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('no secret-like values'))).toBe(true);
  });
});
