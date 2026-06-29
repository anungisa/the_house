/**
 * AffiliationApplication boundary validation + idempotency helpers.
 *
 * Hand-written, dependency-free validation (no schema library). All failures use the
 * stable {@link ErrorCode} contract so callers branch on `code`, never message text.
 *
 * Idempotency posture: the service REQUIRES a caller-supplied idempotency key for every
 * governed action and never fabricates one. {@link suggestIdempotencyKey} offers a
 * recommended deterministic shape but does not enforce it.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { AffiliationApplicationTransitionRequest } from './AffiliationApplicationDtos.js';
import { AFFILIATION_HIGH_RISK_TRIGGERS, type AffiliationTrigger } from './index.js';

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

function fail(message: string, details?: Record<string, unknown>): never {
  throw new AppError(ErrorCode.INVALID_INPUT, message, details !== undefined ? { details } : undefined);
}

/**
 * Validate a transition request for the resolved trigger. Fails CLOSED on the first
 * problem. This is request-shape validation only — governed authority (permissions,
 * guards, tenant isolation) remains the kernel's responsibility.
 */
export function validateTransitionRequest(
  request: AffiliationApplicationTransitionRequest | undefined,
  trigger: AffiliationTrigger,
): void {
  if (request === undefined || request === null) {
    fail('AffiliationApplication transition request is required.');
  }
  if (isBlank(request.tenantId)) {
    fail('tenantId is required.');
  }
  if (isBlank(request.applicationId)) {
    fail('applicationId is required.');
  }
  if (request.actor === undefined || isBlank(request.actor.userId)) {
    fail('actor.userId is required.');
  }
  if (request.context === undefined || isBlank(request.context.seasonId)) {
    fail('context.seasonId is required.');
  }
  if (isBlank(request.idempotencyKey)) {
    fail('idempotencyKey is required (callers must supply a deterministic key).');
  }
  if (AFFILIATION_HIGH_RISK_TRIGGERS.has(trigger) && isBlank(request.reason)) {
    fail(`reason is required for high-risk trigger '${trigger}'.`, { trigger });
  }
}

/**
 * Recommended deterministic idempotency key shape. Callers MAY use this; the service does
 * not auto-apply it. Shape: `tenantId:AffiliationApplication:applicationId:trigger:seasonId:userId`.
 */
export function suggestIdempotencyKey(input: {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly trigger: AffiliationTrigger;
  readonly seasonId: string;
  readonly actorUserId: string;
}): string {
  return [
    input.tenantId,
    'AffiliationApplication',
    input.applicationId,
    input.trigger,
    input.seasonId,
    input.actorUserId,
  ].join(':');
}
