import { describe, it, expect } from 'vitest';
import {
  buildWorkflowDetailView,
  buildWorkflowListView,
  canDecideStep,
  canExecuteWorkflow,
  decisionTargetStepCode,
  executionReadinessLabel,
  getCurrentActionableStep,
  orderSteps,
  workflowStatusLabel,
} from '../../../../src/admin/workflows/workflowAdminViewModel.js';
import type {
  WorkflowDetail,
  WorkflowListPage,
  WorkflowStep,
} from '../../../../src/admin/workflows/workflowAdminTypes.js';

/**
 * Unit tests for the pure workflow admin view-model helpers. These are pure functions: they
 * never perform I/O and never trigger a decision or an execution.
 */

function step(overrides: Partial<WorkflowStep>): WorkflowStep {
  return {
    stepCode: 'regional_signoff',
    stepOrder: 1,
    reviewTier: 'regional_review',
    required: true,
    status: 'pending',
    assignedRoleKey: 'regional_reviewer',
    decidedByUserId: null,
    decidedAt: null,
    decisionReason: null,
    ...overrides,
  };
}

function detail(overrides: Partial<WorkflowDetail>): WorkflowDetail {
  return {
    workflowInstanceId: 'wf-1',
    transitionRequestId: 'tr-1',
    entityType: 'AffiliationApplication',
    entityId: 'app-1',
    workflowType: 'affiliation_two_tier_review',
    workflowStatus: 'pending',
    currentStepCode: 'regional_signoff',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [
      step({ stepCode: 'regional_signoff', stepOrder: 1, reviewTier: 'regional_review' }),
      step({
        stepCode: 'national_signoff',
        stepOrder: 2,
        reviewTier: 'national_review',
        assignedRoleKey: 'national_reviewer',
      }),
    ],
    execution: { executable: false, reason: 'workflow_not_approved' },
    ...overrides,
  };
}

