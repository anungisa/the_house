/**
 * Migration baseline validator entrypoint (`npm run migrations:check`).
 *
 * Thin wrapper over the pure validator in src/deployment/validateMigrationBaseline.ts.
 * Prints each check and exits non-zero when any check fails. STATIC ONLY: never
 * connects to a database, runs a migration, calls Azure, the network, or requires
 * credentials.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateMigrationBaseline } from '../src/deployment/validateMigrationBaseline.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const result = validateMigrationBaseline(repoRoot);

for (const check of result.checks) {
  const mark = check.ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${check.name} — ${check.detail}`);
}

if (result.ok) {
  console.log('\nMigration baseline OK.');
  process.exit(0);
} else {
  console.error(`\nMigration baseline FAILED (${result.errors.length} problem(s)):`);
  for (const error of result.errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}
