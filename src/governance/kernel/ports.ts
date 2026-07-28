/**
 * Kernel ports (hexagonal boundaries) and row DTOs.
 *
 * The GovernanceKernel depends on these interfaces only — never on a concrete store or
 * the pg driver. This lets unit tests run against an in-memory store and integration
 * tests run against PostgreSQL with identical kernel logic.
 *
 * Naming is NSO-GENERIC throughout.
 */

import type {
  AuditEventInput,
  GuardEvaluationResult,
  TransitionActor,
} from '../types/TransitionTypes.js';
import type { WorkflowInstanceInsert, WorkflowStepInsert } from '../workflow/WorkflowTypes.js';

// -----------------------------------------------------------------------------
// Row DTOs (mirror governance.* tables, camelCased)
// -----------------------------------------------------------------------------

export interface StateMachineRow {
  readonly id: string;
  readonly policyVersionId: string;
  readonly entityType: string;
  readonly version: number;
  /** Name of the node where is_initial = true (used to bootstrap entity_state). */
  readonly initialState: string;
}

export interface EntityStateRow {
  readonly id: string;
  readonly tenantId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly currentState: string;
  readonly stateMachineId: string;
}

export interface TransitionDefinitionRow {
  readonly id: string;
  readonly stateMachineId: string;
  readonly trigger: string;
  readonly fromState: string;
  readonly toState: string;
  readonly riskLevel: 'low' | 'high';
  readonly evidenceRequired: boolean;
  readonly approvalRequired: boolean;
}

export interface TransitionGuardRow {
  readonly guardCode: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly sortOrder: number;
}

export interface ExistingTransitionRow {
  readonly id: string;
  readonly fromState: string;
  readonly toState: string;
  readonly trigger: string;
  readonly idempotencyKey: string;
}

export interface ExistingRequestRow {
  readonly id: string;
  readonly fromState: string;
  readonly requestedToState: string;
  readonly trigger: string;
  readonly idempotencyKey: string;
  readonly status: string;
}

/**
 * A transition_request locked FOR UPDATE during approved-workflow execution. Carries the
 * ORIGINAL request payload + actor so the kernel can faithfully re-resolve the policy and
 * RE-RUN guards at execution time (rather than trusting the approval).
 */
export interface TransitionRequestForExecutionRow {
  readonly id: string;
  readonly tenantId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly trigger: string;
  readonly fromState: string;
  readonly requestedToState: string;
  readonly idempotencyKey: string;
  readonly status: string;
  readonly actorUserId?: string;
  readonly correlationId?: string;
  /** The opaque domain payload captured when the request was created (guard/evidence input). */
  readonly payload: Readonly<Record<string, unknown>>;
}

/** The review workflow approval state for a transition request (execution gate). */
export interface WorkflowApprovalStatusRow {
  readonly workflowInstanceId: string;
  readonly status: string;
}

// -----------------------------------------------------------------------------
// Write inputs
// -----------------------------------------------------------------------------

export interface GuardResultInsert {
  readonly tenantId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly trigger: string;
  readonly idempotencyKey: string;
  readonly guardCode: string;
  readonly passed: boolean;
  readonly failureMessage?: string;
  readonly stateTransitionId?: string;
  readonly transitionRequestId?: string;
}

