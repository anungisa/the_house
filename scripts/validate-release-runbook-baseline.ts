/**
 * Production release runbook baseline validator entrypoint (`npm run release:check`).
 *
 * Thin wrapper over the pure validator in
 * src/deployment/validateReleaseRunbookBaseline.ts. Prints each check and exits
 * non-zero when any check fails. STATIC ONLY: never deploys, runs migrations,
 * builds/pushes/scans/signs images, or calls Azure, a registry, a DB, the
 * network, or credentials.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateReleaseRunbookBaseline } from '../src/deployment/validateReleaseRunbookBaseline.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const result = validateReleaseRunbookBaseline(repoRoot);

for (const check of result.checks) {
  const mark = check.ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${check.name} — ${check.detail}`);
}

if (result.ok) {
  console.log('\nProduction release runbook baseline OK.');
  process.exit(0);
} else {
  console.error(
    `\nProduction release runbook baseline FAILED (${result.errors.length} problem(s)):`,
  );
  for (const error of result.errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}
