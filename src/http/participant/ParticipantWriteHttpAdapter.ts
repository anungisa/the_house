/**
 * Participant Registry WRITE HTTP adapter.
 *
 * Protocol-pure mutation handlers over the validated {@link ParticipantRegistryService}:
 *  - `POST /v1/participants` — create a participant.
 *  - `PATCH /v1/participants/:participantId` — update a participant's safe profile fields.
 *  - `POST /v1/participants/:participantId/status-transitions` — transition a participant's
 *    reference-data status (draft/active/suspended/archived).
 *  - `POST /v1/organizations/:organizationId/participants` — record an organization↔participant
 *    relationship (reference data).
 *  - `POST /v1/organizations/:organizationId/participants/:relationshipId/status-transitions` —
 *    transition an existing relationship's reference-data status (active/suspended/ended).
 *
 * Architectural boundaries (DO NOT violate):
 *  - All mutations go THROUGH {@link ParticipantRegistryService}. The adapter never writes to a
 *    store directly, never enqueues an outbox message itself (the service owns the transactional
 *    outbox), never touches governance.entity_state, and never invokes the Governance Kernel.
 *    Participant status is REFERENCE DATA, not a governed lifecycle FSM — the status-transition
 *    route changes a denormalized status field, it does not drive a kernel state machine.
 *  - Tenant comes EXCLUSIVELY from the resolved {@link AuthContext} (the `x-house-*` trusted
 *    headers). The body never carries identity; a cross-tenant participant is invisible (RLS), so
 *    a write against another tenant's participant returns 404 — never revealing cross-tenant
 *    existence.
 *  - Authorization is centralized: create/update use the `participant.write` action; the status
 *    transition uses the distinct `participant.status.write` action (neither implies the other,
 *    and neither implies `participant.read`). Denials emit the sanitized `authz.denied` signal.
 *
 * IDEMPOTENCY: create REQUIRES a client-supplied `participantId` and an `Idempotency-Key` header. A
 * duplicate `participantId` for the tenant is rejected with 409 (there is no replay cache yet — we
 * do not pretend a retry is a verified replay). The status transition also REQUIRES an
 * `Idempotency-Key` header and is naturally idempotent: re-applying the same target status is a
 * no-op (the service emits no duplicate outbox signal). The idempotency key is propagated as
 * outbox correlation lineage only. PATCH is deterministic and does not require an idempotency key.
 *
 * PRIVACY: a response may carry the participant's `email` (authorized same-tenant read-back). That
 * email — and the participant's names — NEVER appear in telemetry or outbox signals.
 */

import { randomUUID } from 'node:crypto';

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import { assertAuthorized, AuthorizationAction } from '../../authz/index.js';
import {
  NOOP_TELEMETRY,
  TelemetryAttributeKeys,
  TelemetryCounters,
  TelemetryResult,
  type Telemetry,
} from '../../observability/index.js';
import type { AuthContextResolver } from '../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../auth/DemoAuthContextResolver.js';
import { requireTenant, resolveParticipantAuth } from './participantHttpAuth.js';
import {
  toParticipantDto,
  toOrganizationParticipantDto,
  type ParticipantReadHttpResult,
} from './ParticipantReadHttpAdapter.js';
import {
  PARTICIPANT_CREATE_BODY_KEYS,
  PARTICIPANT_ORGANIZATION_LINK_BODY_KEYS,
  PARTICIPANT_ORGANIZATION_LINK_STATUS_TRANSITION_BODY_KEYS,
  PARTICIPANT_ORGANIZATION_LINK_STATUS_TRANSITION_REASON_MAX_LENGTH,
  PARTICIPANT_STATUS_TRANSITION_BODY_KEYS,
  PARTICIPANT_STATUS_TRANSITION_REASON_MAX_LENGTH,
  PARTICIPANT_UPDATE_BODY_KEYS,
  type OrganizationParticipantLinkHttpRequest,
  type OrganizationParticipantLinkResponseBody,
  type OrganizationParticipantStatusTransitionHttpRequest,
  type OrganizationParticipantStatusTransitionResponseBody,
  type ParticipantCreateHttpRequest,
  type ParticipantStatusTransitionHttpRequest,
  type ParticipantUpdateHttpRequest,
  type ParticipantWriteResponseBody,
} from './ParticipantWriteHttpDtos.js';
import type {
  ChangeOrganizationParticipantStatusInput,
  ChangeParticipantStatusInput,
  CreateParticipantInput,
  LinkParticipantToOrganizationInput,
  ParticipantRegistryService,
  UpdateParticipantInput,
} from '../../domains/participant-registry/ParticipantRegistryService.js';
import {
  isParticipantStatus,
  isRelationshipStatus,
  isRelationshipType,
  type OrganizationParticipantView,
  type ParticipantExternalRef,
  type ParticipantStatus,
  type RelationshipStatus,
  type RelationshipType,
  type ParticipantView,
} from '../../domains/participant-registry/ParticipantTypes.js';

