/**
 * Provenance baseline validator entrypoint (`npm run provenance:check`).
 *
 * Thin wrapper over the pure validator in
 * src/deployment/validateProvenanceBaseline.ts. Prints each check and exits
 * non-zero when any check fails. STATIC ONLY: never signs, attests, pushes, or
 * verifies an image, never calls Cosign / Sigstore / a registry / a transparency
 * log / Azure / the network, and requires no credentials or secrets.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateProvenanceBaseline } from '../src/deployment/validateProvenanceBaseline.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const result = validateProvenanceBaseline(repoRoot);

for (const check of result.checks) {
  const mark = check.ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${check.name} — ${check.detail}`);
}

if (result.ok) {
  console.log('\nSigned provenance / Cosign baseline OK.');
  process.exit(0);
} else {
  console.error(`\nSigned provenance / Cosign baseline FAILED (${result.errors.length} problem(s)):`);
  for (const error of result.errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}
