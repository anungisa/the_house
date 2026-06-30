/**
 * Workflow admin/operator READ HTTP adapter — protocol-pure list + detail handlers.
 *
 * These are THIN, READ-ONLY transport adapters over the workflow read store. They let an
 * authorized operator list pending review work and inspect a single workflow, including an
 * execution-readiness HINT. They perform NO writes whatsoever.
 *
 * Architectural boundaries (DO NOT violate — these keep the kernel authoritative):
 *  - Read-only: they NEVER mutate governance.entity_state, NEVER record decisions, and NEVER
 *    execute a transition. The execution-readiness field is an operational hint only and never
 *    triggers execution (see WorkflowExecutionReadiness).
 *  - Their only collaborator is a narrow {@link WorkflowReadStore} port (list + detail). They
 *    never reach the kernel/decision service and never bypass RLS — the Pg store applies tenant
 *    context per read.
 *  - Tenant comes EXCLUSIVELY from the resolved {@link AuthContext}. Query/path inputs never
 *    carry identity; any tenantId in the query is IGNORED.
 *  - Authorization is enforced by the centralized policy (src/authz): the actor must be
 *    authorized for the `workflow.read` action. The policy is the single source of truth for
 *    role/permission mappings.
 */

import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import { assertAuthorized, AuthorizationAction } from '../../authz/index.js';
import {
  NOOP_TELEMETRY,
  TelemetryAttributeKeys,
  TelemetryCounters,
  TelemetryResult,
  type Telemetry,
} from '../../observability/index.js';
import type { AuthContextResolver } from '../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../auth/DemoAuthContextResolver.js';
import { requireTenant, resolveWorkflowAuth } from './workflowHttpAuth.js';
import type {
  WorkflowListCursor,
  WorkflowListFilter,
  WorkflowReadStore,
} from '../../governance/workflow/WorkflowStore.js';
import type {
  WorkflowInstanceStatus,
  WorkflowInstanceSummaryView,
  WorkflowReviewTier,
} from '../../governance/workflow/WorkflowTypes.js';
import {
  computeWorkflowExecutionReadiness,
  deriveReadinessStatus,
} from '../../governance/workflow/WorkflowExecutionReadiness.js';
import type {
  WorkflowDetailHttpRequest,
  WorkflowDetailResponseBody,
  WorkflowExecutionHintDto,
  WorkflowListHttpRequest,
  WorkflowListResponseBody,
  WorkflowSummaryDto,
} from './WorkflowReadHttpDtos.js';

/** Default resolver mirrors the other workflow adapters: demo identity unless one is supplied. */
const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

const VALID_STATUSES: readonly WorkflowInstanceStatus[] = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
];
const VALID_REVIEW_TIERS: readonly WorkflowReviewTier[] = ['regional_review', 'national_review'];

/** Dependencies for the read adapter: just the narrow read store. */
export interface WorkflowReadHttpDeps {
  readonly readStore: WorkflowReadStore;
  /**
   * Optional telemetry sink. Emits a `workflow.read.count` counter tagged with the operation
   * (list/detail) and result (success/failure). Visibility only — never affects reads or auth.
   */
  readonly telemetry?: Telemetry;
}

/** Protocol-pure result: an HTTP status code and a JSON-serializable body. */
export interface WorkflowReadHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

/** Encode a keyset cursor as an opaque base64url token. */
function encodeCursor(cursor: WorkflowListCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Decode an opaque cursor token; throws INVALID_INPUT when malformed. */
function decodeCursor(token: string): WorkflowListCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw new AppError(ErrorCode.INVALID_INPUT, 'cursor is not a valid pagination token.');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['createdAt'] !== 'string' ||
    typeof (parsed as Record<string, unknown>)['id'] !== 'string'
  ) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'cursor is not a valid pagination token.');
  }
  const p = parsed as { createdAt: string; id: string };
  return { createdAt: p.createdAt, id: p.id };
}

/** Parse and validate the list query into a store filter. Throws INVALID_INPUT on bad input. */
function parseListFilter(query: Readonly<Record<string, string | undefined>>): WorkflowListFilter {
  const filter: {
    status?: WorkflowInstanceStatus;
    entityType?: string;
    entityId?: string;
    reviewTier?: WorkflowReviewTier;
    assignedRoleKey?: string;
    limit?: number;
    cursor?: WorkflowListCursor;
  } = {};

  const status = query['status'];
  if (status !== undefined && status !== '') {
    if (!VALID_STATUSES.includes(status as WorkflowInstanceStatus)) {
      throw new AppError(ErrorCode.INVALID_INPUT, `status must be one of: ${VALID_STATUSES.join(', ')}.`);
    }
    filter.status = status as WorkflowInstanceStatus;
  }

  const reviewTier = query['reviewTier'];
  if (reviewTier !== undefined && reviewTier !== '') {
    if (!VALID_REVIEW_TIERS.includes(reviewTier as WorkflowReviewTier)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `reviewTier must be one of: ${VALID_REVIEW_TIERS.join(', ')}.`,
      );
    }
    filter.reviewTier = reviewTier as WorkflowReviewTier;
  }

  const entityType = query['entityType'];
  if (entityType !== undefined && entityType.trim() !== '') filter.entityType = entityType.trim();

  const entityId = query['entityId'];
  if (entityId !== undefined && entityId.trim() !== '') filter.entityId = entityId.trim();

  const assignedRoleKey = query['assignedRoleKey'];
  if (assignedRoleKey !== undefined && assignedRoleKey.trim() !== '') {
    filter.assignedRoleKey = assignedRoleKey.trim();
  }

  const limitRaw = query['limit'];
  if (limitRaw !== undefined && limitRaw !== '') {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'limit must be a positive integer.');
    }
    filter.limit = parsed;
  }

  const cursorRaw = query['cursor'];
  if (cursorRaw !== undefined && cursorRaw !== '') filter.cursor = decodeCursor(cursorRaw);

  return filter;
}