/** Default resolver mirrors the read adapter: demo identity unless one is supplied. */
const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

/** Lowercased HTTP header carrying the create idempotency token. */
const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/**
 * Narrow read port used for write pre-checks: the create duplicate probe (so a duplicate
 * `participantId` deterministically maps to 409 rather than a silent service-level replay) and the
 * organization-link idempotent read-back (so a pre-existing active relationship of the same type
 * returns 200 rather than a fabricated 201). Both the in-memory and Pg registry stores satisfy
 * this — it is a structural subset of the registry store.
 */
export interface ParticipantExistenceReader {
  getParticipantById(tenantId: string, participantId: string): Promise<ParticipantView | undefined>;
  findActiveOrganizationLink(
    tenantId: string,
    organizationId: string,
    participantId: string,
    relationshipType: RelationshipType,
  ): Promise<OrganizationParticipantView | undefined>;
  getOrganizationLinkById(
    tenantId: string,
    relationshipId: string,
  ): Promise<OrganizationParticipantView | undefined>;
}

/** Dependencies for the write adapter: the registry service, a read port, and optional telemetry. */
export interface ParticipantWriteHttpDeps {
  /** The validated domain command boundary. ALL mutations go through this. */
  readonly service: ParticipantRegistryService;
  /** Read port for the create duplicate pre-check + org-link idempotent read-back. Same store. */
  readonly readStore: ParticipantExistenceReader;
  /**
   * Optional telemetry sink. Emits a `participant.registry.write.count` counter tagged with the
   * operation (`create`/`update`) and result (`success`/`failure`). Never carries identifiers,
   * headers, email, names, body bytes, or secrets.
   */
  readonly telemetry?: Telemetry;
}

/** Coerce an unknown JSON body into a plain object (reject arrays/null/primitives). */
function asObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'Request body must be a JSON object.');
  }
  return body as Record<string, unknown>;
}

/** Reject any body key outside the CLOSED allow-list (fails closed on unexpected/sensitive fields). */
function rejectUnknownKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `Unknown field '${key}' is not allowed for ${label}.`,
      );
    }
  }
}

/** Read the required, non-blank `Idempotency-Key` header for a create. Throws 400 when absent. */
function requireIdempotencyKey(headers: Readonly<Record<string, string | undefined>>): string {
  const raw = headers[IDEMPOTENCY_KEY_HEADER];
  if (raw === undefined || raw.trim() === '') {
    throw new AppError(ErrorCode.INVALID_INPUT, 'Idempotency-Key header is required.');
  }
  return raw.trim();
}

/** Map a write error code to an HTTP status. */
function writeAppErrorStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.INVALID_INPUT:
    case ErrorCode.PARTICIPANT_INVALID_EMAIL:
      return 400;
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.FORBIDDEN:
    case ErrorCode.PERMISSION_DENIED:
      return 403;
    case ErrorCode.PARTICIPANT_NOT_FOUND:
    case ErrorCode.ORGANIZATION_NOT_FOUND:
    case ErrorCode.ORGANIZATION_PARTICIPANT_NOT_FOUND:
      return 404;
    case ErrorCode.PARTICIPANT_ALREADY_EXISTS:
    case ErrorCode.ORGANIZATION_PARTICIPANT_ALREADY_EXISTS:
    case ErrorCode.PARTICIPANT_ARCHIVED_NO_ACTIVE_LINK:
      return 409;
    default:
      return 500;
  }
}

