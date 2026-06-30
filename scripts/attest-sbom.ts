/**
 * SBOM attestation runner (`npm run sbom:attest`).
 *
 * Explicit, opt-in release tooling — NEVER part of `npm test` and never invoked
 * by the application at runtime. It prepares (and, only when explicitly
 * confirmed, executes) a digest-bound Cosign SBOM attestation, binding a
 * previously generated SBOM to an immutable image digest. By default it is a DRY
 * RUN: it validates inputs and prints the exact Cosign command without
 * contacting a registry, a transparency log, or any network.
 *
 *   IMAGE_DIGEST=registry.example/the-house-api@sha256:<digest> \
 *     SBOM_PATH=sbom-api.spdx.json npm run sbom:attest
 *   ... npm run sbom:attest -- --confirm                # actually attests
 *
 * Rules enforced here:
 *  - an image DIGEST is mandatory (tag-only references are refused);
 *  - an existing SBOM file path is mandatory (a missing artifact is refused);
 *  - attestation only executes with an explicit `--confirm`, and only if Cosign
 *    is installed; otherwise it prints the command and exits 0.
 *
 * It NEVER prints secrets, never embeds a private key (keyless OIDC only), and
 * contacts NO Azure / registry / transparency log unless explicitly confirmed.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function isAvailable(command: string): boolean {
  const probe = spawnSync('command', ['-v', command], { shell: true, stdio: 'ignore' });
  return probe.status === 0;
}

function isDigestReference(reference: string): boolean {
  return /@sha256:[0-9a-f]{64}$/i.test(reference.trim());
}

function main(): void {
  const confirm = process.argv.slice(2).includes('--confirm');
  const digest = process.env['IMAGE_DIGEST']?.trim() ?? '';
  const sbomPath = process.env['SBOM_PATH']?.trim() ?? '';

  if (digest === '') {
    console.error(
      '[attest] IMAGE_DIGEST is required. Provide a digest-bound reference, e.g. ' +
        'IMAGE_DIGEST=registry.example/the-house-api@sha256:<64-hex> npm run sbom:attest.',
    );
    process.exit(1);
  }

  if (!isDigestReference(digest)) {
    console.error(
      `[attest] refusing to attest a tag-only reference "${digest}". Attestation must bind to an ` +
        'immutable @sha256:<digest>.',
    );
    process.exit(1);
  }

  if (sbomPath === '') {
    console.error(
      '[attest] SBOM_PATH is required. Generate an SBOM first (npm run sbom:generate) and pass ' +
        'its path, e.g. SBOM_PATH=sbom-api.spdx.json.',
    );
    process.exit(1);
  }

  if (!existsSync(sbomPath)) {
    console.error(
      `[attest] SBOM artifact "${sbomPath}" does not exist. Generate it first with ` +
        '`npm run sbom:generate`.',
    );
    process.exit(1);
  }

  // Keyless (Sigstore/Fulcio + Rekor) — no private key is read or printed.
  const cosignArgs = [
    'attest',
    '--yes',
    '--type',
    'spdxjson',
    '--predicate',
    sbomPath,
    digest,
  ];
  const command = `cosign ${cosignArgs.join(' ')}`;

  if (!confirm) {
    console.log('[attest] DRY RUN (pass --confirm to execute). Would run:');
    console.log(`  ${command}`);
    console.log('[attest] keyless OIDC attestation; no private key, no secrets, no network in dry run.');
    process.exit(0);
  }

  if (!isAvailable('cosign')) {
    console.error(
      '[attest] Cosign is not installed. Install it (https://github.com/sigstore/cosign) to ' +
        'attest. Attestation is an opt-in release step and is intentionally not part of the ' +
        'default test/build pipeline.',
    );
    process.exit(1);
  }

  console.log(`[attest] attesting SBOM ${sbomPath} for ${digest} (keyless).`);
  const result = spawnSync('cosign', cosignArgs, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[attest] cosign attest failed (exit ${String(result.status)}).`);
    process.exit(result.status ?? 1);
  }
  console.log('[attest] complete.');
}

main();
