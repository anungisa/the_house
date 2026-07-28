import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { Clock } from '../../shared/time/clock.js';
import { systemClock } from '../../shared/time/clock.js';
import type {
  AuditEventInput,
  ExecuteApprovedTransitionInput,
  ExecuteApprovedTransitionResult,
  GuardEvaluationResult,
  TransitionContext,
  TransitionInput,
  TransitionResult,
} from '../types/TransitionTypes.js';
import type { GuardRegistry } from '../guards/GuardRegistry.js';
import { DefaultPermissionChecker } from '../permissions/PermissionChecker.js';
import type {
  DomainEffectContext,
  DomainEffectResult,
  ExistingTransitionRow,
  GovernanceStore,
  GovernanceTx,
  GuardResultInsert,
  PermissionChecker,
  StateMachineRow,
  TransitionDefinitionRow,
  TransitionDomainEffect,
  TransitionRequestForExecutionRow,
  TransitionSerializationKeyResolver,
} from './ports.js';
import type { WorkflowPlanner } from '../workflow/WorkflowPlanner.js';

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
  /**
   * Optional review-workflow planner. When configured, the kernel asks it for a review plan
   * inside the approval-required branch and persists the resulting workflow instance + steps
   * atomically with the transition_request (two-tier review METADATA). When absent or when it
   * returns no plan, approval-required transitions behave exactly as before.
   */
  readonly workflowPlanner?: WorkflowPlanner;

  /**
   * Optional per-entity-type transition serialization-key resolvers. Before a governed
   * transition evaluates its guards and mutates state, the kernel asks the resolver registered
   * for the entity type for the transaction-scoped advisory lock keys to acquire. This lets a
   * DOMAIN declare a concurrency-serialization scope (e.g. exactly-one ACTIVE affiliation
   * standing per tenant + subject + season) without the domain-agnostic kernel knowing the
   * domain's rules. When absent, or when a resolver returns no keys, transitions behave
   * exactly as before.
   */
  readonly serializationKeyResolvers?: ReadonlyMap<string, TransitionSerializationKeyResolver>;

  /**
   * Optional per-entity-type domain-effect hooks. When a governed transition EXECUTES (mutates
   * state), the kernel invokes the effect registered for its entity type INSIDE the governed
   * transaction (after the state_transition journal append, before evidence/outbox), so the
   * effect can persist DOMAIN facts atomically with the governed state. When absent, or when no
   * effect is registered for the entity type, transitions behave exactly as before.
   */
  readonly domainEffects?: ReadonlyMap<string, TransitionDomainEffect>;
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
  private readonly workflowPlanner: WorkflowPlanner | undefined;
  private readonly serializationKeyResolvers: ReadonlyMap<
    string,
    TransitionSerializationKeyResolver
  >;
  private readonly domainEffects: ReadonlyMap<string, TransitionDomainEffect>;

  constructor(deps: GovernanceKernelDeps) {
    this.store = deps.store;
    this.guards = deps.guards;
    this.permissions = deps.permissions ?? new DefaultPermissionChecker();
    this.clock = deps.clock ?? systemClock;
    this.outboxMaxRetries = deps.outboxMaxRetries ?? 10;
    this.workflowPlanner = deps.workflowPlanner;
    this.serializationKeyResolvers = deps.serializationKeyResolvers ?? new Map();
    this.domainEffects = deps.domainEffects ?? new Map();
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

      // 2e-i) Acquire any domain-declared transaction-scoped serialization lock(s) BEFORE
      // evaluating guards, for transitions that DIRECTLY execute (mutate) here. This
      // serializes concurrent governed transitions that resolve to the same governed scope
      // (e.g. one ACTIVE affiliation standing per tenant + subject + season): the loser blocks
      // here until the winner COMMITS, so its uniqueness guard then observes the winner's
      // committed state and fails closed. The lock is bound to THIS transaction and released
      // on COMMIT/ROLLBACK, holding through the state mutation and outbox write below.
      //
      // Approval-required transitions do NOT mutate state here (they only record a request);
      // their authoritative serialization happens when the approved request is EXECUTED (see
      // executeApprovedTransitionRequest). Acquiring the lock only on the mutating branch keeps
      // it bound to the transaction that actually grants standing.
      if (!def.approvalRequired) {
        await this.acquireSerializationLocks(tx, {
          tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          trigger: input.trigger,
          fromState,
          toState: def.toState,
        });
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

        // 2j-i) Optional two-tier review workflow METADATA, persisted atomically with the
        // request. Does NOT mutate entity_state and does NOT execute the transition.
        const workflowInstanceId = await this.persistWorkflow(
          tx,
          input,
          tenantId,
          fromState,
          def.toState,
          requestId,
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
          ...(workflowInstanceId !== undefined ? { workflowInstanceId } : {}),
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

      // 2m-i) Domain effect (atomic): a registered per-entity-type effect persists DOMAIN facts
      // (amounts, references, reconciliation outcomes) in the SAME governed transaction, so they
      // commit/roll back with the state mutation, journal, audit, evidence, and outbox. Runs
      // ONLY here on the executed branch, after the journal append. Its optional evidence
      // manifest fragment is merged into the evidence metadata below.
      const domainEffectResult = await this.applyDomainEffect(tx, {
        tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        trigger: input.trigger,
        fromState,
        toState: def.toState,
        stateTransitionId,
        actor: input.actor,
        context: input.context,
        payload: input.payload ?? {},
      });

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
            ...(domainEffectResult?.evidenceManifest !== undefined
              ? { domainEffect: domainEffectResult.evidenceManifest }
              : {}),
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

  /**
   * Execute a previously approval-required transition that has been EXPLICITLY approved by
   * its review workflow. This is the governed execution path: it runs the request's ORIGINAL
   * pending transition through the kernel exactly once. It is never auto-invoked by the
   * workflow decision endpoint — an explicit execution command is required.
   *
   * Atomic (one DB transaction): lock the transition_request (serialize concurrent executes)
   * → idempotent-replay / already-consumed handling → require an APPROVED review workflow
   * (fail closed) → re-resolve the active policy and lock entity_state → reject if the entity
   * state no longer matches the approved source (TRANSITION_STATE_CONFLICT) → re-check the
   * permission with the EXECUTION actor → RE-RUN guards against the recorded request payload
   * (fail closed; guard failure mutates nothing) → update entity_state → append the immutable
   * state_transition (keyed by the execution idempotency key, linked to the request) → append
   * audit → create evidence metadata when required → enqueue the outbox message → mark the
   * transition_request 'executed' (consumed) → COMMIT.
   *
   * Governed rejections are THROWN as {@link AppError}s; the only returned outcomes are a
   * fresh execution or an idempotent replay of a prior execution.
   */
  async executeApprovedTransitionRequest(
    input: ExecuteApprovedTransitionInput,
  ): Promise<ExecuteApprovedTransitionResult> {
    this.validateExecutionInput(input);
    const tenantId = input.tenantId;

    return this.store.runInTransaction(tenantId, async (tx) => {
      // 1) Lock the request FOR UPDATE (serializes concurrent execution attempts).
      const req = await tx.lockTransitionRequestById(input.transitionRequestId);
      if (req === undefined) {
        throw new AppError(
          ErrorCode.TRANSITION_REQUEST_NOT_FOUND,
          'No transition request found for the supplied id.',
          { details: { transitionRequestId: input.transitionRequestId } },
        );
      }

      // 2) Already-consumed / idempotent-replay handling.
      if (req.status === 'executed') {
        const prior = await tx.findStateTransition(
          req.entityType,
          req.entityId,
          input.idempotencyKey,
        );
        if (prior !== undefined) {
          return this.executionReplay(req, prior, input.idempotencyKey);
        }
        throw new AppError(
          ErrorCode.IDEMPOTENCY_CONFLICT,
          'Transition request already executed under a different idempotency key.',
          { details: { transitionRequestId: req.id } },
        );
      }
      if (req.status !== 'pending_approval') {
        throw new AppError(
          ErrorCode.WORKFLOW_NOT_APPROVED,
          `Transition request is '${req.status}', not executable.`,
          { details: { transitionRequestId: req.id, status: req.status } },
        );
      }

      // 3) A state_transition may already exist for this execution key (idempotent replay).
      const dup = await tx.findStateTransition(req.entityType, req.entityId, input.idempotencyKey);
      if (dup !== undefined) {
        return this.executionReplay(req, dup, input.idempotencyKey);
      }

      // 4) Require an APPROVED review workflow (execution gate; fail closed).
      const workflow = await tx.findWorkflowApprovalForRequest(req.id);
      if (workflow === undefined) {
        throw new AppError(
          ErrorCode.WORKFLOW_NOT_APPROVED,
          'No review workflow exists for this transition request.',
          { details: { transitionRequestId: req.id } },
        );
      }
      if (workflow.status !== 'approved') {
        throw new AppError(
          ErrorCode.WORKFLOW_NOT_APPROVED,
          `Review workflow is '${workflow.status}', not approved.`,
          { details: { transitionRequestId: req.id, workflowStatus: workflow.status } },
        );
      }

      // 5) Re-resolve the active policy and lock the current entity_state.
      const machine = await tx.loadActiveStateMachine(req.entityType);
      if (machine === undefined) {
        throw new AppError(
          ErrorCode.UNKNOWN_TRANSITION,
          `No active state machine for entity type '${req.entityType}'.`,
          { details: { entityType: req.entityType } },
        );
      }
      const entity = await tx.lockEntityState(req.entityType, req.entityId);
      if (entity === undefined) {
        throw new AppError(
          ErrorCode.TRANSITION_STATE_CONFLICT,
          'Entity has no current state; the approved transition can no longer be executed.',
          { details: { transitionRequestId: req.id } },
        );
      }
      if (entity.currentState !== req.fromState) {
        throw new AppError(
          ErrorCode.TRANSITION_STATE_CONFLICT,
          `Entity state '${entity.currentState}' no longer matches the approved transition source '${req.fromState}'.`,
          {
            details: {
              transitionRequestId: req.id,
              currentState: entity.currentState,
              expectedFromState: req.fromState,
            },
          },
        );
      }

      // 6) Re-resolve the transition definition; deny unknown / target drift (fail closed).
      const def = await tx.resolveTransition(machine.id, entity.currentState, req.trigger);
      if (def === undefined) {
        throw new AppError(
          ErrorCode.UNKNOWN_TRANSITION,
          `No transition for trigger '${req.trigger}' from state '${entity.currentState}'.`,
          { details: { entityType: req.entityType, fromState: entity.currentState, trigger: req.trigger } },
        );
      }
      if (def.toState !== req.requestedToState) {
        throw new AppError(
          ErrorCode.TRANSITION_STATE_CONFLICT,
          'The active policy target no longer matches the approved transition target.',
          {
            details: {
              transitionRequestId: req.id,
              activeToState: def.toState,
              approvedToState: req.requestedToState,
            },
          },
        );
      }

      // 7) Re-check the permission with the EXECUTION actor.
      const decision = this.permissions.check({
        actor: input.actor,
        entityType: req.entityType,
        trigger: req.trigger,
        riskLevel: def.riskLevel,
        approvalRequired: def.approvalRequired,
      });
      if (!decision.allowed) {
        throw new AppError(
          (decision.reasonCode as ErrorCode | undefined) ?? ErrorCode.PERMISSION_DENIED,
          decision.reasonMessage ?? 'Permission denied.',
          { details: { transitionRequestId: req.id, trigger: req.trigger } },
        );
      }

      // 7-i) Acquire any domain-declared transaction-scoped serialization lock(s) BEFORE
      // re-running guards. Governed transitions granting the same scope (e.g. ACTIVE
      // affiliation standing per tenant + subject + season) are serialized whether they run
      // via the direct-execute path or this approved-execution path: the loser blocks until
      // the winner COMMITS, so its uniqueness guard observes the committed state and fails
      // closed. Bound to THIS transaction; released on COMMIT/ROLLBACK.
      await this.acquireSerializationLocks(tx, {
        tenantId,
        entityType: req.entityType,
        entityId: req.entityId,
        trigger: req.trigger,
        fromState: req.fromState,
        toState: def.toState,
      });

      // 8) RE-RUN guards against the RECORDED request payload (fail closed on unknown code).
      const context = this.executionContext(input, req);
      const bindings = await tx.loadGuards(def.id);
      for (const binding of bindings) {
        if (!this.guards.hasGuard(binding.guardCode)) {
          throw new AppError(ErrorCode.UNKNOWN_GUARD, `Unknown guard code: ${binding.guardCode}`, {
            details: { guardCode: binding.guardCode, trigger: req.trigger },
          });
        }
      }
      const guardResults: GuardEvaluationResult[] = [];
      for (const binding of bindings) {
        const result = await this.guards.evaluate({
          guardCode: binding.guardCode,
          parameters: binding.parameters,
          entityType: req.entityType,
          entityId: req.entityId,
          trigger: req.trigger,
          fromState: req.fromState,
          toState: def.toState,
          actor: input.actor,
          context,
          payload: req.payload,
        });
        guardResults.push(result);
      }

      // 9) Persist guard results keyed by the execution idempotency key + request linkage.
      await tx.insertGuardResults(
        guardResults.map((r) => ({
          tenantId,
          entityType: req.entityType,
          entityId: req.entityId,
          trigger: req.trigger,
          idempotencyKey: input.idempotencyKey,
          guardCode: r.guardCode,
          passed: r.passed,
          transitionRequestId: req.id,
          ...(r.message !== undefined ? { failureMessage: r.message } : {}),
        })),
      );

      // 10) Any failing guard => fail closed, NO state mutation.
      const failed = guardResults.find((g) => !g.passed);
      if (failed !== undefined) {
        throw new AppError(
          ErrorCode.GUARD_FAILED,
          failed.message ?? `Guard failed: ${failed.guardCode}`,
          { details: { transitionRequestId: req.id, guardCode: failed.guardCode } },
        );
      }

      const correlationId = input.correlationId ?? req.correlationId;

      // 11) Execute: update entity_state (the approval-required branch never bootstrapped it).
      await tx.updateEntityState(entity.id, def.toState, input.actor.actorId);

      // 12) Append the immutable journal (keyed by the execution idempotency key; linked to
      // the request; caused by the request).
      const stateTransitionId = await tx.insertStateTransition({
        tenantId,
        entityType: req.entityType,
        entityId: req.entityId,
        trigger: req.trigger,
        fromState: req.fromState,
        toState: def.toState,
        idempotencyKey: input.idempotencyKey,
        stateMachineId: machine.id,
        policyVersionId: machine.policyVersionId,
        transitionRequestId: req.id,
        actorUserId: input.actor.actorId,
        ...(correlationId !== undefined ? { correlationId } : {}),
        causationId: req.id,
      });

      // 13) Append the audit event.
      const auditEventId = await tx.insertAuditEvent({
        entityType: req.entityType,
        entityId: req.entityId,
        trigger: req.trigger,
        action: 'transition.executed',
        tenantId,
        actorId: input.actor.actorId,
        fromState: req.fromState,
        toState: def.toState,
        ...(correlationId !== undefined ? { correlationId } : {}),
        causationId: req.id,
        metadata: {
          idempotencyKey: input.idempotencyKey,
          transitionRequestId: req.id,
          executedFromApprovedWorkflow: true,
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
        },
      });

      // 13-i) Domain effect (atomic): mirror the direct-execute path so a registered
      // per-entity-type effect persists DOMAIN facts in the SAME governed transaction here too.
      const domainEffectResult = await this.applyDomainEffect(tx, {
        tenantId,
        entityType: req.entityType,
        entityId: req.entityId,
        trigger: req.trigger,
        fromState: req.fromState,
        toState: def.toState,
        stateTransitionId,
        actor: input.actor,
        context,
        payload: req.payload,
      });

      // 14) Evidence metadata for evidence-required (high-risk) transitions.
      let evidenceObjectId: string | undefined;
      if (def.evidenceRequired) {
        evidenceObjectId = await tx.insertEvidenceObject({
          tenantId,
          entityType: req.entityType,
          entityId: req.entityId,
          trigger: req.trigger,
          stateTransitionId,
          manifest: {
            fromState: req.fromState,
            toState: def.toState,
            riskLevel: def.riskLevel,
            actorId: input.actor.actorId,
            transitionRequestId: req.id,
            guardResults,
            recordedAt: this.clock.nowIso(),
            ...(domainEffectResult?.evidenceManifest !== undefined
              ? { domainEffect: domainEffectResult.evidenceManifest }
              : {}),
          },
          createdBy: input.actor.actorId,
        });
      }

      // 15) Enqueue the outbox message (same transaction; dedupe by the execution key).
      const outboxMessageId = await tx.insertOutboxMessage({
        tenantId,
        messageType: `${req.entityType}.${req.trigger}`,
        payload: {
          entityType: req.entityType,
          entityId: req.entityId,
          trigger: req.trigger,
          fromState: req.fromState,
          toState: def.toState,
          stateTransitionId,
          transitionRequestId: req.id,
        },
        dedupeKey: `${req.entityType}:${req.entityId}:${input.idempotencyKey}`,
        ...(correlationId !== undefined ? { correlationId } : {}),
        causationId: stateTransitionId,
        maxRetries: this.outboxMaxRetries,
      });

      // 16) Mark the transition_request consumed (status='executed').
      await tx.markTransitionRequestExecuted({
        transitionRequestId: req.id,
        executedByUserId: input.actor.actorId,
        executedAtIso: this.clock.nowIso(),
        executionStateTransitionId: stateTransitionId,
      });

      // 17) Deterministic result.
      return {
        status: 'executed',
        transitionRequestId: req.id,
        entityType: req.entityType,
        entityId: req.entityId,
        trigger: req.trigger,
        fromState: req.fromState,
        toState: def.toState,
        stateTransitionId,
        auditEventId,
        ...(evidenceObjectId !== undefined ? { evidenceObjectId } : {}),
        outboxMessageId,
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

  private validateExecutionInput(input: ExecuteApprovedTransitionInput): void {
    if (input.tenantId.trim() === '') {
      throw new AppError(ErrorCode.TENANT_CONTEXT_MISSING, 'tenantId is required.');
    }
    if (input.actor.tenantId.trim() === '') {
      throw new AppError(ErrorCode.TENANT_CONTEXT_MISSING, 'actor.tenantId is required.');
    }
    if (input.actor.tenantId !== input.tenantId) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'Actor tenant does not match tenant context (cross-tenant request denied).',
        { details: { actorTenant: input.actor.tenantId, contextTenant: input.tenantId } },
      );
    }
    if (input.transitionRequestId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'transitionRequestId is required.');
    }
    if (input.idempotencyKey.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'idempotencyKey is required.');
    }
  }

  /** Reconstruct the guard/audit context for an execution from the execution input + request. */
  private executionContext(
    input: ExecuteApprovedTransitionInput,
    req: TransitionRequestForExecutionRow,
  ): TransitionContext {
    const correlationId = input.correlationId ?? req.correlationId;
    return {
      tenantId: input.tenantId,
      scopeType: input.actor.scopeType,
      ...(input.actor.scopeId !== undefined ? { scopeId: input.actor.scopeId } : {}),
      ...(correlationId !== undefined ? { correlationId } : {}),
    };
  }

  /** Deterministic idempotent-replay result for an already-executed approved transition. */
  private executionReplay(
    req: TransitionRequestForExecutionRow,
    prior: ExistingTransitionRow,
    idempotencyKey: string,
  ): ExecuteApprovedTransitionResult {
    return {
      status: 'idempotent_replay',
      transitionRequestId: req.id,
      entityType: req.entityType,
      entityId: req.entityId,
      trigger: req.trigger,
      fromState: prior.fromState,
      toState: prior.toState,
      stateTransitionId: prior.id,
      idempotencyKey,
    };
  }

  /**
   * Acquire every transaction-scoped serialization lock that the entity type's registered
   * {@link TransitionSerializationKeyResolver} declares for this transition, on the governed
   * transaction's own connection, BEFORE guards run and state mutates. Keys are sorted so
   * concurrent transitions acquire multiple locks in a consistent order (deadlock-free). A
   * no-op when no resolver is registered or the resolver returns no keys.
   */
  private async acquireSerializationLocks(
    tx: GovernanceTx,
    input: {
      readonly tenantId: string;
      readonly entityType: string;
      readonly entityId: string;
      readonly trigger: string;
      readonly fromState: string;
      readonly toState: string;
    },
  ): Promise<void> {
    const resolver = this.serializationKeyResolvers.get(input.entityType);
    if (resolver === undefined) return;
    const keys = await resolver.resolveKeys(input);
    if (keys.length === 0) return;
    for (const key of [...new Set(keys)].sort()) {
      await tx.acquireSerializationLock(key);
    }
  }

  /**
   * Invoke the domain effect registered for the transition's entity type, if any, INSIDE the
   * governed transaction. Called only on the executed (state-mutating) branch, after the
   * journal append. Returns the effect's optional contribution (evidence manifest fragment), or
   * undefined when no effect is registered. Any throw propagates and rolls back the whole
   * governed transaction (state, journal, audit, evidence, outbox, and the domain writes).
   */
  private async applyDomainEffect(
    tx: GovernanceTx,
    ctx: DomainEffectContext,
  ): Promise<DomainEffectResult | undefined> {
    const effect = this.domainEffects.get(ctx.entityType);
    if (effect === undefined) return undefined;
    const result = await effect.apply(tx, ctx);
    return result ?? undefined;
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

  /**
   * Persist a two-tier review workflow (instance + ordered steps) for an approval-required
   * transition, atomically with its transition_request. Returns the workflow instance id, or
   * undefined when no planner is configured or the planner produces no plan. METADATA only:
   * never mutates entity_state and never executes the transition.
   */
  private async persistWorkflow(
    tx: GovernanceTx,
    input: TransitionInput,
    tenantId: string,
    fromState: string,
    toState: string,
    transitionRequestId: string,
  ): Promise<string | undefined> {
    if (this.workflowPlanner === undefined) {
      return undefined;
    }
    const plan = this.workflowPlanner.planFor({
      entityType: input.entityType,
      entityId: input.entityId,
      trigger: input.trigger,
      fromState,
      toState,
      tenantId,
      actor: input.actor,
    });
    if (plan === undefined || plan.steps.length === 0) {
      return undefined;
    }

    const orderedSteps = [...plan.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    const firstStepCode = orderedSteps[0]!.stepCode;

    const workflowInstanceId = await tx.insertWorkflowInstance({
      tenantId,
      transitionRequestId,
      entityType: input.entityType,
      entityId: input.entityId,
      workflowType: plan.workflowType,
      currentStepCode: firstStepCode,
    });

    await tx.insertWorkflowSteps(
      orderedSteps.map((s) => ({
        tenantId,
        workflowInstanceId,
        stepCode: s.stepCode,
        stepOrder: s.stepOrder,
        reviewTier: s.reviewTier,
        required: s.required,
        ...(s.assignedScopeType !== undefined ? { assignedScopeType: s.assignedScopeType } : {}),
        ...(s.assignedScopeId !== undefined ? { assignedScopeId: s.assignedScopeId } : {}),
        ...(s.assignedRoleKey !== undefined ? { assignedRoleKey: s.assignedRoleKey } : {}),
      })),
    );

    return workflowInstanceId;
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
