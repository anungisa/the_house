import { randomUUID } from 'node:crypto';

import { AppError, ErrorCode } from '../../../shared/errors/AppError.js';
import type {
  AffiliationDecisionService,
  AffiliationReviewerActor,
} from '../../../domains/affiliation-review/index.js';
import type { AuthContextResolver } from '../../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../../auth/DemoAuthContextResolver.js';
import { resolveOrganizationAuth } from '../../organization/organizationHttpAuth.js';
import type {
  ButtonAffiliationReviewHttpRequest,
  ButtonAffiliationReviewHttpResult,
} from './ButtonAffiliationReviewHttpAdapter.js';

const DEFAULT_RESOLVER = new DemoAuthContextResolver();

function actorFromAuth(
  actor: Awaited<ReturnType<typeof resolveOrganizationAuth>>['actor'],
): AffiliationReviewerActor {
  return {
    userId: actor.userId,
    roleKeys: actor.roleKeys,
    ...(actor.scopeType !== undefined ? { scopeType: actor.scopeType } : {}),
    ...(actor.scopeId !== undefined ? { scopeId: actor.scopeId } : {}),
    ...(actor.organizationId !== undefined ? { organizationId: actor.organizationId } : {}),
    ...(actor.organizationUnitId !== undefined
      ? { organizationUnitId: actor.organizationUnitId }
      : {}),
    ...(actor.nationalOrganizationId !== undefined
      ? { nationalOrganizationId: actor.nationalOrganizationId }
      : {}),
    ...(actor.regionalOrganizationId !== undefined
      ? { regionalOrganizationId: actor.regionalOrganizationId }
      : {}),
    ...(actor.localOrganizationId !== undefined
      ? { localOrganizationId: actor.localOrganizationId }
      : {}),
  };
}

function bodyRecord(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'Request body must be an object.');
  }
  return body as Record<string, unknown>;
}

function value(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(ErrorCode.INVALID_INPUT, `'${field}' is required.`);
  }
  return value.trim();
}

function errorResult(error: unknown, requestId: string): ButtonAffiliationReviewHttpResult {
  if (error instanceof AppError) {
    const status =
      error.code === ErrorCode.UNAUTHENTICATED
        ? 401
        : error.code === ErrorCode.FORBIDDEN || error.code === ErrorCode.PERMISSION_DENIED
          ? 403
          : error.code === ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND ||
              error.code === ErrorCode.WORKFLOW_NOT_FOUND
            ? 404
            : error.code === ErrorCode.INVALID_INPUT ||
                error.code === ErrorCode.WORKFLOW_INVALID_DECISION
              ? 400
              : 409;
    return {
      status,
      body: { status: 'error', code: error.code, message: error.message, requestId },
    };
  }
  return {
    status: 500,
    body: { status: 'error', code: 'INTERNAL', message: 'Internal server error.', requestId },
  };
}

export async function handleAffiliationDecisionState(
  service: AffiliationDecisionService,
  request: ButtonAffiliationReviewHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_RESOLVER,
): Promise<ButtonAffiliationReviewHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, request.headers);
    const applicationId = value(request.params.applicationId, 'applicationId');
    const decisionState = await service.getState(
      auth.tenantId,
      actorFromAuth(auth.actor),
      applicationId,
    );
    return { status: 200, body: { status: 'ok', requestId, decisionState: decisionState ?? null } };
  } catch (error) {
    return errorResult(error, requestId);
  }
}

export async function handleAffiliationDecisionProposal(
  service: AffiliationDecisionService,
  request: ButtonAffiliationReviewHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_RESOLVER,
): Promise<ButtonAffiliationReviewHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, request.headers);
    const applicationId = value(request.params.applicationId, 'applicationId');
    const body = bodyRecord(request.body);
    const outcome = value(body['outcome'], 'outcome');
    if (outcome !== 'approve' && outcome !== 'reject') {
      throw new AppError(ErrorCode.INVALID_INPUT, "'outcome' must be approve or reject.");
    }
    const decisionState = await service.propose({
      tenantId: auth.tenantId,
      applicationId,
      actor: actorFromAuth(auth.actor),
      outcome,
      reason: value(body['reason'], 'reason'),
      idempotencyKey: value(
        request.headers['idempotency-key'] ?? body['idempotencyKey'],
        'Idempotency-Key',
      ),
    });
    return { status: 201, body: { status: 'ok', requestId, decisionState } };
  } catch (error) {
    return errorResult(error, requestId);
  }
}

export async function handleAffiliationTierDecision(
  service: AffiliationDecisionService,
  request: ButtonAffiliationReviewHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_RESOLVER,
): Promise<ButtonAffiliationReviewHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, request.headers);
    const body = bodyRecord(request.body);
    const decision = value(body['decision'], 'decision');
    if (decision !== 'approve' && decision !== 'reject') {
      throw new AppError(ErrorCode.WORKFLOW_INVALID_DECISION, 'Unknown workflow decision.');
    }
    const decisionState = await service.decide({
      tenantId: auth.tenantId,
      applicationId: value(request.params.applicationId, 'applicationId'),
      actor: actorFromAuth(auth.actor),
      workflowInstanceId: value(body['workflowInstanceId'], 'workflowInstanceId'),
      stepCode: value(body['stepCode'], 'stepCode'),
      decision,
      reason: typeof body['reason'] === 'string' ? body['reason'] : '',
    });
    return { status: 200, body: { status: 'ok', requestId, decisionState } };
  } catch (error) {
    return errorResult(error, requestId);
  }
}

export async function handleAffiliationDecisionExecute(
  service: AffiliationDecisionService,
  request: ButtonAffiliationReviewHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_RESOLVER,
): Promise<ButtonAffiliationReviewHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, request.headers);
    const body = bodyRecord(request.body);
    const execution = await service.execute({
      tenantId: auth.tenantId,
      applicationId: value(request.params.applicationId, 'applicationId'),
      actor: actorFromAuth(auth.actor),
      workflowInstanceId: value(body['workflowInstanceId'], 'workflowInstanceId'),
      idempotencyKey: value(
        request.headers['idempotency-key'] ?? body['idempotencyKey'],
        'Idempotency-Key',
      ),
      ...(typeof body['reason'] === 'string' ? { reason: body['reason'] } : {}),
    });
    return { status: 200, body: { status: 'ok', requestId, execution } };
  } catch (error) {
    return errorResult(error, requestId);
  }
}
