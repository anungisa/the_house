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
  FACILITY_HTTP_WRITE_INTEGRATION_TEST_REL,
  FACILITY_MIGRATION_REL,
  FACILITY_DOMAIN_DIR_REL,
  FACILITY_HTTP_DIR_REL,
  FACILITY_HTTP_READ_FILES,
  FACILITY_HTTP_WRITE_FILES,
  FACILITY_HTTP_WRITE_ADAPTER_TEST_REL,
  FACILITY_HTTP_WRITE_SERVER_TEST_REL,
  SERVER_MODULE_REL,
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

/**
 * An authorization catalog fixture that DEFINES facility.read + facility.write + facility.status.write
 * and maps facility_admin to all three.
 */
const AUTHZ_WITH_FACILITY_WRITE =
  "ParticipantRead: 'participant.read',\n  FacilityRead: 'facility.read',\n  FacilityWrite: 'facility.write',\n  FacilityStatusWrite: 'facility.status.write',\n  // facility_admin: [FacilityRead, FacilityWrite, FacilityStatusWrite]\n";

/** A server module fixture that wires the facility create + update + status-transition routes. */
const SERVER_WITH_FACILITY_WRITE =
  '// server fixture\nhandleFacilityCreate();\nhandleFacilityUpdate();\nhandleFacilityStatusTransition();\n// POST /v1/facilities/:id/status-transitions\n';

