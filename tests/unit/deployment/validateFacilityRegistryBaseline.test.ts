import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateFacilityRegistryBaseline,
  FACILITY_DOC_REL,
  FACILITY_TEST_REL,
  FACILITY_INTEGRATION_TEST_REL,
  FACILITY_HTTP_INTEGRATION_TEST_REL,
  FACILITY_MIGRATION_REL,
  FACILITY_DOMAIN_DIR_REL,
  FACILITY_HTTP_DIR_REL,
  FACILITY_HTTP_READ_FILES,
  FACILITY_HTTP_WRITE_FILES,
  AUTHZ_ACTIONS_MODULE_REL,
  FACILITY_READ_PREFLIGHT_REL,
  FACILITY_WRITE_PREFLIGHT_REL,
} from '../../../src/deployment/validateFacilityRegistryBaseline.js';
/**
 * Hermetic tests for the Facility Registry baseline validator. Fully static / in-process: they read
 * repo files and build temp fixtures. They NEVER run tests, deploy, migrate, build/push/scan/sign
 * images, or contact Azure, a registry, a DB, Service Bus, Key Vault, a live URL, or the network,
 * and they require no credentials.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');

const tempRoots: string[] = [];

const VALID_DOC = [
  '# Facility Registry domain baseline',
  '',
  '## Purpose',
  'Generic tenant-scoped place/site reference structure owned by an organization.',
  '',
  '## Domain model',
  'A single facility aggregate with descriptive, location, and contact reference fields.',
  '',
  '## Tenant isolation',
  'RLS keyed on the tenant; the store sets app.tenant_id in each transaction.',
  '',
  '## Organization dependency',
  'Reads the organization registry as same-tenant reference structure only.',
  '',
  '## Outbox signals (sanitized)',
  'Created/updated/status_changed outbox messages carry identity metadata only.',
  '',
  '## Telemetry signals',
  'Counters and events with low-cardinality attributes.',
  '',
  '## Privacy stance',
  'Minimal fields; name, address, and contact fields excluded from outbox payloads.',
  '',
  '## Out of scope (intentionally not built)',
  'No booking, scheduling, maintenance, inventory, inspection, accreditation, registration,',
  'payments, programs, or competition. No HTTP surface and no authorization action.',
  '',
].join('\n');

const DOMAIN_FILES = [
  'FacilityTypes.ts',
  'FacilityRegistryErrors.ts',
  'FacilityRegistryStore.ts',
  'InMemoryFacilityRegistryStore.ts',
  'PgFacilityRegistryStore.ts',
  'FacilityRegistryService.ts',
  'index.ts',
];

/** A read-surface preflight fixture that enumerates the three planned read route paths. */
const VALID_PREFLIGHT = [
  '# Facility HTTP read-surface preflight',
  '',
  'Design-only. The three read routes:',
  '- GET /v1/facilities',
  '- GET /v1/facilities/:facilityId',
  '- GET /v1/organizations/:organizationId/facilities',
  '',
].join('\n');

/** A write-surface preflight fixture that enumerates the three future write route strings. */
const VALID_WRITE_PREFLIGHT = [
  '# Facility HTTP write-surface preflight',
  '',
  'Design-only. The three future write routes:',
  '- POST /v1/facilities',
  '- PATCH /v1/facilities/:facilityId',
  '- POST /v1/facilities/:facilityId/status-transitions',
  '',
].join('\n');

const VALID_PACKAGE_JSON = JSON.stringify(
  {
    name: 'fixture',
    scripts: {
      'facility:check': 'tsx scripts/validate-facility-registry-baseline.ts',
      'ci:check': 'npm run build && npm run participant:check && npm run facility:check',
    },
  },
  null,
  2,
);

/** An authorization catalog fixture that DEFINES facility.read (read-only scope guard passes). */
const AUTHZ_WITH_FACILITY_READ =
  "ParticipantRead: 'participant.read',\n  FacilityRead: 'facility.read',\n";

