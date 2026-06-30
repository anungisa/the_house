import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/config/index.js';

/**
 * Unit tests for evidence quarantine configuration (src/config/index.ts).
 *
 * Quarantine is ENABLED by default: a blocked malware upload should be an auditable security
 * event. The default also surfaces the (non-sensitive) quarantine event id in the rejection
 * response. Neither default requires any external system, so the local/demo runtime keeps
 * working out of the box. Env is isolated per test; no secrets or live resources are used.
 */

const KEYS = [
  'EVIDENCE_QUARANTINE_ENABLED',
  'EVIDENCE_QUARANTINE_INCLUDE_EVENT_ID_IN_RESPONSE',
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

describe('evidence quarantine config', () => {
  it('defaults to enabled and includes the event id in the response', () => {
    expect(loadConfig().evidenceQuarantine).toEqual({
      enabled: true,
      includeEventIdInResponse: true,
    });
  });

  it('can disable quarantine recording', () => {
    process.env['EVIDENCE_QUARANTINE_ENABLED'] = 'false';
    expect(loadConfig().evidenceQuarantine).toEqual({
      enabled: false,
      includeEventIdInResponse: true,
    });
  });

  it('can suppress the event id in the rejection response while still recording', () => {
    process.env['EVIDENCE_QUARANTINE_INCLUDE_EVENT_ID_IN_RESPONSE'] = 'false';
    expect(loadConfig().evidenceQuarantine).toEqual({
      enabled: true,
      includeEventIdInResponse: false,
    });
  });
});