export interface TransitionRequestInsert {
  readonly tenantId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly trigger: string;
  readonly fromState: string;
  readonly requestedToState: string;
  readonly idempotencyKey: string;
  readonly actorUserId: string;
  readonly workflowRef: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface StateTransitionInsert {
  readonly tenantId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly trigger: string;
  readonly fromState: string;
  readonly toState: string;
  readonly idempotencyKey: string;
  readonly stateMachineId: string;
  readonly policyVersionId: string;
  readonly transitionRequestId?: string;
  readonly actorUserId: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

export interface EvidenceObjectInsert {
  readonly tenantId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly trigger: string;
  readonly stateTransitionId: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly createdBy: string;
  /**
   * Optional SHA-256 digest of a bound evidence payload → persisted to `content_hash`.
   * Absent for metadata-only evidence (the digest column stays NULL).
   */
  readonly contentHash?: string;
  /**
   * Optional stable, serialized storage reference (JSON) for a bound evidence payload →
   * persisted to `storage_ref`. Absent for metadata-only evidence (the column stays NULL).
   * Never contains raw payload bytes.
   */
  readonly storageRef?: string;
}

export interface OutboxMessageInsert {
  readonly tenantId: string;
  readonly messageType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly dedupeKey: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly maxRetries: number;
}

export interface EntityStateInsert {
  readonly tenantId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly currentState: string;
  readonly stateMachineId: string;
  readonly scopeType?: string;
  readonly scopeId?: string;
}

/** Marks a transition_request consumed by a successful approved-workflow execution. */
export interface MarkTransitionRequestExecutedInput {
  readonly transitionRequestId: string;
  readonly executedByUserId: string;
  readonly executedAtIso: string;
  readonly executionStateTransitionId: string;
}

// -----------------------------------------------------------------------------
// Transaction port — all governed table access happens through this within a
// single DB transaction with tenant context (RLS) already applied.
// -----------------------------------------------------------------------------

export interface GovernanceTx {
  /**
   * Acquire a TRANSACTION-SCOPED PostgreSQL advisory lock (`pg_advisory_xact_lock`) on the
   * governed transaction's own connection, keyed by an opaque string. The lock is held for
   * the remainder of the transaction and released automatically on COMMIT or ROLLBACK — so it
   * serializes concurrent governed transitions that share the same key while remaining bound
   * to the SAME transaction as the authoritative state mutation and outbox enqueue.
   *
   * The kernel is domain-agnostic: it only acquires whatever opaque keys a registered
   * {@link TransitionSerializationKeyResolver} returns. The in-memory store implements this as
   * a no-op (its transactions are not truly concurrent); the concurrency invariant is proven
   * against PostgreSQL. Keys MUST be globally unique across tenants (advisory locks are
   * cluster-global) — include the tenant id in the key.
   */
  acquireSerializationLock(key: string): Promise<void>;

  /** Resolve the active state machine for an entity type (global or tenant). */
  loadActiveStateMachine(entityType: string): Promise<StateMachineRow | undefined>;

  /** Lock the entity_state row FOR UPDATE; undefined if it does not exist yet. */
  lockEntityState(entityType: string, entityId: string): Promise<EntityStateRow | undefined>;

  /** Resolve a transition definition by (machine, from_state, trigger). */
  resolveTransition(
    stateMachineId: string,
    fromState: string,
    trigger: string,
  ): Promise<TransitionDefinitionRow | undefined>;

  /** Load ordered guard bindings for a transition definition. */
  loadGuards(transitionDefinitionId: string): Promise<TransitionGuardRow[]>;

  /** In-transaction idempotency re-check: an executed transition with this key. */
  findStateTransition(
    entityType: string,
    entityId: string,
    idempotencyKey: string,
  ): Promise<ExistingTransitionRow | undefined>;

  /** In-transaction idempotency re-check: a transition request with this key. */
  findTransitionRequest(
    entityType: string,
    entityId: string,
    idempotencyKey: string,
  ): Promise<ExistingRequestRow | undefined>;

  /**
   * Lock a transition_request by id FOR UPDATE (serializes concurrent execution attempts).
   * Returns undefined when no request with that id exists for the current tenant. Carries the
   * original payload/actor so execution can re-run guards against the recorded intent.
   */
  lockTransitionRequestById(
    transitionRequestId: string,
  ): Promise<TransitionRequestForExecutionRow | undefined>;

  /** Resolve the review workflow approval state bound to a transition request (execution gate). */
  findWorkflowApprovalForRequest(
    transitionRequestId: string,
  ): Promise<WorkflowApprovalStatusRow | undefined>;

  insertGuardResults(results: readonly GuardResultInsert[]): Promise<void>;

  insertTransitionRequest(input: TransitionRequestInsert): Promise<string>;

  insertEntityState(input: EntityStateInsert): Promise<void>;

  updateEntityState(entityStateId: string, toState: string, actorUserId: string): Promise<void>;

  insertStateTransition(input: StateTransitionInsert): Promise<string>;

  insertAuditEvent(input: AuditEventInput): Promise<string>;

  insertEvidenceObject(input: EvidenceObjectInsert): Promise<string>;

  insertOutboxMessage(input: OutboxMessageInsert): Promise<string>;

  /** Mark a transition_request as executed (consumed) by an approved-workflow execution. */
  markTransitionRequestExecuted(input: MarkTransitionRequestExecutedInput): Promise<void>;

  /**
   * Create the review workflow instance for an approval-required transition request, in the
   * same transaction. Returns the new workflow instance id. (Two-tier review METADATA — does
   * not affect entity_state.)
   */
  insertWorkflowInstance(input: WorkflowInstanceInsert): Promise<string>;

  /** Insert the ordered review steps for a workflow instance, in the same transaction. */
  insertWorkflowSteps(inputs: readonly WorkflowStepInsert[]): Promise<void>;
}

// -----------------------------------------------------------------------------
// Store port — owns the transaction boundary and the fast (pre-txn) idempotency
// lookup.
// -----------------------------------------------------------------------------

export interface GovernanceStore {
  /**
   * Fast idempotency lookup performed OUTSIDE the transaction. Returns a prior executed
   * transition or recorded request for this idempotency key, if any. The kernel re-checks
   * inside the transaction as well.
   */
  findExistingResult(
    tenantId: string,
    entityType: string,
    entityId: string,
    idempotencyKey: string,
  ): Promise<
    | { readonly kind: 'transition'; readonly row: ExistingTransitionRow }
    | { readonly kind: 'request'; readonly row: ExistingRequestRow }
    | undefined
  >;

  /** Run `fn` inside a transaction with tenant context (RLS) applied. */
  runInTransaction<T>(tenantId: string, fn: (tx: GovernanceTx) => Promise<T>): Promise<T>;
}

// -----------------------------------------------------------------------------
// Transition serialization port — domain-supplied concurrency keys the kernel
// locks (transaction-scoped) before evaluating guards and mutating state.
// -----------------------------------------------------------------------------

/** The transition being resolved, as seen by a serialization-key resolver. */
export interface TransitionSerializationInput {
  readonly tenantId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly trigger: string;
  readonly fromState: string;
  readonly toState: string;
}

/**
 * Resolves the transaction-scoped advisory lock keys that must be acquired before a governed
 * transition evaluates its guards and mutates state. This is the seam that lets a DOMAIN
 * declare a concurrency-serialization scope (e.g. "one ACTIVE affiliation standing per
 * tenant + subject + season") WITHOUT the domain-agnostic kernel knowing the domain's rules.
 *
 * Registered per entity type on the kernel. Implementations MUST be read-only and
 * deterministic: the same transition resolves to the same key(s). Returning an empty array
 * means "no serialization required for this transition". Keys must incorporate the tenant id
 * (advisory locks are cluster-global). Derive keys only from IMMUTABLE facts so that two
 * racing transitions for the same governed scope compute an identical key.
 */
export interface TransitionSerializationKeyResolver {
  resolveKeys(input: TransitionSerializationInput): Promise<readonly string[]>;
}

// -----------------------------------------------------------------------------
// Permission port
// -----------------------------------------------------------------------------

export interface PermissionDecision {
  readonly allowed: boolean;
  readonly reasonCode?: string;
  readonly reasonMessage?: string;
}

export interface PermissionChecker {
  check(input: {
    readonly actor: TransitionActor;
    readonly entityType: string;
    readonly trigger: string;
    readonly riskLevel: 'low' | 'high';
    readonly approvalRequired: boolean;
  }): PermissionDecision;
}

// -----------------------------------------------------------------------------
// Shared helper type
// -----------------------------------------------------------------------------

export type { GuardEvaluationResult };
