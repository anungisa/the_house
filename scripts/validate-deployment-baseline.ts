/**
 * Deployment baseline validator entrypoint (`npm run deploy:check`).
 *
 * Thin wrapper over the pure validator in src/deployment/validateDeploymentBaseline.ts.
 * Prints each check and exits non-zero when any check fails. STATIC ONLY: never
 * calls Azure or the `az` CLI, never requires credentials, a database, Service
 * Bus, Entra/JWKS, or any network.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateDeploymentBaseline } from '../src/deployment/validateDeploymentBaseline.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const result = validateDeploymentBaseline(repoRoot);

for (const check of result.checks) {
  const mark = check.ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${check.name} — ${check.detail}`);
}

if (result.ok) {
  console.log('\nDeployment baseline OK.');
  process.exit(0);
} else {
  console.error(`\nDeployment baseline FAILED (${result.errors.length} problem(s)):`);
  for (const error of result.errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}
