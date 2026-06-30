import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateOrganizationRegistryBaseline,
  ORGANIZATION_DOC_REL,
  ORGANIZATION_TEST_REL,
  ORGANIZATION_MIGRATION_REL,
  ORGANIZATION_DOMAIN_DIR_REL,
} from '../../../src/deployment/validateOrganizationRegistryBaseline.js';

/**
 * Hermetic tests for the Organization Registry baseline validator. Fully static / in-process:
 * they read repo files and build temp fixtures. They NEVER run tests, deploy, migrate,
 * build/push/scan/sign images, or contact Azure, a registry, a DB, Service Bus, Key Vault, a
 * live URL, or the network, and they require no credentials.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');

const tempRoots: string[] = [];

const VALID_DOC = [
  '# Organization Registry domain baseline',
  '',
  '## Purpose',
  'Reference structure.',
  '',
  '## Domain model',
  'A single canonical record.',
  '',
  '## Tenant isolation',
  'RLS keyed on the tenant.',
  '',
  '## Affiliation linkage (one-way projection)',
  'A one-way projection from an approved application.',
  '',
  '## Outbox signals (sanitized)',
  'Created/updated/status_changed outbox.',
  '',
  '## Telemetry signals',
  'Counters and events.',
  '',
  '## HTTP surfaces — deferred (out of scope this pass)',
  'HTTP surfaces are deferred.',
  '',
  '## Out of scope (intentionally not built)',
  'No HTTP endpoints.',
  '',
].join('\n');

const DOMAIN_FILES = [
  'OrganizationTypes.ts',
  'OrganizationRegistryErrors.ts',
  'OrganizationRegistryStore.ts',
  'InMemoryOrganizationRegistryStore.ts',
  'PgOrganizationRegistryStore.ts',
  'OrganizationRegistryService.ts',
  'index.ts',
];

const VALID_PACKAGE_JSON = JSON.stringify(
  {
    name: 'fixture',
    scripts: {
      'organization:check': 'tsx scripts/validate-organization-registry-baseline.ts',
      'ci:check': 'npm run build && npm run synthetic:check && npm run organization:check',
    },
  },
  null,
  2,
);

function baseFiles(): Record<string, string | null> {
  const files: Record<string, string | null> = {
    [ORGANIZATION_DOC_REL]: VALID_DOC,
    [ORGANIZATION_TEST_REL]: '// organization registry service test (fixture)\n',
    [ORGANIZATION_MIGRATION_REL]: '-- 0009 organization registry (fixture)\n',
    'package.json': VALID_PACKAGE_JSON,
  };
  for (const f of DOMAIN_FILES) {
    files[`${ORGANIZATION_DOMAIN_DIR_REL}/${f}`] = `// ${f} (fixture)\n`;
  }
  return files;
}

function writeRepo(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'house-organization-'));
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
  const result = validateOrganizationRegistryBaseline(root);
  return result.checks.find((c) => c.name === name)?.ok ?? false;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('validateOrganizationRegistryBaseline', () => {
  it('passes on the current repository', () => {
    const result = validateOrganizationRegistryBaseline(REPO_ROOT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('passes on a complete valid fixture', () => {
    const result = validateOrganizationRegistryBaseline(writeRepo(baseFiles()));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails when a domain file is missing', () => {
    const files = baseFiles();
    files[`${ORGANIZATION_DOMAIN_DIR_REL}/OrganizationRegistryService.ts`] = null;
    const root = writeRepo(files);
    expect(validateOrganizationRegistryBaseline(root).ok).toBe(false);
    expect(
      checkOk(root, `domain file exists: ${ORGANIZATION_DOMAIN_DIR_REL}/OrganizationRegistryService.ts`),
    ).toBe(false);
  });

  it('fails when the migration is missing', () => {
    const files = baseFiles();
    files[ORGANIZATION_MIGRATION_REL] = null;
    const root = writeRepo(files);
    expect(checkOk(root, 'organization registry migration exists')).toBe(false);
  });

  it('fails when the architecture doc is missing', () => {
    const files = baseFiles();
    files[ORGANIZATION_DOC_REL] = null;
    const root = writeRepo(files);
    expect(checkOk(root, 'organization registry doc exists')).toBe(false);
  });

  it('fails when the unit test is missing', () => {
    const files = baseFiles();
    files[ORGANIZATION_TEST_REL] = null;
    const root = writeRepo(files);
    expect(checkOk(root, 'organization registry test exists')).toBe(false);
  });

  it('fails when organization:check script is missing', () => {
    const files = baseFiles();
    files['package.json'] = JSON.stringify({
      scripts: { 'ci:check': 'npm run build && npm run organization:check' },
    });
    const root = writeRepo(files);
    expect(checkOk(root, 'package.json defines organization:check')).toBe(false);
  });

  it('fails when ci:check omits organization:check', () => {
    const files = baseFiles();
    files['package.json'] = JSON.stringify({
      scripts: {
        'organization:check': 'tsx scripts/validate-organization-registry-baseline.ts',
        'ci:check': 'npm run build && npm run synthetic:check',
      },
    });
    const root = writeRepo(files);
    expect(checkOk(root, 'ci:check includes organization:check')).toBe(false);
  });

  it('fails when the doc omits the deferred-HTTP section', () => {
    const files = baseFiles();
    files[ORGANIZATION_DOC_REL] = VALID_DOC.replace(/HTTP surfaces — deferred.*$/im, '## Notes')
      .replace(/HTTP surfaces are deferred\./i, 'endpoints exist');
    const root = writeRepo(files);
    expect(checkOk(root, 'doc documents HTTP surfaces are deferred')).toBe(false);
  });

  it('flags sport-specific terminology leaking into a domain file', () => {
    const files = baseFiles();
    files[`${ORGANIZATION_DOMAIN_DIR_REL}/OrganizationTypes.ts`] = '// curling type fixture\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'no sport-specific terminology in organization registry files')).toBe(
      false,
    );
  });

  it('flags a secret-like value leaking into the doc', () => {
    const files = baseFiles();
    files[ORGANIZATION_DOC_REL] = `${VALID_DOC}\nAccountKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ012345==\n`;
    const root = writeRepo(files);
    expect(checkOk(root, 'no secret-like values in organization registry files')).toBe(false);
  });
});
