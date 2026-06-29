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
  WorkflowInstanceRecord,
  WorkflowInstanceView,
  WorkflowStepRecord,
  WorkflowStepView,
} from './WorkflowTypes.js';
import type {
  WorkflowDecisionInsert,
  WorkflowInstanceProgressUpdate,
  WorkflowStepDecisionUpdate,
  WorkflowStore,
  WorkflowTx,
} from './WorkflowStore.js';

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

export class InMemoryWorkflowStore implements WorkflowStore {
  constructor(
    private readonly backing: WorkflowBacking,
    private readonly ids: IdGenerator = uuidGenerator,
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
    }
    return Promise.resolve();
  }
}
