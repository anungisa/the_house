import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateDeploymentBaseline,
  findSecretLikeValues,
  scanInfraForSecrets,
  REQUIRED_INFRA_MODULES,
  REQUIRED_ENV_VARS,
  FORBIDDEN_DOMAIN_TERMS,
} from '../../../src/deployment/validateDeploymentBaseline.js';

/**
 * Hermetic tests for the deployment baseline validator. Fully static: they read repo files
 * and build temp fixtures on disk. They NEVER call Azure, the `az` CLI, a database, Service
 * Bus, Entra/JWKS, or any network.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');

/** Build a minimal, VALID baseline fixture under a temp dir. */
function buildValidFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'deploy-baseline-'));
  const infraAzure = join(root, 'infra', 'azure');
  mkdirSync(join(infraAzure, 'modules'), { recursive: true });
  mkdirSync(join(infraAzure, 'parameters'), { recursive: true });
  mkdirSync(join(root, 'docs', 'architecture'), { recursive: true });

  writeFileSync(join(infraAzure, 'main.bicep'), '// main\nparam x string\n');
  for (const moduleRel of REQUIRED_INFRA_MODULES) {
    writeFileSync(join(infraAzure, moduleRel), '// module\n');
  }
  for (const env of ['dev', 'test', 'prod']) {
    writeFileSync(
      join(infraAzure, 'parameters', `${env}.example.bicepparam`),
      `using '../main.bicep'\nparam resourcePrefix = 'house'\n`,
    );
  }
  writeFileSync(
    join(root, 'docs', 'architecture', 'production-deployment-baseline.md'),
    '# Production Deployment Baseline\n',
  );
  const envLines = REQUIRED_ENV_VARS.map((name) => `${name}=`).join('\n');
  writeFileSync(join(root, '.env.example'), `${envLines}\n`);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ scripts: { 'deploy:check': 'tsx scripts/validate-deployment-baseline.ts' } }),
  );
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

