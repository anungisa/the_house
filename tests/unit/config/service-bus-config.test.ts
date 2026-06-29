import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/config/index.js';

/**
 * Unit tests for Service Bus configuration validation (src/config/index.ts).
 *
 * Validation fails closed ONLY when publishing is explicitly enabled. The default
 * (disabled) requires no connection string and never blocks local/test runtimes — this is
 * what keeps the local/demo API runtime free of any Service Bus dependency.
 *
 * Env is isolated per test; no secrets and no live broker are required.
 */

const KEYS = [
  'SERVICE_BUS_ENABLED',
  'SERVICE_BUS_CONNECTION_STRING',
  'SERVICE_BUS_QUEUE_NAME',
  'SERVICE_BUS_TOPIC_NAME',
  'SERVICE_BUS_PUBLISH_TARGET',
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

describe('Service Bus config validation', () => {
  // (1) Disabled is the default and requires no connection string.
  it('disabled by default and requires no connection string', () => {
    const { serviceBus } = loadConfig();
    expect(serviceBus.enabled).toBe(false);
    expect(serviceBus.connectionString).toBe('');
    expect(serviceBus.publishTarget).toBe('queue');
  });

  it('treats SERVICE_BUS_ENABLED=false as disabled with no other config', () => {
    process.env['SERVICE_BUS_ENABLED'] = 'false';
    expect(() => loadConfig()).not.toThrow();
    expect(loadConfig().serviceBus.enabled).toBe(false);
  });

  // (2) Enabled without a connection string fails closed.
  it('rejects enabled config with no connection string', () => {
    process.env['SERVICE_BUS_ENABLED'] = 'true';
    process.env['SERVICE_BUS_QUEUE_NAME'] = 'outbox-q';
    expect(() => loadConfig()).toThrow(/SERVICE_BUS_CONNECTION_STRING is required/);
  });

  // (3) Enabled queue target requires a queue name.
  it('rejects enabled queue target with no queue name', () => {
    process.env['SERVICE_BUS_ENABLED'] = 'true';
    process.env['SERVICE_BUS_CONNECTION_STRING'] = 'Endpoint=sb://x/;SharedAccessKey=k';
    process.env['SERVICE_BUS_PUBLISH_TARGET'] = 'queue';
    expect(() => loadConfig()).toThrow(/SERVICE_BUS_QUEUE_NAME is required/);
  });

  it('accepts a fully-specified enabled queue config', () => {
    process.env['SERVICE_BUS_ENABLED'] = 'true';
    process.env['SERVICE_BUS_CONNECTION_STRING'] = 'Endpoint=sb://x/;SharedAccessKey=k';
    process.env['SERVICE_BUS_PUBLISH_TARGET'] = 'queue';
    process.env['SERVICE_BUS_QUEUE_NAME'] = 'outbox-q';
    const { serviceBus } = loadConfig();
    expect(serviceBus).toEqual({
      enabled: true,
      connectionString: 'Endpoint=sb://x/;SharedAccessKey=k',
      publishTarget: 'queue',
      queueName: 'outbox-q',
      topicName: '',
    });
  });

  // (4) Enabled topic target requires a topic name.
  it('rejects enabled topic target with no topic name', () => {
    process.env['SERVICE_BUS_ENABLED'] = 'true';
    process.env['SERVICE_BUS_CONNECTION_STRING'] = 'Endpoint=sb://x/;SharedAccessKey=k';
    process.env['SERVICE_BUS_PUBLISH_TARGET'] = 'topic';
    expect(() => loadConfig()).toThrow(/SERVICE_BUS_TOPIC_NAME is required/);
  });

  it('accepts a fully-specified enabled topic config', () => {
    process.env['SERVICE_BUS_ENABLED'] = 'true';
    process.env['SERVICE_BUS_CONNECTION_STRING'] = 'Endpoint=sb://x/;SharedAccessKey=k';
    process.env['SERVICE_BUS_PUBLISH_TARGET'] = 'topic';
    process.env['SERVICE_BUS_TOPIC_NAME'] = 'outbox-t';
    const { serviceBus } = loadConfig();
    expect(serviceBus.publishTarget).toBe('topic');
    expect(serviceBus.topicName).toBe('outbox-t');
  });

  // (5) An invalid publish target is rejected.
  it('rejects an invalid publish target', () => {
    process.env['SERVICE_BUS_PUBLISH_TARGET'] = 'firehose';
    expect(() => loadConfig()).toThrow(/Invalid SERVICE_BUS_PUBLISH_TARGET/);
  });

  // A malformed SERVICE_BUS_ENABLED value fails closed rather than silently disabling.
  it('rejects a non-boolean SERVICE_BUS_ENABLED', () => {
    process.env['SERVICE_BUS_ENABLED'] = 'maybe';
    expect(() => loadConfig()).toThrow(/Invalid boolean/);
  });

  // (15) The default config (Service Bus disabled) never blocks a local runtime.
  it('does not require Service Bus for a local runtime', () => {
    process.env['DATABASE_URL'] = 'postgres://u:p@localhost:5432/db';
    const cfg = loadConfig();
    expect(cfg.serviceBus.enabled).toBe(false);
    expect(cfg.databaseUrl).toBe('postgres://u:p@localhost:5432/db');
  });
});