/** Translate any error into a safe HTTP result; unknown errors collapse to an opaque 500. */
export function participantWriteErrorToHttpResult(
  err: unknown,
  requestId: string,
): ParticipantReadHttpResult {
  if (err instanceof AppError) {
    return {
      status: writeAppErrorStatus(err.code),
      body: { status: 'error', code: err.code, message: err.message, requestId },
    };
  }
  return {
    status: 500,
    body: { status: 'error', code: 'INTERNAL', message: 'Internal server error.', requestId },
  };
}

/**
 * Handle `POST /v1/participants` — create a participant.
 *
 * Flow: resolve identity (tenant from auth, never the body) → enforce `participant.write` →
 * require the `Idempotency-Key` header → validate the CLOSED create body (require client-supplied
 * `participantId`; restrict initial `status` to draft/active) → duplicate pre-check (409 on an
 * existing id for the tenant) → {@link ParticipantRegistryService.createParticipant} → project to
 * the safe DTO. The service owns the transactional outbox; the adapter enqueues nothing itself.
 */
export async function handleParticipantCreate(
  deps: ParticipantWriteHttpDeps,
  req: ParticipantCreateHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ParticipantReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveParticipantAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.ParticipantWrite, telemetry);

    const idempotencyKey = requireIdempotencyKey(req.headers);

    const obj = asObjectBody(req.body);
    rejectUnknownKeys(obj, PARTICIPANT_CREATE_BODY_KEYS, 'participant create');

    const participantIdRaw = obj['participantId'];
    if (typeof participantIdRaw !== 'string' || participantIdRaw.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'participantId is required.');
    }
    const participantId = participantIdRaw.trim();

    const statusRaw = obj['status'];
    if (statusRaw !== undefined && statusRaw !== 'draft' && statusRaw !== 'active') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'status must be one of: draft, active.');
    }

    // Duplicate pre-check: an existing id for THIS tenant is a 409 (no silent replay in phase 1).
    const existing = await deps.readStore.getParticipantById(tenantId, participantId);
    if (existing !== undefined) {
      throw new AppError(
        ErrorCode.PARTICIPANT_ALREADY_EXISTS,
        'A participant with this id already exists.',
      );
    }

    const input: CreateParticipantInput = {
      tenantId,
      participantId,
      displayName: obj['displayName'] as string,
      ...(obj['givenName'] !== undefined ? { givenName: obj['givenName'] as string } : {}),
      ...(obj['familyName'] !== undefined ? { familyName: obj['familyName'] as string } : {}),
      ...(obj['email'] !== undefined ? { email: obj['email'] as string } : {}),
      ...(statusRaw !== undefined ? { status: statusRaw } : {}),
      ...(obj['externalRefs'] !== undefined
        ? { externalRefs: obj['externalRefs'] as readonly ParticipantExternalRef[] }
        : {}),
      correlationId: idempotencyKey,
      requestId,
    };

    const view = await deps.service.createParticipant(input);

    const body: ParticipantWriteResponseBody = {
      status: 'ok',
      participant: toParticipantDto(view),
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.participantRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'create',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 201, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.participantRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'create',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return participantWriteErrorToHttpResult(err, requestId);
  }
}

/**
 * Handle `PATCH /v1/participants/:participantId` — update a participant's safe profile fields.
 *
 * Flow: resolve identity → enforce `participant.write` → validate the CLOSED update body
 * (`null` clears, omitted leaves unchanged, string sets; at least one field required;
 * `status`/organization-link fields are rejected as unknown keys) →
 * {@link ParticipantRegistryService.updateParticipant} → project to the safe DTO. A missing or
 * cross-tenant participant returns 404 (never reveals cross-tenant existence). The service owns
 * email normalization and the transactional outbox.
 */
