import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../../../src/shared/errors/AppError.js';
import { NotImplementedError } from '../../../src/shared/errors/NotImplementedError.js';
import { err, isErr, isOk, ok, type Result } from '../../../src/shared/result/Result.js';
import { fixedClock, systemClock } from '../../../src/shared/time/clock.js';
import { uuidGenerator } from '../../../src/shared/uuid/id.js';

/**
 * Lightweight tests for the pure shared utilities. These are simple, dependency-free
 * helpers used throughout governance/domain code; the tests just lock in their contracts.
 */

describe('AppError', () => {
  it('carries a stable code and message', () => {
    const e = new AppError(ErrorCode.INVALID_INPUT, 'bad input');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe(ErrorCode.INVALID_INPUT);
    expect(e.message).toBe('bad input');
    expect(e.name).toBe('AppError');
  });

  it('attaches optional details and preserves cause', () => {
    const cause = new Error('root');
    const e = new AppError(ErrorCode.CONFIG_ERROR, 'boom', { details: { key: 'v' }, cause });
    expect(e.details).toEqual({ key: 'v' });
    expect(e.cause).toBe(cause);
  });

  it('omits details when not provided', () => {
    const e = new AppError(ErrorCode.GUARD_FAILED, 'nope');
    expect(e.details).toBeUndefined();
  });
});

describe('NotImplementedError', () => {
  it('is an AppError carrying NOT_IMPLEMENTED', () => {
    const e = new NotImplementedError('feature-x');
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe(ErrorCode.NOT_IMPLEMENTED);
    expect(e.message).toContain('feature-x');
  });
});

describe('Result', () => {
  it('builds and narrows an Ok', () => {
    const r: Result<number, string> = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) {
      expect(r.value).toBe(42);
    }
  });

  it('builds and narrows an Err', () => {
    const r: Result<number, string> = err('nope');
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
    if (isErr(r)) {
      expect(r.error).toBe('nope');
    }
  });
});

describe('clock', () => {
  it('fixedClock returns the configured instant', () => {
    const c = fixedClock(0);
    expect(c.now()).toBe(0);
    expect(c.nowIso()).toBe('1970-01-01T00:00:00.000Z');
  });

  it('systemClock now() and nowIso() are consistent', () => {
    const before = Date.now();
    const now = systemClock.now();
    const iso = systemClock.nowIso();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
  });
});

describe('uuidGenerator', () => {
  it('produces unique RFC-4122 v4 ids', () => {
    const a = uuidGenerator.newId();
    const b = uuidGenerator.newId();
    expect(a).not.toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
