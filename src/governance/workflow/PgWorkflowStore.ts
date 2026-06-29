/**
 * PostgreSQL WorkflowStore (integration).
 *
 * Reads and decision recording run with tenant context applied (RLS enforced). Recording a
 * decision locks the workflow_instance row FOR UPDATE so concurrent decisions on the same
 * workflow serialize. Never mutates governance entity_state and never executes a transition.
 *
 * Used by gated integration tests (RUN_DB_TESTS / DATABASE_URL). Unit tests use the
 * in-memory store.
 */

import { withTenantTransaction, type QueryClient } from '../../db/pool.js';
import type {
  WorkflowDecisionInsert,
  WorkflowInstanceProgressUpdate,
  WorkflowStepDecisionUpdate,
  WorkflowStore,
  WorkflowTx,
} from './WorkflowStore.js';
import type { WorkflowInstanceView, WorkflowStepView } from './WorkflowTypes.js';

type InstanceRow = {
  id: string;
  tenant_id: string;
  transition_request_id: string;
  entity_type: string;
  entity_id: string;
  workflow_type: string;
  status: WorkflowInstanceView['status'];
  current_step_code: string | null;
};

type StepRow = {
  id: string;
  tenant_id: string;
  workflow_instance_id: string;
  step_code: string;
  step_order: number;
  review_tier: WorkflowStepView['reviewTier'];
  required: boolean;
  status: WorkflowStepView['status'];
  assigned_scope_type: string | null;
  assigned_scope_id: string | null;
  assigned_role_key: string | null;
  decided_by_user_id: string | null;
  decided_at: string | null;
  decision_reason: string | null;
};

const INSTANCE_COLUMNS = `id, tenant_id, transition_request_id, entity_type, entity_id,
  workflow_type, status, current_step_code`;

const STEP_COLUMNS = `id, tenant_id, workflow_instance_id, step_code, step_order, review_tier,
  required, status, assigned_scope_type, assigned_scope_id, assigned_role_key,
  decided_by_user_id, decided_at, decision_reason`;

function toInstanceView(r: InstanceRow): WorkflowInstanceView {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    transitionRequestId: r.transition_request_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    workflowType: r.workflow_type,
    status: r.status,
    ...(r.current_step_code !== null ? { currentStepCode: r.current_step_code } : {}),
  };
}

function toStepView(r: StepRow): WorkflowStepView {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    workflowInstanceId: r.workflow_instance_id,
    stepCode: r.step_code,
    stepOrder: r.step_order,
    reviewTier: r.review_tier,
    required: r.required,
    status: r.status,
    ...(r.assigned_scope_type !== null ? { assignedScopeType: r.assigned_scope_type } : {}),
    ...(r.assigned_scope_id !== null ? { assignedScopeId: r.assigned_scope_id } : {}),
    ...(r.assigned_role_key !== null ? { assignedRoleKey: r.assigned_role_key } : {}),
    ...(r.decided_by_user_id !== null ? { decidedByUserId: r.decided_by_user_id } : {}),
    ...(r.decided_at !== null ? { decidedAt: r.decided_at } : {}),
    ...(r.decision_reason !== null ? { decisionReason: r.decision_reason } : {}),
  };
}

export class PgWorkflowStore implements WorkflowStore {
  getInstanceByTransitionRequestId(
    tenantId: string,
    transitionRequestId: string,
  ): Promise<WorkflowInstanceView | undefined> {
    return withTenantTransaction(tenantId, async (client) => {
      const rows = await client.query<InstanceRow>(
        `SELECT ${INSTANCE_COLUMNS} FROM governance.workflow_instance
          WHERE transition_request_id = $1 LIMIT 1`,
        [transitionRequestId],
      );
      const r = rows[0];
      return r === undefined ? undefined : toInstanceView(r);
    });
  }

  getInstance(
    tenantId: string,
    workflowInstanceId: string,
  ): Promise<WorkflowInstanceView | undefined> {
    return withTenantTransaction(tenantId, async (client) => {
      const rows = await client.query<InstanceRow>(
        `SELECT ${INSTANCE_COLUMNS} FROM governance.workflow_instance WHERE id = $1 LIMIT 1`,
        [workflowInstanceId],
      );
      const r = rows[0];
      return r === undefined ? undefined : toInstanceView(r);
    });
  }

  getSteps(tenantId: string, workflowInstanceId: string): Promise<WorkflowStepView[]> {
    return withTenantTransaction(tenantId, async (client) => {
      const rows = await client.query<StepRow>(
        `SELECT ${STEP_COLUMNS} FROM governance.workflow_step
          WHERE workflow_instance_id = $1 ORDER BY step_order ASC`,
        [workflowInstanceId],
      );
      return rows.map(toStepView);
    });
  }

  runInTransaction<T>(tenantId: string, fn: (tx: WorkflowTx) => Promise<T>): Promise<T> {
    return withTenantTransaction(tenantId, (client) => fn(new PgWorkflowTx(client)));
  }
}

class PgWorkflowTx implements WorkflowTx {
  constructor(private readonly client: QueryClient) {}

  async lockInstance(workflowInstanceId: string): Promise<WorkflowInstanceView | undefined> {
    const rows = await this.client.query<InstanceRow>(
      `SELECT ${INSTANCE_COLUMNS} FROM governance.workflow_instance
        WHERE id = $1 FOR UPDATE`,
      [workflowInstanceId],
    );
    const r = rows[0];
    return r === undefined ? undefined : toInstanceView(r);
  }

  async getSteps(workflowInstanceId: string): Promise<WorkflowStepView[]> {
    const rows = await this.client.query<StepRow>(
      `SELECT ${STEP_COLUMNS} FROM governance.workflow_step
        WHERE workflow_instance_id = $1 ORDER BY step_order ASC`,
      [workflowInstanceId],
    );
    return rows.map(toStepView);
  }

  async applyStepDecision(update: WorkflowStepDecisionUpdate): Promise<void> {
    await this.client.query(
      `UPDATE governance.workflow_step
          SET status = $2, decided_by_user_id = $3, decided_at = $4,
              decision_reason = $5, updated_at = now()
        WHERE id = $1`,
      [
        update.stepId,
        update.status,
        update.decidedByUserId,
        update.decidedAt,
        update.decisionReason ?? null,
      ],
    );
  }

  async insertDecision(input: WorkflowDecisionInsert): Promise<string> {
    const rows = await this.client.query<{ id: string }>(
      `INSERT INTO governance.workflow_decision
         (tenant_id, workflow_step_id, decision, decided_by_user_id, reason)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [
        input.tenantId,
        input.workflowStepId,
        input.decision,
        input.decidedByUserId,
        input.reason ?? null,
      ],
    );
    return rows[0]!.id;
  }

  async updateInstanceProgress(update: WorkflowInstanceProgressUpdate): Promise<void> {
    await this.client.query(
      `UPDATE governance.workflow_instance
          SET status = $2, current_step_code = $3, updated_at = now()
        WHERE id = $1`,
      [update.instanceId, update.status, update.currentStepCode],
    );
  }
}