export async function handleParticipantUpdate(
  deps: ParticipantWriteHttpDeps,
  req: ParticipantUpdateHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ParticipantReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveParticipantAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.ParticipantWrite, telemetry);

    if (req.participantId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'participantId path parameter is required.');
    }
    const participantId = req.participantId.trim();

    const obj = asObjectBody(req.body);
    rejectUnknownKeys(obj, PARTICIPANT_UPDATE_BODY_KEYS, 'participant update');
    if (Object.keys(obj).length === 0) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'At least one updatable field is required.',
      );
    }

    const input: UpdateParticipantInput = {
      tenantId,
      participantId,
      ...('displayName' in obj ? { displayName: obj['displayName'] as string } : {}),
      ...('givenName' in obj ? { givenName: obj['givenName'] as string | null } : {}),
      ...('familyName' in obj ? { familyName: obj['familyName'] as string | null } : {}),
      ...('email' in obj ? { email: obj['email'] as string | null } : {}),
      ...('externalRefs' in obj
        ? { externalRefs: obj['externalRefs'] as readonly ParticipantExternalRef[] | null }
        : {}),
      requestId,
    };

    const view = await deps.service.updateParticipant(input);

    const body: ParticipantWriteResponseBody = {
      status: 'ok',
      participant: toParticipantDto(view),
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.participantRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'update',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.participantRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'update',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return participantWriteErrorToHttpResult(err, requestId);
  }
}

/**
 * Handle `POST /v1/participants/:participantId/status-transitions` — transition a participant's
 * reference-data status.
 *
 * Flow: resolve identity (tenant from auth, never the body) → enforce the distinct
 * `participant.status.write` action → require the `Idempotency-Key` header → validate the path
 * `participantId` → validate the CLOSED status-transition body (require a known `targetStatus`;
 * `reason` optional + length-capped; any other key — a profile field, an organization-link field,
 * or an out-of-scope behavior field — is rejected) →
 * {@link ParticipantRegistryService.changeParticipantStatus} → project to the safe DTO.
 *
 * A missing or cross-tenant participant returns 404 (never reveals cross-tenant existence). The
 * status change is naturally idempotent: re-applying the current status is a service-level no-op
 * that emits no duplicate outbox signal. `reason` is validated at the boundary but NOT persisted —
 * the service records no free-text note — and never enters the outbox payload or telemetry. The
 * service owns the transactional outbox; the adapter enqueues nothing itself and never invokes the
 * Governance Kernel (participant status is reference data, not a governed lifecycle FSM).
 */
export async function handleParticipantStatusTransition(
  deps: ParticipantWriteHttpDeps,
  req: ParticipantStatusTransitionHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ParticipantReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveParticipantAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.ParticipantStatusWrite, telemetry);

    const idempotencyKey = requireIdempotencyKey(req.headers);

    if (req.participantId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'participantId path parameter is required.');
    }
    const participantId = req.participantId.trim();

    const obj = asObjectBody(req.body);
    rejectUnknownKeys(obj, PARTICIPANT_STATUS_TRANSITION_BODY_KEYS, 'participant status transition');

    const targetStatusRaw = obj['targetStatus'];
    if (!isParticipantStatus(targetStatusRaw)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'targetStatus must be one of: draft, active, suspended, archived.',
      );
    }
    const targetStatus: ParticipantStatus = targetStatusRaw;

    const reasonRaw = obj['reason'];
    if (reasonRaw !== undefined) {
      if (typeof reasonRaw !== 'string') {
        throw new AppError(ErrorCode.INVALID_INPUT, 'reason must be a string when provided.');
      }
      if (reasonRaw.length > PARTICIPANT_STATUS_TRANSITION_REASON_MAX_LENGTH) {
        throw new AppError(
          ErrorCode.INVALID_INPUT,
          `reason must be at most ${PARTICIPANT_STATUS_TRANSITION_REASON_MAX_LENGTH} characters.`,
        );
      }
    }

    const input: ChangeParticipantStatusInput = {
      tenantId,
      participantId,
      status: targetStatus,
      correlationId: idempotencyKey,
      requestId,
    };

    const view = await deps.service.changeParticipantStatus(input);

    const body: ParticipantWriteResponseBody = {
      status: 'ok',
      participant: toParticipantDto(view),
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.participantRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'status_transition',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.participantRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'status_transition',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return participantWriteErrorToHttpResult(err, requestId);
  }
}

