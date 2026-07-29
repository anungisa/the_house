import { randomUUID } from 'node:crypto';

import type {
  FinancialObligationReviewService,
  FinancialReviewerActor,
} from '../../../domains/affiliation-finance/index.js';
import type {
  FinancialObligationCommandExecutor,
  FinancialObligationHttpResult,
} from '../../finance/FinancialObligationHttpAdapter.js';
import { handleFinancialObligationHttpTransition } from '../../finance/FinancialObligationHttpAdapter.js';
import type { AuthActor } from '../../auth/AuthContext.js';
import type { AuthContextResolver } from '../../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../../auth/DemoAuthContextResolver.js';
import { resolveOrganizationAuth } from '../../organization/organizationHttpAuth.js';
import { AppError, ErrorCode } from '../../../shared/errors/AppError.js';

const DEFAULT_RESOLVER = new DemoAuthContextResolver();

export interface ButtonFinancialHttpRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly params?: Readonly<{ obligationId?: string }>;
  readonly body?: unknown;
}

function actorFromAuth(actor: AuthActor): FinancialReviewerActor {
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

function errorResult(error: unknown, requestId: string): FinancialObligationHttpResult {
  if (error instanceof AppError) {
    const status =
      error.code === ErrorCode.UNAUTHENTICATED
        ? 401
        : error.code === ErrorCode.FORBIDDEN || error.code === ErrorCode.PERMISSION_DENIED
          ? 403
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

export async function handleFinancialObligationQueue(
  service: FinancialObligationReviewService,
  request: ButtonFinancialHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_RESOLVER,
): Promise<FinancialObligationHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, request.headers);
    const items = await service.listQueue(auth.tenantId, actorFromAuth(auth.actor));
    return { status: 200, body: { status: 'ok', requestId, items } };
  } catch (error) {
    return errorResult(error, requestId);
  }
}

export async function handleFinancialObligationReconciliation(
  executor: FinancialObligationCommandExecutor,
  request: ButtonFinancialHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_RESOLVER,
): Promise<FinancialObligationHttpResult> {
  const obligationId = request.params?.obligationId;
  if (typeof obligationId !== 'string' || obligationId.trim() === '') {
    return errorResult(
      new AppError(ErrorCode.INVALID_INPUT, "'obligationId' is required."),
      requestId,
    );
  }
  try {
    const auth = await resolveOrganizationAuth(resolver, request.headers);
    return handleFinancialObligationHttpTransition(
      executor,
      {
        obligationId,
        action: 'reconcile',
        headers: request.headers,
        body: request.body ?? {},
      },
      requestId,
      { mode: auth.mode, resolve: async () => auth },
    );
  } catch (error) {
    return errorResult(error, requestId);
  }
}
