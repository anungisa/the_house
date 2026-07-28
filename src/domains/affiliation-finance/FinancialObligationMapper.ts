/**
 * AffiliationFinancialObligation boundary mapper.
 *
 * Translates caller-facing DTOs ↔ kernel contracts. This is the ONLY place that knows both
 * shapes; it performs NO governed work. The command-specific `details` are carried to the kernel
 * as the opaque transition payload — consumed later by the {@link TransitionDomainEffect} (never
 * by the kernel itself) and never trusted by the guards (which read persisted facts).
 */

import type {
  TransitionActor,
  TransitionContext,
  TransitionInput,
  TransitionResult,
} from '../../governance/types/TransitionTypes.js';
import type {
  FinancialObligationTransitionRequest,
  FinancialObligationTransitionResponse,
} from './FinancialObligationDtos.js';
import {
  AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE,
  type FinancialObligationTrigger,
} from './index.js';

const DEFAULT_SCOPE_TYPE = 'platform' as const;

function buildActor(request: FinancialObligationTransitionRequest): TransitionActor {
  const a = request.actor;
  return {
    actorId: a.userId,
    tenantId: request.tenantId,
    scopeType: a.scopeType ?? DEFAULT_SCOPE_TYPE,
    ...(a.scopeId !== undefined ? { scopeId: a.scopeId } : {}),
    ...(a.organizationId !== undefined ? { organizationId: a.organizationId } : {}),
    ...(a.nationalOrganizationId !== undefined
      ? { nationalOrganizationId: a.nationalOrganizationId }
      : {}),
    ...(a.regionalOrganizationId !== undefined
      ? { regionalOrganizationId: a.regionalOrganizationId }
      : {}),
    ...(a.localOrganizationId !== undefined ? { localOrganizationId: a.localOrganizationId } : {}),
    ...(a.roleKeys !== undefined ? { roles: a.roleKeys } : {}),
  };
}

function buildContext(request: FinancialObligationTransitionRequest): TransitionContext {
  const metadata: Record<string, unknown> = {};
  if (request.reason !== undefined) metadata.reason = request.reason;
  return {
    tenantId: request.tenantId,
    scopeType: request.actor.scopeType ?? DEFAULT_SCOPE_TYPE,
    ...(request.correlationId !== undefined ? { correlationId: request.correlationId } : {}),
    ...(request.causationId !== undefined ? { causationId: request.causationId } : {}),
    workflowMetadata: metadata,
  };
}

/** Build the opaque payload the domain effect consumes: command details + the reason. */
function buildPayload(
  request: FinancialObligationTransitionRequest,
): Readonly<Record<string, unknown>> {
  return {
    ...(request.details ?? {}),
    ...(request.reason !== undefined ? { reason: request.reason } : {}),
  };
}

/** Map a validated request + resolved trigger into the kernel's {@link TransitionInput}. */
export function toFinancialTransitionInput(
  request: FinancialObligationTransitionRequest,
  trigger: FinancialObligationTrigger,
): TransitionInput {
  return {
    entityType: AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE,
    entityId: request.obligationId,
    trigger,
    idempotencyKey: request.idempotencyKey,
    actor: buildActor(request),
    context: buildContext(request),
    payload: buildPayload(request),
  };
}

/** Map a kernel {@link TransitionResult} into a caller-facing response DTO. */
export function toFinancialResponse(
  result: TransitionResult,
  obligationId: string,
): FinancialObligationTransitionResponse {
  switch (result.status) {
    case 'executed':
      return {
        status: 'executed',
        obligationId,
        ...(result.fromState !== undefined ? { fromState: result.fromState } : {}),
        ...(result.toState !== undefined ? { toState: result.toState } : {}),
        ...(result.stateTransitionId !== undefined
          ? { transitionId: result.stateTransitionId }
          : {}),
        ...(result.auditEventId !== undefined ? { auditEventId: result.auditEventId } : {}),
        ...(result.evidenceObjectId !== undefined
          ? { evidenceObjectId: result.evidenceObjectId }
          : {}),
      };

    case 'approval_required':
      return {
        status: 'approval_required',
        obligationId,
        ...(result.transitionRequestId !== undefined
          ? { transitionRequestId: result.transitionRequestId }
          : {}),
        ...(result.fromState !== undefined ? { currentState: result.fromState } : {}),
        ...(result.toState !== undefined ? { requestedToState: result.toState } : {}),
      };

    case 'idempotent_replay':
      if (result.transitionRequestId !== undefined) {
        return {
          status: 'approval_required',
          obligationId,
          transitionRequestId: result.transitionRequestId,
          ...(result.fromState !== undefined ? { currentState: result.fromState } : {}),
          ...(result.toState !== undefined ? { requestedToState: result.toState } : {}),
          replayed: true,
        };
      }
      return {
        status: 'executed',
        obligationId,
        ...(result.fromState !== undefined ? { fromState: result.fromState } : {}),
        ...(result.toState !== undefined ? { toState: result.toState } : {}),
        replayed: true,
      };

    case 'rejected':
    default:
      return {
        status: 'rejected',
        obligationId,
        code: result.reasonCode ?? 'REJECTED',
        message: result.reasonMessage ?? 'Transition rejected.',
        ...(result.guardResults !== undefined
          ? { failedGuards: result.guardResults.filter((g) => !g.passed).map((g) => g.guardCode) }
          : {}),
      };
  }
}
