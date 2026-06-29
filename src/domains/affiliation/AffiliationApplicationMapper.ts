/**
 * AffiliationApplication boundary mapper.
 *
 * Translates caller-facing DTOs ↔ kernel contracts. This is the ONLY place that knows the
 * shape of both worlds; it performs NO governed work (no state mutation, no guard
 * evaluation, no audit/evidence/outbox writes). It just shapes data for the kernel and
 * shapes the kernel's result back into a response DTO without leaking raw DB rows.
 */

import type {
  TransitionActor,
  TransitionContext,
  TransitionInput,
  TransitionResult,
} from '../../governance/types/TransitionTypes.js';
import type {
  AffiliationApplicationTransitionRequest,
  AffiliationApplicationTransitionResponse,
} from './AffiliationApplicationDtos.js';
import { AFFILIATION_APPLICATION_ENTITY_TYPE, type AffiliationTrigger } from './index.js';

/** Default organizational scope classification when a caller omits one. */
const DEFAULT_SCOPE_TYPE = 'platform' as const;

/** Build the opaque workflow metadata bundle carried to the kernel/outbox. */
function buildWorkflowMetadata(
  request: AffiliationApplicationTransitionRequest,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { seasonId: request.context.seasonId };
  if (request.reason !== undefined) {
    metadata.reason = request.reason;
  }
  if (request.actor.permissionKeys !== undefined) {
    metadata.permissionKeys = request.actor.permissionKeys;
  }
  return metadata;
}

/** Merge optional guard facts + caller payload into a single kernel payload (or undefined). */
function buildPayload(
  request: AffiliationApplicationTransitionRequest,
): Readonly<Record<string, unknown>> | undefined {
  if (request.facts === undefined && request.payload === undefined) {
    return undefined;
  }
  const payload: Record<string, unknown> = { ...(request.payload ?? {}) };
  if (request.facts !== undefined) {
    payload.facts = request.facts;
  }
  return payload;
}

function buildActor(request: AffiliationApplicationTransitionRequest): TransitionActor {
  const a = request.actor;
  return {
    actorId: a.userId,
    tenantId: request.tenantId,
    scopeType: a.scopeType ?? DEFAULT_SCOPE_TYPE,
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
    ...(a.roleKeys !== undefined ? { roles: a.roleKeys } : {}),
  };
}

function buildContext(request: AffiliationApplicationTransitionRequest): TransitionContext {
  const c = request.context;
  return {
    tenantId: request.tenantId,
    scopeType: c.scopeType ?? request.actor.scopeType ?? DEFAULT_SCOPE_TYPE,
    ...(c.scopeId !== undefined ? { scopeId: c.scopeId } : {}),
    ...(c.organizationId !== undefined ? { organizationId: c.organizationId } : {}),
    ...(c.organizationUnitId !== undefined ? { organizationUnitId: c.organizationUnitId } : {}),
    ...(c.nationalOrganizationId !== undefined
      ? { nationalOrganizationId: c.nationalOrganizationId }
      : {}),
    ...(c.regionalOrganizationId !== undefined
      ? { regionalOrganizationId: c.regionalOrganizationId }
      : {}),
    ...(c.localOrganizationId !== undefined ? { localOrganizationId: c.localOrganizationId } : {}),
    ...(c.correlationId !== undefined ? { correlationId: c.correlationId } : {}),
    ...(c.causationId !== undefined ? { causationId: c.causationId } : {}),
    workflowMetadata: buildWorkflowMetadata(request),
  };
}

/** Map a validated request + resolved trigger into the kernel's {@link TransitionInput}. */
export function toTransitionInput(
  request: AffiliationApplicationTransitionRequest,
  trigger: AffiliationTrigger,
): TransitionInput {
  const payload = buildPayload(request);
  return {
    entityType: AFFILIATION_APPLICATION_ENTITY_TYPE,
    entityId: request.applicationId,
    trigger,
    idempotencyKey: request.idempotencyKey,
    actor: buildActor(request),
    context: buildContext(request),
    ...(payload !== undefined ? { payload } : {}),
  };
}

/** Map a kernel {@link TransitionResult} into a caller-facing response DTO. */
export function toResponse(
  result: TransitionResult,
  applicationId: string,
): AffiliationApplicationTransitionResponse {
  switch (result.status) {
    case 'executed':
      return {
        status: 'executed',
        applicationId,
        ...(result.fromState !== undefined ? { fromState: result.fromState } : {}),
        ...(result.toState !== undefined ? { toState: result.toState } : {}),
        ...(result.stateTransitionId !== undefined ? { transitionId: result.stateTransitionId } : {}),
        ...(result.auditEventId !== undefined ? { auditEventId: result.auditEventId } : {}),
        ...(result.evidenceObjectId !== undefined
          ? { evidenceObjectId: result.evidenceObjectId }
          : {}),
      };

    case 'approval_required':
      return {
        status: 'approval_required',
        applicationId,
        ...(result.transitionRequestId !== undefined
          ? { transitionRequestId: result.transitionRequestId }
          : {}),
        ...(result.fromState !== undefined ? { currentState: result.fromState } : {}),
        ...(result.toState !== undefined ? { requestedToState: result.toState } : {}),
      };

    case 'idempotent_replay':
      // A replay echoes a prior outcome. A request-kind replay carries a transitionRequestId
      // (it was an approval); a transition-kind replay was a prior execution.
      if (result.transitionRequestId !== undefined) {
        return {
          status: 'approval_required',
          applicationId,
          transitionRequestId: result.transitionRequestId,
          ...(result.fromState !== undefined ? { currentState: result.fromState } : {}),
          ...(result.toState !== undefined ? { requestedToState: result.toState } : {}),
          replayed: true,
        };
      }
      return {
        status: 'executed',
        applicationId,
        ...(result.fromState !== undefined ? { fromState: result.fromState } : {}),
        ...(result.toState !== undefined ? { toState: result.toState } : {}),
        replayed: true,
      };

    case 'rejected':
    default:
      return {
        status: 'rejected',
        applicationId,
        code: result.reasonCode ?? 'REJECTED',
        message: result.reasonMessage ?? 'Transition rejected.',
        ...(result.guardResults !== undefined
          ? {
              failedGuards: result.guardResults
                .filter((g) => !g.passed)
                .map((g) => g.guardCode),
            }
          : {}),
      };
  }
}
