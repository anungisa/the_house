/**
 * Workflow execution HTTP adapter — protocol-pure "execute the approved transition" handler.
 *
 * This is a THIN transport adapter over {@link ApprovedWorkflowExecutionService}. It maps an
 * HTTP-shaped request into a single `execute` call and maps the result (or any thrown
 * {@link AppError}) to `{ status, body }`.
 *
 * Architectural boundaries (DO NOT violate — these keep the kernel authoritative):
 *  - It triggers the GOVERNED execution of an already-approved transition request through the
 *    Governance Kernel. It performs NO governed writes itself.
 *  - It is the ONLY workflow surface that causes a lifecycle transition, and it does so only
 *    via an EXPLICIT call — it is never invoked from the decision endpoint.
 *  - Tenant + actor come EXCLUSIVELY from the resolved {@link AuthContext} (trusted headers).
 *    The JSON body carries only `{ reason?, idempotencyKey? }`; any `actor`/`tenantId` in the
 *    body is IGNORED. The `Idempotency-Key` header is preferred for the idempotency key.
 */

import { randomUUID } from 'node:crypto';

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { AuthContext } from '../auth/AuthContext.js';
import type { AuthContextResolver } from '../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../auth/DemoAuthContextResolver.js';
import {
  requireActorUserId,
  requireTenant,
  resolveWorkflowAuth,
} from './workflowHttpAuth.js';
import type {
  ExecuteApprovedWorkflowInput,
} from '../../governance/workflow/ApprovedWorkflowExecutionService.js';
import type {
  ExecuteApprovedTransitionResult,
  TransitionActor,
} from '../../governance/types/TransitionTypes.js';
import type {
  WorkflowExecutionHttpRequest,
  WorkflowExecutionResponseBody,
} from './WorkflowExecutionHttpDtos.js';

/** Default resolver mirrors the decision adapter: demo identity unless one is supplied. */
const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

/** Generic default scope when the verified identity supplies none (mirrors the domain mapper). */
const DEFAULT_SCOPE_TYPE = 'platform' as const;

/**
 * Minimal execution boundary the adapter depends on. Depending on the method (not the
 * concrete service) keeps the adapter unit-testable. {@link ApprovedWorkflowExecutionService}
 * satisfies this interface.
 */
export interface WorkflowTransitionExecutor {
  execute(input: ExecuteApprovedWorkflowInput): Promise<ExecuteApprovedTransitionResult>;
}

export interface WorkflowExecutionHttpDeps {
  readonly executor: WorkflowTransitionExecutor;
}

/** Protocol-pure result: an HTTP status code and a JSON-serializable body. */
export interface WorkflowExecutionHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Map the verified edge identity onto the kernel's generic {@link TransitionActor}. */
function authActorToTransitionActor(auth: AuthContext): TransitionActor {
  const a = auth.actor;
  return {
    actorId: a.userId,
    tenantId: auth.tenantId,
    scopeType: a.scopeType ?? DEFAULT_SCOPE_TYPE,
    ...(a.scopeId !== undefined ? { scopeId: a.scopeId } : {}),
    ...(a.organizationId !== undefined ? { organizationId: a.organizationId } : {}),
    ...(a.organizationUnitId !== undefined ? { organizationUnitId: a.organizationUnitId } : {}),
    ...(a.nationalOrganizationId !== undefined
      ? { nationalOrganizationId: a.nationalOrganizationId }
      : {}),
    ...(a.regionalOrganizationId !== undefined
      ? { regionalOrganizationId: a.regionalOrganizationId }
      : {}),
    ...(a.localOrganizationId !== undefined ? { localOrganizationId: a.localOrganizationId } : {}),
    roles: a.roleKeys,
  };
}

/**
 * Reconcile the idempotency key from the `Idempotency-Key` header and/or the request body.
 * Header is preferred. If BOTH are present and DIFFER, the request is rejected (fail closed).
 * An execution command MUST carry an idempotency key (exactly-once), so an absent key is a
 * 400 rather than a silently generated one.
 */
function resolveIdempotencyKey(
  headers: Readonly<Record<string, string | undefined>>,
  body: Record<string, unknown>,
): string {
  const headerKey = asString(headers['idempotency-key']);
  const bodyKey = asString(body['idempotencyKey']);
  if (headerKey !== undefined && bodyKey !== undefined && headerKey !== bodyKey) {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      'Idempotency-Key header and body idempotencyKey differ.',
    );
  }
  const key = (headerKey ?? bodyKey ?? '').trim();
  if (key === '') {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      'An idempotency key is required (Idempotency-Key header or body idempotencyKey).',
    );
  }
  return key;
}

