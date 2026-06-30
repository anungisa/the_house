/**
 * Workflow admin/reviewer surface — public barrel.
 *
 * This module is a framework-neutral CLIENT of the existing workflow HTTP APIs. It contains a
 * typed client, pure view-model helpers, and the wire types — but NO UI framework. A concrete
 * renderer (React/Vue/Svelte/etc.) is intentionally future work; see
 * docs/architecture/workflow-admin-review-surface.md.
 */

export * from './workflowAdminTypes.js';
export { WorkflowAdminClient } from './workflowAdminClient.js';
export {
  workflowStatusLabel,
  reviewTierLabel,
  executionReadinessLabel,
  orderSteps,
  getCurrentActionableStep,
  canDecideStep,
  canExecuteWorkflow,
  decisionTargetStepCode,
  buildWorkflowListView,
  buildWorkflowDetailView,
} from './workflowAdminViewModel.js';
export type {
  WorkflowListRowView,
  WorkflowListView,
  WorkflowStepView,
  WorkflowDetailView,
} from './workflowAdminViewModel.js';
