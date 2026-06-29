/**
 * AffiliationApplication HTTP adapter (transport-agnostic core).
 *
 * This is a THIN transport adapter. It exposes the existing domain boundary
 * ({@link AffiliationApplicationService} / `executeCommand`) over an HTTP-shaped request
 * and translates the returned response DTO (and any thrown {@link AppError}) into an HTTP
 * status + JSON body. It is the only HTTP-specific seam in the affiliation slice.
 *
 * Architectural rules (DO NOT violate — these keep the kernel authoritative):
 *  - The adapter contains NO lifecycle/transition logic and evaluates NO guards.
 *  - It NEVER writes audit/evidence/outbox, NEVER mutates governance.entity_state or any
 *    domain status, and NEVER touches the store/kernel directly.
 *  - Its only collaborator is the domain command boundary ({@link AffiliationCommandExecutor}),
 *    so every governed change still flows through GovernanceKernel.transition() exactly once.
 *  - Caller-supplied guard "facts" are REJECTED: guard outcomes derive from persisted
 *    domain state, never from request payloads.
 *
 * This module is framework-free and protocol-pure: it takes a parsed request shape and
 * returns `{ status, body }`. The native HTTP server (see ./server.ts) is responsible for
 * socket I/O, routing, and JSON (de)serialization.
 */

import { randomUUID } from 'node:crypto';
import {
  AFFILIATION_APPLICATION_COMMANDS,
  type AffiliationApplicationCommand,
} from '../domains/affiliation/AffiliationApplicationCommands.js';
import type {
  AffiliationActorDto,
  AffiliationContextDto,
  AffiliationApplicationTransitionRequest,
  AffiliationApplicationTransitionResponse,
} from '../domains/affiliation/AffiliationApplicationDtos.js';
import { AppError, ErrorCode } from '../shared/errors/AppError.js';
import type { AuthActor, AuthContext } from './auth/AuthContext.js';
import type { AuthContextResolver } from './auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from './auth/DemoAuthContextResolver.js';

/**
 * Default edge-identity resolver. LOCAL/DEMO ONLY: trusts body-supplied actor/tenant. The
 * server/composition inject a config-selected resolver; this default only keeps the
 * adapter's pre-auth ergonomics for tests and direct callers.
 */
const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

/**
 * Minimal domain surface the adapter depends on. Depending on the command-executor method
 * (not the concrete service) keeps the adapter unit-testable and prevents it from reaching
 * past the boundary. {@link AffiliationApplicationService} satisfies this interface.
 */
