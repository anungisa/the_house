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
  WorkflowListFilter,
  WorkflowListResult,
  WorkflowStepDecisionUpdate,
  WorkflowStore,
  WorkflowTx,
} from './WorkflowStore.js';
import { WORKFLOW_LIST_DEFAULT_LIMIT, WORKFLOW_LIST_MAX_LIMIT } from './WorkflowStore.js';
import type {
  WorkflowDetailView,
  WorkflowInstanceSummaryView,
  WorkflowInstanceView,
  WorkflowStepView,
} from './WorkflowTypes.js';

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

/**
 * Summary row: instance columns + timestamps + an `executed` flag derived from the governing
 * transition request (LEFT JOIN, so a missing request reports executed = false rather than
 * dropping the row).
 */
type SummaryRow = InstanceRow & {
  created_at: string;
  updated_at: string;
  executed: boolean;
};

const SUMMARY_COLUMNS = `wi.id, wi.tenant_id, wi.transition_request_id, wi.entity_type,
  wi.entity_id, wi.workflow_type, wi.status, wi.current_step_code, wi.created_at, wi.updated_at,
  COALESCE(tr.status = 'executed', false) AS executed`;

function clampLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return WORKFLOW_LIST_DEFAULT_LIMIT;
  const floored = Math.floor(requested);
  if (floored < 1) return 1;
  if (floored > WORKFLOW_LIST_MAX_LIMIT) return WORKFLOW_LIST_MAX_LIMIT;
  return floored;
}

function toSummaryView(r: SummaryRow): WorkflowInstanceSummaryView {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    transitionRequestId: r.transition_request_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    workflowType: r.workflow_type,
    status: r.status,
    ...(r.current_step_code !== null ? { currentStepCode: r.current_step_code } : {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    executed: r.executed,
  };
}

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

  listWorkflows(tenantId: string, filter: WorkflowListFilter): Promise<WorkflowListResult> {
    const limit = clampLimit(filter.limit);
    return withTenantTransaction(tenantId, async (client) => {
      const conditions: string[] = [];
      const params: unknown[] = [];
      const add = (sql: (idx: number) => string, value: unknown): void => {
        params.push(value);
        conditions.push(sql(params.length));
      };
      if (filter.status !== undefined) add((i) => `wi.status = $${i}`, filter.status);
      if (filter.entityType !== undefined) add((i) => `wi.entity_type = $${i}`, filter.entityType);
      if (filter.entityId !== undefined) add((i) => `wi.entity_id = $${i}`, filter.entityId);
      if (filter.reviewTier !== undefined) {
        add(
          (i) =>
            `EXISTS (SELECT 1 FROM governance.workflow_step ws
               WHERE ws.workflow_instance_id = wi.id AND ws.review_tier = $${i})`,
          filter.reviewTier,
        );
      }
      if (filter.assignedRoleKey !== undefined) {
        add(
          (i) =>
            `EXISTS (SELECT 1 FROM governance.workflow_step ws
               WHERE ws.workflow_instance_id = wi.id AND ws.assigned_role_key = $${i})`,
          filter.assignedRoleKey,
        );
      }
      if (filter.cursor !== undefined) {
        params.push(filter.cursor.createdAt);
        const cIdx = params.length;
        params.push(filter.cursor.id);
        const idIdx = params.length;
        conditions.push(`(wi.created_at, wi.id) > ($${cIdx}, $${idIdx})`);
      }
      params.push(limit);
      const limitIdx = params.length;
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await client.query<SummaryRow>(
        `SELECT ${SUMMARY_COLUMNS}
           FROM governance.workflow_instance wi
           LEFT JOIN governance.transition_request tr ON tr.id = wi.transition_request_id
           ${where}
          ORDER BY wi.created_at ASC, wi.id ASC
          LIMIT $${limitIdx}`,
        params,
      );
      const items = rows.map(toSummaryView);
      const last = rows[rows.length - 1];
      const hasMore = rows.length === limit && last !== undefined;
      return {
        items,
        ...(hasMore && last !== undefined
          ? { nextCursor: { createdAt: last.created_at, id: last.id } }
          : {}),
      };
    });
  }

  getWorkflowDetail(
    tenantId: string,
    workflowInstanceId: string,
  ): Promise<WorkflowDetailView | undefined> {
    return withTenantTransaction(tenantId, async (client) => {
      const instanceRows = await client.query<SummaryRow>(
        `SELECT ${SUMMARY_COLUMNS}
           FROM governance.workflow_instance wi
           LEFT JOIN governance.transition_request tr ON tr.id = wi.transition_request_id
          WHERE wi.id = $1 LIMIT 1`,
        [workflowInstanceId],
      );
      const inst = instanceRows[0];
      if (inst === undefined) return undefined;
      const stepRows = await client.query<StepRow>(
        `SELECT ${STEP_COLUMNS} FROM governance.workflow_step
          WHERE workflow_instance_id = $1 ORDER BY step_order ASC`,
        [workflowInstanceId],
      );
      return { instance: toSummaryView(inst), steps: stepRows.map(toStepView) };
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
