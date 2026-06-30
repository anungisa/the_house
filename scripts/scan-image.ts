/**
 * Container image vulnerability scan runner (`npm run image:scan`).
 *
 * Explicit, opt-in release tooling — NEVER part of `npm test` and never invoked
 * by the application at runtime. It shells out to Trivy to scan a locally-built
 * image using the committed `trivy.yaml` thresholds. It checks tool availability
 * first and fails with a clear, actionable message when Trivy (or a built image)
 * is unavailable, so a missing scanner binary is never a silent or confusing
 * local-development blocker.
 *
 *   npm run image:scan -- --target api
 *   npm run image:scan -- --target worker --image the-house-worker:local
 *   npm run image:scan -- --target api --fail-on CRITICAL   # opt-in gate
 *
 * Reporting-only by default (does NOT fail on findings) to mirror the PR
 * behaviour described in docs/architecture/image-sbom-vulnerability-baseline.md.
 * It performs NO registry push, requires NO secrets, and contacts NO Azure.
 * Trivy may download its vulnerability database on first run; that is the only
 * network access and it happens ONLY when this script is explicitly invoked.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

interface ScanOptions {
  readonly target: string;
  readonly image: string;
  readonly failOn: string | undefined;
}

function parseArgs(argv: readonly string[]): ScanOptions | { readonly error: string } {
  let target = 'api';
  let image: string | undefined;
  let failOn: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--target' && next !== undefined) {
      target = next;
      i += 1;
    } else if (arg === '--image' && next !== undefined) {
      image = next;
      i += 1;
    } else if (arg === '--fail-on' && next !== undefined) {
      failOn = next.toUpperCase();
      i += 1;
    }
  }

  if (target !== 'api' && target !== 'worker') {
    return { error: `Unknown --target "${target}". Use "api" or "worker".` };
  }

  return { target, image: image ?? `the-house-${target}:local`, failOn };
}

function isAvailable(command: string): boolean {
  const probe = spawnSync('command', ['-v', command], { shell: true, stdio: 'ignore' });
  return probe.status === 0;
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(`[scan] ${parsed.error}`);
    process.exit(1);
  }

  if (!isAvailable('trivy')) {
    console.error(
      '[scan] Trivy is not installed. Install it (https://github.com/aquasecurity/trivy) and ' +
        'build the image first, e.g. `docker build --target api -t the-house-api:local .`. ' +
        'Image scanning is an opt-in release step and is intentionally not part of the ' +
        'default test/build pipeline.',
    );
    process.exit(1);
  }

  const args = ['image'];
  if (existsSync('trivy.yaml')) {
    args.push('--config', 'trivy.yaml');
  }
  // Reporting-only unless an explicit severity gate is requested.
  args.push('--exit-code', parsed.failOn === undefined ? '0' : '1');
  if (parsed.failOn !== undefined) {
    args.push('--severity', parsed.failOn);
  }
  args.push(parsed.image);

  console.log(
    `[scan] scanning ${parsed.image}` +
      (parsed.failOn === undefined ? ' (reporting-only)' : ` (gate: fail on ${parsed.failOn})`),
  );
  const result = spawnSync('trivy', args, { stdio: 'inherit' });

  if (result.status !== 0) {
    console.error(`[scan] findings at or above the gate threshold (exit ${String(result.status)}).`);
    process.exit(result.status ?? 1);
  }

  console.log('[scan] complete.');
}

main();
