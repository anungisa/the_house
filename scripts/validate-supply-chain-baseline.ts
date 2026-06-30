/**
 * Supply-chain baseline validator entrypoint (`npm run supply-chain:check`).
 *
 * Thin wrapper over the pure validator in
 * src/deployment/validateSupplyChainBaseline.ts. Prints each check and exits
 * non-zero when any check fails. STATIC ONLY: never builds, pulls, or scans an
 * image, never calls Docker / Syft / Trivy / a registry / a vulnerability
 * database / Azure / the network, and requires no credentials or secrets.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateSupplyChainBaseline } from '../src/deployment/validateSupplyChainBaseline.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const result = validateSupplyChainBaseline(repoRoot);

for (const check of result.checks) {
  const mark = check.ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${check.name} — ${check.detail}`);
}

if (result.ok) {
  console.log('\nSupply-chain baseline OK.');
  process.exit(0);
} else {
  console.error(`\nSupply-chain baseline FAILED (${result.errors.length} problem(s)):`);
  for (const error of result.errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}
