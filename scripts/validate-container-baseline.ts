/**
 * Container + CI/CD baseline validator entrypoint (`npm run container:check`).
 *
 * Thin wrapper over the pure validator in src/deployment/validateContainerBaseline.ts.
 * Prints each check and exits non-zero when any check fails. STATIC ONLY: never
 * builds or runs a container, never calls Docker, a registry, Azure, the network,
 * or requires credentials, a database, or secrets.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateContainerBaseline } from '../src/deployment/validateContainerBaseline.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const result = validateContainerBaseline(repoRoot);

for (const check of result.checks) {
  const mark = check.ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${check.name} — ${check.detail}`);
}

if (result.ok) {
  console.log('\nContainer/CI baseline OK.');
  process.exit(0);
} else {
  console.error(`\nContainer/CI baseline FAILED (${result.errors.length} problem(s)):`);
  for (const error of result.errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}
