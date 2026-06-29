import { describe, it, expect } from 'vitest';
import {
  GuardRegistry,
  AFFILIATION_GUARD_CODES,
} from '../../../src/governance/guards/GuardRegistry.js';
import { AppError, ErrorCode } from '../../../src/shared/errors/AppError.js';
import type { GuardEvaluationResult } from '../../../src/governance/types/TransitionTypes.js';

describe('GuardRegistry', () => {
  it('returns a registered guard handler', () => {
    const registry = new GuardRegistry();
    const handler = (): GuardEvaluationResult => ({ guardCode: 'TEST_GUARD', passed: true });
    registry.registerGuard('TEST_GUARD', handler);

    expect(registry.hasGuard('TEST_GUARD')).toBe(true);
    expect(registry.getGuardHandler('TEST_GUARD')).toBe(handler);
  });

  it('fails closed on an unknown guard code (throws UNKNOWN_GUARD)', () => {
    const registry = new GuardRegistry();
    expect(() => registry.getGuardHandler('NOPE')).toThrowError(AppError);
    try {
      registry.getGuardHandler('NOPE');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.UNKNOWN_GUARD);
    }
  });

  it('rejects duplicate registration of the same guard code', () => {
    const registry = new GuardRegistry();
    const handler = (): GuardEvaluationResult => ({ guardCode: 'DUP', passed: true });
    registry.registerGuard('DUP', handler);
    expect(() => registry.registerGuard('DUP', handler)).toThrowError(AppError);
  });

  it('exposes the six required AffiliationApplication guard codes (placeholders)', () => {
    expect(AFFILIATION_GUARD_CODES).toHaveLength(6);
    expect(AFFILIATION_GUARD_CODES).toContain('ACTOR_HAS_REVIEWER_SCOPE');
    expect(AFFILIATION_GUARD_CODES).toContain('AFFILIATION_FEES_PAID');
  });
});
