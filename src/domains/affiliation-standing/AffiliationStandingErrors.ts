/**
 * AffiliationStanding boundary validation + idempotency helpers.
 *
 * Hand-written, dependency-free validation (no schema library). All failures use the stable
 * {@link ErrorCode} contract so callers branch on `code`, never message text. This is
 * request-shape validation only — governed authority (permissions, guards, tenant isolation,
 * idempotency) remains the kernel's responsibility. The effective-period shape (valid ISO
 * instants, from < until) is enforced here (and again by DB CHECK constraints) so a malformed
 * period never reaches the kernel or the domain effect.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type {
  OpenStandingDetails,
  RenewStandingDetails,
  StandingTransitionRequest,
} from './AffiliationStandingDtos.js';
import { STANDING_HIGH_RISK_TRIGGERS, STANDING_PATHWAYS, type StandingTrigger } from './index.js';

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

/** True when `value` is a parseable ISO-8601 instant. */
function isValidInstant(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function fail(message: string, details?: Record<string, unknown>): never {
  throw new AppError(
    ErrorCode.INVALID_INPUT,
    message,
    details !== undefined ? { details } : undefined,
  );
}

function requireDetails<T>(request: StandingTransitionRequest, trigger: string): T {
  if (request.details === undefined || request.details === null) {
    fail(`details are required for '${trigger}'.`, { trigger });
  }
  return request.details as T;
}

/** Validate an effective period: both instants valid and strictly ordered (from < until). */
function validatePeriod(from: unknown, until: unknown): void {
  if (!isValidInstant(from)) fail('details.effectiveFrom must be an ISO-8601 instant.');
  if (!isValidInstant(until)) fail('details.effectiveUntil must be an ISO-8601 instant.');
  if (Date.parse(from as string) >= Date.parse(until as string)) {
    fail('details.effectiveFrom must be strictly before details.effectiveUntil.');
  }
}

/**
 * Validate a transition request for the resolved trigger. Fails CLOSED on the first problem.
 */
export function validateStandingTransitionRequest(
  request: StandingTransitionRequest | undefined,
  trigger: StandingTrigger,
): void {
  if (request === undefined || request === null) {
    fail('AffiliationStanding transition request is required.');
  }
  if (isBlank(request.tenantId)) fail('tenantId is required.');
  if (isBlank(request.standingId)) fail('standingId is required.');
  if (request.actor === undefined || isBlank(request.actor.userId)) {
    fail('actor.userId is required.');
  }
  if (isBlank(request.idempotencyKey)) {
    fail('idempotencyKey is required (callers must supply a deterministic key).');
  }
  if (STANDING_HIGH_RISK_TRIGGERS.has(trigger) && isBlank(request.reason)) {
    fail(`reason is required for high-risk trigger '${trigger}'.`, { trigger });
  }

  switch (trigger) {
    case 'open': {
      const d = requireDetails<OpenStandingDetails>(request, trigger);
      if (isBlank(d.affiliationApplicationId)) fail('details.affiliationApplicationId is required.');
      if (isBlank(d.subjectId)) fail('details.subjectId is required.');
      if (isBlank(d.season)) fail('details.season is required.');
      if (!STANDING_PATHWAYS.has(d.pathway)) {
        fail('details.pathway is invalid.', { pathway: d.pathway });
      }
      validatePeriod(d.effectiveFrom, d.effectiveUntil);
      return;
    }
    case 'renew':
    case 'renew_active': {
      const d = requireDetails<RenewStandingDetails>(request, trigger);
      if (!STANDING_PATHWAYS.has(d.pathway)) {
        fail('details.pathway is invalid.', { pathway: d.pathway });
      }
      validatePeriod(d.effectiveFrom, d.effectiveUntil);
      return;
    }
    // activate / expire / suspend / reinstate / terminate: no required details (facts are read
    // from persisted state; the operational reason is validated above for high-risk triggers).
    default:
      return;
  }
}

/**
 * Recommended deterministic idempotency key shape:
 * `tenantId:AffiliationStanding:standingId:trigger:discriminator`. For renewal triggers pass the
 * new period start as the discriminator so a genuine retry replays and a new period is distinct.
 */
export function suggestStandingIdempotencyKey(input: {
  readonly tenantId: string;
  readonly standingId: string;
  readonly trigger: StandingTrigger;
  readonly discriminator: string;
}): string {
  return [
    input.tenantId,
    'AffiliationStanding',
    input.standingId,
    input.trigger,
    input.discriminator,
  ].join(':');
}
