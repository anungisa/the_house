/**
 * Workflow decision HTTP adapter — protocol-pure approve/reject handler.
 *
 * This is a THIN transport adapter over the existing {@link WorkflowDecisionService}. It
 * translates an HTTP-shaped request into a single `recordDecision` call and maps the result
 * (or any thrown {@link AppError}) to `{ status, body }`.
 *
 * Architectural boundaries (DO NOT violate — these keep the kernel authoritative):
 *  - It records workflow METADATA only. It NEVER mutates governance.entity_state, NEVER
 *    executes the pending transition, and NEVER calls GovernanceKernel.transition().
 *  - Its only collaborator is {@link WorkflowDecisionService} (the metadata-only decision
 *    boundary). It never reaches the store or kernel directly and never bypasses RLS.
 *  - Tenant + actor come EXCLUSIVELY from the resolved {@link AuthContext} (trusted headers).
 *    The JSON body carries only `{ decision, reason? }`; any `actor`/`tenantId` in the body
 *    is IGNORED (identity is never sourced from the body on this surface).
 *
 * A workflow may become `approved`, but turning that into an executed lifecycle transition
 * remains a separate, explicit governed pass — never a side effect of this endpoint.
 */

import { randomUUID } from 'node:crypto';

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { AuthContextResolver } from '../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../auth/DemoAuthContextResolver.js';
import {
  requireActorUserId,
  requireTenant,
  resolveWorkflowAuth,
} from './workflowHttpAuth.js';
import type {
  RecordWorkflowDecisionInput,
  WorkflowDecisionOutcome,
} from '../../governance/workflow/WorkflowDecisionService.js';
import type { WorkflowStepDecision } from '../../governance/workflow/WorkflowTypes.js';
import type {
  WorkflowDecisionHttpRequest,
  WorkflowDecisionResponseBody,
} from './WorkflowHttpDtos.js';

/** Default resolver mirrors the evidence adapter: demo identity unless one is supplied. */
const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

/**
 * Minimal decision boundary the adapter depends on. Depending on the method (not the
 * concrete service) keeps the adapter unit-testable and prevents it from reaching past the
 * boundary. {@link WorkflowDecisionService} satisfies this interface.
 */
export interface WorkflowDecisionRecorder {
  recordDecision(input: RecordWorkflowDecisionInput): Promise<WorkflowDecisionOutcome>;
}

export interface WorkflowHttpDeps {
  readonly decisionService: WorkflowDecisionRecorder;
}

/** Protocol-pure result: an HTTP status code and a JSON-serializable body. */
export interface WorkflowHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Map a thrown {@link AppError} to an HTTP status.
 *
 * Documented mapping (see docs/architecture/workflow-decision-http-endpoints.md):
 *  - INVALID_INPUT / WORKFLOW_INVALID_DECISION → 400
 *  - UNAUTHENTICATED                           → 401
 *  - FORBIDDEN / PERMISSION_DENIED             → 403
 *  - WORKFLOW_NOT_FOUND (unknown instance)     → 404
 *  - WORKFLOW_STEP_UNKNOWN (unknown / not the
 *    step currently awaiting a decision)       → 409 (conflict with current workflow state)
 *  - WORKFLOW_ALREADY_DECIDED                  → 409
 *  - anything else                             → opaque 500
 */
function workflowAppErrorStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.INVALID_INPUT:
    case ErrorCode.WORKFLOW_INVALID_DECISION:
      return 400;
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.FORBIDDEN:
    case ErrorCode.PERMISSION_DENIED:
      return 403;
    case ErrorCode.WORKFLOW_NOT_FOUND:
      return 404;
    case ErrorCode.WORKFLOW_STEP_UNKNOWN:
    case ErrorCode.WORKFLOW_ALREADY_DECIDED:
      return 409;
    default:
      // TENANT_CONTEXT_MISSING and any unexpected error collapse to an opaque server error.
      return 500;
  }
}

/**
 * Translate any error into a safe HTTP result. Known {@link AppError}s surface their stable
 * (NSO-generic) code + authored message; anything else (e.g. a raw driver error) collapses
 * into an opaque 500 so internal details never leak across the boundary.
 */
export function workflowErrorToHttpResult(err: unknown, requestId: string): WorkflowHttpResult {
  if (err instanceof AppError) {
    return {
      status: workflowAppErrorStatus(err.code),
      body: { status: 'error', code: err.code, message: err.message, requestId },
    };
  }
  return {
    status: 500,
    body: { status: 'error', code: 'INTERNAL', message: 'Internal server error.', requestId },
  };
}

/**
 * Handle one HTTP-shaped workflow decision request.
 *
 * Flow: resolve TRUSTED identity (tenant + actor from headers, never the body) → parse the
 * decision body → call {@link WorkflowDecisionService.recordDecision} EXACTLY ONCE → map the
 * metadata outcome (or caught error) to `{ status, body }`. The adapter performs NO governed
 * writes itself and never executes the pending lifecycle transition.
 */
export async function handleWorkflowDecision(
  deps: WorkflowHttpDeps,
  req: WorkflowDecisionHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<WorkflowHttpResult> {
  try {
    const auth = resolveWorkflowAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    const actorUserId = requireActorUserId(auth);

    if (req.workflowInstanceId.trim() === '' || req.stepCode.trim() === '') {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'workflowInstanceId and stepCode path parameters are required.',
      );
    }
    if (!isPlainObject(req.body)) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'Request body must be a JSON object.');
    }
    const decision = asString(req.body['decision']);
    if (decision === undefined) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'decision is required.');
    }
    const reason = asString(req.body['reason']);

    // The decision VALUE (approve | reject) is validated authoritatively by the service.
    const input: RecordWorkflowDecisionInput = {
      tenantId,
      workflowInstanceId: req.workflowInstanceId,
      stepCode: req.stepCode,
      decision: decision as WorkflowStepDecision,
      actorUserId,
      ...(reason !== undefined ? { reason } : {}),
    };
    const outcome = await deps.decisionService.recordDecision(input);

    const body: WorkflowDecisionResponseBody = {
      status: 'recorded',
      workflowInstanceId: outcome.workflowInstanceId,
      workflowStatus: outcome.status,
      currentStepCode: outcome.currentStepCode ?? null,
      decidedStepCode: outcome.decidedStepCode,
      decision: outcome.decision,
      requestId,
    };
    return { status: 200, body };
  } catch (err) {
    return workflowErrorToHttpResult(err, requestId);
  }
}
