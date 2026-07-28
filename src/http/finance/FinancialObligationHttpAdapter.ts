/**
 * AffiliationFinancialObligation HTTP adapter (transport-agnostic core).
 *
 * A THIN transport adapter that exposes the existing domain boundary
 * ({@link FinancialObligationService} / `executeCommand`) over an HTTP-shaped request and
 * translates the returned response DTO (and any thrown {@link AppError}) into an HTTP status +
 * JSON body.
 *
 * Architectural rules (identical to the affiliation adapter — these keep the kernel authoritative):
 *  - NO lifecycle/transition logic; evaluates NO guards; resolves NO reconcile outcome (the
 *    service does, from persisted facts).
 *  - NEVER writes audit/evidence/outbox, NEVER mutates governed state or any domain row, NEVER
 *    touches the store/kernel directly.
 *  - Its only collaborator is the domain command boundary, so every governed change flows through
 *    GovernanceKernel.transition() exactly once.
 *  - Caller-supplied guard "facts" are REJECTED; guard outcomes derive from persisted state.
 *  - Tenant + actor come from the TRUSTED identity context, never the request body. Command
 *    `details` (amounts, references) are legitimate inputs and ARE read from the body, then
 *    validated at the domain boundary and by DB constraints.
 */

import { randomUUID } from 'node:crypto';
import {
  FINANCIAL_OBLIGATION_COMMANDS,
  RECONCILE_OBLIGATION_COMMAND,
  type FinancialObligationCommand,
} from '../../domains/affiliation-finance/FinancialObligationCommands.js';
import type {
  FinancialActorDto,
  FinancialObligationDetails,
  FinancialObligationTransitionRequest,
  FinancialObligationTransitionResponse,
} from '../../domains/affiliation-finance/FinancialObligationDtos.js';
import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { AuthActor, AuthContext } from '../auth/AuthContext.js';
import type { AuthContextResolver } from '../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../auth/DemoAuthContextResolver.js';

/** Default edge-identity resolver. LOCAL/DEMO ONLY: trusts body-supplied actor/tenant. */
const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

/**
 * Minimal domain surface the adapter depends on. {@link FinancialObligationService} satisfies it.
 */
export interface FinancialObligationCommandExecutor {
  executeCommand(
    command: string,
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse>;
}

/** An HTTP-shaped request, already parsed by the transport. */
export interface FinancialObligationHttpRequest {
  /** Path parameter: the obligation id (a fresh UUID minted by the caller for `assess`). */
  readonly obligationId: string;
  /** Path parameter: the transition action (FSM-trigger-style verb). */
  readonly action: string;
  /** Header map with lowercased names. */
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Parsed JSON body (expected to be an object) or undefined. */
  readonly body: unknown;
}

/** Protocol-pure result: an HTTP status code and a JSON-serializable body. */
export interface FinancialObligationHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

/**
 * URL action → domain command name. `reconcile` maps to the deterministic reconcile command
 * (which resolves reconcile vs record_mismatch at the service); `record_mismatch` is NEVER a
 * client action. All others come from the 1:1 command map (single source of truth).
 */
const ACTION_TO_COMMAND: Readonly<Record<string, FinancialObligationCommand>> = (() => {
  const map: Record<string, FinancialObligationCommand> = {};
  for (const command of Object.keys(
    FINANCIAL_OBLIGATION_COMMANDS,
  ) as (keyof typeof FINANCIAL_OBLIGATION_COMMANDS)[]) {
    map[FINANCIAL_OBLIGATION_COMMANDS[command]] = command;
  }
  // The reconcile action drives the dynamic command; record_mismatch is system-derived only.
  map['reconcile'] = RECONCILE_OBLIGATION_COMMAND;
  return Object.freeze(map);
})();

function commandForAction(action: string): FinancialObligationCommand | undefined {
  return ACTION_TO_COMMAND[action];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Map the trusted {@link AuthActor} onto the financial actor DTO (no identity from body). */
function authActorToDto(a: AuthActor): FinancialActorDto {
  return {
    userId: a.userId,
    roleKeys: a.roleKeys,
    ...(a.scopeType !== undefined ? { scopeType: a.scopeType } : {}),
    ...(a.scopeId !== undefined ? { scopeId: a.scopeId } : {}),
    ...(a.organizationId !== undefined ? { organizationId: a.organizationId } : {}),
    ...(a.nationalOrganizationId !== undefined
      ? { nationalOrganizationId: a.nationalOrganizationId }
      : {}),
    ...(a.regionalOrganizationId !== undefined
      ? { regionalOrganizationId: a.regionalOrganizationId }
      : {}),
    ...(a.localOrganizationId !== undefined ? { localOrganizationId: a.localOrganizationId } : {}),
  };
}

/** Reconcile the idempotency key from the `Idempotency-Key` header and/or the request body. */
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
  return headerKey ?? bodyKey ?? '';
}

function buildCommandRequest(
  req: FinancialObligationHttpRequest,
  auth: AuthContext,
): {
  readonly command: FinancialObligationCommand;
  readonly request: FinancialObligationTransitionRequest;
  readonly correlationId: string | undefined;
} {
  const command = commandForAction(req.action);
  if (command === undefined) {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      `Unknown AffiliationFinancialObligation transition action: ${req.action}`,
      { details: { action: req.action } },
    );
  }