describe('deployment baseline validator', () => {
  // (1) passes on the current repository.
  it('(1) passes on the current repository', () => {
    const result = validateDeploymentBaseline(REPO_ROOT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // (2) fails when a required IaC file is missing.
  it('(2) fails when a required IaC module is missing', () => {
    const root = track(buildValidFixture());
    rmSync(join(root, 'infra', 'azure', 'modules', 'postgres.bicep'));
    const result = validateDeploymentBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('postgres.bicep'))).toBe(true);
  });

  it('(2b) fails when main.bicep is missing', () => {
    const root = track(buildValidFixture());
    rmSync(join(root, 'infra', 'azure', 'main.bicep'));
    const result = validateDeploymentBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('main.bicep'))).toBe(true);
  });

  // (3) detects obvious secret-like values in parameter files.
  it('(3) detects secret-like values in infra parameter files', () => {
    const root = track(buildValidFixture());
    writeFileSync(
      join(root, 'infra', 'azure', 'parameters', 'dev.example.bicepparam'),
      "using '../main.bicep'\n" +
        "param sb = 'Endpoint=sb://x.servicebus.windows.net/;SharedAccessKey=abcd1234EFGH5678ijkl9012MNOP'\n",
    );
    const result = validateDeploymentBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('secret-like'))).toBe(true);
  });

  it('(3b) findSecretLikeValues flags connection strings, inline creds, JWTs, and private keys', () => {
    expect(findSecretLikeValues('AccountKey=ABCDEFGH12345678ijklmnop90==')).toContain(
      'azure-account-key',
    );
    expect(findSecretLikeValues('url = postgres://admin:hunter2@db.internal:5432/house')).toContain(
      'inline-url-credentials',
    );
    expect(
      findSecretLikeValues('token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QTValid'),
    ).toContain('jwt-token');
    expect(findSecretLikeValues('-----BEGIN RSA PRIVATE KEY-----')).toContain('private-key-block');
  });

  it('(3c) treats placeholders and Key Vault references as NON-secret', () => {
    expect(findSecretLikeValues("param image = 'REPLACE_WITH_API_IMAGE_REF'")).toEqual([]);
    expect(findSecretLikeValues('https://login.microsoftonline.com/tenant/v2.0')).toEqual([]);
    expect(findSecretLikeValues("password = '<set-in-key-vault>'")).toEqual([]);
  });

  // (4) checks required modules.
  it('(4) reports a check per required module', () => {
    const result = validateDeploymentBaseline(REPO_ROOT);
    for (const moduleRel of REQUIRED_INFRA_MODULES) {
      const check = result.checks.find((c) => c.name === `module ${moduleRel} exists`);
      expect(check?.ok).toBe(true);
    }
  });

  // (5) checks required environment variables in .env.example.
  it('(5) fails when .env.example is missing a required production env var', () => {
    const root = track(buildValidFixture());
    const envPath = join(root, '.env.example');
    const trimmed = readFileSync(envPath, 'utf8')
      .split('\n')
      .filter((line) => !line.startsWith('DATABASE_URL='))
      .join('\n');
    writeFileSync(envPath, trimmed);
    const result = validateDeploymentBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('DATABASE_URL'))).toBe(true);
  });

  it('(5b) the real .env.example documents every required production env var', () => {
    const envText = readFileSync(join(REPO_ROOT, '.env.example'), 'utf8');
    for (const name of REQUIRED_ENV_VARS) {
      expect(new RegExp(`^\\s*${name}\\s*=`, 'm').test(envText)).toBe(true);
    }
  });

  // (6) does not call the Azure CLI (no child_process / az usage in validator source).
  it('(6) validator source contacts no Azure CLI, network, or child process', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'src', 'deployment', 'validateDeploymentBaseline.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/child_process/);
    expect(src).not.toMatch(/\bexecSync\b|\bexecFilep?\b|\bspawnSync?\b/);
    expect(src).not.toMatch(/['"`]az\s+(deployment|login|group|bicep|account)/);
    expect(src).not.toMatch(/node:https?\b|node:net\b|globalThis\.fetch|[^.\w]fetch\(/);
  });

  // (6b) the validator CLI wrapper does not call the Azure CLI or network either.
  it('(6b) validator script wrapper contacts no Azure CLI or network', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'scripts', 'validate-deployment-baseline.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/child_process/);
    expect(src).not.toMatch(/['"`]az\s+/);
    expect(src).not.toMatch(/node:https?\b|node:net\b|globalThis\.fetch|[^.\w]fetch\(/);
  });

  // (7) package script exposes deploy:check.
  it('(7) package.json exposes deploy:check', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.['deploy:check']).toBe('tsx scripts/validate-deployment-baseline.ts');
  });

  // (8) production deployment doc exists.
  it('(8) production deployment baseline doc exists', () => {
    const result = validateDeploymentBaseline(REPO_ROOT);
    const check = result.checks.find((c) => c.name === 'production deployment baseline doc exists');
    expect(check?.ok).toBe(true);
  });

  // (9) IaC files contain no sport-specific terminology.
  it('(9) infra files contain no sport-specific terminology', () => {
    const result = validateDeploymentBaseline(REPO_ROOT);
    const check = result.checks.find(
      (c) => c.name === 'no sport-specific terminology in infra files',
    );
    expect(check?.ok).toBe(true);

    // Direct content scan as a second guard.
    const fixture = track(mkdtempSync(join(tmpdir(), 'deploy-domain-')));
    const infraAzure = join(fixture, 'infra', 'azure');
    cpSync(join(REPO_ROOT, 'infra', 'azure'), infraAzure, { recursive: true });
    for (const file of [
      'main.bicep',
      'modules/container-apps.bicep',
      'parameters/prod.example.bicepparam',
    ]) {
      const lowered = readFileSync(join(infraAzure, file), 'utf8').toLowerCase();
      for (const term of FORBIDDEN_DOMAIN_TERMS) {
        expect(lowered.includes(term)).toBe(false);
      }
    }
  });

  // (10) no secrets are committed in infra example files.
  it('(10) the real infra tree contains no secret-like values', () => {
    const findings = scanInfraForSecrets(REPO_ROOT, join(REPO_ROOT, 'infra', 'azure'));
    expect(findings).toEqual([]);
  });
});
