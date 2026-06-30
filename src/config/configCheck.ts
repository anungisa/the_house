/**
 * Config check runner (platform observability hardening).
 *
 * Loads the effective configuration, prints a SAFE redacted operational summary plus any
 * advisory warnings, and signals success/failure via an injected `exit`. It exits non-zero
 * ONLY when configuration cannot be loaded (fail-closed); advisory warnings never fail the
 * check. It NEVER prints raw secrets and NEVER contacts Azure/DB/AV.
 *
 * The runner is dependency-injected so it can be unit-tested without a process or console.
 */

import { buildConfigDiagnostics } from './diagnostics.js';
import type { AppConfig } from './index.js';
import type { Logger } from '../shared/logging/logger.js';

export interface ConfigCheckDeps {
  /** Loads the effective config. Throws on invalid/missing required config (fail-closed). */
  readonly loadConfig: () => AppConfig;
  /** Structured logger used to emit the redacted summary and warnings. */
  readonly logger: Logger;
  /** Process-exit hook (0 = ok, 1 = config load failed). Injectable for tests. */
  readonly exit: (code: number) => void;
}

/**
 * Run the config check. Emits the redacted diagnostics summary and warnings, then exits 0.
 * On config load failure, logs a safe error and exits 1.
 */
export function runConfigCheck(deps: ConfigCheckDeps): void {
  let config: AppConfig;
  try {
    config = deps.loadConfig();
  } catch (err) {
    deps.logger.error('config check failed: configuration could not be loaded', { err });
    deps.exit(1);
    return;
  }

  const diagnostics = buildConfigDiagnostics(config);
  deps.logger.info('config diagnostics', { config: diagnostics.summary });
  for (const warning of diagnostics.warnings) {
    deps.logger.warn('config warning', { warning });
  }
  deps.logger.info('config check complete', { warnings: diagnostics.warnings.length });
  deps.exit(0);
}
