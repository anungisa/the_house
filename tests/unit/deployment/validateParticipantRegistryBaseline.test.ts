import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateParticipantRegistryBaseline,
  PARTICIPANT_DOC_REL,
  PARTICIPANT_WRITE_PREFLIGHT_DOC_REL,
  PARTICIPANT_TEST_REL,
  PARTICIPANT_INTEGRATION_TEST_REL,
  PARTICIPANT_MIGRATION_REL,
  PARTICIPANT_DOMAIN_DIR_REL,
  PARTICIPANT_HTTP_ADAPTER_REL,
  PARTICIPANT_HTTP_DTO_REL,
  PARTICIPANT_HTTP_INDEX_REL,
  PARTICIPANT_HTTP_AUTH_REL,
  PARTICIPANT_HTTP_TEST_REL,
  PARTICIPANT_HTTP_INTEGRATION_TEST_REL,
  PARTICIPANT_HTTP_WRITE_ADAPTER_REL,
  PARTICIPANT_HTTP_WRITE_DTO_REL,
  PARTICIPANT_HTTP_WRITE_TEST_REL,
  SERVER_MODULE_REL,
  AUTHZ_ACTIONS_MODULE_REL,
  SYNTHETIC_TEST_REL,
} from '../../../src/deployment/validateParticipantRegistryBaseline.js';

