/**
 * Request/response DTOs for the Facility Registry HTTP READ surface.
 *
 * These shapes are the STABLE wire contract for the read-only facility list/detail and an
 * organization's facilities list endpoints. They are intentionally a SAFE projection of
 * {@link FacilityView}: identity/reference/location/contact fields only — never secrets, raw
 * headers, connection strings, or payload bytes. Optional domain fields are normalized to `null`
 * (or `[]` for collections) for a stable JSON shape.
 *
 * The DTO deliberately omits `tenantId`: the tenant is established by the authenticated context
 * and is never echoed in a facility read body. Every field name here is NSO-generic (no
 * sport-specific place vocabulary).
 */

import type {
  FacilityStatus,
  FacilityType,
  FacilityVisibility,
} from '../../domains/facility-registry/FacilityTypes.js';

/**
 * A single facility as exposed over HTTP. A null-normalized projection of the canonical
 * {@link FacilityView} MINUS `tenantId`. The field set is CLOSED — adding a field is a deliberate
 * contract change (a unit test asserts exactly these keys so internal/sensitive fields can never
 * leak).
 */
export type FacilityDto = {
  readonly facilityId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly facilityType: FacilityType;
  readonly status: FacilityStatus;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly locality: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly contactName: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly visibility: FacilityVisibility | null;
  readonly capabilityTags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** GET /v1/facilities — list request. Tenant comes from auth headers, never the query. */
export interface FacilityListHttpRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly query: Readonly<Record<string, string | undefined>>;
}

/** GET /v1/facilities/:facilityId — detail request. Tenant comes from auth headers only. */
export interface FacilityDetailHttpRequest {
  readonly facilityId: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
}

/**
 * GET /v1/organizations/:organizationId/facilities — an organization's facilities list request.
 * The organization id comes from the path; tenant comes from auth headers only.
 */
export interface OrganizationFacilityListHttpRequest {
  readonly organizationId: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly query: Readonly<Record<string, string | undefined>>;
}

/** Pagination envelope: the EFFECTIVE (clamped) page size and an opaque continuation token. */
export type FacilityPageDto = {
  readonly limit: number;
  readonly nextCursor: string | null;
};

/** Successful facility list response body. */
export type FacilityListResponseBody = {
  readonly status: 'ok';
  readonly items: readonly FacilityDto[];
  readonly page: FacilityPageDto;
  readonly requestId: string;
};

/** Successful facility detail response body. */
export type FacilityDetailResponseBody = {
  readonly status: 'ok';
  readonly facility: FacilityDto;
  readonly requestId: string;
};

/** Successful organization-facilities list response body. */
export type OrganizationFacilityListResponseBody = {
  readonly status: 'ok';
  readonly items: readonly FacilityDto[];
  readonly page: FacilityPageDto;
  readonly requestId: string;
};