/** Compute the execution-readiness hint for a summary (derives the executed status first). */
function executionHint(summary: WorkflowInstanceSummaryView): WorkflowExecutionHintDto {
  const readiness = computeWorkflowExecutionReadiness(
    deriveReadinessStatus(summary.status, summary.executed),
  );
  return { executable: readiness.executable, reason: readiness.reason };
}

function toSummaryDto(summary: WorkflowInstanceSummaryView): WorkflowSummaryDto {
  return {
    workflowInstanceId: summary.id,
    transitionRequestId: summary.transitionRequestId,
    entityType: summary.entityType,
    entityId: summary.entityId,
    workflowType: summary.workflowType,
    status: summary.status,
    currentStepCode: summary.currentStepCode ?? null,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    execution: executionHint(summary),
  };
}

/** Map the read code to an HTTP status. Read surface: no 409 (no concurrency mutation). */
function readAppErrorStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.INVALID_INPUT:
      return 400;
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.FORBIDDEN:
    case ErrorCode.PERMISSION_DENIED:
      return 403;
    case ErrorCode.WORKFLOW_NOT_FOUND:
      return 404;
    default:
      return 500;
  }
}

/** Translate any error into a safe HTTP result; unknown errors collapse to an opaque 500. */
export function workflowReadErrorToHttpResult(
  err: unknown,
  requestId: string,
): WorkflowReadHttpResult {
  if (err instanceof AppError) {
    return {
      status: readAppErrorStatus(err.code),
      body: { status: 'error', code: err.code, message: err.message, requestId },
    };
  }
  return {
    status: 500,
    body: { status: 'error', code: 'INTERNAL', message: 'Internal server error.', requestId },
  };
}

/**
 * Handle GET /v1/workflows — list workflow summaries for the authenticated tenant.
 *
 * Flow: resolve identity (tenant from auth, never the query) → enforce the v1 read gate →
 * parse + validate filters → call {@link WorkflowReadStore.listWorkflows} → map to stable DTOs
 * with an execution-readiness hint. No governed writes occur.
 */
export async function handleWorkflowList(
  deps: WorkflowReadHttpDeps,
  req: WorkflowListHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<WorkflowReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveWorkflowAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.WorkflowRead, telemetry);

    const filter = parseListFilter(req.query);
    const result = await deps.readStore.listWorkflows(tenantId, filter);

    const body: WorkflowListResponseBody = {
      status: 'ok',
      items: result.items.map(toSummaryDto),
      nextCursor: result.nextCursor !== undefined ? encodeCursor(result.nextCursor) : null,
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.workflowRead, 1, {
      [TelemetryAttributeKeys.operation]: 'list',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.workflowRead, 1, {
      [TelemetryAttributeKeys.operation]: 'list',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return workflowReadErrorToHttpResult(err, requestId);
  }
}

/**
 * Handle GET /v1/workflows/:workflowInstanceId — inspect a single workflow with its steps.
 *
 * Flow: resolve identity → enforce the v1 read gate → load detail (tenant-scoped) → map to a
 * stable DTO with an execution-readiness hint. 404 when the instance does not exist for the
 * tenant. No governed writes occur.
 */
export async function handleWorkflowDetail(
  deps: WorkflowReadHttpDeps,
  req: WorkflowDetailHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<WorkflowReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveWorkflowAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.WorkflowRead, telemetry);

    if (req.workflowInstanceId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'workflowInstanceId path parameter is required.');
    }

    const detail = await deps.readStore.getWorkflowDetail(tenantId, req.workflowInstanceId);
    if (detail === undefined) {
      throw new AppError(ErrorCode.WORKFLOW_NOT_FOUND, 'Workflow instance not found.');
    }

    const body: WorkflowDetailResponseBody = {
      status: 'ok',
      workflowInstanceId: detail.instance.id,
      transitionRequestId: detail.instance.transitionRequestId,
      entityType: detail.instance.entityType,
      entityId: detail.instance.entityId,
      workflowType: detail.instance.workflowType,
      workflowStatus: detail.instance.status,
      currentStepCode: detail.instance.currentStepCode ?? null,
      createdAt: detail.instance.createdAt,
      updatedAt: detail.instance.updatedAt,
      steps: detail.steps.map((s) => ({
        stepCode: s.stepCode,
        stepOrder: s.stepOrder,
        reviewTier: s.reviewTier,
        required: s.required,
        status: s.status,
        assignedRoleKey: s.assignedRoleKey ?? null,
        decidedByUserId: s.decidedByUserId ?? null,
        decidedAt: s.decidedAt ?? null,
        decisionReason: s.decisionReason ?? null,
      })),
      execution: executionHint(detail.instance),
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.workflowRead, 1, {
      [TelemetryAttributeKeys.operation]: 'detail',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.workflowRead, 1, {
      [TelemetryAttributeKeys.operation]: 'detail',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return workflowReadErrorToHttpResult(err, requestId);
  }
}
