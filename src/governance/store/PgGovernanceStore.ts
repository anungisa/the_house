/**
 * PostgreSQL GovernanceStore (integration).
 *
 * Runs the governed transaction with tenant context applied (RLS enforced). All governed
 * table writes happen through the same transaction client, including the outbox enqueue,
 * so the transactional-outbox invariant holds.
 *
 * Used by gated integration tests (RUN_DB_TESTS / DATABASE_URL). Unit tests use the
 * in-memory store.
 */

import { withTenantTransaction, type QueryClient } from '../../db/pool.js';
import type { AuditEventInput } from '../types/TransitionTypes.js';
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
import type { WorkflowInstanceInsert, WorkflowStepInsert } from '../workflow/WorkflowTypes.js';

export class PgGovernanceStore implements GovernanceStore {
  async findExistingResult(
    tenantId: string,
    entityType: string,
    entityId: string,
    idempotencyKey: string,
  ): Promise<
    | { readonly kind: 'transition'; readonly row: ExistingTransitionRow }
    | { readonly kind: 'request'; readonly row: ExistingRequestRow }
    | undefined
  > {
    return withTenantTransaction(tenantId, async (client) => {
      const tx = new PgGovernanceTx(client);
      const t = await tx.findStateTransition(entityType, entityId, idempotencyKey);
      if (t !== undefined) return { kind: 'transition', row: t } as const;
      const req = await tx.findTransitionRequest(entityType, entityId, idempotencyKey);
      if (req !== undefined) return { kind: 'request', row: req } as const;
      return undefined;
    });
  }

  runInTransaction<T>(tenantId: string, fn: (tx: GovernanceTx) => Promise<T>): Promise<T> {
    return withTenantTransaction(tenantId, (client) => fn(new PgGovernanceTx(client)));
  }
}

class PgGovernanceTx implements GovernanceTx {
  constructor(private readonly client: QueryClient) {}

  async loadActiveStateMachine(entityType: string): Promise<StateMachineRow | undefined> {
    const rows = await this.client.query<{
      id: string;
      policy_version_id: string;
      entity_type: string;
      version: number;
      initial_state: string;
    }>(
      `SELECT sm.id, sm.policy_version_id, sm.entity_type, sm.version,
              (SELECT sn.name FROM governance.state_node sn
                 WHERE sn.state_machine_id = sm.id AND sn.is_initial = true
                 LIMIT 1) AS initial_state
         FROM governance.state_machine sm
        WHERE sm.entity_type = $1 AND sm.status = 'active'
        ORDER BY sm.version DESC
        LIMIT 1`,
      [entityType],
    );
    const r = rows[0];
    if (r === undefined) return undefined;
    return {
      id: r.id,
      policyVersionId: r.policy_version_id,
      entityType: r.entity_type,
      version: r.version,
      initialState: r.initial_state,
    };
  }

  async lockEntityState(
    entityType: string,
    entityId: string,
  ): Promise<EntityStateRow | undefined> {
    const rows = await this.client.query<{
      id: string;
      tenant_id: string;
      entity_type: string;
      entity_id: string;
      current_state: string;
      state_machine_id: string;
    }>(
      `SELECT id, tenant_id, entity_type, entity_id, current_state, state_machine_id
         FROM governance.entity_state
        WHERE entity_type = $1 AND entity_id = $2
        FOR UPDATE`,
      [entityType, entityId],
    );
    const r = rows[0];
    if (r === undefined) return undefined;
    return {
      id: r.id,
      tenantId: r.tenant_id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      currentState: r.current_state,
      stateMachineId: r.state_machine_id,
    };
  }

  async resolveTransition(
    stateMachineId: string,
    fromState: string,
    trigger: string,
  ): Promise<TransitionDefinitionRow | undefined> {
    const rows = await this.client.query<{
      id: string;
      state_machine_id: string;
      trigger: string;
      from_state: string;
      to_state: string;
      risk_level: 'low' | 'high';
      evidence_required: boolean;
      approval_required: boolean;
    }>(
      `SELECT id, state_machine_id, trigger, from_state, to_state,
              risk_level, evidence_required, approval_required
         FROM governance.transition_definition
        WHERE state_machine_id = $1 AND from_state = $2 AND trigger = $3
        LIMIT 1`,
      [stateMachineId, fromState, trigger],
    );
    const r = rows[0];
    if (r === undefined) return undefined;
    return {
      id: r.id,
      stateMachineId: r.state_machine_id,
      trigger: r.trigger,
      fromState: r.from_state,
      toState: r.to_state,
      riskLevel: r.risk_level,
      evidenceRequired: r.evidence_required,
      approvalRequired: r.approval_required,
    };
  }

