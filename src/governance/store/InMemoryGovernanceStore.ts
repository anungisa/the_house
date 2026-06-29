/**
 * In-memory GovernanceStore (full implementation for unit tests).
 *
 * Implements the same GovernanceStore/GovernanceTx ports the kernel uses against
 * PostgreSQL, so kernel unit tests exercise the real algorithm with no database.
 *
 * Transaction semantics: writes are BUFFERED inside a transaction and applied on success.
 * If the kernel throws (e.g. unknown transition/guard), buffered writes are discarded.
 * Reads (lock/resolve/find) observe already-committed data. The kernel never reads back
 * its own in-transaction writes except by returned id, so buffering is sufficient and
 * keeps idempotency/tenant-isolation behaviour faithful.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { Clock } from '../../shared/time/clock.js';
import { systemClock } from '../../shared/time/clock.js';
import type { IdGenerator } from '../../shared/uuid/id.js';
import { uuidGenerator } from '../../shared/uuid/id.js';
import type { AuditEventInput } from '../types/TransitionTypes.js';
import type { OutboxRecord } from '../outbox/OutboxStore.js';
import type {
  WorkflowBacking,
  WorkflowInstanceInsert,
  WorkflowInstanceRecord,
  WorkflowStepInsert,
  WorkflowStepRecord,
} from '../workflow/WorkflowTypes.js';
import type {
  EntityStateInsert,
  EntityStateRow,
  EvidenceObjectInsert,
  ExistingRequestRow,
  ExistingTransitionRow,
  GovernanceStore,
  GovernanceTx,
  GuardResultInsert,
  OutboxMessageInsert,
  StateMachineRow,
  StateTransitionInsert,
  TransitionDefinitionRow,
  TransitionGuardRow,
  TransitionRequestInsert,
} from '../kernel/ports.js';

interface DefTransition {
  id: string;
  stateMachineId: string;
  trigger: string;
  fromState: string;
  toState: string;
  riskLevel: 'low' | 'high';
  evidenceRequired: boolean;
  approvalRequired: boolean;
  guards: TransitionGuardRow[];
}

interface EntityStateRecord {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  currentState: string;
  stateMachineId: string;
}

interface StateTransitionRecord extends ExistingTransitionRow {
  tenantId: string;
  entityType: string;
  entityId: string;
}

interface TransitionRequestRecord extends ExistingRequestRow {
  tenantId: string;
  entityType: string;
  entityId: string;
}

interface GovernanceData {
  stateMachines: StateMachineRow[];
  transitions: DefTransition[];
  entityStates: EntityStateRecord[];
  stateTransitions: StateTransitionRecord[];
  transitionRequests: TransitionRequestRecord[];
  guardResults: GuardResultInsert[];
  auditEvents: Array<AuditEventInput & { id: string }>;
  evidenceObjects: Array<EvidenceObjectInsert & { id: string }>;
  outbox: OutboxRecord[];
  workflowInstances: WorkflowInstanceRecord[];
  workflowSteps: WorkflowStepRecord[];
  workflowDecisions: WorkflowBacking['decisions'];
}

export class InMemoryGovernanceStore implements GovernanceStore {
  public readonly data: GovernanceData;

  constructor(
    private readonly clock: Clock = systemClock,
    private readonly ids: IdGenerator = uuidGenerator,
    backing?: Partial<GovernanceData>,
  ) {
    this.data = {
      stateMachines: backing?.stateMachines ?? [],
      transitions: backing?.transitions ?? [],
      entityStates: backing?.entityStates ?? [],
      stateTransitions: backing?.stateTransitions ?? [],
      transitionRequests: backing?.transitionRequests ?? [],
      guardResults: backing?.guardResults ?? [],
      auditEvents: backing?.auditEvents ?? [],
      evidenceObjects: backing?.evidenceObjects ?? [],
      outbox: backing?.outbox ?? [],
      workflowInstances: backing?.workflowInstances ?? [],
      workflowSteps: backing?.workflowSteps ?? [],
      workflowDecisions: backing?.workflowDecisions ?? [],
    };
  }

  /** Share the outbox backing array with an InMemoryOutboxStore. */
  get outboxRecords(): OutboxRecord[] {
    return this.data.outbox;
  }

  /** Share the workflow backing arrays with an InMemoryWorkflowStore. */
  get workflowBacking(): WorkflowBacking {
    return {
      instances: this.data.workflowInstances,
      steps: this.data.workflowSteps,
      decisions: this.data.workflowDecisions,
    };
  }

  /** Read-only entity-state snapshots (test affordance for asserting state integrity). */
  get entityStateSnapshots(): ReadonlyArray<{
    readonly entityType: string;
    readonly entityId: string;
    readonly currentState: string;
  }> {
    return this.data.entityStates.map((e) => ({
      entityType: e.entityType,
      entityId: e.entityId,
      currentState: e.currentState,
    }));
  }

  findExistingResult(
    tenantId: string,
    entityType: string,
    entityId: string,
    idempotencyKey: string,
  ): Promise<
    | { readonly kind: 'transition'; readonly row: ExistingTransitionRow }
    | { readonly kind: 'request'; readonly row: ExistingRequestRow }
    | undefined
  > {
    const t = this.data.stateTransitions.find(
      (r) =>
        r.tenantId === tenantId &&
        r.entityType === entityType &&
        r.entityId === entityId &&
        r.idempotencyKey === idempotencyKey,
    );
    if (t !== undefined) {
      return Promise.resolve({ kind: 'transition', row: t });
    }
    const req = this.data.transitionRequests.find(
      (r) =>
        r.tenantId === tenantId &&
        r.entityType === entityType &&
        r.entityId === entityId &&
        r.idempotencyKey === idempotencyKey,
    );
    if (req !== undefined) {
      return Promise.resolve({ kind: 'request', row: req });
    }
    return Promise.resolve(undefined);
  }

  async runInTransaction<T>(tenantId: string, fn: (tx: GovernanceTx) => Promise<T>): Promise<T> {
    const tx = new InMemoryGovernanceTx(this.data, tenantId, this.clock, this.ids);
    const result = await fn(tx);
    tx.commit();
    return result;
  }
}

