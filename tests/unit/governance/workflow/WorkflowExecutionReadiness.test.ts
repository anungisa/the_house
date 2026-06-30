import { describe, it, expect } from 'vitest';

import {
  computeWorkflowExecutionReadiness,
  deriveReadinessStatus,
} from '../../../../src/governance/workflow/WorkflowExecutionReadiness.js';

/**
 * Unit tests for the pure execution-readiness helper. No I/O, no governance coupling — it is a
 * total function over the derived workflow status used as an operational HINT only.
 */
describe('workflow execution readiness', () => {
  it('approved → executable with no reason', () => {
    expect(computeWorkflowExecutionReadiness('approved')).toEqual({
      executable: true,
      reason: null,
    });
  });

  it('pending → not executable (workflow_not_approved)', () => {
    expect(computeWorkflowExecutionReadiness('pending')).toEqual({
      executable: false,
      reason: 'workflow_not_approved',
    });
  });

  it('rejected → not executable (workflow_rejected)', () => {
    expect(computeWorkflowExecutionReadiness('rejected')).toEqual({
      executable: false,
      reason: 'workflow_rejected',
    });
  });

  it('cancelled → not executable (workflow_cancelled)', () => {
    expect(computeWorkflowExecutionReadiness('cancelled')).toEqual({
      executable: false,
      reason: 'workflow_cancelled',
    });
  });

  it('executed → not executable (workflow_already_executed)', () => {
    expect(computeWorkflowExecutionReadiness('executed')).toEqual({
      executable: false,
      reason: 'workflow_already_executed',
    });
  });

  it('deriveReadinessStatus maps approved+executed → executed', () => {
    expect(deriveReadinessStatus('approved', true)).toBe('executed');
  });

  it('deriveReadinessStatus leaves approved (not executed) as approved', () => {
    expect(deriveReadinessStatus('approved', false)).toBe('approved');
  });

  it('deriveReadinessStatus ignores executed marker for non-approved statuses', () => {
    // Defensive: an executed marker only matters when the instance is approved.
    expect(deriveReadinessStatus('pending', true)).toBe('pending');
    expect(deriveReadinessStatus('rejected', true)).toBe('rejected');
    expect(deriveReadinessStatus('cancelled', true)).toBe('cancelled');
  });
});
