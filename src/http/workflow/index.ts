/**
 * Workflow decision HTTP endpoint surface — public exports.
 *
 * A narrow transport over the existing {@link WorkflowDecisionService}. It records
 * approve/reject metadata on review steps and NEVER bypasses or invokes the Governance
 * Kernel, NEVER mutates governance.entity_state, and NEVER executes a lifecycle transition.
 */

export {
  handleWorkflowDecision,
  workflowErrorToHttpResult,
  type WorkflowHttpDeps,
  type WorkflowHttpResult,
  type WorkflowDecisionRecorder,
} from './WorkflowHttpAdapter.js';

export {
  type WorkflowDecisionHttpRequest,
  type WorkflowDecisionResponseBody,
} from './WorkflowHttpDtos.js';
