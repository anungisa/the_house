/**
 * Readiness checks for the AffiliationApplication HTTP adapter (observability hardening).
 *
 * `/readyz` reports whether the process is wired and (optionally) whether its backing
 * database is reachable. The DB check is a tenant-agnostic `SELECT 1` with a bounded
 * timeout: it NEVER queries tenant-owned tables, NEVER sets tenant context, and NEVER
 * mutates state. When no readiness check is wired, `/readyz` stays shallow (process-level).
 */

import { setTimeout, clearTimeout } from 'node:timers';

export interface ReadinessCheck {
  /** Resolve when the backing database answers a trivial probe; reject when it does not. */
  checkDatabase(): Promise<void>;
}

export interface DatabaseReadinessOptions {
  /** Runs a parameterless probe query (e.g. `SELECT 1`). Returns/throws; result is ignored. */
  readonly probe: () => Promise<unknown>;
  /** Bounded timeout in milliseconds before the probe is considered unavailable. */
  readonly timeoutMs?: number;
}

const DEFAULT_READINESS_TIMEOUT_MS = 2000;

/**
 * Build a database readiness check that runs a bounded `SELECT 1`-style probe. The probe is
 * raced against a timeout so a hung connection surfaces as "not ready" instead of blocking
 * the readiness endpoint.
 */
export function createDatabaseReadinessCheck(options: DatabaseReadinessOptions): ReadinessCheck {
  const timeoutMs = options.timeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;
  return {
    async checkDatabase(): Promise<void> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`database readiness probe timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      });
      try {
        await Promise.race([options.probe(), timeout]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  };
}