function baseFiles(): Record<string, string | null> {
  const files: Record<string, string | null> = {
    [FACILITY_DOC_REL]: VALID_DOC,
    [FACILITY_TEST_REL]: '// facility registry service test (fixture)\n',
    [FACILITY_INTEGRATION_TEST_REL]: '// facility registry integration test (fixture)\n',
    [FACILITY_HTTP_INTEGRATION_TEST_REL]:
      '// facility registry HTTP integration test (fixture)\n',
    [FACILITY_MIGRATION_REL]: '-- 0011 facility registry (fixture)\n',
    [AUTHZ_ACTIONS_MODULE_REL]: AUTHZ_WITH_FACILITY_READ,
    [FACILITY_READ_PREFLIGHT_REL]: VALID_PREFLIGHT,
    [FACILITY_WRITE_PREFLIGHT_REL]: VALID_WRITE_PREFLIGHT,
    'package.json': VALID_PACKAGE_JSON,
  };
  for (const f of DOMAIN_FILES) {
    files[`${FACILITY_DOMAIN_DIR_REL}/${f}`] = `// ${f} (fixture)\n`;
  }
  for (const rel of FACILITY_HTTP_READ_FILES) {
    files[rel] = `// ${rel} (fixture)\n`;
  }
  return files;
}