/**
 * Handle `POST /v1/organizations/:organizationId/participants` — record a tenant-scoped
 * organization↔participant relationship (reference data).
 *
 * Flow: resolve identity (tenant from auth, never the body) → enforce the distinct
 * `participant.organization_link.write` action → require the `Idempotency-Key` header → validate
 * the path `organizationId` → validate the CLOSED link body (require `participantId` +
 * `relationshipType`; optional `status`/`startDate`/`endDate`; any other key — a profile field, a
 * participant STATUS field, a relationship id, or an out-of-scope behavior field — is rejected) →
 * idempotent read-back (a pre-existing NON-ended relationship of the same type returns 200 with
 * that relationship, never a fabricated 201) → {@link ParticipantRegistryService.linkParticipantToOrganization}
 * → project to the safe relationship DTO (201 on create).
 *
 * A missing participant returns 404; a missing or cross-tenant organization returns 404 (RLS makes
 * a cross-tenant organization invisible, so it is indistinguishable from not-found and never
 * reveals cross-tenant existence). The service owns the transactional outbox; the adapter enqueues
 * nothing itself, never touches governance.entity_state, never invokes the Governance Kernel
 * (relationship linking is reference data, not a governed lifecycle FSM), and never mutates the
 * Organization Registry (the organization is read-only reference).
 */
export async function handleOrganizationParticipantLink(
  deps: ParticipantWriteHttpDeps,
  req: OrganizationParticipantLinkHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ParticipantReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveParticipantAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.ParticipantOrganizationLinkWrite, telemetry);

    const idempotencyKey = requireIdempotencyKey(req.headers);

    if (req.organizationId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'organizationId path parameter is required.');
    }
    const organizationId = req.organizationId.trim();

    const obj = asObjectBody(req.body);
    rejectUnknownKeys(obj, PARTICIPANT_ORGANIZATION_LINK_BODY_KEYS, 'organization participant link');

    const participantIdRaw = obj['participantId'];
    if (typeof participantIdRaw !== 'string' || participantIdRaw.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'participantId is required.');
    }
    const participantId = participantIdRaw.trim();

    const relationshipTypeRaw = obj['relationshipType'];
    if (!isRelationshipType(relationshipTypeRaw)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'relationshipType must be one of: member, staff, volunteer, official, contact, other.',
      );
    }
    const relationshipType: RelationshipType = relationshipTypeRaw;

    const statusRaw = obj['status'];
    if (statusRaw !== undefined && !isRelationshipStatus(statusRaw)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'status must be one of: active, suspended, ended.',
      );
    }

    const startDateRaw = obj['startDate'];
    if (startDateRaw !== undefined && typeof startDateRaw !== 'string') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'startDate must be a string when provided.');
    }
    const endDateRaw = obj['endDate'];
    if (endDateRaw !== undefined && typeof endDateRaw !== 'string') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'endDate must be a string when provided.');
    }

    // Idempotent read-back: an existing NON-ended relationship of this type is returned as-is with
    // a 200 (no new write, no outbox signal) — mirrors the service's own idempotent link semantics.
    const existing = await deps.readStore.findActiveOrganizationLink(
      tenantId,
      organizationId,
      participantId,
      relationshipType,
    );
    if (existing !== undefined) {
      const body: OrganizationParticipantLinkResponseBody = {
        status: 'ok',
        relationship: toOrganizationParticipantDto(existing),
        requestId,
      };
      telemetry.incrementCounter(TelemetryCounters.participantRegistryWrite, 1, {
        [TelemetryAttributeKeys.operation]: 'organization_link',
        [TelemetryAttributeKeys.result]: TelemetryResult.success,
      });
      return { status: 200, body };
    }

    const input: LinkParticipantToOrganizationInput = {
      tenantId,
      organizationId,
      participantId,
      relationshipType,
      ...(statusRaw !== undefined ? { status: statusRaw } : {}),
      ...(startDateRaw !== undefined ? { startDate: startDateRaw } : {}),
      ...(endDateRaw !== undefined ? { endDate: endDateRaw } : {}),
      correlationId: idempotencyKey,
      requestId,
    };

    const view = await deps.service.linkParticipantToOrganization(input);

    const body: OrganizationParticipantLinkResponseBody = {
      status: 'ok',
      relationship: toOrganizationParticipantDto(view),
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.participantRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'organization_link',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 201, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.participantRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'organization_link',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return participantWriteErrorToHttpResult(err, requestId);
  }
}

