/**
 * AffiliationFinancialObligation boundary validation + idempotency helpers.
 *
 * Hand-written, dependency-free validation (no schema library). All failures use the stable
 * {@link ErrorCode} contract so callers branch on `code`, never message text. This is
 * request-shape validation only — governed authority (permissions, guards, tenant isolation,
 * idempotency) remains the kernel's responsibility. Amount/currency shape is enforced here (and
 * again by the DB CHECK) so a malformed value never reaches the kernel or the domain effect.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type {
  AccountingConfirmationDetails,
  AssessmentDetails,
  FinancialObligationTransitionRequest,
  ProviderAcknowledgementDetails,
  RevisionDetails,
} from './FinancialObligationDtos.js';
import { isValidAmount, isValidCurrency } from './Money.js';
import { FINANCIAL_OBLIGATION_HIGH_RISK_TRIGGERS, type FinancialObligationTrigger } from './index.js';

/** Obligation types accepted by the domain (mirrors the DB CHECK). */
export const OBLIGATION_TYPES: ReadonlySet<string> = new Set([
  'affiliation_fee',
  'assessment',
  'levy',
  'penalty',
  'other',
]);

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

function fail(message: string, details?: Record<string, unknown>): never {
  throw new AppError(
    ErrorCode.INVALID_INPUT,
    message,
    details !== undefined ? { details } : undefined,
  );
}

function requireDetails<T>(request: FinancialObligationTransitionRequest, trigger: string): T {
  if (request.details === undefined || request.details === null) {
    fail(`details are required for '${trigger}'.`, { trigger });
  }
  return request.details as T;
}

/**
 * Validate a transition request for the resolved trigger. Fails CLOSED on the first problem.
 */
export function validateFinancialTransitionRequest(
  request: FinancialObligationTransitionRequest | undefined,
  trigger: FinancialObligationTrigger,
): void {
  if (request === undefined || request === null) {
    fail('AffiliationFinancialObligation transition request is required.');
  }
  if (isBlank(request.tenantId)) fail('tenantId is required.');
  if (isBlank(request.obligationId)) fail('obligationId is required.');
  if (request.actor === undefined || isBlank(request.actor.userId)) {
    fail('actor.userId is required.');
  }
  if (isBlank(request.idempotencyKey)) {
    fail('idempotencyKey is required (callers must supply a deterministic key).');
  }
  if (FINANCIAL_OBLIGATION_HIGH_RISK_TRIGGERS.has(trigger) && isBlank(request.reason)) {
    fail(`reason is required for high-risk trigger '${trigger}'.`, { trigger });
  }

  switch (trigger) {
    case 'assess': {
      const d = requireDetails<AssessmentDetails>(request, trigger);
      if (isBlank(d.affiliationApplicationId)) fail('details.affiliationApplicationId is required.');
      if (isBlank(d.subjectId)) fail('details.subjectId is required.');
      if (isBlank(d.season)) fail('details.season is required.');
      if (!OBLIGATION_TYPES.has(d.obligationType)) {
        fail('details.obligationType is invalid.', { obligationType: d.obligationType });
      }
      if (isBlank(d.assessmentBasis)) fail('details.assessmentBasis is required.');
      if (!isValidAmount(d.amount)) fail('details.amount must be a positive decimal (≤ 2 dp).');
      if (!isValidCurrency(d.currency)) fail('details.currency must be a 3-letter code.');
      return;
    }
    case 'revise_assessment': {
      const d = requireDetails<RevisionDetails>(request, trigger);
      if (!isValidAmount(d.amount)) fail('details.amount must be a positive decimal (≤ 2 dp).');
      if (!isValidCurrency(d.currency)) fail('details.currency must be a 3-letter code.');
      if (isBlank(d.assessmentBasis)) fail('details.assessmentBasis is required.');
      return;
    }
    case 'acknowledge': {
      const d = requireDetails<ProviderAcknowledgementDetails>(request, trigger);
      if (isBlank(d.externalReference)) fail('details.externalReference is required.');
      if (d.amount !== undefined && !isValidAmount(d.amount)) {
        fail('details.amount, when present, must be a positive decimal (≤ 2 dp).');
      }
      if (d.currency !== undefined && !isValidCurrency(d.currency)) {
        fail('details.currency, when present, must be a 3-letter code.');
      }
      return;
    }
    case 'confirm': {
      const d = requireDetails<AccountingConfirmationDetails>(request, trigger);
      if (isBlank(d.externalReference)) fail('details.externalReference is required.');
      if (!isValidAmount(d.amount)) fail('details.amount must be a positive decimal (≤ 2 dp).');
      if (!isValidCurrency(d.currency)) fail('details.currency must be a 3-letter code.');
      return;
    }
    // reconcile / record_mismatch / resolve_mismatch / waive / exempt / close: no required
    // details (facts are read from persisted state; clearance reason is optional).
    default:
      return;
  }
}

/**
 * Recommended deterministic idempotency key shape. Shape:
 * `tenantId:AffiliationFinancialObligation:obligationId:trigger:discriminator`.
 * For external-event triggers pass the external reference as the discriminator so a genuine
 * retry replays and a distinct event is distinct.
 */
export function suggestFinancialIdempotencyKey(input: {
  readonly tenantId: string;
  readonly obligationId: string;
  readonly trigger: FinancialObligationTrigger;
  readonly discriminator: string;
}): string {
  return [
    input.tenantId,
    'AffiliationFinancialObligation',
    input.obligationId,
    input.trigger,
    input.discriminator,
  ].join(':');
}
