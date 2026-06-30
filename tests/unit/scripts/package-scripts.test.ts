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
    ]) {
      expect(scripts[name]).toBeDefined();
    }
  });
});
