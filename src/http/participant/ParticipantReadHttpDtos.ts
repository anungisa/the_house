/**
 * Request/response DTOs for the Participant Registry HTTP READ surface.
 *
 * These shapes are the STABLE wire contract for the read-only participant list/detail and
 * organization-participant relationship list endpoints. They are intentionally a SAFE projection
 * of {@link ParticipantView} / {@link OrganizationParticipantView}: identity/reference/status
 * fields only — never secrets, raw headers, connection strings, or payload bytes. Optional domain
 * fields are normalized to `null` (or `[]` for collections) for a stable JSON shape.
 *
 * PRIVACY: the participant DTO carries a contact `email` because it is the minimal identifying
 * attribute an authorized SAME-TENANT operator may read. That email NEVER appears in telemetry or
 * outbox signals — only in the authorized read response body.
 *
 * NSO-GENERIC: every field name here is sport-agnostic (no sport-specific vocabulary).
 */

import type {
  ParticipantStatus,
  RelationshipStatus,
  RelationshipType,
} from '../../domains/participant-registry/ParticipantTypes.js';

/**
 * A single external reference as exposed over HTTP. A narrow correlation handle
 * (provider + opaque external id) — never an identity-provider credential or sensitive attribute.
 */
export type ParticipantExternalRefDto = {
  readonly provider: string;
  readonly externalId: string;
};

/**
 * A single participant as exposed over HTTP. A 1:1, null-normalized projection of the canonical
 * {@link ParticipantView}. The field set is CLOSED — adding a field is a deliberate contract
 * change (a unit test asserts exactly these keys so internal/sensitive fields can never leak).
 */
export type ParticipantDto = {
  readonly tenantId: string;
  readonly participantId: string;
  readonly displayName: string;
  readonly givenName: string | null;
  readonly familyName: string | null;
  readonly email: string | null;
  readonly status: ParticipantStatus;
  readonly externalRefs: readonly ParticipantExternalRefDto[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

/**
 * A single organization-participant relationship as exposed over HTTP. A 1:1, null-normalized
 * projection of the canonical {@link OrganizationParticipantView}. The field set is CLOSED.
 */
export type OrganizationParticipantDto = {
  readonly tenantId: string;
  readonly relationshipId: string;
  readonly organizationId: string;
  readonly participantId: string;
  readonly relationshipType: RelationshipType;
  readonly status: RelationshipStatus;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** GET /v1/participants — list request. Tenant comes from auth headers, never the query. */
export interface ParticipantListHttpRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly query: Readonly<Record<string, string | undefined>>;
}

/** GET /v1/participants/:participantId — detail request. Tenant comes from auth headers only. */
export interface ParticipantDetailHttpRequest {
  readonly participantId: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
}

/**
 * GET /v1/organizations/:organizationId/participants — organization-participant list request.
 * The organization id comes from the path; tenant comes from auth headers only.
 */
export interface OrganizationParticipantListHttpRequest {
  readonly organizationId: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly query: Readonly<Record<string, string | undefined>>;
}

/** Pagination envelope: the EFFECTIVE (clamped) page size and an opaque continuation token. */
export type ParticipantPageDto = {
  readonly limit: number;
  readonly nextCursor: string | null;
};

/** Successful participant list response body. */
export type ParticipantListResponseBody = {
  readonly status: 'ok';
  readonly items: readonly ParticipantDto[];
  readonly page: ParticipantPageDto;
  readonly requestId: string;
};

/** Successful participant detail response body. */
export type ParticipantDetailResponseBody = {
  readonly status: 'ok';
  readonly participant: ParticipantDto;
  readonly requestId: string;
};

/** Successful organization-participant relationship list response body. */
export type OrganizationParticipantListResponseBody = {
  readonly status: 'ok';
  readonly items: readonly OrganizationParticipantDto[];
  readonly page: ParticipantPageDto;
  readonly requestId: string;
};
