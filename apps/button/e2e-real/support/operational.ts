/**
 * Operational E2E prerequisite helpers.
 *
 * These wrap REAL repository entrypoints as child processes so the browser journey can establish
 * prerequisites that have no Button operating surface, and can trigger the governed standing
 * projection exactly as production does. They introduce NO second server/harness: they reuse the
 * same least-privilege DATABASE_URL as the running API and the same kernel-backed code paths.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// support -> e2e-real -> button -> apps -> <repo root>
const repoRoot = join(here, '..', '..', '..', '..');
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx');

function run(scriptRelPath: string, extraEnv: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(tsxBin, [join(repoRoot, scriptRelPath)], {
      cwd: repoRoot,
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${scriptRelPath} exited with code ${String(code)}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
      }
    });
  });
}

export interface BlockingFinancialObligationInput {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly obligationId: string;
  readonly subjectId: string;
  readonly season: string;
  readonly amount?: string;
}

/**
 * Seed a BLOCKING affiliation financial obligation driven to `confirmed` through the real kernel
 * (assess -> acknowledge -> confirm). Reconciliation itself is performed through the Button.
 */
export async function seedBlockingFinancialObligation(
  input: BlockingFinancialObligationInput,
): Promise<void> {
  await run('scripts/e2e-real/seed-financial-obligation.ts', {
    E2E_SEED_TENANT_ID: input.tenantId,
    E2E_SEED_APPLICATION_ID: input.applicationId,
    E2E_SEED_OBLIGATION_ID: input.obligationId,
    E2E_SEED_SUBJECT_ID: input.subjectId,
    E2E_SEED_SEASON: input.season,
    ...(input.amount !== undefined ? { E2E_SEED_AMOUNT: input.amount } : {}),
  });
}

/**
 * Run the governed standing-projection worker for exactly one batch (run-once), then exit. This is
 * the production worker entrypoint; every standing it opens goes through the Governance Kernel.
 */
export async function runStandingProjectionOnce(): Promise<void> {
  await run('scripts/standing-projection-worker.ts', {
    STANDING_PROJECTION_WORKER_ENABLED: 'true',
    STANDING_PROJECTION_WORKER_RUN_ONCE: 'true',
  });
}
