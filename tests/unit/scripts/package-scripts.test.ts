import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Guards that the local/demo runtime package scripts exist and that no existing script was
 * removed or renamed. Reads package.json directly (no Docker/DB).
 */

const here = dirname(fileURLToPath(import.meta.url));
const PKG_PATH = join(here, '..', '..', '..', 'package.json');

let scripts: Record<string, string>;

beforeAll(async () => {
  const pkg = JSON.parse(await readFile(PKG_PATH, 'utf8')) as { scripts?: Record<string, string> };
  scripts = pkg.scripts ?? {};
});

describe('package scripts', () => {
  // (9) New local/demo scripts are present.
  it('defines dev:api and demo:seed:affiliation', () => {
    expect(scripts['dev:api']).toBe('tsx scripts/api-dev.ts');
    expect(scripts['demo:seed:affiliation']).toBe('tsx scripts/demo-seed-affiliation.ts');
  });

  // (13) Outbox worker runtime script is present.
  it('defines worker:outbox', () => {
    expect(scripts['worker:outbox']).toBe('tsx scripts/outbox-worker.ts');
  });

  // Operational config check script is present.
  it('defines config:check', () => {
    expect(scripts['config:check']).toBe('tsx scripts/config-check.ts');
  });

  // Deployment baseline validation script is present.
  it('defines deploy:check', () => {
    expect(scripts['deploy:check']).toBe('tsx scripts/validate-deployment-baseline.ts');
  });

  // Container/CI baseline validation script is present.
  it('defines container:check', () => {
    expect(scripts['container:check']).toBe('tsx scripts/validate-container-baseline.ts');
  });

  // Migration baseline validation + governed runner scripts are present.
  it('defines migrations:check, migrations:plan, and migrations:apply', () => {
    expect(scripts['migrations:check']).toBe('tsx scripts/validate-migrations.ts');
    expect(scripts['migrations:plan']).toBe('tsx scripts/migrate-db.ts --plan');
    expect(scripts['migrations:apply']).toBe('tsx scripts/migrate-db.ts --apply');
  });

  // Supply-chain (SBOM + vulnerability scan) baseline scripts are present.
  it('defines supply-chain:check, sbom:generate, and image:scan', () => {
    expect(scripts['supply-chain:check']).toBe('tsx scripts/validate-supply-chain-baseline.ts');
    expect(scripts['sbom:generate']).toBe('tsx scripts/generate-sbom.ts');
    expect(scripts['image:scan']).toBe('tsx scripts/scan-image.ts');
  });

  // Signed-provenance / Cosign baseline scripts are present.
  it('defines provenance:check, image:sign, and sbom:attest', () => {
    expect(scripts['provenance:check']).toBe('tsx scripts/validate-provenance-baseline.ts');
    expect(scripts['image:sign']).toBe('tsx scripts/sign-image.ts');
    expect(scripts['sbom:attest']).toBe('tsx scripts/attest-sbom.ts');
  });

  // Azure environment smoke-test baseline scripts are present.
  it('defines smoke:check and smoke:azure', () => {
    expect(scripts['smoke:check']).toBe('tsx scripts/validate-azure-smoke-baseline.ts');
    expect(scripts['smoke:azure']).toBe('tsx scripts/azure-smoke-test.ts');
  });

  // Aggregate CI gate script is present and chains the required gates.
  it('defines ci:check chaining the required gates', () => {
    const ciCheck = scripts['ci:check'];
    expect(ciCheck).toBeDefined();
    for (const gate of [
      'npm run typecheck',
      'npm run lint',
      'npm test',
      'npm run build',
      'npm run deploy:check',
      'npm run container:check',
      'npm run migrations:check',
      'npm run supply-chain:check',
      'npm run provenance:check',
      'npm run smoke:check',
    ]) {
      expect(ciCheck).toContain(gate);
    }
  });

  it('does not remove or rename existing scripts', () => {
    for (const name of [
      'typecheck',
      'lint',
      'test',
      'test:unit',
      'test:integration',
      'build',
      'db:migrate',
      'db:seed',
      'dev:api',
      'demo:seed:affiliation',
      'worker:outbox',
      'config:check',
      'deploy:check',
      'container:check',
      'migrations:check',
      'supply-chain:check',
      'provenance:check',
      'smoke:check',
      'smoke:azure',
    ]) {
      expect(scripts[name]).toBeDefined();
    }
  });
});
