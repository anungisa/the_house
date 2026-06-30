/**
 * Azure smoke-test baseline validator entrypoint (`npm run smoke:check`).
 *
 * Thin wrapper over the pure validator in
 * src/deployment/validateAzureSmokeBaseline.ts. Prints each check and exits
 * non-zero when any check fails. STATIC ONLY: never calls Azure, the Azure CLI,
 * a live app URL, the network, a DB, or credentials, and never runs the live
 * smoke runner.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateAzureSmokeBaseline } from '../src/deployment/validateAzureSmokeBaseline.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const result = validateAzureSmokeBaseline(repoRoot);

for (const check of result.checks) {
  const mark = check.ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${check.name} — ${check.detail}`);
}

if (result.ok) {
  console.log('\nAzure smoke-test baseline OK.');
  process.exit(0);
} else {
  console.error(`\nAzure smoke-test baseline FAILED (${result.errors.length} problem(s)):`);
  for (const error of result.errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}
