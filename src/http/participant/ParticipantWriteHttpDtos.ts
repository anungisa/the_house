/**
 * Request/response DTOs for the Participant Registry HTTP WRITE surface.
 *
 * The write surface exposes three mutations: create a participant (`POST /v1/participants`),
 * update a participant's safe profile fields (`PATCH /v1/participants/:participantId`), and
 * transition a participant's reference-data status
 * (`POST /v1/participants/:participantId/status-transitions`). There is NO organization-link or
 * relationship-status shape here — those remain deliberately out of scope (see
 * docs/architecture/participant-write-http-preflight.md).
 *
 * A participant `status` is REFERENCE DATA, not a governed lifecycle FSM: the status-transition
 * route changes a denormalized status field through the validated Participant Registry service. It
 * NEVER invokes the Governance Kernel and NEVER touches governance.entity_state /
 * governance.state_transition / governance.audit_event.
 *
 * These shapes are the STABLE wire contract for the write surface. Requests carry ONLY the safe,
 * NSO-generic fields; identity (tenant + actor) comes EXCLUSIVELY from the resolved auth context
 * (the `x-house-*` trusted-header contract), never from the body. Responses reuse the read
 * surface's CLOSED {@link ParticipantDto} projection (identity / reference / status fields only) —
 * never secrets, raw headers, connection strings, store metadata, or payload bytes.
 *
 * PRIVACY: a write response may carry the participant's contact `email` (the minimal identifying
 * attribute an authorized SAME-TENANT operator may read back). That email NEVER appears in
 * telemetry or outbox signals — only in the authorized response body.
 */

import type { ParticipantDto } from './ParticipantReadHttpDtos.js';
import type {
  ParticipantExternalRef,
  ParticipantStatus,
} from '../../domains/participant-registry/ParticipantTypes.js';

/**
 * Create-allowed initial status. Phase 1 deliberately restricts creation to `draft` (default) or
 * `active`; promoting to `suspended`/`archived` is a status transition (a later phase), not a
 * create concern.
 */
export type ParticipantCreateStatus = 'draft' | 'active';

/** The CLOSED set of body keys accepted by `POST /v1/participants`. Any other key is rejected. */
export const PARTICIPANT_CREATE_BODY_KEYS: readonly string[] = [
  'participantId',
  'displayName',
  'givenName',
  'familyName',
  'email',
  'externalRefs',
  'status',
];

/** The CLOSED set of body keys accepted by `PATCH /v1/participants/:participantId`. */
export const PARTICIPANT_UPDATE_BODY_KEYS: readonly string[] = [
  'displayName',
  'givenName',
  'familyName',
  'email',
  'externalRefs',
];

/**
 * Wire body for `POST /v1/participants`. `participantId` is REQUIRED in phase 1 (client-supplied)
 * so creation is deterministically idempotent on the id (a duplicate id is a `409`, not a silent
 * replay). No identity, status-transition, organization-link, or sensitive fields are accepted.
 */
export interface ParticipantCreateRequestBody {
  readonly participantId: string;
  readonly displayName: string;
  readonly givenName?: string;
  readonly familyName?: string;
  readonly email?: string;
  readonly externalRefs?: readonly ParticipantExternalRef[];
  readonly status?: ParticipantCreateStatus;
}

/**
 * Wire body for `PATCH /v1/participants/:participantId`. All fields are optional but AT LEAST ONE
 * must be present. `null` clears an optional field; an omitted field is left unchanged; a string
 * sets it. `displayName` cannot be cleared. `status` and any organization-link field are NOT
 * accepted (rejected as unknown keys).
 */
export interface ParticipantUpdateRequestBody {
  readonly displayName?: string;
  readonly givenName?: string | null;
  readonly familyName?: string | null;
  readonly email?: string | null;
  readonly externalRefs?: readonly ParticipantExternalRef[] | null;
}

/** `POST /v1/participants` request: parsed JSON body + auth headers + idempotency header. */
export interface ParticipantCreateHttpRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

/** `PATCH /v1/participants/:participantId` request: path id + parsed JSON body + auth headers. */
export interface ParticipantUpdateHttpRequest {
  readonly participantId: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

/** Successful create/update response body (reuses the CLOSED read DTO projection). */
export type ParticipantWriteResponseBody = {
  readonly status: 'ok';
  readonly participant: ParticipantDto;
  readonly requestId: string;
};

/**
 * The CLOSED set of body keys accepted by `POST /v1/participants/:participantId/status-transitions`.
 * `targetStatus` is the required new reference-data status; `reason` is an OPTIONAL free-text audit
 * note. Any other key is rejected (so a profile field, an organization-link field, or any
 * out-of-scope behavior field can never ride in on a status transition).
 */
export const PARTICIPANT_STATUS_TRANSITION_BODY_KEYS: readonly string[] = ['targetStatus', 'reason'];

/**
 * Maximum accepted length of the optional `reason` audit note. This is a request-boundary guard
 * only — `reason` is NOT persisted by this route (the Participant Registry status change records
 * no free-text note), and it NEVER appears in the outbox payload or telemetry.
 */
export const PARTICIPANT_STATUS_TRANSITION_REASON_MAX_LENGTH = 1024;

/**
 * Wire body for `POST /v1/participants/:participantId/status-transitions`. `targetStatus` is the
 * REQUIRED new participant reference-data status (`draft`/`active`/`suspended`/`archived`). `reason`
 * is an OPTIONAL audit note that is validated at the boundary but NOT persisted by this route.
 */
export interface ParticipantStatusTransitionRequestBody {
  readonly targetStatus: ParticipantStatus;
  readonly reason?: string;
}

/**
 * `POST /v1/participants/:participantId/status-transitions` request: path id + parsed JSON body +
 * auth headers (which also carry the required `Idempotency-Key`).
 */
export interface ParticipantStatusTransitionHttpRequest {
  readonly participantId: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

/** Successful status-transition response body (reuses the CLOSED read DTO projection). */
export type ParticipantStatusTransitionResponseBody = ParticipantWriteResponseBody;
