import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateSyntheticLifecycleBaseline,
  SYNTHETIC_DOC_REL,
  SYNTHETIC_TEST_REL,
  SYNTHETIC_SUPPORT_DIR_REL,
} from '../../../src/deployment/validateSyntheticLifecycleBaseline.js';

/**
 * Hermetic tests for the synthetic tenant-lifecycle baseline validator. Fully static /
 * in-process: they read repo files and build temp fixtures. They NEVER run tests, deploy,
 * migrate, build/push/scan/sign images, or contact Azure, a registry, a DB, Service Bus, Key
 * Vault, a live URL, or the network, and they require no credentials.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');

const tempRoots: string[] = [];

const VALID_DOC = [
  '# Synthetic Tenant Lifecycle Test Suite',
  '',
  '## Purpose',
  'A confidence baseline.',
  '',
  '## Scope (in)',
  'A tenant-scoped lifecycle.',
  '',
  '## Out of scope (explicitly)',
  'Live Azure smoke. It is not a substitute for live smoke.',
  '',
  '## Scenario map',
  'Twenty scenarios.',
  '',
  '## Actor map',
  'NSO-generic actors.',
  '',
  '## Tenant isolation checks',
  'Beta sees nothing.',
  '',
  '## Evidence / quarantine checks',
  'Infected payloads are quarantine-only.',
  '',
  '## Outbox checks',
  'Lifecycle and quarantine outbox.',
  '',
  '## Telemetry checks',
  'Counters and events, redacted.',
  '',
].join('\n');

const SUPPORT_FILES = [
  'SyntheticTenantLifecycleHarness.ts',
  'syntheticTenants.ts',
  'syntheticActors.ts',
  'syntheticPayloads.ts',
  'assertions.ts',
  'index.ts',
];

const VALID_PACKAGE_JSON = JSON.stringify(
  {
    name: 'fixture',
    scripts: {
      'synthetic:check': 'tsx scripts/validate-synthetic-lifecycle-baseline.ts',
      'ci:check': 'npm run build && npm run release:check && npm run synthetic:check',
    },
  },
  null,
  2,
);

function baseFiles(): Record<string, string | null> {
  const files: Record<string, string | null> = {
    [SYNTHETIC_DOC_REL]: VALID_DOC,
    [SYNTHETIC_TEST_REL]: '// synthetic scenario test (fixture)\n',
    'package.json': VALID_PACKAGE_JSON,
  };
  for (const f of SUPPORT_FILES) {
    files[`${SYNTHETIC_SUPPORT_DIR_REL}/${f}`] = `// ${f} (fixture)\n`;
  }
  return files;
}

function writeRepo(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'house-synthetic-'));
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
  const result = validateSyntheticLifecycleBaseline(root);
  return result.checks.find((c) => c.name === name)?.ok ?? false;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('validateSyntheticLifecycleBaseline', () => {
  it('passes on the current repository', () => {
    const result = validateSyntheticLifecycleBaseline(REPO_ROOT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('passes on a complete valid fixture', () => {
    const result = validateSyntheticLifecycleBaseline(writeRepo(baseFiles()));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails when the architecture doc is missing', () => {
    const files = baseFiles();
    files[SYNTHETIC_DOC_REL] = null;
    const root = writeRepo(files);
    expect(validateSyntheticLifecycleBaseline(root).ok).toBe(false);
    expect(checkOk(root, 'synthetic lifecycle doc exists')).toBe(false);
  });

  it('fails when the scenario test is missing', () => {
    const files = baseFiles();
    files[SYNTHETIC_TEST_REL] = null;
    const root = writeRepo(files);
    expect(checkOk(root, 'synthetic lifecycle test exists')).toBe(false);
  });

  it('fails when a support fixture is missing', () => {
    const files = baseFiles();
    files[`${SYNTHETIC_SUPPORT_DIR_REL}/SyntheticTenantLifecycleHarness.ts`] = null;
    const root = writeRepo(files);
    expect(
      checkOk(root, `support file exists: ${SYNTHETIC_SUPPORT_DIR_REL}/SyntheticTenantLifecycleHarness.ts`),
    ).toBe(false);
  });

  it('fails when synthetic:check script is missing', () => {
    const files = baseFiles();
    files['package.json'] = JSON.stringify({
      scripts: { 'ci:check': 'npm run build && npm run synthetic:check' },
    });
    const root = writeRepo(files);
    expect(checkOk(root, 'package.json defines synthetic:check')).toBe(false);
  });

  it('fails when ci:check omits synthetic:check', () => {
    const files = baseFiles();
    files['package.json'] = JSON.stringify({
      scripts: {
        'synthetic:check': 'tsx scripts/validate-synthetic-lifecycle-baseline.ts',
        'ci:check': 'npm run build && npm run release:check',
      },
    });
    const root = writeRepo(files);
    expect(checkOk(root, 'ci:check includes synthetic:check')).toBe(false);
  });

  it('fails when the doc omits the out-of-scope section', () => {
    const files = baseFiles();
    files[SYNTHETIC_DOC_REL] = VALID_DOC.replace(/out of scope/gi, 'coverage notes').replace(
      /not a substitute for/gi,
      'complements',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'doc documents out-of-scope')).toBe(false);
  });

  it('flags sport-specific terminology leaking into a fixture', () => {
    const files = baseFiles();
    files[`${SYNTHETIC_SUPPORT_DIR_REL}/syntheticTenants.ts`] = '// curling tenant fixture\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'no sport-specific terminology in synthetic files')).toBe(false);
  });

  it('flags a secret-like value leaking into the doc', () => {
    const files = baseFiles();
    files[SYNTHETIC_DOC_REL] =
      `${VALID_DOC}\nAccountKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ012345==\n`;
    const root = writeRepo(files);
    expect(checkOk(root, 'no secret-like values in synthetic files')).toBe(false);
  });
});
