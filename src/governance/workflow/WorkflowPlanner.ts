/**
 * WorkflowPlanner — pure (no I/O) producer of a review {@link WorkflowPlan} for an
 * approval-required transition.
 *
 * The Governance Kernel consults a planner ONLY inside the approval-required branch (after
 * it has decided to create a transition_request instead of mutating state). When the planner
 * returns a plan, the kernel persists the workflow instance + ordered steps atomically with
 * the request. When it returns `undefined`, the request is created with no workflow metadata
 * (unchanged legacy behavior). A planner must be deterministic and side-effect-free.
 */

import type { TransitionActor } from '../types/TransitionTypes.js';
import type { WorkflowPlan } from './WorkflowTypes.js';

/** Read-only context passed to a planner. NSO-generic — no sport-specific fields. */
export interface WorkflowPlanInput {
  readonly entityType: string;
  readonly entityId: string;
  readonly trigger: string;
  readonly fromState: string;
  readonly toState: string;
  readonly tenantId: string;
  readonly actor: TransitionActor;
}

export interface WorkflowPlanner {
  /** Return the review workflow plan for this transition, or undefined for no workflow. */
  planFor(input: WorkflowPlanInput): WorkflowPlan | undefined;
}
