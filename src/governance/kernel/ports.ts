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

// -----------------------------------------------------------------------------
// Transaction port — all governed table access happens through this within a
// single DB transaction with tenant context (RLS) already applied.
// -----------------------------------------------------------------------------

export interface GovernanceTx {
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

  insertGuardResults(results: readonly GuardResultInsert[]): Promise<void>;

  insertTransitionRequest(input: TransitionRequestInsert): Promise<string>;

  insertEntityState(input: EntityStateInsert): Promise<void>;

  updateEntityState(entityStateId: string, toState: string, actorUserId: string): Promise<void>;

  insertStateTransition(input: StateTransitionInsert): Promise<string>;

  insertAuditEvent(input: AuditEventInput): Promise<void>;

  insertEvidenceObject(input: EvidenceObjectInsert): Promise<string>;

  insertOutboxMessage(input: OutboxMessageInsert): Promise<string>;
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