  if (!isPlainObject(req.body)) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'Request body must be a JSON object.');
  }
  const body = req.body;

  // Caller-supplied guard facts are not accepted over HTTP; guard outcomes derive from state.
  if (Object.prototype.hasOwnProperty.call(body, 'facts')) {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      'Caller-supplied guard facts are not accepted over HTTP; guard outcomes derive from persisted state.',
    );
  }

  const context = isPlainObject(body['context']) ? body['context'] : {};
  const correlationId = asString(context['correlationId']) ?? asString(body['correlationId']);
  const causationId = asString(context['causationId']) ?? asString(body['causationId']);
  const reason = asString(body['reason']);
  const details = isPlainObject(body['details'])
    ? (body['details'] as unknown as FinancialObligationDetails)
    : undefined;

  const request: FinancialObligationTransitionRequest = {
    tenantId: auth.tenantId,
    obligationId: req.obligationId,
    actor: authActorToDto(auth.actor),
    idempotencyKey: resolveIdempotencyKey(req.headers, body),
    ...(reason !== undefined ? { reason } : {}),
    ...(details !== undefined ? { details } : {}),
    ...(correlationId !== undefined ? { correlationId } : {}),
    ...(causationId !== undefined ? { causationId } : {}),
  };

  return { command, request, correlationId };
}

function envelope(
  body: FinancialObligationTransitionResponse,
  requestId: string,
  correlationId: string | undefined,
): Record<string, unknown> {
  return {
    ...body,
    requestId,
    ...(correlationId !== undefined ? { correlationId } : {}),
  };
}

function rejectedHttpStatus(code: string): number {
  switch (code) {
    case ErrorCode.PERMISSION_DENIED:
      return 403;
    case ErrorCode.INVALID_INPUT:
      return 400;
    case ErrorCode.GUARD_FAILED:
    case ErrorCode.UNKNOWN_TRANSITION:
    case ErrorCode.IDEMPOTENCY_CONFLICT:
      return 409;
    default:
      return 409;
  }
}

function appErrorHttpStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.INVALID_INPUT:
      return 400;
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.PERMISSION_DENIED:
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.FINANCIAL_OBLIGATION_NOT_FOUND:
      return 404;
    case ErrorCode.UNKNOWN_TRANSITION:
    case ErrorCode.GUARD_FAILED:
    case ErrorCode.IDEMPOTENCY_CONFLICT:
      return 409;
    case ErrorCode.NOT_IMPLEMENTED:
      return 501;
    case ErrorCode.UNKNOWN_GUARD:
    case ErrorCode.TENANT_CONTEXT_MISSING:
    case ErrorCode.CONFIG_ERROR:
      return 500;
    default:
      return 500;
  }
}

function successToHttpResult(
  response: FinancialObligationTransitionResponse,
  requestId: string,
  correlationId: string | undefined,
): FinancialObligationHttpResult {
  const body = envelope(response, requestId, correlationId);
  if (response.status === 'executed') {
    return { status: 200, body };
  }
  if (response.status === 'approval_required') {
    return { status: 202, body };
  }
  return { status: rejectedHttpStatus(response.code), body };
}

/** Translate any error into a safe HTTP result (internal details never leak). */
export function errorToHttpResult(
  err: unknown,
  requestId: string,
): FinancialObligationHttpResult {
  if (err instanceof AppError) {
    return {
      status: appErrorHttpStatus(err.code),
      body: { status: 'error', code: err.code, message: err.message, requestId },
    };
  }
  return {
    status: 500,
    body: { status: 'error', code: 'INTERNAL', message: 'Internal server error.', requestId },
  };
}

/**
 * Handle one HTTP-shaped AffiliationFinancialObligation transition request.
 *
 * Flow: resolve TRUSTED identity → map request (tenant/actor from the auth context) → call the
 * domain boundary's `executeCommand` EXACTLY ONCE → map the response DTO (or caught error) to
 * `{ status, body }`. The adapter never bypasses the service/kernel and never performs governed
 * writes itself.
 */
export async function handleFinancialObligationHttpTransition(
  executor: FinancialObligationCommandExecutor,
  req: FinancialObligationHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<FinancialObligationHttpResult> {
  try {
    const auth = await resolver.resolve({ headers: req.headers, body: req.body });
    const { command, request, correlationId } = buildCommandRequest(req, auth);
    const response = await executor.executeCommand(command, request);
    return successToHttpResult(response, requestId, correlationId);
  } catch (err) {
    return errorToHttpResult(err, requestId);
  }
}