/**
 * Map a thrown {@link AppError} to an HTTP status.
 *
 * Documented mapping (see docs/architecture/approved-workflow-transition-execution.md):
 *  - INVALID_INPUT                                   → 400
 *  - UNAUTHENTICATED                                 → 401
 *  - FORBIDDEN / PERMISSION_DENIED                   → 403
 *  - WORKFLOW_NOT_FOUND / TRANSITION_REQUEST_NOT_FOUND → 404
 *  - WORKFLOW_NOT_APPROVED / TRANSITION_STATE_CONFLICT /
 *    GUARD_FAILED / IDEMPOTENCY_CONFLICT / UNKNOWN_TRANSITION → 409
 *  - anything else (UNKNOWN_GUARD, TENANT_CONTEXT_MISSING, …) → opaque 500
 */
function executionAppErrorStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.INVALID_INPUT:
      return 400;
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.FORBIDDEN:
    case ErrorCode.PERMISSION_DENIED:
      return 403;
    case ErrorCode.WORKFLOW_NOT_FOUND:
    case ErrorCode.TRANSITION_REQUEST_NOT_FOUND:
      return 404;
    case ErrorCode.WORKFLOW_NOT_APPROVED:
    case ErrorCode.TRANSITION_STATE_CONFLICT:
    case ErrorCode.GUARD_FAILED:
    case ErrorCode.IDEMPOTENCY_CONFLICT:
    case ErrorCode.UNKNOWN_TRANSITION:
      return 409;
    default:
      return 500;
  }
}

/**
 * Translate any error into a safe HTTP result. Known {@link AppError}s surface their stable
 * (NSO-generic) code + authored message; anything else collapses into an opaque 500 so
 * internal details never leak across the boundary.
 */
export function workflowExecutionErrorToHttpResult(
  err: unknown,
  requestId: string,
): WorkflowExecutionHttpResult {
  if (err instanceof AppError) {
    return {
      status: executionAppErrorStatus(err.code),
      body: { status: 'error', code: err.code, message: err.message, requestId },
    };
  }
  return {
    status: 500,
    body: { status: 'error', code: 'INTERNAL', message: 'Internal server error.', requestId },
  };
}

/**
 * Handle one HTTP-shaped workflow execution request.
 *
 * Flow: resolve TRUSTED identity (tenant + actor from headers, never the body) → reconcile the
 * idempotency key → call {@link ApprovedWorkflowExecutionService.execute} EXACTLY ONCE → map
 * the kernel result (or caught error) to `{ status, body }`. The adapter performs NO governed
 * writes itself; the kernel owns the actual lifecycle execution.
 */
export async function handleWorkflowExecution(
  deps: WorkflowExecutionHttpDeps,
  req: WorkflowExecutionHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<WorkflowExecutionHttpResult> {
  try {
    const auth = await resolveWorkflowAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    requireActorUserId(auth);

    if (req.workflowInstanceId.trim() === '') {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'workflowInstanceId path parameter is required.',
      );
    }
    if (!isPlainObject(req.body)) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'Request body must be a JSON object.');
    }
    const body = req.body;
    const idempotencyKey = resolveIdempotencyKey(req.headers, body);
    const reason = asString(body['reason']);
    const correlationId = asString(body['correlationId']);

    const input: ExecuteApprovedWorkflowInput = {
      tenantId,
      workflowInstanceId: req.workflowInstanceId,
      actor: authActorToTransitionActor(auth),
      idempotencyKey,
      ...(reason !== undefined ? { reason } : {}),
      ...(correlationId !== undefined ? { correlationId } : {}),
    };
    const result = await deps.executor.execute(input);

    const responseBody: WorkflowExecutionResponseBody = {
      status: 'executed',
      workflowInstanceId: req.workflowInstanceId,
      transitionRequestId: result.transitionRequestId,
      entityType: result.entityType,
      entityId: result.entityId,
      trigger: result.trigger,
      fromState: result.fromState,
      toState: result.toState,
      stateTransitionId: result.stateTransitionId ?? null,
      idempotentReplay: result.status === 'idempotent_replay',
      requestId,
    };
    return { status: 200, body: responseBody };
  } catch (err) {
    return workflowExecutionErrorToHttpResult(err, requestId);
  }
}