export interface AffiliationCommandExecutor {
  executeCommand(
    command: string,
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse>;
}

/**
 * An HTTP-shaped request, already parsed by the transport. `action` is the FSM
 * trigger-style verb from the URL path (e.g. 'submit', 'review_start', 'approve').
 */
export interface AffiliationHttpRequest {
  /** Path parameter: the AffiliationApplication id. Authoritative over any body value. */
  readonly applicationId: string;
  /** Path parameter: the transition action (FSM trigger name). */
  readonly action: string;
  /** Header map with lowercased names (native Node http lowercases header keys). */
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Parsed JSON body (expected to be an object) or undefined when no body was sent. */
  readonly body: unknown;
}

/** Protocol-pure result: an HTTP status code and a JSON-serializable body. */
export interface AffiliationHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

/**
 * URL action (FSM trigger) → domain command name. Derived from the single source of truth
 * ({@link AFFILIATION_APPLICATION_COMMANDS}); no parallel vocabulary is introduced.
 */
const ACTION_TO_COMMAND: Readonly<Record<string, AffiliationApplicationCommand>> = (() => {
  const map: Record<string, AffiliationApplicationCommand> = {};
  for (const command of Object.keys(
    AFFILIATION_APPLICATION_COMMANDS,
  ) as AffiliationApplicationCommand[]) {
    map[AFFILIATION_APPLICATION_COMMANDS[command]] = command;
  }
  return Object.freeze(map);
})();

function commandForAction(action: string): AffiliationApplicationCommand | undefined {
  return ACTION_TO_COMMAND[action];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Map the trusted {@link AuthActor} onto the affiliation actor DTO (no identity from body). */
function authActorToDto(a: AuthActor): AffiliationActorDto {
  return {
    userId: a.userId,
    roleKeys: a.roleKeys,
    permissionKeys: a.permissionKeys,
    ...(a.scopeType !== undefined ? { scopeType: a.scopeType } : {}),
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
  };
}

/**
 * Reconcile the idempotency key from the `Idempotency-Key` header and/or the request body.
 * Header is preferred. If BOTH are present and DIFFER, the request is rejected (fail
 * closed) so a caller can never accidentally submit two keys for one logical action.
 * Returns '' when neither is present so the domain's required-field validation rejects it.
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
  return headerKey ?? bodyKey ?? '';
}

/**
 * Translate an HTTP-shaped request into a domain command name + typed transition request.
 * Adapter-level concerns ONLY (action→command resolution, idempotency reconciliation,
 * facts rejection). Field-presence/required validation is deferred to the domain boundary,
 * so the kernel/domain remains the single source of validation truth.
 *
 * The trusted `auth` context (not the request body) is authoritative for tenant + actor.
 */
function buildCommandRequest(
  req: AffiliationHttpRequest,
  auth: AuthContext,
): {
  readonly command: AffiliationApplicationCommand;
  readonly request: AffiliationApplicationTransitionRequest;
  readonly correlationId: string | undefined;
} {
  const command = commandForAction(req.action);
  if (command === undefined) {
    // Unknown action verb in the URL — fail closed (a non-existent command, not a state
    // conflict), surfaced as 400 by the error mapper.
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      `Unknown AffiliationApplication transition action: ${req.action}`,
      { details: { action: req.action } },
    );
  }

  if (!isPlainObject(req.body)) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'Request body must be a JSON object.');
  }
  const body = req.body;

  // Caller-supplied guard facts are not accepted over HTTP. Guard outcomes derive from
  // PERSISTED domain state; accepting facts here would let a caller influence guards.
  if (Object.prototype.hasOwnProperty.call(body, 'facts')) {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      'Caller-supplied guard facts are not accepted over HTTP; guard outcomes derive from persisted state.',
    );
  }

  const context = (
    isPlainObject(body['context']) ? body['context'] : {}
  ) as unknown as AffiliationContextDto;
  const reason = asString(body['reason']);
  const payload = isPlainObject(body['payload']) ? body['payload'] : undefined;

  const request: AffiliationApplicationTransitionRequest = {
    // Tenant + actor come from the TRUSTED identity context, never the request body.
    tenantId: auth.tenantId,
    // Path parameter is authoritative for the resource id.
    applicationId: req.applicationId,
    actor: authActorToDto(auth.actor),
    context,
    idempotencyKey: resolveIdempotencyKey(req.headers, body),
    ...(reason !== undefined ? { reason } : {}),
    ...(payload !== undefined ? { payload } : {}),
  };

  return { command, request, correlationId: asString(context.correlationId) };
}

function envelope(
  body: AffiliationApplicationTransitionResponse,
  requestId: string,
  correlationId: string | undefined,
): Record<string, unknown> {
  return {
    ...body,
    requestId,
    ...(correlationId !== undefined ? { correlationId } : {}),
  };
}

/** Map a rejected response DTO's stable code to an HTTP status. */
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
      // Any other governed rejection is a conflict with current governed state.
      return 409;
  }
}

/** Map a thrown {@link AppError} code to an HTTP status. */
function appErrorHttpStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.INVALID_INPUT:
      return 400;
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.PERMISSION_DENIED:
    case ErrorCode.FORBIDDEN:
      return 403;
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
  response: AffiliationApplicationTransitionResponse,
  requestId: string,
  correlationId: string | undefined,
): AffiliationHttpResult {
  const body = envelope(response, requestId, correlationId);
  if (response.status === 'executed') {
    return { status: 200, body };
  }
  if (response.status === 'approval_required') {
    return { status: 202, body };
  }
  // response.status === 'rejected'
  return { status: rejectedHttpStatus(response.code), body };
}

/**
 * Translate any error into a safe HTTP result. Known {@link AppError}s surface their stable
 * (NSO-generic) code + authored message. Anything else (e.g. a raw SQL/driver error) is
 * collapsed into an opaque 500 so internal details never leak to the caller.
 */
export function errorToHttpResult(err: unknown, requestId: string): AffiliationHttpResult {
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
 * Handle one HTTP-shaped AffiliationApplication transition request.
 *
 * Flow: resolve TRUSTED identity (auth context) → map request (tenant/actor come from the
 * auth context, not the body) → call the domain boundary's `executeCommand` EXACTLY ONCE →
 * map the response DTO (or caught error) to `{ status, body }`. The adapter never bypasses
 * the service/kernel and never performs governed writes itself.
 */
export async function handleAffiliationHttpTransition(
  executor: AffiliationCommandExecutor,
  req: AffiliationHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<AffiliationHttpResult> {
  try {
    const auth = resolver.resolve({ headers: req.headers, body: req.body });
    const { command, request, correlationId } = buildCommandRequest(req, auth);
    const response = await executor.executeCommand(command, request);
    return successToHttpResult(response, requestId, correlationId);
  } catch (err) {
    return errorToHttpResult(err, requestId);
  }
}
