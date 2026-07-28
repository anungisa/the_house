import { randomUUID } from 'node:crypto';

import type { AuthContextResolver } from '../../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../../auth/DemoAuthContextResolver.js';
import { resolveOrganizationAuth } from '../../organization/organizationHttpAuth.js';
import { AppError, ErrorCode } from '../../../shared/errors/AppError.js';
import type {
  AffiliationReviewQueueFilter,
  AffiliationReviewerActor,
} from '../../../domains/affiliation-review/index.js';
import type { AffiliationReviewService } from '../../../domains/affiliation-review/index.js';

const DEFAULT_RESOLVER = new DemoAuthContextResolver();

export interface ButtonAffiliationReviewHttpRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly params: Readonly<{ applicationId?: string }>;
  readonly body?: unknown;
}

export interface ButtonAffiliationReviewHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

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

function errorResult(error: unknown, requestId: string): ButtonAffiliationReviewHttpResult {
  if (error instanceof AppError) {
    const status =
      error.code === ErrorCode.UNAUTHENTICATED
        ? 401
        : error.code === ErrorCode.FORBIDDEN || error.code === ErrorCode.PERMISSION_DENIED
          ? 403
          : error.code === ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND
            ? 404
            : error.code === ErrorCode.AFFILIATION_REVIEW_CONFLICT ||
                error.code === ErrorCode.IDEMPOTENCY_CONFLICT
              ? 409
              : error.code === ErrorCode.INVALID_INPUT
                ? 400
                : 500;
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

function requireValue(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(ErrorCode.INVALID_INPUT, `'${field}' is required.`);
  }
  return value.trim();
}

export async function handleAffiliationReviewQueue(
  service: AffiliationReviewService,
  request: ButtonAffiliationReviewHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_RESOLVER,
): Promise<ButtonAffiliationReviewHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, request.headers);
    const state = request.query['state'];
    if (state !== undefined && state !== 'submitted' && state !== 'under_review') {
      throw new AppError(ErrorCode.INVALID_INPUT, "Unknown review queue 'state'.");
    }
    const filter: AffiliationReviewQueueFilter = {
      ...(request.query['season'] !== undefined ? { seasonId: request.query['season'] } : {}),
      ...(state !== undefined ? { state } : {}),
    };
    const items = await service.listQueue(auth.tenantId, actorFromAuth(auth.actor), filter);
    return { status: 200, body: { status: 'ok', requestId, items } };
  } catch (error) {
    return errorResult(error, requestId);
  }
}

export async function handleAffiliationReviewCase(
  service: AffiliationReviewService,
  request: ButtonAffiliationReviewHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_RESOLVER,
): Promise<ButtonAffiliationReviewHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, request.headers);
    const applicationId = requireValue(request.params.applicationId, 'applicationId');
    const reviewCase = await service.getCase(
      auth.tenantId,
      actorFromAuth(auth.actor),
      applicationId,
    );
    return { status: 200, body: { status: 'ok', requestId, reviewCase } };
  } catch (error) {
    return errorResult(error, requestId);
  }
}

export async function handleAffiliationReviewStart(
  service: AffiliationReviewService,
  request: ButtonAffiliationReviewHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_RESOLVER,
): Promise<ButtonAffiliationReviewHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, request.headers);
    const applicationId = requireValue(request.params.applicationId, 'applicationId');
    const body =
      request.body !== null && typeof request.body === 'object' && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {};
    const idempotencyKey = requireValue(
      request.headers['idempotency-key'] ?? body['idempotencyKey'],
      'Idempotency-Key',
    );
    const item = await service.startReview({
      tenantId: auth.tenantId,
      applicationId,
      actor: actorFromAuth(auth.actor),
      idempotencyKey,
      correlationId: requestId,
    });
    return { status: 200, body: { status: 'ok', requestId, item } };
  } catch (error) {
    return errorResult(error, requestId);
  }
}