function baseFiles(): Record<string, string | null> {
  const files: Record<string, string | null> = {
    [FACILITY_DOC_REL]: VALID_DOC,
    [FACILITY_TEST_REL]: '// facility registry service test (fixture)\n',
    [FACILITY_INTEGRATION_TEST_REL]: '// facility registry integration test (fixture)\n',
    [FACILITY_HTTP_INTEGRATION_TEST_REL]:
      '// facility registry HTTP integration test (fixture)\n',
    [FACILITY_HTTP_WRITE_INTEGRATION_TEST_REL]:
      '// facility registry HTTP write integration test (fixture)\n',
    [FACILITY_MIGRATION_REL]: '-- 0011 facility registry (fixture)\n',
    [AUTHZ_ACTIONS_MODULE_REL]: AUTHZ_WITH_FACILITY_WRITE,
    [SERVER_MODULE_REL]: SERVER_WITH_FACILITY_WRITE,
    [FACILITY_HTTP_WRITE_ADAPTER_TEST_REL]:
      '// facility write adapter test (fixture)\nhandleFacilityStatusTransition();\n',
    [FACILITY_HTTP_WRITE_SERVER_TEST_REL]:
      '// facility write server test (fixture) POST /v1/facilities/:id/status-transitions\n',
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
  for (const rel of FACILITY_HTTP_WRITE_FILES) {
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

  it('fails when the HTTP write integration test is missing', () => {
    const files = baseFiles();
    files[FACILITY_HTTP_WRITE_INTEGRATION_TEST_REL] = null;
    expect(checkOk(writeRepo(files), 'facility HTTP write integration test exists')).toBe(false);
  });

  it('fails when a facility HTTP read file is missing', () => {
    const files = baseFiles();
    files[`${FACILITY_HTTP_DIR_REL}/FacilityReadHttpAdapter.ts`] = null;
    const root = writeRepo(files);
    expect(checkOk(root, 'facility HTTP read surface exists')).toBe(false);
  });

  it('fails when a facility HTTP write file is missing', () => {
    const files = baseFiles();
    files[FACILITY_HTTP_WRITE_FILES[0]!] = null;
    const root = writeRepo(files);
    expect(
      checkOk(root, 'facility HTTP write surface exists (create/update/status)'),
    ).toBe(false);
  });

  it('fails when the facility.read action is missing', () => {
    const files = baseFiles();
    files[AUTHZ_ACTIONS_MODULE_REL] = "ParticipantRead: 'participant.read',\n";
    const root = writeRepo(files);
    expect(checkOk(root, 'facility.read authorization action defined')).toBe(false);
  });

  it('fails when the facility.write action is missing', () => {
    const files = baseFiles();
    files[AUTHZ_ACTIONS_MODULE_REL] = "FacilityRead: 'facility.read',\n";
    const root = writeRepo(files);
    expect(
      checkOk(root, 'facility.write authorization action defined (create/update)'),
    ).toBe(false);
  });

  it('fails when facility_admin does not map the write action', () => {
    const files = baseFiles();
    files[AUTHZ_ACTIONS_MODULE_REL] = "FacilityRead: 'facility.read',\n";
    const root = writeRepo(files);
    expect(checkOk(root, 'facility_admin maps to facility read + write')).toBe(false);
  });

  it('fails when a facility.status.write action is missing', () => {
    const files = baseFiles();
    files[AUTHZ_ACTIONS_MODULE_REL] =
      "FacilityRead: 'facility.read',\n  FacilityWrite: 'facility.write',\n";
    const root = writeRepo(files);
    expect(
      checkOk(
        root,
        'facility.status.write authorization action defined (status transition)',
      ),
    ).toBe(false);
  });

  it('fails when facility_admin does not map the status.write action', () => {
    const files = baseFiles();
    files[AUTHZ_ACTIONS_MODULE_REL] =
      "FacilityRead: 'facility.read',\n  FacilityWrite: 'facility.write',\n  'facility.status.write',\n";
    const root = writeRepo(files);
    expect(checkOk(root, 'facility_admin maps to facility.status.write')).toBe(false);
  });

  it('fails when the server does not wire facility create + update routes', () => {
    const files = baseFiles();
    files[SERVER_MODULE_REL] = '// server fixture with no facility write wiring\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'server wires facility create + update routes')).toBe(false);
  });

  it('fails when the server does not wire a facility status-transition route', () => {
    const files = baseFiles();
    files[SERVER_MODULE_REL] =
      '// server fixture\nhandleFacilityCreate();\nhandleFacilityUpdate();\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'server wires the facility status-transition route')).toBe(false);
  });

  it('fails when the write adapter calls the Governance Kernel', () => {
    const files = baseFiles();
    files[`${FACILITY_HTTP_DIR_REL}/FacilityWriteHttpAdapter.ts`] =
      'const k = new GovernanceKernel();\n';
    const root = writeRepo(files);
    expect(
      checkOk(root, 'facility write adapter does not call the Governance Kernel'),
    ).toBe(false);
  });

  it('passes the kernel guard when only a comment mentions the Governance Kernel', () => {
    const files = baseFiles();
    files[`${FACILITY_HTTP_DIR_REL}/FacilityWriteHttpAdapter.ts`] =
      '// never invokes the Governance Kernel\nexport const x = 1;\n';
    const root = writeRepo(files);
    expect(
      checkOk(root, 'facility write adapter does not call the Governance Kernel'),
    ).toBe(true);
  });

  it('fails when the write adapter enqueues the outbox directly', () => {
    const files = baseFiles();
    files[`${FACILITY_HTTP_DIR_REL}/FacilityWriteHttpAdapter.ts`] =
      'await outbox.enqueue(msg);\n';
    const root = writeRepo(files);
    expect(
      checkOk(root, 'facility write adapter does not enqueue the outbox directly'),
    ).toBe(false);
  });

  it('fails when the write adapter mutates the Organization Registry', () => {
    const files = baseFiles();
    files[`${FACILITY_HTTP_DIR_REL}/FacilityWriteHttpAdapter.ts`] =
      'await service.updateOrganization(input);\n';
    const root = writeRepo(files);
    expect(
      checkOk(root, 'facility write adapter does not mutate the Organization Registry'),
    ).toBe(false);
  });

  it('fails when the facility write adapter test is missing', () => {
    const files = baseFiles();
    files[FACILITY_HTTP_WRITE_ADAPTER_TEST_REL] = null;
    expect(checkOk(writeRepo(files), 'facility write HTTP adapter test exists')).toBe(false);
  });

  it('fails when the facility write server test is missing', () => {
    const files = baseFiles();
    files[FACILITY_HTTP_WRITE_SERVER_TEST_REL] = null;
    expect(checkOk(writeRepo(files), 'facility write HTTP server test exists')).toBe(false);
  });

  it('fails when the write adapter test does not cover the status transition', () => {
    const files = baseFiles();
    files[FACILITY_HTTP_WRITE_ADAPTER_TEST_REL] = '// facility write adapter test (fixture)\n';
    const root = writeRepo(files);
    expect(
      checkOk(root, 'facility write adapter test covers the status transition'),
    ).toBe(false);
  });

  it('fails when the write server test does not cover the status-transition route', () => {
    const files = baseFiles();
    files[FACILITY_HTTP_WRITE_SERVER_TEST_REL] = '// facility write server test (fixture)\n';
    const root = writeRepo(files);
    expect(
      checkOk(root, 'facility write server test covers the status-transition route'),
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