describe('workflow admin view-model', () => {
  // (7) The list view-model identifies pending workflows.
  it('flags pending workflows in the list view', () => {
    const page: WorkflowListPage = {
      items: [
        {
          workflowInstanceId: 'wf-pending',
          transitionRequestId: 'tr-1',
          entityType: 'AffiliationApplication',
          entityId: 'app-1',
          workflowType: 'affiliation_two_tier_review',
          status: 'pending',
          currentStepCode: 'regional_signoff',
          createdAt: 'x',
          updatedAt: 'x',
          execution: { executable: false, reason: 'workflow_not_approved' },
        },
        {
          workflowInstanceId: 'wf-approved',
          transitionRequestId: 'tr-2',
          entityType: 'AffiliationApplication',
          entityId: 'app-2',
          workflowType: 'affiliation_two_tier_review',
          status: 'approved',
          currentStepCode: null,
          createdAt: 'x',
          updatedAt: 'x',
          execution: { executable: true, reason: null },
        },
      ],
      nextCursor: null,
    };

    const view = buildWorkflowListView(page);
    expect(view.isEmpty).toBe(false);
    const pending = view.rows.filter((r) => r.isPending).map((r) => r.workflowInstanceId);
    expect(pending).toEqual(['wf-pending']);
    const executable = view.rows.filter((r) => r.isExecutable).map((r) => r.workflowInstanceId);
    expect(executable).toEqual(['wf-approved']);
  });

  it('reports an empty list view when there are no items', () => {
    const view = buildWorkflowListView({ items: [], nextCursor: null });
    expect(view.isEmpty).toBe(true);
    expect(view.rows).toHaveLength(0);
  });

  // (8) The detail view-model orders steps correctly even when given them out of order.
  it('orders steps by stepOrder ascending', () => {
    const d = detail({
      steps: [
        step({ stepCode: 'national_signoff', stepOrder: 2, reviewTier: 'national_review' }),
        step({ stepCode: 'regional_signoff', stepOrder: 1, reviewTier: 'regional_review' }),
      ],
    });
    expect(orderSteps(d).map((s) => s.stepCode)).toEqual(['regional_signoff', 'national_signoff']);
    const view = buildWorkflowDetailView(d);
    expect(view.steps.map((s) => s.stepCode)).toEqual(['regional_signoff', 'national_signoff']);
  });

  // (11) Approve/reject targets the current pending step (the earliest pending one).
  it('targets the earliest pending step for the next decision', () => {
    const d = detail({});
    expect(decisionTargetStepCode(d)).toBe('regional_signoff');
    expect(getCurrentActionableStep(d)?.stepCode).toBe('regional_signoff');

    // After the regional step is approved, the national step becomes actionable.
    const advanced = detail({
      steps: [
        step({ stepCode: 'regional_signoff', stepOrder: 1, status: 'approved' }),
        step({
          stepCode: 'national_signoff',
          stepOrder: 2,
          reviewTier: 'national_review',
          assignedRoleKey: 'national_reviewer',
          status: 'pending',
        }),
      ],
    });
    expect(decisionTargetStepCode(advanced)).toBe('national_signoff');
  });

  it('allows deciding only the current actionable step', () => {
    const d = detail({});
    const [regional, national] = orderSteps(d);
    expect(canDecideStep(d, regional!)).toBe(true);
    expect(canDecideStep(d, national!)).toBe(false);
  });

  it('honors actor role keys when a step is role-assigned', () => {
    const d = detail({});
    const [regional] = orderSteps(d);
    expect(canDecideStep(d, regional!, ['regional_reviewer'])).toBe(true);
    expect(canDecideStep(d, regional!, ['national_reviewer'])).toBe(false);
  });

  // (9) The execute action is disabled when execution.executable is false.
  it('disables execution when the backend hint is not executable', () => {
    const d = detail({ execution: { executable: false, reason: 'workflow_not_approved' } });
    expect(canExecuteWorkflow(d)).toBe(false);
    expect(buildWorkflowDetailView(d).canExecute).toBe(false);
  });

  // (10) The execute action is enabled when execution.executable is true.
  it('enables execution when the backend hint is executable', () => {
    const d = detail({
      workflowStatus: 'approved',
      currentStepCode: null,
      steps: [
        step({ stepCode: 'regional_signoff', stepOrder: 1, status: 'approved' }),
        step({ stepCode: 'national_signoff', stepOrder: 2, status: 'approved' }),
      ],
      execution: { executable: true, reason: null },
    });
    expect(canExecuteWorkflow(d)).toBe(true);
    expect(buildWorkflowDetailView(d).canExecute).toBe(true);
  });

  // (12) After a final approval there is no actionable step, but building the view never
  // executes anything — execution remains a separate explicit call.
  it('has no actionable step after final approval and never auto-executes', () => {
    const approved = detail({
      workflowStatus: 'approved',
      currentStepCode: null,
      steps: [
        step({ stepCode: 'regional_signoff', stepOrder: 1, status: 'approved' }),
        step({ stepCode: 'national_signoff', stepOrder: 2, status: 'approved' }),
      ],
      execution: { executable: true, reason: null },
    });
    expect(getCurrentActionableStep(approved)).toBeNull();
    expect(decisionTargetStepCode(approved)).toBeNull();

    const view = buildWorkflowDetailView(approved);
    // The view exposes that execution is possible, but is a pure projection (no side effects).
    expect(view.canExecute).toBe(true);
    expect(view.actionableStepCode).toBeNull();
    expect(view.steps.every((s) => s.isActionable === false)).toBe(true);
  });

  it('produces generic, sport-free labels', () => {
    expect(workflowStatusLabel('pending')).toBe('Pending review');
    expect(workflowStatusLabel('approved')).toBe('Approved');
    expect(executionReadinessLabel({ executable: true, reason: null })).toBe('Ready to execute');
    expect(
      executionReadinessLabel({ executable: false, reason: 'workflow_already_executed' }),
    ).toBe('Already executed');
  });
});