  async loadGuards(transitionDefinitionId: string): Promise<TransitionGuardRow[]> {
    const rows = await this.client.query<{
      guard_code: string;
      parameters: Record<string, unknown>;
      sort_order: number;
    }>(
      `SELECT guard_code, parameters, sort_order
         FROM governance.transition_guard
        WHERE transition_definition_id = $1
        ORDER BY sort_order ASC`,
      [transitionDefinitionId],
    );
    return rows.map((r) => ({
      guardCode: r.guard_code,
      parameters: r.parameters ?? {},
      sortOrder: r.sort_order,
    }));
  }

  async findStateTransition(
    entityType: string,
    entityId: string,
    idempotencyKey: string,
  ): Promise<ExistingTransitionRow | undefined> {
    const rows = await this.client.query<{
      id: string;
      from_state: string;
      to_state: string;
      trigger: string;
      idempotency_key: string;
    }>(
      `SELECT id, from_state, to_state, trigger, idempotency_key
         FROM governance.state_transition
        WHERE entity_type = $1 AND entity_id = $2 AND idempotency_key = $3
        LIMIT 1`,
      [entityType, entityId, idempotencyKey],
    );
    const r = rows[0];
    if (r === undefined) return undefined;
    return {
      id: r.id,
      fromState: r.from_state,
      toState: r.to_state,
      trigger: r.trigger,
      idempotencyKey: r.idempotency_key,
    };
  }

  async findTransitionRequest(
    entityType: string,
    entityId: string,
    idempotencyKey: string,
  ): Promise<ExistingRequestRow | undefined> {
    const rows = await this.client.query<{
      id: string;
      from_state: string;
      requested_to_state: string;
      trigger: string;
      idempotency_key: string;
      status: string;
    }>(
      `SELECT id, from_state, requested_to_state, trigger, idempotency_key, status
         FROM governance.transition_request
        WHERE entity_type = $1 AND entity_id = $2 AND idempotency_key = $3
        LIMIT 1`,
      [entityType, entityId, idempotencyKey],
    );
    const r = rows[0];
    if (r === undefined) return undefined;
    return {
      id: r.id,
      fromState: r.from_state,
      requestedToState: r.requested_to_state,
      trigger: r.trigger,
      idempotencyKey: r.idempotency_key,
      status: r.status,
    };
  }

