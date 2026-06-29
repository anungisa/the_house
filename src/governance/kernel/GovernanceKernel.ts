import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { Clock } from '../../shared/time/clock.js';
import { systemClock } from '../../shared/time/clock.js';
import type {
  AuditEventInput,
  GuardEvaluationResult,
  TransitionInput,
  TransitionResult,
} from '../types/TransitionTypes.js';
import type { GuardRegistry } from '../guards/GuardRegistry.js';
import { DefaultPermissionChecker } from '../permissions/PermissionChecker.js';
import type {
  GovernanceStore,
  GuardResultInsert,
  PermissionChecker,
  StateMachineRow,
  TransitionDefinitionRow,
} from './ports.js';

/**
 * Dependencies for the GovernanceKernel. All ports are injected so the kernel runs
 * identically against the in-memory store (unit tests) and PostgreSQL (integration).
 */
export interface GovernanceKernelDeps {
  readonly store: GovernanceStore;
  readonly guards: GuardRegistry;
  readonly permissions?: PermissionChecker;
  readonly clock?: Clock;
  readonly outboxMaxRetries?: number;
}

/**
 * GovernanceKernel — the SOLE authority for governed lifecycle transitions.
 *
 * Executes the full governed algorithm atomically (one DB transaction):
 * validate → fast idempotency lookup (outside txn) → BEGIN (tenant context/RLS set by the
 * store) → double-check idempotency → resolve active state machine → lock entity_state
 * (FOR UPDATE) or bootstrap at the initial state → resolve transition (deny unknown,
 * fail closed) → check permission (deny) → load guards (deny unknown guard code, fail
 * closed) → evaluate guards → persist guard results → if any guard fails return REJECTED
 * (no state mutation) → if approval required create transition_request + workflow
 * placeholder + audit (no state mutation, no outbox/evidence) → else update/insert
 * entity_state → append state_transition (immutable journal) → append audit_event →
 * create evidence_object when evidence_required → enqueue outbox_message (stable dedupe
 * key; correlation_id propagated; causation_id = state_transition id) → COMMIT → return a
 * deterministic TransitionResult.
 *
 * External side effects (Service Bus publish, email, webhooks) happen ONLY after commit,
 * via the outbox processor. Domain modules must never mutate governed state directly.
 */
export class GovernanceKernel {
  private readonly store: GovernanceStore;
  private readonly guards: GuardRegistry;
  private readonly permissions: PermissionChecker;
  private readonly clock: Clock;
  private readonly outboxMaxRetries: number;

  constructor(deps: GovernanceKernelDeps) {
    this.store = deps.store;
    this.guards = deps.guards;
    this.permissions = deps.permissions ?? new DefaultPermissionChecker();
    this.clock = deps.clock ?? systemClock;
    this.outboxMaxRetries = deps.outboxMaxRetries ?? 10;
  }

