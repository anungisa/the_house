/**
 * Container image signing runner (`npm run image:sign`).
 *
 * Explicit, opt-in release tooling — NEVER part of `npm test` and never invoked
 * by the application at runtime. It prepares (and, only when explicitly
 * confirmed, executes) a digest-bound Cosign keyless signature for a built
 * image. By default it is a DRY RUN: it validates inputs and prints the exact
 * Cosign command without contacting a registry, a transparency log, or any
 * network.
 *
 *   IMAGE_DIGEST=registry.example/the-house-api@sha256:<digest> npm run image:sign
 *   IMAGE_DIGEST=...@sha256:<digest> npm run image:sign -- --confirm   # actually signs
 *
 * Signing rules enforced here:
 *  - an image DIGEST is mandatory (tag-only references are refused, because a
 *    mutable tag can be repointed after signing);
 *  - signing only executes with an explicit `--confirm`, and only if Cosign is
 *    installed; otherwise it prints the command and exits 0.
 *
 * It NEVER prints secrets, never embeds a private key (keyless OIDC only), and
 * contacts NO Azure / registry / transparency log unless explicitly confirmed.
 */

import { spawnSync } from 'node:child_process';

function isAvailable(command: string): boolean {
  const probe = spawnSync('command', ['-v', command], { shell: true, stdio: 'ignore' });
  return probe.status === 0;
}

/** A reference is digest-bound when it pins an immutable `@sha256:` digest. */
function isDigestReference(reference: string): boolean {
  return /@sha256:[0-9a-f]{64}$/i.test(reference.trim());
}

function main(): void {
  const confirm = process.argv.slice(2).includes('--confirm');
  const digest = process.env['IMAGE_DIGEST']?.trim() ?? '';

  if (digest === '') {
    console.error(
      '[sign] IMAGE_DIGEST is required. Provide a digest-bound reference, e.g. ' +
        'IMAGE_DIGEST=registry.example/the-house-api@sha256:<64-hex> npm run image:sign.',
    );
    process.exit(1);
  }

  if (!isDigestReference(digest)) {
    console.error(
      `[sign] refusing to sign a tag-only reference "${digest}". Signing must bind to an ` +
        'immutable @sha256:<digest> so a mutable tag cannot be repointed after signing.',
    );
    process.exit(1);
  }

  // Keyless (Sigstore/Fulcio + Rekor) — no private key is read or printed.
  const cosignArgs = ['sign', '--yes', digest];
  const command = `cosign ${cosignArgs.join(' ')}`;

  if (!confirm) {
    console.log('[sign] DRY RUN (pass --confirm to execute). Would run:');
    console.log(`  ${command}`);
    console.log('[sign] keyless OIDC signing; no private key, no secrets, no network in dry run.');
    process.exit(0);
  }

  if (!isAvailable('cosign')) {
    console.error(
      '[sign] Cosign is not installed. Install it (https://github.com/sigstore/cosign) to sign. ' +
        'Signing is an opt-in release step and is intentionally not part of the default ' +
        'test/build pipeline.',
    );
    process.exit(1);
  }

  console.log(`[sign] signing ${digest} (keyless).`);
  const result = spawnSync('cosign', cosignArgs, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[sign] cosign sign failed (exit ${String(result.status)}).`);
    process.exit(result.status ?? 1);
  }
  console.log('[sign] complete.');
}

main();
