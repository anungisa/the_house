/**
 * Config check entrypoint.
 *
 * Loads the effective configuration and prints a SAFE, redacted operational summary plus any
 * advisory warnings. Exits non-zero ONLY when configuration cannot be loaded (fail-closed);
 * advisory warnings do not fail the check. Never prints secrets; never contacts Azure/DB/AV.
 *
 * Run with: `npm run config:check`. The reusable, unit-tested logic lives in
 * src/config/configCheck.ts; this file is a thin shell.
 */

import { loadConfig } from '../src/config/index.js';
import { runConfigCheck } from '../src/config/configCheck.js';
import { createLogger } from '../src/shared/logging/logger.js';

runConfigCheck({
  loadConfig,
  logger: createLogger('debug'),
  exit: (code) => process.exit(code),
});
