import { describe, it, expect } from 'vitest';
import { createLogger, type LogLevel } from '../../../../src/shared/logging/logger.js';

/**
 * Unit tests for the structured logger. No console capture: a custom sink is injected.
 */

function capture(options: Parameters<typeof createLogger>[1] = {}) {
  const lines: Array<{ level: LogLevel; json: Record<string, unknown> }> = [];
  const logger = createLogger('debug', {
    now: () => '2024-01-01T00:00:00.000Z',
    write: (level, line) => lines.push({ level, json: JSON.parse(line) as Record<string, unknown> }),
    ...options,
  });
  return { logger, lines };
}

describe('structured logger', () => {
  // (12) Includes level, message, and timestamp.
  it('emits level, message, and timestamp', () => {
    const { logger, lines } = capture();
    logger.info('server listening', { port: 3000 });
    expect(lines).toHaveLength(1);
    const entry = lines[0]!.json;
    expect(entry['level']).toBe('info');
    expect(entry['message']).toBe('server listening');
    expect(entry['timestamp']).toBe('2024-01-01T00:00:00.000Z');
    expect(entry['port']).toBe(3000);
  });

  // (11) Redacts metadata secrets.
  it('redacts secret metadata before writing', () => {
    const { logger, lines } = capture();
    logger.info('config', {
      databaseUrl: 'postgres://u:secretpw@host/db',
      serviceBus: { connectionString: 'Endpoint=sb://x;SharedAccessKey=k==' },
      host: '127.0.0.1',
    });
    const serialized = JSON.stringify(lines[0]!.json);
    expect(serialized).not.toContain('secretpw');
    expect(serialized).not.toContain('SharedAccessKey=k');
    expect(serialized).toContain('127.0.0.1');
  });

  // (13) Error mode does not leak stack in production by default.
  it('omits Error stack traces in production by default', () => {
    const { logger, lines } = capture({ includeStack: false });
    logger.error('boom', { err: new Error('kaboom') });
    const err = lines[0]!.json['err'] as Record<string, unknown>;
    expect(err['name']).toBe('Error');
    expect(err['message']).toBe('kaboom');
    expect(err['stack']).toBeUndefined();
  });

  it('includes Error stack traces when explicitly enabled', () => {
    const { logger, lines } = capture({ includeStack: true });
    logger.error('boom', { err: new Error('kaboom') });
    const err = lines[0]!.json['err'] as Record<string, unknown>;
    expect(typeof err['stack']).toBe('string');
  });

  it('suppresses messages below the minimum level', () => {
    const lines: string[] = [];
    const logger = createLogger('warn', { write: (_l, line) => lines.push(line) });
    logger.info('quiet');
    logger.warn('loud');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('loud');
  });
});