  async insertGuardResults(results: readonly GuardResultInsert[]): Promise<void> {
    for (const g of results) {
      await this.client.query(
        `INSERT INTO governance.transition_guard_result
           (tenant_id, entity_type, entity_id, trigger, idempotency_key, guard_code,
            passed, failure_message, state_transition_id, transition_request_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          g.tenantId,
          g.entityType,
          g.entityId,
          g.trigger,
          g.idempotencyKey,
          g.guardCode,
          g.passed,
          g.failureMessage ?? null,
          g.stateTransitionId ?? null,
          g.transitionRequestId ?? null,
        ],
      );
    }
  }

  async insertTransitionRequest(input: TransitionRequestInsert): Promise<string> {
    const rows = await this.client.query<{ id: string }>(
      `INSERT INTO governance.transition_request
         (tenant_id, entity_type, entity_id, trigger, from_state, requested_to_state,
          idempotency_key, status, actor_user_id, workflow_ref, correlation_id,
          causation_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_approval',$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        input.tenantId,
        input.entityType,
        input.entityId,
        input.trigger,
        input.fromState,
        input.requestedToState,
        input.idempotencyKey,
        input.actorUserId,
        JSON.stringify(input.workflowRef),
        input.correlationId ?? null,
        input.causationId ?? null,
        JSON.stringify(input.payload),
      ],
    );
    return rows[0]!.id;
  }

  async insertEntityState(input: EntityStateInsert): Promise<void> {
    await this.client.query(
      `INSERT INTO governance.entity_state
         (tenant_id, entity_type, entity_id, current_state, state_machine_id,
          scope_type, scope_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.tenantId,
        input.entityType,
        input.entityId,
        input.currentState,
        input.stateMachineId,
        input.scopeType ?? null,
        input.scopeId ?? null,
      ],
    );
  }

  async updateEntityState(
    entityStateId: string,
    toState: string,
    actorUserId: string,
  ): Promise<void> {
    await this.client.query(
      `UPDATE governance.entity_state
          SET current_state = $2, updated_at = now(), updated_by = $3
        WHERE id = $1`,
      [entityStateId, toState, actorUserId],
    );
  }

  async insertStateTransition(input: StateTransitionInsert): Promise<string> {
    const rows = await this.client.query<{ id: string }>(
      `INSERT INTO governance.state_transition
         (tenant_id, entity_type, entity_id, trigger, from_state, to_state,
          idempotency_key, state_machine_id, policy_version_id, transition_request_id,
          actor_user_id, correlation_id, causation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        input.tenantId,
        input.entityType,
        input.entityId,
        input.trigger,
        input.fromState,
        input.toState,
        input.idempotencyKey,
        input.stateMachineId,
        input.policyVersionId,
        input.transitionRequestId ?? null,
        input.actorUserId,
        input.correlationId ?? null,
        input.causationId ?? null,
      ],
    );
    return rows[0]!.id;
  }

  async insertAuditEvent(input: AuditEventInput): Promise<string> {
    const rows = await this.client.query<{ id: string }>(
      `INSERT INTO governance.audit_event
         (tenant_id, entity_type, entity_id, action, trigger, from_state, to_state,
          actor_user_id, correlation_id, causation_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        input.tenantId,
        input.entityType,
        input.entityId,
        input.action,
        input.trigger,
        input.fromState ?? null,
        input.toState ?? null,
        input.actorId,
        input.correlationId ?? null,
        input.causationId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return rows[0]!.id;
  }

  async insertEvidenceObject(input: EvidenceObjectInsert): Promise<string> {
    const rows = await this.client.query<{ id: string }>(
      `INSERT INTO governance.evidence_object
         (tenant_id, entity_type, entity_id, trigger, state_transition_id, manifest,
          content_hash, storage_ref, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        input.tenantId,
        input.entityType,
        input.entityId,
        input.trigger,
        input.stateTransitionId,
        JSON.stringify(input.manifest),
        input.contentHash ?? null,
        input.storageRef ?? null,
        input.createdBy,
      ],
    );
    return rows[0]!.id;
  }

  async insertOutboxMessage(input: OutboxMessageInsert): Promise<string> {
    const rows = await this.client.query<{ id: string }>(
      `INSERT INTO governance.outbox_message
         (tenant_id, message_type, payload, status, max_retries, dedupe_key,
          correlation_id, causation_id)
       VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)
       RETURNING id`,
      [
        input.tenantId,
        input.messageType,
        JSON.stringify(input.payload),
        input.maxRetries,
        input.dedupeKey,
        input.correlationId ?? null,
        input.causationId ?? null,
      ],
    );
    return rows[0]!.id;
  }

  async insertWorkflowInstance(input: WorkflowInstanceInsert): Promise<string> {
    const rows = await this.client.query<{ id: string }>(
      `INSERT INTO governance.workflow_instance
         (tenant_id, transition_request_id, entity_type, entity_id, workflow_type,
          status, current_step_code)
       VALUES ($1,$2,$3,$4,$5,'pending',$6)
       RETURNING id`,
      [
        input.tenantId,
        input.transitionRequestId,
        input.entityType,
        input.entityId,
        input.workflowType,
        input.currentStepCode ?? null,
      ],
    );
    return rows[0]!.id;
  }

  async insertWorkflowSteps(inputs: readonly WorkflowStepInsert[]): Promise<void> {
    for (const s of inputs) {
      await this.client.query(
        `INSERT INTO governance.workflow_step
           (tenant_id, workflow_instance_id, step_code, step_order, review_tier,
            required, status, assigned_scope_type, assigned_scope_id, assigned_role_key)
         VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9)`,
        [
          s.tenantId,
          s.workflowInstanceId,
          s.stepCode,
          s.stepOrder,
          s.reviewTier,
          s.required,
          s.assignedScopeType ?? null,
          s.assignedScopeId ?? null,
          s.assignedRoleKey ?? null,
        ],
      );
    }
  }
}