class InMemoryGovernanceTx implements GovernanceTx {
  // Buffered writes (applied on commit()).
  private readonly pendingGuardResults: GuardResultInsert[] = [];
  private readonly pendingRequests: TransitionRequestRecord[] = [];
  private readonly pendingEntityInserts: EntityStateRecord[] = [];
  private readonly pendingEntityUpdates: Array<{ id: string; toState: string }> = [];
  private readonly pendingTransitions: StateTransitionRecord[] = [];
  private readonly pendingAudits: Array<AuditEventInput & { id: string }> = [];
  private readonly pendingEvidence: Array<EvidenceObjectInsert & { id: string }> = [];
  private readonly pendingOutbox: OutboxRecord[] = [];
  private readonly pendingWorkflowInstances: WorkflowInstanceRecord[] = [];
  private readonly pendingWorkflowSteps: WorkflowStepRecord[] = [];

  constructor(
    private readonly data: GovernanceData,
    private readonly tenantId: string,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  loadActiveStateMachine(entityType: string): Promise<StateMachineRow | undefined> {
    return Promise.resolve(this.data.stateMachines.find((m) => m.entityType === entityType));
  }

  lockEntityState(entityType: string, entityId: string): Promise<EntityStateRow | undefined> {
    const rec = this.data.entityStates.find(
      (e) => e.tenantId === this.tenantId && e.entityType === entityType && e.entityId === entityId,
    );
    return Promise.resolve(rec === undefined ? undefined : { ...rec });
  }

  resolveTransition(
    stateMachineId: string,
    fromState: string,
    trigger: string,
  ): Promise<TransitionDefinitionRow | undefined> {
    const def = this.data.transitions.find(
      (t) => t.stateMachineId === stateMachineId && t.fromState === fromState && t.trigger === trigger,
    );
    if (def === undefined) return Promise.resolve(undefined);
    const { guards: _guards, ...row } = def;
    return Promise.resolve(row);
  }

  loadGuards(transitionDefinitionId: string): Promise<TransitionGuardRow[]> {
    const def = this.data.transitions.find((t) => t.id === transitionDefinitionId);
    const guards = def === undefined ? [] : [...def.guards].sort((a, b) => a.sortOrder - b.sortOrder);
    return Promise.resolve(guards);
  }

  findStateTransition(
    entityType: string,
    entityId: string,
    idempotencyKey: string,
  ): Promise<ExistingTransitionRow | undefined> {
    return Promise.resolve(
      this.data.stateTransitions.find(
        (r) =>
          r.tenantId === this.tenantId &&
          r.entityType === entityType &&
          r.entityId === entityId &&
          r.idempotencyKey === idempotencyKey,
      ),
    );
  }

  findTransitionRequest(
    entityType: string,
    entityId: string,
    idempotencyKey: string,
  ): Promise<ExistingRequestRow | undefined> {
    return Promise.resolve(
      this.data.transitionRequests.find(
        (r) =>
          r.tenantId === this.tenantId &&
          r.entityType === entityType &&
          r.entityId === entityId &&
          r.idempotencyKey === idempotencyKey,
      ),
    );
  }

  insertGuardResults(results: readonly GuardResultInsert[]): Promise<void> {
    this.pendingGuardResults.push(...results);
    return Promise.resolve();
  }

  insertTransitionRequest(input: TransitionRequestInsert): Promise<string> {
    const id = this.ids.newId();
    this.pendingRequests.push({
      id,
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      trigger: input.trigger,
      fromState: input.fromState,
      requestedToState: input.requestedToState,
      idempotencyKey: input.idempotencyKey,
      status: 'pending_approval',
    });
    return Promise.resolve(id);
  }

  insertEntityState(input: EntityStateInsert): Promise<void> {
    this.pendingEntityInserts.push({
      id: this.ids.newId(),
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      currentState: input.currentState,
      stateMachineId: input.stateMachineId,
    });
    return Promise.resolve();
  }

  updateEntityState(entityStateId: string, toState: string, _actorUserId: string): Promise<void> {
    this.pendingEntityUpdates.push({ id: entityStateId, toState });
    return Promise.resolve();
  }

  insertStateTransition(input: StateTransitionInsert): Promise<string> {
    const id = this.ids.newId();
    this.pendingTransitions.push({
      id,
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      trigger: input.trigger,
      fromState: input.fromState,
      toState: input.toState,
      idempotencyKey: input.idempotencyKey,
    });
    return Promise.resolve(id);
  }

  insertAuditEvent(input: AuditEventInput): Promise<string> {
    const id = this.ids.newId();
    this.pendingAudits.push({ ...input, id });
    return Promise.resolve(id);
  }

  insertEvidenceObject(input: EvidenceObjectInsert): Promise<string> {
    const id = this.ids.newId();
    this.pendingEvidence.push({ ...input, id });
    return Promise.resolve(id);
  }

  insertOutboxMessage(input: OutboxMessageInsert): Promise<string> {
    const now = this.clock.now();
    const rec: OutboxRecord = {
      id: this.ids.newId(),
      tenantId: input.tenantId,
      messageType: input.messageType,
      payload: { ...input.payload },
      dedupeKey: input.dedupeKey,
      status: 'pending',
      retryCount: 0,
      maxRetries: input.maxRetries,
      nextAttemptAt: now,
      createdAt: now,
    };
    if (input.correlationId !== undefined) rec.correlationId = input.correlationId;
    if (input.causationId !== undefined) rec.causationId = input.causationId;
    this.pendingOutbox.push(rec);
    return Promise.resolve(rec.id);
  }

  insertWorkflowInstance(input: WorkflowInstanceInsert): Promise<string> {
    const id = this.ids.newId();
    this.pendingWorkflowInstances.push({
      id,
      tenantId: input.tenantId,
      transitionRequestId: input.transitionRequestId,
      entityType: input.entityType,
      entityId: input.entityId,
      workflowType: input.workflowType,
      status: 'pending',
      currentStepCode: input.currentStepCode,
    });
    return Promise.resolve(id);
  }

  insertWorkflowSteps(inputs: readonly WorkflowStepInsert[]): Promise<void> {
    for (const s of inputs) {
      this.pendingWorkflowSteps.push({
        id: this.ids.newId(),
        tenantId: s.tenantId,
        workflowInstanceId: s.workflowInstanceId,
        stepCode: s.stepCode,
        stepOrder: s.stepOrder,
        reviewTier: s.reviewTier,
        required: s.required,
        status: 'pending',
        assignedScopeType: s.assignedScopeType,
        assignedScopeId: s.assignedScopeId,
        assignedRoleKey: s.assignedRoleKey,
        decidedByUserId: undefined,
        decidedAt: undefined,
        decisionReason: undefined,
      });
    }
    return Promise.resolve();
  }

  /** Apply all buffered writes, enforcing idempotency/dedupe uniqueness. */
  commit(): void {
    // Enforce idempotency uniqueness (mirrors DB unique constraints).
    for (const t of this.pendingTransitions) {
      const conflict = this.data.stateTransitions.some(
        (r) =>
          r.tenantId === t.tenantId &&
          r.entityType === t.entityType &&
          r.entityId === t.entityId &&
          r.idempotencyKey === t.idempotencyKey,
      );
      if (conflict) {
        throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'Duplicate state_transition idempotency key');
      }
    }
    for (const req of this.pendingRequests) {
      const conflict = this.data.transitionRequests.some(
        (r) =>
          r.tenantId === req.tenantId &&
          r.entityType === req.entityType &&
          r.entityId === req.entityId &&
          r.idempotencyKey === req.idempotencyKey,
      );
      if (conflict) {
        throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'Duplicate transition_request idempotency key');
      }
    }
    for (const o of this.pendingOutbox) {
      const conflict = this.data.outbox.some(
        (r) => r.tenantId === o.tenantId && r.dedupeKey === o.dedupeKey,
      );
      if (conflict) {
        throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'Duplicate outbox dedupe key');
      }
    }

    this.data.guardResults.push(...this.pendingGuardResults);
    this.data.transitionRequests.push(...this.pendingRequests);
    this.data.entityStates.push(...this.pendingEntityInserts);
    for (const u of this.pendingEntityUpdates) {
      const rec = this.data.entityStates.find((e) => e.id === u.id);
      if (rec !== undefined) rec.currentState = u.toState;
    }
    this.data.stateTransitions.push(...this.pendingTransitions);
    this.data.auditEvents.push(...this.pendingAudits);
    this.data.evidenceObjects.push(...this.pendingEvidence);
    this.data.outbox.push(...this.pendingOutbox);
    this.data.workflowInstances.push(...this.pendingWorkflowInstances);
    this.data.workflowSteps.push(...this.pendingWorkflowSteps);
  }
}
