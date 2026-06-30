/**
 * In-memory WorkflowStore for unit tests.
 *
 * Operates on the SAME backing arrays the InMemoryGovernanceStore writes workflow rows into
 * (passed via {@link WorkflowBacking}), so a workflow created by the kernel's transition is
 * immediately visible to the decision service — mirroring the outbox sharing pattern. Writes
 * apply immediately (single-threaded); the Pg store provides real row locking.
 */

import type { IdGenerator } from '../../shared/uuid/id.js';
import { uuidGenerator } from '../../shared/uuid/id.js';
import type {
  WorkflowBacking,
  WorkflowDetailView,
  WorkflowInstanceRecord,
  WorkflowInstanceSummaryView,
  WorkflowInstanceView,
  WorkflowStepRecord,
  WorkflowStepView,
} from './WorkflowTypes.js';
import type {
  WorkflowDecisionInsert,
  WorkflowInstanceProgressUpdate,
  WorkflowListFilter,
  WorkflowListResult,
  WorkflowStepDecisionUpdate,
  WorkflowStore,
  WorkflowTx,
} from './WorkflowStore.js';
import { WORKFLOW_LIST_DEFAULT_LIMIT, WORKFLOW_LIST_MAX_LIMIT } from './WorkflowStore.js';

/** Clamp a requested page size to [1, WORKFLOW_LIST_MAX_LIMIT], defaulting when absent/invalid. */
function clampLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return WORKFLOW_LIST_DEFAULT_LIMIT;
  const floored = Math.floor(requested);
  if (floored < 1) return 1;
  if (floored > WORKFLOW_LIST_MAX_LIMIT) return WORKFLOW_LIST_MAX_LIMIT;
  return floored;
}

function toInstanceView(rec: WorkflowInstanceRecord): WorkflowInstanceView {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    transitionRequestId: rec.transitionRequestId,
    entityType: rec.entityType,
    entityId: rec.entityId,
    workflowType: rec.workflowType,
    status: rec.status,
    ...(rec.currentStepCode !== undefined ? { currentStepCode: rec.currentStepCode } : {}),
  };
}

function toStepView(rec: WorkflowStepRecord): WorkflowStepView {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    workflowInstanceId: rec.workflowInstanceId,
    stepCode: rec.stepCode,
    stepOrder: rec.stepOrder,
    reviewTier: rec.reviewTier,
    required: rec.required,
    status: rec.status,
    ...(rec.assignedScopeType !== undefined ? { assignedScopeType: rec.assignedScopeType } : {}),
    ...(rec.assignedScopeId !== undefined ? { assignedScopeId: rec.assignedScopeId } : {}),
    ...(rec.assignedRoleKey !== undefined ? { assignedRoleKey: rec.assignedRoleKey } : {}),
    ...(rec.decidedByUserId !== undefined ? { decidedByUserId: rec.decidedByUserId } : {}),
    ...(rec.decidedAt !== undefined ? { decidedAt: rec.decidedAt } : {}),
    ...(rec.decisionReason !== undefined ? { decisionReason: rec.decisionReason } : {}),
  };
}

/** Map an in-memory instance record to the admin summary view (timestamps + executed marker). */
function toSummaryView(
  rec: WorkflowInstanceRecord,
  executed: boolean,
): WorkflowInstanceSummaryView {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    transitionRequestId: rec.transitionRequestId,
    entityType: rec.entityType,
    entityId: rec.entityId,
    workflowType: rec.workflowType,
    status: rec.status,
    ...(rec.currentStepCode !== undefined ? { currentStepCode: rec.currentStepCode } : {}),
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    executed,
  };
}

/**
 * In-memory WorkflowStore for unit tests. The optional `isExecuted` predicate lets a harness
 * model the governing transition request's consumed/executed marker (the in-memory store has no
 * visibility into governance transition_request rows on its own); when omitted, instances are
 * reported as not executed.
 */
export class InMemoryWorkflowStore implements WorkflowStore {
  constructor(
    private readonly backing: WorkflowBacking,
    private readonly ids: IdGenerator = uuidGenerator,
    private readonly isExecuted: (transitionRequestId: string) => boolean = () => false,
  ) {}

  getInstanceByTransitionRequestId(
    tenantId: string,
    transitionRequestId: string,
  ): Promise<WorkflowInstanceView | undefined> {
    const rec = this.backing.instances.find(
      (i) => i.tenantId === tenantId && i.transitionRequestId === transitionRequestId,
    );
    return Promise.resolve(rec === undefined ? undefined : toInstanceView(rec));
  }

  getInstance(
    tenantId: string,
    workflowInstanceId: string,
  ): Promise<WorkflowInstanceView | undefined> {
    const rec = this.backing.instances.find(
      (i) => i.tenantId === tenantId && i.id === workflowInstanceId,
    );
    return Promise.resolve(rec === undefined ? undefined : toInstanceView(rec));
  }

  getSteps(tenantId: string, workflowInstanceId: string): Promise<WorkflowStepView[]> {
    const steps = this.backing.steps
      .filter((s) => s.tenantId === tenantId && s.workflowInstanceId === workflowInstanceId)
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .map(toStepView);
    return Promise.resolve(steps);
  }

