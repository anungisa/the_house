/**
 * The Button — `GET /v1/button/context` HTTP adapter (protocol-pure).
 *
 * Resolves the TRUSTED identity from the shared `x-house-*` header contract, then delegates to
 * {@link ButtonContextService} to assemble the representative-safe context. Tenant + actor come
 * EXCLUSIVELY from the resolved {@link AuthContext}; the browser's requested organization/season/
 * locale (query string) are re-authorized inside the service and never trusted blindly.
 *
 * Errors map to a sanitized `{ status, code, message, requestId }` envelope — no stack traces,
 * SQL, internal ids, cross-tenant identifiers, or policy detail ever leave this boundary.
 */

import { randomUUID } from 'node:crypto';

import { AppError } from '../../shared/errors/AppError.js';
import { ErrorCode } from '../../shared/errors/AppError.js';
import type { AuthContextResolver } from '../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../auth/DemoAuthContextResolver.js';
import { resolveOrganizationAuth } from '../organization/organizationHttpAuth.js';
import {
  NOOP_TELEMETRY,
  TelemetryAttributeKeys,
  TelemetryCounters,
  TelemetryResult,
} from '../../observability/index.js';
import type { Telemetry } from '../../observability/index.js';
import type { ButtonContextService } from './ButtonContextService.js';

/** Default resolver mirrors the other read adapters: demo identity unless one is supplied. */
const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

/** Protocol-pure request the server hands the adapter (headers + parsed query). */
export interface ButtonContextHttpRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly query: Readonly<Record<string, string | undefined>>;
}

/** Protocol-pure result: an HTTP status code and a JSON-serializable body. */
export interface ButtonContextHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

/** Dependencies for the Button context adapter: the assembly service and optional telemetry. */
export interface ButtonContextHttpDeps {
  readonly service: ButtonContextService;
  readonly telemetry?: Telemetry;
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
    default:
      return 500;
  }
}

function errorToButtonHttpResult(err: unknown, requestId: string): ButtonContextHttpResult {
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
 * Handle one `GET /v1/button/context` request. Never throws: any error is mapped to a sanitized
 * HTTP result. Emits a `button.context.read.count` counter (success/failure) for visibility only.
 */
export async function handleButtonContext(
  deps: ButtonContextHttpDeps,
  req: ButtonContextHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ButtonContextHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveOrganizationAuth(resolver, req.headers);
    const selection: { organizationId?: string; season?: string; locale?: string } = {};
    if (req.query['organizationId'] !== undefined) {
      selection.organizationId = req.query['organizationId'];
    }
    if (req.query['season'] !== undefined) selection.season = req.query['season'];
    if (req.query['locale'] !== undefined) selection.locale = req.query['locale'];

    const context = await deps.service.resolve(auth, selection);
    telemetry.incrementCounter(TelemetryCounters.buttonContextRead, 1, {
      [TelemetryAttributeKeys.operation]: 'context',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body: { status: 'ok', requestId, context } };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.buttonContextRead, 1, {
      [TelemetryAttributeKeys.operation]: 'context',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return errorToButtonHttpResult(err, requestId);
  }
}