/**
 * Handle `POST /v1/organizations/:organizationId/participants/:relationshipId/status-transitions` —
 * transition an existing relationship's reference-data status.
 *
 * Flow: resolve identity (tenant from auth, never the body) → enforce the
 * `participant.organization_link.write` action (the SAME action that gates link creation) → require
 * the `Idempotency-Key` header → validate the path `organizationId` + `relationshipId` → validate
 * the CLOSED status-transition body (require a known `targetStatus`; `reason` optional +
 * length-capped; any other key — a profile field, a participant STATUS field, a link-CREATE field,
 * or an out-of-scope behavior field — is rejected) → read-back pre-check (the relationship must
 * exist for the tenant AND belong to the path organization; otherwise 404, indistinguishable from
 * not-found) → {@link ParticipantRegistryService.changeOrganizationParticipantStatus} → project to
 * the safe relationship DTO.
 *
 * A missing relationship, a relationship under a different organization, or a cross-tenant
 * relationship all return 404 (never revealing cross-tenant existence). The status change is
 * naturally idempotent: re-applying the current status with no new end date is a service-level
 * no-op that emits no duplicate outbox signal. `reason` is validated at the boundary but NOT
 * persisted — the service records no free-text note — and never enters the outbox payload or
 * telemetry. The service owns the transactional outbox; the adapter enqueues nothing itself, never
 * touches governance.entity_state, never invokes the Governance Kernel (relationship status is
 * reference data, not a governed lifecycle FSM), and never mutates the Organization Registry.
 */
export async function handleOrganizationParticipantStatusTransition(
  deps: ParticipantWriteHttpDeps,
  req: OrganizationParticipantStatusTransitionHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ParticipantReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveParticipantAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.ParticipantOrganizationLinkWrite, telemetry);

    const idempotencyKey = requireIdempotencyKey(req.headers);

    if (req.organizationId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'organizationId path parameter is required.');
    }
    const organizationId = req.organizationId.trim();

    if (req.relationshipId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'relationshipId path parameter is required.');
    }
    const relationshipId = req.relationshipId.trim();

    const obj = asObjectBody(req.body);
    rejectUnknownKeys(
      obj,
      PARTICIPANT_ORGANIZATION_LINK_STATUS_TRANSITION_BODY_KEYS,
      'organization participant status transition',
    );

    const targetStatusRaw = obj['targetStatus'];
    if (!isRelationshipStatus(targetStatusRaw)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'targetStatus must be one of: active, suspended, ended.',
      );
    }
    const targetStatus: RelationshipStatus = targetStatusRaw;

    const reasonRaw = obj['reason'];
    if (reasonRaw !== undefined) {
      if (typeof reasonRaw !== 'string') {
        throw new AppError(ErrorCode.INVALID_INPUT, 'reason must be a string when provided.');
      }
      if (reasonRaw.length > PARTICIPANT_ORGANIZATION_LINK_STATUS_TRANSITION_REASON_MAX_LENGTH) {
        throw new AppError(
          ErrorCode.INVALID_INPUT,
          `reason must be at most ${PARTICIPANT_ORGANIZATION_LINK_STATUS_TRANSITION_REASON_MAX_LENGTH} characters.`,
        );
      }
    }

    // Read-back pre-check: the relationship must exist for this tenant (RLS makes a cross-tenant
    // relationship invisible → undefined → 404) AND belong to the PATH organization. A relationship
    // that exists but under a DIFFERENT organization is treated as not-found (404) so the path
    // scope is authoritative and no cross-organization existence leaks. The service itself resolves
    // only by (tenant, relationshipId), so this is where the organization scope is enforced.
    const existing = await deps.readStore.getOrganizationLinkById(tenantId, relationshipId);
    if (existing === undefined || existing.organizationId !== organizationId) {
      throw new AppError(
        ErrorCode.ORGANIZATION_PARTICIPANT_NOT_FOUND,
        'Organization-participant relationship not found.',
      );
    }

    const input: ChangeOrganizationParticipantStatusInput = {
      tenantId,
      relationshipId,
      status: targetStatus,
      correlationId: idempotencyKey,
      requestId,
    };

    const view = await deps.service.changeOrganizationParticipantStatus(input);

    const body: OrganizationParticipantStatusTransitionResponseBody = {
      status: 'ok',
      relationship: toOrganizationParticipantDto(view),
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.participantRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'organization_link_status',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.participantRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'organization_link_status',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return participantWriteErrorToHttpResult(err, requestId);
  }
}
