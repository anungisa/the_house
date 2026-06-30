/**
 * Request/response DTOs for the Organization Registry HTTP READ surface.
 *
 * These shapes are the STABLE wire contract for the read-only list/detail endpoints. They are
 * intentionally a SAFE projection of {@link OrganizationView}: identity/reference/status fields
 * only — never secrets, raw headers, connection strings, or payload bytes. Optional domain
 * fields are normalized to `null` for a stable JSON shape.
 *
 * NSO-GENERIC: every field name here is sport-agnostic (no sport-specific organization
 * vocabulary).
 */

import type {
  OrganizationSource,
  OrganizationStatus,
  OrganizationType,
} from '../../domains/organization-registry/OrganizationTypes.js';

/**
 * A single organization as exposed over HTTP. A 1:1, null-normalized projection of the canonical
 * {@link OrganizationView}. The field set is CLOSED — adding a field is a deliberate contract
 * change (a unit test asserts exactly these keys so internal/sensitive fields can never leak).
 */
export type OrganizationDto = {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly organizationType: OrganizationType;
  readonly displayName: string;
  readonly legalName: string | null;
  readonly status: OrganizationStatus;
  readonly parentOrganizationId: string | null;
  readonly source: OrganizationSource;
  readonly sourceEntityType: string | null;
  readonly sourceEntityId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** GET /v1/organizations — list request. Tenant comes from auth headers, never the query. */
export interface OrganizationListHttpRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly query: Readonly<Record<string, string | undefined>>;
}

/** GET /v1/organizations/:organizationId — detail request. Tenant comes from auth headers only. */
export interface OrganizationDetailHttpRequest {
  readonly organizationId: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
}

/** Pagination envelope: the EFFECTIVE (clamped) page size and an opaque continuation token. */
export type OrganizationPageDto = {
  readonly limit: number;
  readonly nextCursor: string | null;
};

/** Successful list response body. */
export type OrganizationListResponseBody = {
  readonly status: 'ok';
  readonly items: readonly OrganizationDto[];
  readonly page: OrganizationPageDto;
  readonly requestId: string;
};

/** Successful detail response body. */
export type OrganizationDetailResponseBody = {
  readonly status: 'ok';
  readonly organization: OrganizationDto;
  readonly requestId: string;
};
