/**
 * Workflow HTTP endpoint surface — public exports.
 *
 * Two narrow transports:
 *  - the decision surface over {@link WorkflowDecisionService} (records approve/reject
 *    METADATA only; never executes a transition), and
 *  - the execution surface over {@link ApprovedWorkflowExecutionService} (the explicit,
 *    governed "run the approved transition" command — the only workflow surface that causes a
 *    lifecycle transition, and only through the Governance Kernel).
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

export {
  handleWorkflowExecution,
  workflowExecutionErrorToHttpResult,
  type WorkflowExecutionHttpDeps,
  type WorkflowExecutionHttpResult,
  type WorkflowTransitionExecutor,
} from './WorkflowExecutionHttpAdapter.js';

export {
  type WorkflowExecutionHttpRequest,
  type WorkflowExecutionResponseBody,
} from './WorkflowExecutionHttpDtos.js';

export {
  handleWorkflowList,
  handleWorkflowDetail,
  workflowReadErrorToHttpResult,
  type WorkflowReadHttpDeps,
  type WorkflowReadHttpResult,
} from './WorkflowReadHttpAdapter.js';

export {
  type WorkflowListHttpRequest,
  type WorkflowDetailHttpRequest,
  type WorkflowListResponseBody,
  type WorkflowDetailResponseBody,
  type WorkflowSummaryDto,
  type WorkflowStepDto,
  type WorkflowExecutionHintDto,
} from './WorkflowReadHttpDtos.js';
