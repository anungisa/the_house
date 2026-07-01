/**
 * Request/response DTOs for the Facility Registry HTTP WRITE surface (phase 1: create + update).
 *
 * The phase-1 write surface exposes two mutations: create a facility
 * (`POST /v1/facilities`) and update a facility's safe descriptive fields
 * (`PATCH /v1/facilities/:facilityId`). A facility `status` is REFERENCE DATA, not a governed
 * lifecycle FSM; changing it is a DISTINCT status-transition route
 * (`POST /v1/facilities/:facilityId/status-transitions`) gated by the separate
 * `facility.status.write` action. None of these routes ever invokes the Governance Kernel or
 * touches governance.entity_state / governance.state_transition / governance.audit_event.
 *
 * These shapes are the STABLE wire contract. Requests carry ONLY safe, NSO-generic fields; identity
 * (tenant + actor) comes EXCLUSIVELY from the resolved auth context (the `x-house-*` trusted-header
 * contract), never from the body. Responses reuse the read surface's CLOSED {@link FacilityDto}
 * projection (identity / reference / location / contact fields only, no `tenantId`) — never
 * secrets, raw headers, connection strings, store metadata, or payload bytes.
 *
 * PRIVACY: a write response may carry the facility's descriptive attributes (name, address, contact,
 * coordinates, capability tags) — the authorized SAME-TENANT read-back. Those attributes NEVER
 * appear in telemetry or outbox signals — only in the authorized response body.
 */

import type {
  FacilityStatus,
  FacilityType,
  FacilityVisibility,
} from '../../domains/facility-registry/FacilityTypes.js';
import type { FacilityDto } from './FacilityReadHttpDtos.js';

/**
 * The CLOSED set of body keys accepted by `POST /v1/facilities`. Any other key is rejected with
 * `400` — so an immutable field, an internal/SQL field, an outbox-metadata field, or any
 * out-of-scope behavior field can never ride in on a create.
 */
export const FACILITY_CREATE_BODY_KEYS: readonly string[] = [
  'facilityId',
  'organizationId',
  'name',
  'facilityType',
  'status',
  'addressLine1',
  'addressLine2',
  'locality',
  'region',
  'postalCode',
  'countryCode',
  'latitude',
  'longitude',
  'contactName',
  'contactEmail',
  'contactPhone',
  'visibility',
  'capabilityTags',
];

/**
 * The CLOSED set of body keys accepted by `PATCH /v1/facilities/:facilityId`. `facilityId`,
 * `organizationId`, `facilityType`, and `status` are DELIBERATELY absent: the id comes from the
 * path, the organization + type are immutable after create, and a status change is the separate
 * status-transition route (`POST /v1/facilities/:facilityId/status-transitions`). Any key outside
 * this list is rejected with `400`.
 */
export const FACILITY_UPDATE_BODY_KEYS: readonly string[] = [
  'name',
  'addressLine1',
  'addressLine2',
  'locality',
  'region',
  'postalCode',
  'countryCode',
  'latitude',
  'longitude',
  'contactName',
  'contactEmail',
  'contactPhone',
  'visibility',
  'capabilityTags',
];

/**
 * Wire body for `POST /v1/facilities`. `facilityId` is REQUIRED (client-supplied) so creation is
 * deterministically idempotent on the id (a duplicate id is a `409` via the adapter pre-check, not
 * a silent replay). `organizationId`, `name`, and `facilityType` are REQUIRED; `status` defaults to
 * `draft`. No identity, immutable-reassignment, or sensitive fields are accepted.
 */
export interface FacilityCreateRequestBody {
  readonly facilityId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly facilityType: FacilityType;
  readonly status?: FacilityStatus;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly locality?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly contactName?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly visibility?: FacilityVisibility;
  readonly capabilityTags?: readonly string[];
}

/**
 * Wire body for `PATCH /v1/facilities/:facilityId`. All fields are optional but AT LEAST ONE must be
 * present (an empty `{}` is rejected with `400`). `null` clears an optional field; an omitted field
 * is left unchanged; a value sets it. `name` cannot be cleared. `status`, `facilityType`,
 * `organizationId`, and `facilityId` are NOT accepted (rejected as unknown keys).
 */
export interface FacilityUpdateRequestBody {
  readonly name?: string;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly locality?: string | null;
  readonly region?: string | null;
  readonly postalCode?: string | null;
  readonly countryCode?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly contactName?: string | null;
  readonly contactEmail?: string | null;
  readonly contactPhone?: string | null;
  readonly visibility?: FacilityVisibility | null;
  readonly capabilityTags?: readonly string[] | null;
}

/** `POST /v1/facilities` request: parsed JSON body + auth headers (which carry the idempotency key). */
export interface FacilityCreateHttpRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

/** `PATCH /v1/facilities/:facilityId` request: path id + parsed JSON body + auth headers. */
export interface FacilityUpdateHttpRequest {
  readonly facilityId: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

/**
 * The CLOSED set of body keys accepted by
 * `POST /v1/facilities/:facilityId/status-transitions`. `targetStatus` is the required new
 * reference-data status; `reason` is an OPTIONAL free-text audit note. Any other key is rejected
 * with `400` — so a profile field (`name`, address/contact), an immutable field (`facilityId`,
 * `organizationId`, `facilityType`), a bare `status` field, or any out-of-scope behavior field can
 * never ride in on a status transition.
 */
export const FACILITY_STATUS_TRANSITION_BODY_KEYS: readonly string[] = ['targetStatus', 'reason'];

/**
 * Maximum accepted length of the optional `reason` audit note. This is a request-boundary guard
 * only — `reason` is NOT persisted by this route (the Facility Registry status change records no
 * free-text note), and it NEVER appears in the outbox payload or telemetry. Mirrors the participant
 * status-transition convention.
 */
export const FACILITY_STATUS_TRANSITION_REASON_MAX_LENGTH = 1024;

/**
 * Wire body for `POST /v1/facilities/:facilityId/status-transitions`. `targetStatus` is the REQUIRED
 * new facility reference-data status (`draft`/`active`/`inactive`/`archived`). `reason` is an
 * OPTIONAL audit note that is validated at the boundary but NOT persisted by this route. No
 * identity, immutable-reassignment, or descriptive fields are accepted.
 */
export interface FacilityStatusTransitionRequestBody {
  readonly targetStatus: FacilityStatus;
  readonly reason?: string;
}

/**
 * `POST /v1/facilities/:facilityId/status-transitions` request: path id + parsed JSON body + auth
 * headers (which also carry the required `Idempotency-Key`).
 */
export interface FacilityStatusTransitionHttpRequest {
  readonly facilityId: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

/** Successful create/update response body (reuses the CLOSED read DTO projection). */
export type FacilityWriteResponseBody = {
  readonly status: 'ok';
  readonly facility: FacilityDto;
  readonly requestId: string;
};
