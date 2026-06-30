import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateReleaseRunbookBaseline } from '../../../src/deployment/validateReleaseRunbookBaseline.js';

/**
 * Hermetic tests for the production release runbook baseline validator. Fully
 * static / in-process: they read repo files and build temp fixtures. They NEVER
 * deploy, run migrations, build/push/scan/sign images, or contact Azure, the
 * Azure CLI, a registry, Cosign, a scanner, a DB, Service Bus, Key Vault, a live
 * URL, or the network, and they require no credentials.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');

const tempRoots: string[] = [];

// A runbook fixture that references every required gate / control marker.
const VALID_RUNBOOK = [
  '# Production Release Runbook',
  '',
  '## Preflight gates',
  'Run ci:check, deploy:check, container:check, migrations:check,',
  'supply-chain:check, provenance:check, and smoke:check.',
  '',
  '## Migrations',
  'Preview with migrations:plan and apply with migrations:apply.',
  'The application role must not run migrations.',
  'There are no automatic API/worker startup migrations.',
  '',
  '## Execution',
  'Dispatch production-deploy-template.yml manually.',
  '',
  '## Supply chain',
  'Review the SBOM and the vulnerability scan; verify Cosign provenance.',
  '',
  '## Smoke',
  'Run smoke:azure only when explicitly enabled.',
  '',
  '## Rollback',
  'Roll back to the previous image digest.',
  '',
].join('\n');

const VALID_CHECKLIST = [
  '# Production Release Checklist',
  '',
  '- Release ID:',
  '- API image digest:',
  '- Worker image digest:',
  '- Go / no-go decision:',
  '',
].join('\n');

const VALID_PACKAGE_JSON = JSON.stringify(
  {
    name: 'fixture',
    scripts: {
      'release:check': 'tsx scripts/validate-release-runbook-baseline.ts',
      'ci:check': 'npm run build && npm run smoke:check && npm run release:check',
    },
  },
  null,
  2,
);

function baseFiles(): Record<string, string | null> {
  return {
    'docs/operations/production-release-runbook.md': VALID_RUNBOOK,
    'docs/operations/templates/production-release-checklist.md': VALID_CHECKLIST,
    'package.json': VALID_PACKAGE_JSON,
  };
}

function writeRepo(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'house-release-'));
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
  const result = validateReleaseRunbookBaseline(root);
  return result.checks.find((c) => c.name === name)?.ok ?? false;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('validateReleaseRunbookBaseline', () => {
  // (1) Passes on the current repository.
  it('passes on the current repository', () => {
    const result = validateReleaseRunbookBaseline(REPO_ROOT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('passes on a complete valid fixture', () => {
    const result = validateReleaseRunbookBaseline(writeRepo(baseFiles()));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // (2) Fails if the runbook is missing.
  it('fails when the release runbook is missing', () => {
    const files = baseFiles();
    files['docs/operations/production-release-runbook.md'] = null;
    const root = writeRepo(files);
    expect(validateReleaseRunbookBaseline(root).ok).toBe(false);
    expect(checkOk(root, 'production release runbook exists')).toBe(false);
  });

  // (3) Fails if the checklist template is missing.
  it('fails when the release checklist template is missing', () => {
    const files = baseFiles();
    files['docs/operations/templates/production-release-checklist.md'] = null;
    const root = writeRepo(files);
    expect(checkOk(root, 'release checklist template exists')).toBe(false);
  });

  // (4) Fails if the release:check script is missing.
  it('fails when release:check script is missing', () => {
    const files = baseFiles();
    files['package.json'] = JSON.stringify({
      scripts: { 'ci:check': 'npm run build && npm run release:check' },
    });
    const root = writeRepo(files);
    expect(checkOk(root, 'package.json defines release:check')).toBe(false);
  });

  // (5) Fails if ci:check omits release:check.
  it('fails when ci:check omits release:check', () => {
    const files = baseFiles();
    files['package.json'] = JSON.stringify({
      scripts: {
        'release:check': 'tsx scripts/validate-release-runbook-baseline.ts',
        'ci:check': 'npm run build && npm run smoke:check',
      },
    });
    const root = writeRepo(files);
    expect(checkOk(root, 'ci:check includes release:check')).toBe(false);
  });

  // (6) Fails if the runbook omits ci:check.
  it('fails when the runbook omits ci:check', () => {
    const files = baseFiles();
    files['docs/operations/production-release-runbook.md'] = VALID_RUNBOOK.replace(
      /ci:check/g,
      'CONTINUOUS-GATE',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'runbook references ci:check gate')).toBe(false);
  });

  // (7) Fails if the runbook omits migrations:plan.
  it('fails when the runbook omits migrations:plan', () => {
    const files = baseFiles();
    files['docs/operations/production-release-runbook.md'] = VALID_RUNBOOK.replace(
      /migrations:plan/g,
      'plan-step',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'runbook references migrations:plan')).toBe(false);
  });

  // (8) Fails if the runbook omits migrations:apply.
  it('fails when the runbook omits migrations:apply', () => {
    const files = baseFiles();
    files['docs/operations/production-release-runbook.md'] = VALID_RUNBOOK.replace(
      /migrations:apply/g,
      'apply-step',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'runbook references migrations:apply')).toBe(false);
  });

  // (9) Fails if the runbook omits production-deploy-template.yml.
  it('fails when the runbook omits production-deploy-template.yml', () => {
    const files = baseFiles();
    files['docs/operations/production-release-runbook.md'] = VALID_RUNBOOK.replace(
      /production-deploy-template\.yml/g,
      'deploy-workflow',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'runbook references production-deploy-template.yml')).toBe(false);
  });

  // (10) Fails if the runbook omits a rollback section.
  it('fails when the runbook omits a rollback procedure', () => {
    const files = baseFiles();
    files['docs/operations/production-release-runbook.md'] = VALID_RUNBOOK.replace(
      /[Rr]ollback/g,
      'revert',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'runbook documents a rollback procedure')).toBe(false);
  });

  // (11) Fails if the runbook omits smoke:azure.
  it('fails when the runbook omits smoke:azure', () => {
    const files = baseFiles();
    files['docs/operations/production-release-runbook.md'] = VALID_RUNBOOK.replace(
      /smoke:azure/g,
      'smoke-run',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'runbook references smoke:azure')).toBe(false);
  });

  // (12) Fails if the runbook omits the no-automatic-startup-migration warning.
  it('fails when the runbook omits the no-startup-migration warning', () => {
    const files = baseFiles();
    files['docs/operations/production-release-runbook.md'] = VALID_RUNBOOK.replace(
      /startup migrations/g,
      'boot tasks',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'runbook warns against automatic startup migrations')).toBe(false);
  });

  // (13) Fails if the checklist omits API image digest.
  it('fails when the checklist omits API image digest', () => {
    const files = baseFiles();
    files['docs/operations/templates/production-release-checklist.md'] = VALID_CHECKLIST.replace(
      /API image digest/g,
      'API build',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'checklist includes API image digest field')).toBe(false);
  });

  // (14) Fails if the checklist omits Worker image digest.
  it('fails when the checklist omits Worker image digest', () => {
    const files = baseFiles();
    files['docs/operations/templates/production-release-checklist.md'] = VALID_CHECKLIST.replace(
      /Worker image digest/g,
      'Worker build',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'checklist includes Worker image digest field')).toBe(false);
  });

  // (15) Fails if the checklist omits the go/no-go decision.
  it('fails when the checklist omits the go/no-go decision', () => {
    const files = baseFiles();
    files['docs/operations/templates/production-release-checklist.md'] = VALID_CHECKLIST.replace(
      /Go \/ no-go decision/g,
      'Ship decision',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'checklist includes go/no-go decision field')).toBe(false);
  });

  // (16) Fails on a secret-like value in a release file.
  it('fails on a secret-like value in a release file', () => {
    const files = baseFiles();
    files['docs/operations/production-release-runbook.md'] =
      VALID_RUNBOOK + '\n\nExample: postgres://svc:Hunter2Hunter2@dbhost/app\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'no secret-like values in release files')).toBe(false);
  });

  // (17) Fails on sport-specific terminology in a release file.
  it('fails on sport-specific terminology in a release file', () => {
    const files = baseFiles();
    files['docs/operations/production-release-runbook.md'] =
      VALID_RUNBOOK + '\n\nThis curling bonspiel detail must not appear.\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'no sport-specific terminology in release files')).toBe(false);
  });

  // (19) The DEFAULT CI workflow does not run a live deploy or live smoke.
  it('confirms the real ci.yml runs release:check but never deploys or runs live smoke', () => {
    const ci = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain('npm run release:check');
    expect(ci).not.toContain('smoke:azure');
    expect(ci).not.toContain('azure/login@');
    expect(ci).not.toContain('containerapp update');
  });

  // (20) The production deploy template stays workflow_dispatch-only + guarded.
  it('confirms the real deploy template is workflow_dispatch-only and confirmation-guarded', () => {
    const tpl = readFileSync(
      join(REPO_ROOT, '.github/workflows/production-deploy-template.yml'),
      'utf8',
    );
    expect(tpl).toContain('workflow_dispatch');
    expect(tpl).not.toContain('on: push');
    expect(tpl).toContain("if: ${{ inputs.confirm == 'DEPLOY' }}");
    expect(tpl).toContain('production-release-runbook.md');
  });
});
