/**
 * SBOM generation runner (`npm run sbom:generate`).
 *
 * Explicit, opt-in release tooling — NEVER part of `npm test` and never invoked
 * by the application at runtime. It shells out to Syft to produce an SPDX-JSON
 * Software Bill of Materials for a locally-built image. It checks tool
 * availability first and fails with a clear, actionable message when Syft (or a
 * built image) is unavailable, so a missing scanner binary is never a silent or
 * confusing local-development blocker.
 *
 *   npm run sbom:generate -- --target api
 *   npm run sbom:generate -- --target worker --image the-house-worker:local
 *
 * It performs NO registry push, requires NO secrets, and contacts NO Azure.
 */

import { spawnSync } from 'node:child_process';

interface SbomOptions {
  readonly target: string;
  readonly image: string;
  readonly output: string;
}

function parseArgs(argv: readonly string[]): SbomOptions | { readonly error: string } {
  let target = 'api';
  let image: string | undefined;
  let output: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--target' && next !== undefined) {
      target = next;
      i += 1;
    } else if (arg === '--image' && next !== undefined) {
      image = next;
      i += 1;
    } else if (arg === '--output' && next !== undefined) {
      output = next;
      i += 1;
    }
  }

  if (target !== 'api' && target !== 'worker') {
    return { error: `Unknown --target "${target}". Use "api" or "worker".` };
  }

  return {
    target,
    image: image ?? `the-house-${target}:local`,
    output: output ?? `sbom-${target}.spdx.json`,
  };
}

function isAvailable(command: string): boolean {
  const probe = spawnSync('command', ['-v', command], { shell: true, stdio: 'ignore' });
  return probe.status === 0;
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(`[sbom] ${parsed.error}`);
    process.exit(1);
  }

  if (!isAvailable('syft')) {
    console.error(
      '[sbom] Syft is not installed. Install it (https://github.com/anchore/syft) and ' +
        'build the image first, e.g. `docker build --target api -t the-house-api:local .`. ' +
        'SBOM generation is an opt-in release step and is intentionally not part of the ' +
        'default test/build pipeline.',
    );
    process.exit(1);
  }

  console.log(`[sbom] generating SPDX SBOM for ${parsed.image} -> ${parsed.output}`);
  const result = spawnSync('syft', [parsed.image, '-o', `spdx-json=${parsed.output}`], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error(`[sbom] FAILED (exit ${String(result.status ?? 'unknown')}).`);
    process.exit(result.status ?? 1);
  }

  console.log(`[sbom] wrote ${parsed.output}`);
}

main();
