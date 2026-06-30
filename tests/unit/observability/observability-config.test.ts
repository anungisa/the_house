import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/config/index.js';
import { buildConfigDiagnostics } from '../../../src/config/diagnostics.js';

/**
 * Unit tests for observability configuration + diagnostics (src/config/*).
 *
 * Observability defaults to enabled with the console exporter. The exporter enum FAILS CLOSED:
 * an unknown value throws at config load. The diagnostics summary reports the exporter mode as
 * a non-secret enum/boolean. Env is isolated per test; no external system is contacted.
 */

const KEYS = [
  'OBSERVABILITY_ENABLED',
  'OBSERVABILITY_EXPORTER',
  'OBSERVABILITY_INCLUDE_DEBUG_ATTRIBUTES',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    const original = saved[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe('observability config', () => {
  it('defaults to enabled with the console exporter', () => {
    expect(loadConfig().observability).toEqual({
      enabled: true,
      exporter: 'console',
      includeDebugAttributes: false,
    });
  });

  // (8) config accepts the supported exporters (noop/memory/console).
  it('(8) accepts noop, memory, and console exporters', () => {
    for (const exporter of ['noop', 'memory', 'console'] as const) {
      process.env['OBSERVABILITY_EXPORTER'] = exporter;
      expect(loadConfig().observability.exporter).toBe(exporter);
    }
  });

  // (9) config rejects an unknown exporter (fails closed at load).
  it('(9) rejects an unknown exporter', () => {
    process.env['OBSERVABILITY_EXPORTER'] = 'datadog';
    expect(() => loadConfig()).toThrow(/OBSERVABILITY_EXPORTER/);
  });

  it('can be disabled', () => {
    process.env['OBSERVABILITY_ENABLED'] = 'false';
    expect(loadConfig().observability.enabled).toBe(false);
  });

  // (10) diagnostics reports the exporter mode as non-secret enum/booleans.
  it('(10) diagnostics summarizes observability without secrets', () => {
    process.env['OBSERVABILITY_EXPORTER'] = 'memory';
    const diag = buildConfigDiagnostics(loadConfig());
    const obs = diag.summary['observability'] as {
      enabled: boolean;
      exporter: string;
      includeDebugAttributes: boolean;
    };
    expect(obs).toEqual({ enabled: true, exporter: 'memory', includeDebugAttributes: false });
  });
});