function writeRepo(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'house-facility-'));
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
  const result = validateFacilityRegistryBaseline(root);
  return result.checks.find((c) => c.name === name)?.ok ?? false;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('validateFacilityRegistryBaseline', () => {
  it('passes on the current repository', () => {
    const result = validateFacilityRegistryBaseline(REPO_ROOT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('passes on a complete valid fixture', () => {
    const result = validateFacilityRegistryBaseline(writeRepo(baseFiles()));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails when a domain file is missing', () => {
    const files = baseFiles();
    files[`${FACILITY_DOMAIN_DIR_REL}/FacilityRegistryService.ts`] = null;
    const root = writeRepo(files);
    expect(validateFacilityRegistryBaseline(root).ok).toBe(false);
    expect(
      checkOk(root, `domain file exists: ${FACILITY_DOMAIN_DIR_REL}/FacilityRegistryService.ts`),
    ).toBe(false);
  });

  it('fails when the migration is missing', () => {
    const files = baseFiles();
    files[FACILITY_MIGRATION_REL] = null;
    expect(checkOk(writeRepo(files), 'facility registry migration exists')).toBe(false);
  });

  it('fails when the architecture doc is missing', () => {
    const files = baseFiles();
    files[FACILITY_DOC_REL] = null;
    expect(checkOk(writeRepo(files), 'facility registry doc exists')).toBe(false);
  });

  it('fails when the unit test is missing', () => {
    const files = baseFiles();
    files[FACILITY_TEST_REL] = null;
    expect(checkOk(writeRepo(files), 'facility registry unit test exists')).toBe(false);
  });

  it('fails when the integration test is missing', () => {
    const files = baseFiles();
    files[FACILITY_INTEGRATION_TEST_REL] = null;
    expect(checkOk(writeRepo(files), 'facility registry integration test exists')).toBe(false);
  });

  it('fails when the HTTP read integration test is missing', () => {
    const files = baseFiles();
    files[FACILITY_HTTP_INTEGRATION_TEST_REL] = null;
    expect(checkOk(writeRepo(files), 'facility HTTP read integration test exists')).toBe(false);
  });

  it('fails the read-only scope guard when a facility HTTP read file is missing', () => {
    const files = baseFiles();
    files[`${FACILITY_HTTP_DIR_REL}/FacilityReadHttpAdapter.ts`] = null;
    const root = writeRepo(files);
    expect(
      checkOk(root, 'facility HTTP read surface exists (read-only scope guard)'),
    ).toBe(false);
  });

  it('fails the read-only scope guard when a facility HTTP write file is present', () => {
    const files = baseFiles();
    files[FACILITY_HTTP_WRITE_FILES[0]!] = '// unexpected facility http write surface\n';
    const root = writeRepo(files);
    expect(
      checkOk(root, 'no facility HTTP write surface exists (write is a separate future pass)'),
    ).toBe(false);
  });

  it('fails the read-only scope guard when the facility.read action is missing', () => {
    const files = baseFiles();
    files[AUTHZ_ACTIONS_MODULE_REL] = "ParticipantRead: 'participant.read',\n";
    const root = writeRepo(files);
    expect(
      checkOk(root, 'facility.read authorization action defined (read-only scope guard)'),
    ).toBe(false);
  });

  it('fails the read-only scope guard when a facility WRITE action is defined', () => {
    const files = baseFiles();
    files[AUTHZ_ACTIONS_MODULE_REL] =
      "FacilityRead: 'facility.read',\n  FacilityWrite: 'facility.write',\n";
    const root = writeRepo(files);
    expect(
      checkOk(
        root,
        'no facility write authorization action defined (write is a separate future pass)',
      ),
    ).toBe(false);
  });

  it('fails when the read-surface preflight document is missing', () => {
    const files = baseFiles();
    files[FACILITY_READ_PREFLIGHT_REL] = null;
    expect(
      checkOk(
        writeRepo(files),
        'facility HTTP read-surface preflight documents the three read routes',
      ),
    ).toBe(false);
  });

  it('fails when the read-surface preflight omits a read route path', () => {
    const files = baseFiles();
    files[FACILITY_READ_PREFLIGHT_REL] = [
      '# Facility HTTP read-surface preflight',
      '- GET /v1/facilities',
      '- GET /v1/facilities/:facilityId',
      '', // missing the organization-scoped facilities route
    ].join('\n');
    expect(
      checkOk(
        writeRepo(files),
        'facility HTTP read-surface preflight documents the three read routes',
      ),
    ).toBe(false);
  });

  it('fails when the write-surface preflight document is missing', () => {
    const files = baseFiles();
    files[FACILITY_WRITE_PREFLIGHT_REL] = null;
    expect(
      checkOk(
        writeRepo(files),
        'facility HTTP write-surface preflight documents the three write routes',
      ),
    ).toBe(false);
  });

  it('fails when the write-surface preflight omits a write route path', () => {
    const files = baseFiles();
    files[FACILITY_WRITE_PREFLIGHT_REL] = [
      '# Facility HTTP write-surface preflight',
      '- POST /v1/facilities',
      '- PATCH /v1/facilities/:facilityId',
      '', // missing the status-transitions route
    ].join('\n');
    expect(
      checkOk(
        writeRepo(files),
        'facility HTTP write-surface preflight documents the three write routes',
      ),
    ).toBe(false);
  });

  it('fails when package.json does not define facility:check', () => {
    const files = baseFiles();
    files['package.json'] = JSON.stringify({ name: 'fixture', scripts: {} });
    expect(checkOk(writeRepo(files), 'package.json defines facility:check')).toBe(false);
  });

  it('fails when ci:check does not chain facility:check', () => {
    const files = baseFiles();
    files['package.json'] = JSON.stringify({
      name: 'fixture',
      scripts: {
        'facility:check': 'tsx scripts/validate-facility-registry-baseline.ts',
        'ci:check': 'npm run build',
      },
    });
    expect(checkOk(writeRepo(files), 'ci:check includes facility:check')).toBe(false);
  });

  it('fails when the doc omits a required marker', () => {
    const files = baseFiles();
    files[FACILITY_DOC_REL] = VALID_DOC.replace('## Out of scope (intentionally not built)', '## Notes');
    expect(checkOk(writeRepo(files), 'doc documents out-of-scope')).toBe(false);
  });

  it('fails when a domain file leaks a secret-like value', () => {
    const files = baseFiles();
    files[`${FACILITY_DOMAIN_DIR_REL}/FacilityTypes.ts`] =
      'const c = "AccountKey=abcdefghijklmnopqrstuvwxyz0123456789==";\n';
    expect(
      checkOk(writeRepo(files), 'no secret-like values in facility registry files'),
    ).toBe(false);
  });

  it('fails when a domain file contains sport-specific terminology', () => {
    const files = baseFiles();
    files[`${FACILITY_DOMAIN_DIR_REL}/FacilityTypes.ts`] = '// this facility is a league venue\n';
    expect(
      checkOk(writeRepo(files), 'no sport-specific terminology in facility registry files'),
    ).toBe(false);
  });

  it('does not flag generic words that merely contain sport letters (office/service)', () => {
    const files = baseFiles();
    files[`${FACILITY_DOMAIN_DIR_REL}/FacilityTypes.ts`] =
      '// an office facility uses this service to notice invoices\n';
    expect(
      checkOk(writeRepo(files), 'no sport-specific terminology in facility registry files'),
    ).toBe(true);
  });

  it('fails when a domain file contains an out-of-scope behavior term', () => {
    const files = baseFiles();
    files[`${FACILITY_DOMAIN_DIR_REL}/FacilityRegistryService.ts`] =
      '// this creates a booking for the facility\n';
    expect(
      checkOk(writeRepo(files), 'no out-of-scope behavior terms in the facility domain code'),
    ).toBe(false);
  });
});
