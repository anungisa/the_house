/**
 * AffiliationStanding HTTP adapter (transport-agnostic core).
 *
 * A THIN transport adapter that exposes the existing domain boundary
 * ({@link AffiliationStandingService} / `executeCommand`) over an HTTP-shaped request and
 * translates the returned response DTO (and any thrown {@link AppError}) into an HTTP status +
 * JSON body.
 *
 * Architectural rules (identical to the affiliation/finance adapters — these keep the kernel
 * authoritative):
 *  - NO lifecycle/transition logic; evaluates NO guards; resolves NO domain decision.
 *  - NEVER writes audit/evidence/outbox, NEVER mutates governed state or any domain row, NEVER
 *    touches the store/kernel directly.
 *  - Its only collaborator is the domain command boundary, so every governed change flows through
 *    GovernanceKernel.transition() exactly once.
 *  - Caller-supplied guard "facts" are REJECTED; guard outcomes derive from persisted state + clock.
 *  - Tenant + actor come from the TRUSTED identity context, never the request body. Command
 *    `details` (effective period, pathway) are legitimate inputs and ARE read from the body, then
 *    validated at the domain boundary and by DB constraints.
 */

import { randomUUID } from 'node:crypto';
import {
  STANDING_COMMANDS,
  type StandingCommand,
} from '../../domains/affiliation-standing/AffiliationStandingCommands.js';
import type {
  StandingActorDto,
  StandingDetails,
  StandingTransitionRequest,
  StandingTransitionResponse,
} from '../../domains/affiliation-standing/AffiliationStandingDtos.js';
import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { AuthActor, AuthContext } from '../auth/AuthContext.js';
import type { AuthContextResolver } from '../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../auth/DemoAuthContextResolver.js';

/** Default edge-identity resolver. LOCAL/DEMO ONLY: trusts body-supplied actor/tenant. */
const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

/** Minimal domain surface the adapter depends on. {@link AffiliationStandingService} satisfies it. */
export interface StandingCommandExecutor {
  executeCommand(
    command: string,
    request: StandingTransitionRequest,
  ): Promise<StandingTransitionResponse>;
}

/** An HTTP-shaped request, already parsed by the transport. */
export interface StandingHttpRequest {
  /** Path parameter: the standing id (a fresh UUID minted by the caller for `open`). */
  readonly standingId: string;
  /** Path parameter: the transition action (FSM-trigger-style verb). */
  readonly action: string;
  /** Header map with lowercased names. */
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Parsed JSON body (expected to be an object) or undefined. */
  readonly body: unknown;
}

/** Protocol-pure result: an HTTP status code and a JSON-serializable body. */
export interface StandingHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

/**
 * URL action → domain command name. Derived from the 1:1 command map (single source of truth), so
 * the action verb equals the FSM trigger (e.g. `renew_active`).
 */
const ACTION_TO_COMMAND: Readonly<Record<string, StandingCommand>> = (() => {
  const map: Record<string, StandingCommand> = {};
  for (const command of Object.keys(STANDING_COMMANDS) as StandingCommand[]) {
    map[STANDING_COMMANDS[command]] = command;
  }
  return Object.freeze(map);
})();

function commandForAction(action: string): StandingCommand | undefined {
  return ACTION_TO_COMMAND[action];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Map the trusted {@link AuthActor} onto the standing actor DTO (no identity from body). */
function authActorToDto(a: AuthActor): StandingActorDto {
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
  req: StandingHttpRequest,
  auth: AuthContext,
): {
  readonly command: StandingCommand;
  readonly request: StandingTransitionRequest;
  readonly correlationId: string | undefined;
} {
  const command = commandForAction(req.action);
  if (command === undefined) {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      `Unknown AffiliationStanding transition action: ${req.action}`,
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
    ? (body['details'] as unknown as StandingDetails)
    : undefined;

  const request: StandingTransitionRequest = {
    tenantId: auth.tenantId,
    standingId: req.standingId,
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
  body: StandingTransitionResponse,
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
    case ErrorCode.AFFILIATION_STANDING_NOT_FOUND:
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
  response: StandingTransitionResponse,
  requestId: string,
  correlationId: string | undefined,
): StandingHttpResult {
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
export function errorToHttpResult(err: unknown, requestId: string): StandingHttpResult {
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
 * Handle one HTTP-shaped AffiliationStanding transition request.
 *
 * Flow: resolve TRUSTED identity → map request (tenant/actor from the auth context) → call the
 * domain boundary's `executeCommand` EXACTLY ONCE → map the response DTO (or caught error) to
 * `{ status, body }`. The adapter never bypasses the service/kernel and never performs governed
 * writes itself.
 */
export async function handleStandingHttpTransition(
  executor: StandingCommandExecutor,
  req: StandingHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<StandingHttpResult> {
  try {
    const auth = await resolver.resolve({ headers: req.headers, body: req.body });
    const { command, request, correlationId } = buildCommandRequest(req, auth);
    const response = await executor.executeCommand(command, request);
    return successToHttpResult(response, requestId, correlationId);
  } catch (err) {
    return errorToHttpResult(err, requestId);
  }
}