/**
 * Hermetic tests for the Participant Registry baseline validator. Fully static / in-process:
 * they read repo files and build temp fixtures. They NEVER run tests, deploy, migrate,
 * build/push/scan/sign images, or contact Azure, a registry, a DB, Service Bus, Key Vault, a
 * live URL, or the network, and they require no credentials.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');

const tempRoots: string[] = [];

const VALID_DOC = [
  '# Participant Registry domain baseline',
  '',
  '## Purpose',
  'Generic tenant-scoped person/member reference structure.',
  '',
  '## Domain model',
  'A participant record and an organization relationship record.',
  '',
  '## Tenant isolation',
  'RLS keyed on the tenant.',
  '',
  '## Organization dependency',
  'Reads the organization registry as same-tenant reference structure only.',
  '',
  '## Outbox signals (sanitized)',
  'Created/updated/status_changed/organization_linked outbox.',
  '',
  '## Telemetry signals',
  'Counters and events.',
  '',
  '## Privacy stance',
  'Minimal fields; email excluded from outbox payloads.',
  '',
  '## HTTP read surface',
  'Read-only list/detail and organization relationship endpoints gated by participant.read.',
  '',
  '## HTTP write surface',
  'Create + update + status-transition endpoints gated by participant.write and participant.status.write.',
  '',
  '## Out of scope (intentionally not built)',
  'No organization-link write endpoints, no write transport beyond create/update/status-transition.',
  '',
].join('\n');

const VALID_PREFLIGHT_DOC = [
  '# Participant write HTTP preflight',
  '',
  'Status: Phase 1 create + update plus status mutation IMPLEMENTED. Org relationship write NOT IMPLEMENTED.',
  '',
  '## Phase 2 preflight — status transitions & organization-link mutations',
  'Phase 2 status-transition route IMPLEMENTED; organization-link route NOT implemented yet.',
  '',
  '## Idempotency & concurrency model',
  'POST mutations require an Idempotency-Key; replays return the prior result.',
  '',
  '## RLS / tenant-isolation requirements',
  'Tenant A cannot mutate tenant B; RLS forced; NOSUPERUSER NOBYPASSRLS.',
  '',
  '## Privacy & payload safety',
  'Email response-only; names/email never in outbox or telemetry.',
  '',
  '## Required test matrix',
  'Hermetic adapter, server routing, gated DB/RLS, coverage.',
  '',
].join('\n');

const DOMAIN_FILES = [
  'ParticipantTypes.ts',
  'ParticipantRegistryErrors.ts',
  'ParticipantRegistryStore.ts',
  'InMemoryParticipantRegistryStore.ts',
  'PgParticipantRegistryStore.ts',
  'ParticipantRegistryService.ts',
  'index.ts',
];

const VALID_PACKAGE_JSON = JSON.stringify(
  {
    name: 'fixture',
    scripts: {
      'participant:check': 'tsx scripts/validate-participant-registry-baseline.ts',
      'ci:check':
        'npm run build && npm run organization:check && npm run participant:check',
    },
  },
  null,
  2,
);

function baseFiles(): Record<string, string | null> {
  const files: Record<string, string | null> = {
    [PARTICIPANT_DOC_REL]: VALID_DOC,
    [PARTICIPANT_WRITE_PREFLIGHT_DOC_REL]: VALID_PREFLIGHT_DOC,
    [PARTICIPANT_TEST_REL]: '// participant registry service test (fixture)\n',
    [PARTICIPANT_INTEGRATION_TEST_REL]: '// participant registry integration test (fixture)\n',
    [PARTICIPANT_MIGRATION_REL]: '-- 0010 participant registry (fixture)\n',
    [SYNTHETIC_TEST_REL]: "// references participant-registry domain in synthetic suite\n",
    [PARTICIPANT_HTTP_ADAPTER_REL]: '// participant read http adapter (fixture)\n',
    [PARTICIPANT_HTTP_DTO_REL]: '// participant read http dtos (fixture)\n',
    [PARTICIPANT_HTTP_INDEX_REL]: '// participant http barrel (fixture)\n',
    [PARTICIPANT_HTTP_AUTH_REL]: '// participant http auth (fixture)\n',
    [PARTICIPANT_HTTP_TEST_REL]: '// participant read http adapter test (fixture)\n',
    [PARTICIPANT_HTTP_INTEGRATION_TEST_REL]:
      '// participant read http integration test (fixture)\n',
    [PARTICIPANT_HTTP_WRITE_ADAPTER_REL]: '// participant write http adapter (fixture)\n',
    [PARTICIPANT_HTTP_WRITE_DTO_REL]: '// participant write http dtos (fixture)\n',
    [PARTICIPANT_HTTP_WRITE_TEST_REL]: '// participant write http adapter test (fixture)\n',
    [SERVER_MODULE_REL]:
      '// server wires /v1/participants and /v1/organizations/:id/participants (fixture)\n' +
      '// handleParticipantCreate handleParticipantUpdate (fixture)\n' +
      '// handleParticipantStatusTransition status-transitions (fixture)\n',
    [AUTHZ_ACTIONS_MODULE_REL]:
      "ParticipantRead: 'participant.read',\nParticipantWrite: 'participant.write',\n" +
      "ParticipantStatusWrite: 'participant.status.write',\n",
    'package.json': VALID_PACKAGE_JSON,
  };
  for (const f of DOMAIN_FILES) {
    files[`${PARTICIPANT_DOMAIN_DIR_REL}/${f}`] = `// ${f} (fixture)\n`;
  }
  return files;
}

function writeRepo(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'house-participant-'));
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
  const result = validateParticipantRegistryBaseline(root);
  return result.checks.find((c) => c.name === name)?.ok ?? false;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('validateParticipantRegistryBaseline', () => {
  it('passes on the current repository', () => {
    const result = validateParticipantRegistryBaseline(REPO_ROOT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('passes on a complete valid fixture', () => {
    const result = validateParticipantRegistryBaseline(writeRepo(baseFiles()));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails when a domain file is missing', () => {
    const files = baseFiles();
    files[`${PARTICIPANT_DOMAIN_DIR_REL}/ParticipantRegistryService.ts`] = null;
    const root = writeRepo(files);
    expect(validateParticipantRegistryBaseline(root).ok).toBe(false);
    expect(
      checkOk(root, `domain file exists: ${PARTICIPANT_DOMAIN_DIR_REL}/ParticipantRegistryService.ts`),
    ).toBe(false);
  });

  it('fails when the migration is missing', () => {
    const files = baseFiles();
    files[PARTICIPANT_MIGRATION_REL] = null;
    const root = writeRepo(files);
    expect(checkOk(root, 'participant registry migration exists')).toBe(false);
  });

  it('fails when the architecture doc is missing', () => {
    const files = baseFiles();
    files[PARTICIPANT_DOC_REL] = null;
    const root = writeRepo(files);
    expect(checkOk(root, 'participant registry doc exists')).toBe(false);
  });

  it('fails when the unit test is missing', () => {
    const files = baseFiles();
    files[PARTICIPANT_TEST_REL] = null;
    const root = writeRepo(files);
    expect(checkOk(root, 'participant registry unit test exists')).toBe(false);
  });

  it('fails when the integration test is missing', () => {
    const files = baseFiles();
    files[PARTICIPANT_INTEGRATION_TEST_REL] = null;
    const root = writeRepo(files);
    expect(checkOk(root, 'participant registry integration test exists')).toBe(false);
  });

  it('fails when the synthetic suite does not reference the participant registry', () => {
    const files = baseFiles();
    files[SYNTHETIC_TEST_REL] = '// synthetic suite without participant reference\n';
    const root = writeRepo(files);
    expect(
      checkOk(root, 'synthetic lifecycle suite references the participant registry'),
    ).toBe(false);
  });

  it('fails when an HTTP read-surface file is missing', () => {
    const files = baseFiles();
    files[PARTICIPANT_HTTP_ADAPTER_REL] = null;
    const root = writeRepo(files);
    expect(
      checkOk(root, `HTTP read-surface file exists: ${PARTICIPANT_HTTP_ADAPTER_REL}`),
    ).toBe(false);
  });

  it('fails when the HTTP read-surface unit test is missing', () => {
    const files = baseFiles();
    files[PARTICIPANT_HTTP_TEST_REL] = null;
    const root = writeRepo(files);
    expect(checkOk(root, 'participant HTTP read-surface unit test exists')).toBe(false);
  });

  it('fails when the HTTP read-surface integration test is missing', () => {
    const files = baseFiles();
    files[PARTICIPANT_HTTP_INTEGRATION_TEST_REL] = null;
    const root = writeRepo(files);
    expect(checkOk(root, 'participant HTTP read-surface integration test exists')).toBe(false);
  });

  it('fails when the server does not wire the /v1/participants routes', () => {
    const files = baseFiles();
    files[SERVER_MODULE_REL] = '// server without participant routes (fixture)\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'server wires the /v1/participants read routes')).toBe(false);
  });

  it('fails when the authz catalog does not define participant.read', () => {
    const files = baseFiles();
    files[AUTHZ_ACTIONS_MODULE_REL] = '// authz catalog without participant.read (fixture)\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'authz catalog defines participant.read')).toBe(false);
  });

  it('fails when the authz catalog does not define participant.status.write', () => {
    const files = baseFiles();
    files[AUTHZ_ACTIONS_MODULE_REL] =
      "ParticipantRead: 'participant.read',\nParticipantWrite: 'participant.write',\n";
    const root = writeRepo(files);
    expect(checkOk(root, 'authz catalog defines participant.status.write')).toBe(false);
  });

  it('fails when the server does not wire the status-transition route', () => {
    const files = baseFiles();
    files[SERVER_MODULE_REL] =
      '// server wires /v1/participants and /v1/organizations/:id/participants (fixture)\n' +
      '// handleParticipantCreate handleParticipantUpdate (fixture)\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'server wires the participant status-transition route')).toBe(false);
  });

  it('fails when the server wires an organization-link write handler', () => {
    const files = baseFiles();
    files[SERVER_MODULE_REL] =
      '// server wires /v1/participants and /v1/organizations/:id/participants (fixture)\n' +
      '// handleParticipantCreate handleParticipantUpdate (fixture)\n' +
      '// handleParticipantStatusTransition status-transitions (fixture)\n' +
      '// handleParticipantLink (fixture)\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'server exposes NO organization-link write handler')).toBe(false);
  });

  it('flags an out-of-scope behavior term leaking into the write surface', () => {
    const files = baseFiles();
    files[PARTICIPANT_HTTP_WRITE_ADAPTER_REL] =
      '// participant write http adapter handles registration (fixture)\n';
    const root = writeRepo(files);
    expect(
      checkOk(root, 'no out-of-scope behavior terms in the participant write surface'),
    ).toBe(false);
  });

  it('fails when the doc omits the HTTP read surface section', () => {
    const files = baseFiles();
    files[PARTICIPANT_DOC_REL] = VALID_DOC.replace(/## HTTP read surface/i, '## Notes').replace(
      /Read-only list\/detail and organization relationship endpoints gated by participant\.read\./i,
      'no notes',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'doc documents the HTTP read surface')).toBe(false);
  });

  it('fails when participant:check script is missing', () => {
    const files = baseFiles();
    files['package.json'] = JSON.stringify({
      scripts: { 'ci:check': 'npm run build && npm run participant:check' },
    });
    const root = writeRepo(files);
    expect(checkOk(root, 'package.json defines participant:check')).toBe(false);
  });

  it('fails when ci:check omits participant:check', () => {
    const files = baseFiles();
    files['package.json'] = JSON.stringify({
      scripts: {
        'participant:check': 'tsx scripts/validate-participant-registry-baseline.ts',
        'ci:check': 'npm run build && npm run organization:check',
      },
    });
    const root = writeRepo(files);
    expect(checkOk(root, 'ci:check includes participant:check')).toBe(false);
  });

  it('fails when the doc omits the privacy stance section', () => {
    const files = baseFiles();
    files[PARTICIPANT_DOC_REL] = VALID_DOC.replace(/## Privacy stance/i, '## Notes').replace(
      /Minimal fields; email excluded from outbox payloads\./i,
      'no notes',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'doc documents privacy stance')).toBe(false);
  });

  it('fails when the write HTTP preflight doc is missing', () => {
    const files = baseFiles();
    delete files[PARTICIPANT_WRITE_PREFLIGHT_DOC_REL];
    const root = writeRepo(files);
    expect(checkOk(root, 'participant write HTTP preflight doc exists')).toBe(false);
  });

  it('fails when the preflight doc omits the idempotency model', () => {
    const files = baseFiles();
    files[PARTICIPANT_WRITE_PREFLIGHT_DOC_REL] = VALID_PREFLIGHT_DOC.replace(
      /## Idempotency & concurrency model[\s\S]*?Idempotency-Key[^\n]*\n/i,
      '## Other\nplaceholder\n',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'participant write preflight documents idempotency model')).toBe(false);
  });

  it('fails when the preflight doc omits the phase 2 status/link design', () => {
    const files = baseFiles();
    files[PARTICIPANT_WRITE_PREFLIGHT_DOC_REL] = VALID_PREFLIGHT_DOC.replace(
      /## Phase 2 preflight[\s\S]*?not implemented yet\.\n/i,
      '## Other\nplaceholder design content\n',
    );
    const root = writeRepo(files);
    expect(checkOk(root, 'participant write preflight documents phase 2 scope')).toBe(false);
    expect(
      checkOk(root, 'participant write preflight documents phase 2 status-transition design'),
    ).toBe(false);
    expect(
      checkOk(root, 'participant write preflight documents phase 2 organization-link design'),
    ).toBe(false);
  });

  it('flags sport-specific terminology leaking into a domain file', () => {
    const files = baseFiles();
    files[`${PARTICIPANT_DOMAIN_DIR_REL}/ParticipantTypes.ts`] = '// curling type fixture\n';
    const root = writeRepo(files);
    expect(checkOk(root, 'no sport-specific terminology in participant registry files')).toBe(
      false,
    );
  });

  it('flags a secret-like value leaking into the doc', () => {
    const files = baseFiles();
    files[PARTICIPANT_DOC_REL] = `${VALID_DOC}\nAccountKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ012345==\n`;
    const root = writeRepo(files);
    expect(checkOk(root, 'no secret-like values in participant registry files')).toBe(false);
  });
});