  listWorkflows(tenantId: string, filter: WorkflowListFilter): Promise<WorkflowListResult> {
    const limit = clampLimit(filter.limit);
    // Steps lookup for reviewTier / assignedRoleKey filters (match if ANY step matches).
    const stepMatches = (instanceId: string): boolean => {
      if (filter.reviewTier === undefined && filter.assignedRoleKey === undefined) return true;
      return this.backing.steps.some(
        (s) =>
          s.tenantId === tenantId &&
          s.workflowInstanceId === instanceId &&
          (filter.reviewTier === undefined || s.reviewTier === filter.reviewTier) &&
          (filter.assignedRoleKey === undefined || s.assignedRoleKey === filter.assignedRoleKey),
      );
    };
    const matched = this.backing.instances
      .filter((i) => i.tenantId === tenantId)
      .filter((i) => filter.status === undefined || i.status === filter.status)
      .filter((i) => filter.entityType === undefined || i.entityType === filter.entityType)
      .filter((i) => filter.entityId === undefined || i.entityId === filter.entityId)
      .filter((i) => stepMatches(i.id))
      // Stable keyset order: (createdAt, id) ascending.
      .sort((a, b) =>
        a.createdAt === b.createdAt
          ? a.id.localeCompare(b.id)
          : a.createdAt.localeCompare(b.createdAt),
      );
    const afterCursor =
      filter.cursor === undefined
        ? matched
        : matched.filter((i) => {
            const c = filter.cursor as { createdAt: string; id: string };
            return (
              i.createdAt > c.createdAt ||
              (i.createdAt === c.createdAt && i.id.localeCompare(c.id) > 0)
            );
          });
    const page = afterCursor.slice(0, limit);
    const items = page.map((i) => toSummaryView(i, this.isExecuted(i.transitionRequestId)));
    const last = page[page.length - 1];
    const hasMore = afterCursor.length > page.length;
    return Promise.resolve({
      items,
      ...(hasMore && last !== undefined
        ? { nextCursor: { createdAt: last.createdAt, id: last.id } }
        : {}),
    });
  }

  getWorkflowDetail(
    tenantId: string,
    workflowInstanceId: string,
  ): Promise<WorkflowDetailView | undefined> {
    const rec = this.backing.instances.find(
      (i) => i.tenantId === tenantId && i.id === workflowInstanceId,
    );
    if (rec === undefined) return Promise.resolve(undefined);
    const steps = this.backing.steps
      .filter((s) => s.tenantId === tenantId && s.workflowInstanceId === workflowInstanceId)
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .map(toStepView);
    return Promise.resolve({
      instance: toSummaryView(rec, this.isExecuted(rec.transitionRequestId)),
      steps,
    });
  }

  async runInTransaction<T>(tenantId: string, fn: (tx: WorkflowTx) => Promise<T>): Promise<T> {
    const tx = new InMemoryWorkflowTx(this.backing, tenantId, this.ids);
    return fn(tx);
  }
}

class InMemoryWorkflowTx implements WorkflowTx {
  constructor(
    private readonly backing: WorkflowBacking,
    private readonly tenantId: string,
    private readonly ids: IdGenerator,
  ) {}

  lockInstance(workflowInstanceId: string): Promise<WorkflowInstanceView | undefined> {
    const rec = this.backing.instances.find(
      (i) => i.tenantId === this.tenantId && i.id === workflowInstanceId,
    );
    return Promise.resolve(rec === undefined ? undefined : toInstanceView(rec));
  }

  getSteps(workflowInstanceId: string): Promise<WorkflowStepView[]> {
    const steps = this.backing.steps
      .filter((s) => s.tenantId === this.tenantId && s.workflowInstanceId === workflowInstanceId)
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .map(toStepView);
    return Promise.resolve(steps);
  }

  applyStepDecision(update: WorkflowStepDecisionUpdate): Promise<void> {
    const rec = this.backing.steps.find(
      (s) => s.tenantId === this.tenantId && s.id === update.stepId,
    );
    if (rec !== undefined) {
      rec.status = update.status;
      rec.decidedByUserId = update.decidedByUserId;
      rec.decidedAt = update.decidedAt;
      rec.decisionReason = update.decisionReason;
    }
    return Promise.resolve();
  }

  insertDecision(input: WorkflowDecisionInsert): Promise<string> {
    const id = this.ids.newId();
    this.backing.decisions.push({
      id,
      tenantId: input.tenantId,
      workflowStepId: input.workflowStepId,
      decision: input.decision,
      decidedByUserId: input.decidedByUserId,
      reason: input.reason,
      createdAt: new Date(0).toISOString(),
    });
    return Promise.resolve(id);
  }

  updateInstanceProgress(update: WorkflowInstanceProgressUpdate): Promise<void> {
    const rec = this.backing.instances.find(
      (i) => i.tenantId === this.tenantId && i.id === update.instanceId,
    );
    if (rec !== undefined) {
      rec.status = update.status;
      rec.currentStepCode = update.currentStepCode ?? undefined;
      rec.updatedAt = new Date().toISOString();
    }
    return Promise.resolve();
  }
}