  async transition(input: TransitionInput): Promise<TransitionResult> {
    this.validateInput(input);
    const tenantId = input.context.tenantId;

    // 1) Fast idempotency lookup OUTSIDE the transaction.
    const existing = await this.store.findExistingResult(
      tenantId,
      input.entityType,
      input.entityId,
      input.idempotencyKey,
    );
    if (existing !== undefined) {
      return this.replayResult(input, existing);
    }

    // 2) Governed transaction (tenant context / RLS applied by the store).
    return this.store.runInTransaction(tenantId, async (tx) => {
      // 2a) In-transaction idempotency double-check.
      const priorTransition = await tx.findStateTransition(
        input.entityType,
        input.entityId,
        input.idempotencyKey,
      );
      if (priorTransition !== undefined) {
        return this.replayResult(input, { kind: 'transition', row: priorTransition });
      }
      const priorRequest = await tx.findTransitionRequest(
        input.entityType,
        input.entityId,
        input.idempotencyKey,
      );
      if (priorRequest !== undefined) {
        return this.replayResult(input, { kind: 'request', row: priorRequest });
      }

      // 2b) Resolve active state machine (fail closed if none).
      const machine = await tx.loadActiveStateMachine(input.entityType);
      if (machine === undefined) {
        throw new AppError(
          ErrorCode.UNKNOWN_TRANSITION,
          `No active state machine for entity type '${input.entityType}'.`,
          { details: { entityType: input.entityType } },
        );
      }

      // 2c) Lock current state, or bootstrap from the initial state.
      const entity = await tx.lockEntityState(input.entityType, input.entityId);
      const fromState = entity?.currentState ?? machine.initialState;

      // 2d) Resolve transition; deny unknown (fail closed).
      const def = await tx.resolveTransition(machine.id, fromState, input.trigger);
      if (def === undefined) {
        throw new AppError(
          ErrorCode.UNKNOWN_TRANSITION,
          `No transition for trigger '${input.trigger}' from state '${fromState}'.`,
          { details: { entityType: input.entityType, fromState, trigger: input.trigger } },
        );
      }

      // 2e) Permission check; deny (rejected, no mutation).
      const decision = this.permissions.check({
        actor: input.actor,
        entityType: input.entityType,
        trigger: input.trigger,
        riskLevel: def.riskLevel,
        approvalRequired: def.approvalRequired,
      });
      if (!decision.allowed) {
        return this.rejected(
          input,
          fromState,
          def.toState,
          decision.reasonCode ?? ErrorCode.PERMISSION_DENIED,
          decision.reasonMessage ?? 'Permission denied.',
        );
      }

      // 2f) Load guards; deny unknown guard code (fail closed).
      const bindings = await tx.loadGuards(def.id);
      for (const binding of bindings) {
        if (!this.guards.hasGuard(binding.guardCode)) {
          throw new AppError(ErrorCode.UNKNOWN_GUARD, `Unknown guard code: ${binding.guardCode}`, {
            details: { guardCode: binding.guardCode, trigger: input.trigger },
          });
        }
      }

      // 2g) Evaluate guards.
      const guardResults: GuardEvaluationResult[] = [];
      for (const binding of bindings) {
        const result = await this.guards.evaluate({
          guardCode: binding.guardCode,
          parameters: binding.parameters,
          entityType: input.entityType,
          entityId: input.entityId,
          trigger: input.trigger,
          fromState,
          toState: def.toState,
          actor: input.actor,
          context: input.context,
          ...(input.payload !== undefined ? { payload: input.payload } : {}),
        });
        guardResults.push(result);
      }

      // 2h) Persist guard results (recorded whether or not the transition proceeds).
      await tx.insertGuardResults(this.toGuardInserts(input, guardResults));

      // 2i) Any failing guard => rejected, NO state mutation.
      const failed = guardResults.find((g) => !g.passed);
      if (failed !== undefined) {
        return this.rejected(
          input,
          fromState,
          def.toState,
          ErrorCode.GUARD_FAILED,
          failed.message ?? `Guard failed: ${failed.guardCode}`,
          guardResults,
        );
      }

      // 2j) Approval required => create request + audit, NO state mutation / outbox / evidence.
      if (def.approvalRequired) {
        const requestId = await tx.insertTransitionRequest({
          tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          trigger: input.trigger,
          fromState,
          requestedToState: def.toState,
          idempotencyKey: input.idempotencyKey,
          actorUserId: input.actor.actorId,
          workflowRef: { status: 'pending_approval', placeholder: true },
          ...(input.context.correlationId !== undefined
            ? { correlationId: input.context.correlationId }
            : {}),
          ...(input.context.causationId !== undefined
            ? { causationId: input.context.causationId }
            : {}),
          payload: input.payload ?? {},
        });
        await tx.insertAuditEvent(
          this.audit(input, 'transition.requested', fromState, def.toState),
        );
        return {
          status: 'approval_required',
          entityType: input.entityType,
          entityId: input.entityId,
          trigger: input.trigger,
          fromState,
          toState: def.toState,
          guardResults,
          transitionRequestId: requestId,
          idempotencyKey: input.idempotencyKey,
        };
      }

      // 2k) Execute: update or bootstrap entity_state.
      if (entity === undefined) {
        await tx.insertEntityState({
          tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          currentState: def.toState,
          stateMachineId: machine.id,
          ...(input.context.scopeType !== undefined ? { scopeType: input.context.scopeType } : {}),
          ...(input.context.scopeId !== undefined ? { scopeId: input.context.scopeId } : {}),
        });
      } else {
        await tx.updateEntityState(entity.id, def.toState, input.actor.actorId);
      }

      // 2l) Append immutable journal.
      const stateTransitionId = await tx.insertStateTransition({
        tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        trigger: input.trigger,
        fromState,
        toState: def.toState,
        idempotencyKey: input.idempotencyKey,
        stateMachineId: machine.id,
        policyVersionId: machine.policyVersionId,
        actorUserId: input.actor.actorId,
        ...(input.context.correlationId !== undefined
          ? { correlationId: input.context.correlationId }
          : {}),
        ...(input.context.causationId !== undefined
          ? { causationId: input.context.causationId }
          : {}),
      });

      // 2m) Append audit event.
      const auditEventId = await tx.insertAuditEvent(
        this.audit(input, 'transition.executed', fromState, def.toState),
      );

      // 2n) Evidence metadata for evidence-required (high-risk) transitions. When the caller
      // supplied a pre-computed payload binding (content hash + serialized storage ref), it is
      // persisted onto the metadata; otherwise the evidence remains metadata-only. The kernel
      // never receives raw bytes and never contacts blob storage.
      let evidenceObjectId: string | undefined;
      if (def.evidenceRequired) {
        evidenceObjectId = await tx.insertEvidenceObject({
          tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          trigger: input.trigger,
          stateTransitionId,
          manifest: {
            fromState,
            toState: def.toState,
            riskLevel: def.riskLevel,
            actorId: input.actor.actorId,
            guardResults,
            recordedAt: this.clock.nowIso(),
          },
          createdBy: input.actor.actorId,
          ...(input.evidence?.contentHash !== undefined
            ? { contentHash: input.evidence.contentHash }
            : {}),
          ...(input.evidence?.storageRef !== undefined
            ? { storageRef: input.evidence.storageRef }
            : {}),
        });
      }

      // 2o) Enqueue outbox message (same transaction). dedupe_key is stable; causation_id
      // is the state_transition id (this message is caused by the transition).
      await tx.insertOutboxMessage({
        tenantId,
        messageType: `${input.entityType}.${input.trigger}`,
        payload: {
          entityType: input.entityType,
          entityId: input.entityId,
          trigger: input.trigger,
          fromState,
          toState: def.toState,
          stateTransitionId,
        },
        dedupeKey: this.dedupeKey(input),
        ...(input.context.correlationId !== undefined
          ? { correlationId: input.context.correlationId }
          : {}),
        causationId: stateTransitionId,
        maxRetries: this.outboxMaxRetries,
      });

      // 2p) Deterministic result.
      return {
        status: 'executed',
        entityType: input.entityType,
        entityId: input.entityId,
        trigger: input.trigger,
        fromState,
        toState: def.toState,
        guardResults,
        stateTransitionId,
        auditEventId,
        ...(evidenceObjectId !== undefined ? { evidenceObjectId } : {}),
        idempotencyKey: input.idempotencyKey,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  private validateInput(input: TransitionInput): void {
    if (input.context.tenantId.trim() === '') {
      throw new AppError(ErrorCode.TENANT_CONTEXT_MISSING, 'context.tenantId is required.');
    }
    if (input.actor.tenantId.trim() === '') {
      throw new AppError(ErrorCode.TENANT_CONTEXT_MISSING, 'actor.tenantId is required.');
    }
    if (input.actor.tenantId !== input.context.tenantId) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'Actor tenant does not match context tenant (cross-tenant request denied).',
        { details: { actorTenant: input.actor.tenantId, contextTenant: input.context.tenantId } },
      );
    }
    if (input.entityType.trim() === '' || input.entityId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'entityType and entityId are required.');
    }
    if (input.trigger.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'trigger is required.');
    }
    if (input.idempotencyKey.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'idempotencyKey is required.');
    }
  }

  private dedupeKey(input: TransitionInput): string {
    return `${input.entityType}:${input.entityId}:${input.idempotencyKey}`;
  }

  private toGuardInserts(
    input: TransitionInput,
    results: readonly GuardEvaluationResult[],
  ): GuardResultInsert[] {
    return results.map((r) => ({
      tenantId: input.context.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      trigger: input.trigger,
      idempotencyKey: input.idempotencyKey,
      guardCode: r.guardCode,
      passed: r.passed,
      ...(r.message !== undefined ? { failureMessage: r.message } : {}),
    }));
  }

  private audit(
    input: TransitionInput,
    action: string,
    fromState: string,
    toState: string,
  ): AuditEventInput {
    return {
      entityType: input.entityType,
      entityId: input.entityId,
      trigger: input.trigger,
      action,
      tenantId: input.context.tenantId,
      actorId: input.actor.actorId,
      fromState,
      toState,
      ...(input.context.correlationId !== undefined
        ? { correlationId: input.context.correlationId }
        : {}),
      ...(input.context.causationId !== undefined
        ? { causationId: input.context.causationId }
        : {}),
      metadata: { idempotencyKey: input.idempotencyKey },
    };
  }

  private rejected(
    input: TransitionInput,
    fromState: string,
    toState: string,
    reasonCode: string,
    reasonMessage: string,
    guardResults?: readonly GuardEvaluationResult[],
  ): TransitionResult {
    return {
      status: 'rejected',
      entityType: input.entityType,
      entityId: input.entityId,
      trigger: input.trigger,
      fromState,
      toState,
      reasonCode,
      reasonMessage,
      ...(guardResults !== undefined ? { guardResults } : {}),
      idempotencyKey: input.idempotencyKey,
    };
  }

  private replayResult(
    input: TransitionInput,
    existing:
      | { readonly kind: 'transition'; readonly row: { fromState: string; toState: string } }
      | {
          readonly kind: 'request';
          readonly row: { id: string; fromState: string; requestedToState: string };
        },
  ): TransitionResult {
    if (existing.kind === 'transition') {
      return {
        status: 'idempotent_replay',
        entityType: input.entityType,
        entityId: input.entityId,
        trigger: input.trigger,
        fromState: existing.row.fromState,
        toState: existing.row.toState,
        idempotencyKey: input.idempotencyKey,
      };
    }
    return {
      status: 'idempotent_replay',
      entityType: input.entityType,
      entityId: input.entityId,
      trigger: input.trigger,
      fromState: existing.row.fromState,
      toState: existing.row.requestedToState,
      transitionRequestId: existing.row.id,
      idempotencyKey: input.idempotencyKey,
    };
  }
}

// Re-export so callers can reference the machine/definition row types alongside the kernel.
export type { StateMachineRow, TransitionDefinitionRow };
