/**
 * Facility Registry READ HTTP adapter — protocol-pure list/detail handlers.
 *
 * These are THIN, READ-ONLY transport adapters over the Facility Registry read store. They let an
 * authorized operator list tenant-scoped facilities, inspect a single facility, and list one
 * organization's facilities. They perform NO writes whatsoever.
 *
 * Architectural boundaries (DO NOT violate):
 *  - Read-only: they NEVER mutate the registry, NEVER touch governance.entity_state, NEVER enqueue
 *    an outbox message, and NEVER invoke the Governance Kernel. They only call the narrow read
 *    port ({@link FacilityReadStore}: get by id + tenant-scoped list). They never mutate the
 *    Organization Registry.
 *  - Tenant comes EXCLUSIVELY from the resolved {@link AuthContext}. Query/path inputs never carry
 *    identity; any tenantId in the query is IGNORED. Cross-tenant rows are invisible (the Pg store
 *    applies RLS per read; the in-memory store filters by tenant), so a detail read of another
 *    tenant's facility returns 404 — it never reveals cross-tenant existence.
 *  - The organization-facilities list filters facilities by the path `organizationId` WITHIN the
 *    caller's tenant. It does NOT perform a separate organization-existence probe: a missing or
 *    cross-tenant organization id simply yields an EMPTY facility list (never a signal of
 *    cross-tenant existence). This is the documented contract for that route.
 *  - Authorization is enforced by the centralized policy (src/authz): the actor must be authorized
 *    for the `facility.read` action. The policy is the single source of truth for role/permission
 *    mappings and emits the `authz.denied` signal on denial.
 *
 * PRIVACY: descriptive attributes (name, address, contact, coordinates, capability tags) appear
 * ONLY in the authorized read response body — NEVER in telemetry or outbox signals.
 */

import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';

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
import { requireTenant, resolveFacilityAuth } from './facilityHttpAuth.js';
import {
  FACILITY_LIST_DEFAULT_LIMIT,
  FACILITY_STATUSES,
  FACILITY_TYPES,
  isFacilityStatus,
  isFacilityType,
  type FacilityListCursor,
  type FacilityListFilter,
  type FacilityListResult,
  type FacilityView,
} from '../../domains/facility-registry/FacilityTypes.js';
import type {
  FacilityDetailHttpRequest,
  FacilityDetailResponseBody,
  FacilityDto,
  FacilityListHttpRequest,
  FacilityListResponseBody,
  OrganizationFacilityListHttpRequest,
  OrganizationFacilityListResponseBody,
} from './FacilityReadHttpDtos.js';

/** Default resolver mirrors the other read adapters: demo identity unless one is supplied. */
const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

/**
 * The MAXIMUM page size the HTTP read surface allows. The domain store permits up to 200, but the
 * HTTP edge intentionally caps lower (100) to bound response size for external callers. A
 * requested limit above the cap is clamped down (not rejected); a non-integer/negative limit is
 * rejected with 400.
 */
export const FACILITY_HTTP_LIST_MAX_LIMIT = 100;

/** Clamp a requested page size into the HTTP-allowed range (default 50, max 100). */
function clampHttpLimit(limit: number | undefined): number {
  if (limit === undefined) return FACILITY_LIST_DEFAULT_LIMIT;
  if (limit < 1) return 1;
  return Math.min(limit, FACILITY_HTTP_LIST_MAX_LIMIT);
}

/**
 * Narrow READ-ONLY port the adapter depends on. Both the in-memory and Pg registry stores satisfy
 * this (it is a structural subset of `FacilityRegistryStore`), so neither create nor update is
 * reachable from the HTTP read surface. The organization-facilities route reuses `list` with the
 * path `organizationId` bound into the filter.
 */
export interface FacilityReadStore {
  getById(tenantId: string, facilityId: string): Promise<FacilityView | undefined>;
  list(tenantId: string, filter: FacilityListFilter): Promise<FacilityListResult>;
}

/** Dependencies for the read adapter: just the narrow read store and optional telemetry. */
export interface FacilityReadHttpDeps {
  readonly readStore: FacilityReadStore;
  /**
   * Optional telemetry sink. Emits a `facility.registry.read.count` counter tagged with the
   * operation (list/detail/organization_facilities) and result (success/failure). Visibility only
   * — never affects reads or authorization, and never carries identifiers, headers, names,
   * addresses, contact fields, coordinates, capability tags, or secrets.
   */
  readonly telemetry?: Telemetry;
}

/** Protocol-pure result: an HTTP status code and a JSON-serializable body. */
export interface FacilityReadHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

/** Encode a keyset cursor as an opaque base64url token. */
function encodeCursor(cursor: FacilityListCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Decode an opaque cursor token; throws INVALID_INPUT when malformed. */
function decodeCursor(token: string): FacilityListCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw new AppError(ErrorCode.INVALID_INPUT, 'cursor is not a valid pagination token.');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['createdAt'] !== 'string' ||
    typeof (parsed as Record<string, unknown>)['id'] !== 'string'
  ) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'cursor is not a valid pagination token.');
  }
  const p = parsed as { createdAt: string; id: string };
  return { createdAt: p.createdAt, id: p.id };
}

/** Parse the shared `limit` query value into a positive integer. Throws INVALID_INPUT on bad input. */
function parseLimit(query: Readonly<Record<string, string | undefined>>): number | undefined {
  const limitRaw = query['limit'];
  if (limitRaw === undefined || limitRaw === '') return undefined;
  const parsed = Number(limitRaw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'limit must be a positive integer.');
  }
  return parsed;
}

/**
 * Parse and validate the shared facility list query (`status`, `facilityType`, `limit`, `cursor`)
 * into a store filter. When `organizationId` is supplied it is bound into the filter (the
 * organization-facilities route binds it from the PATH — the path always wins). Throws
 * INVALID_INPUT on bad input.
 */
function parseFacilityListFilter(
  query: Readonly<Record<string, string | undefined>>,
  boundOrganizationId?: string,
): FacilityListFilter {
  const filter: {
    organizationId?: string;
    facilityType?: FacilityView['facilityType'];
    status?: FacilityView['status'];
    limit?: number;
    cursor?: FacilityListCursor;
  } = {};

  if (boundOrganizationId !== undefined) {
    filter.organizationId = boundOrganizationId;
  } else {
    const organizationId = query['organizationId'];
    if (organizationId !== undefined && organizationId.trim() !== '') {
      filter.organizationId = organizationId.trim();
    }
  }

  const facilityType = query['facilityType'];
  if (facilityType !== undefined && facilityType !== '') {
    if (!isFacilityType(facilityType)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `facilityType must be one of: ${FACILITY_TYPES.join(', ')}.`,
      );
    }
    filter.facilityType = facilityType;
  }

  const status = query['status'];
  if (status !== undefined && status !== '') {
    if (!isFacilityStatus(status)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `status must be one of: ${FACILITY_STATUSES.join(', ')}.`,
      );
    }
    filter.status = status;
  }

  const limit = parseLimit(query);
  if (limit !== undefined) filter.limit = clampHttpLimit(limit);

  const cursorRaw = query['cursor'];
  if (cursorRaw !== undefined && cursorRaw !== '') filter.cursor = decodeCursor(cursorRaw);

  return filter;
}

/** Project a canonical facility view onto the CLOSED, null-normalized wire DTO (no `tenantId`). */
export function toFacilityDto(view: FacilityView): FacilityDto {
  return {
    facilityId: view.facilityId,
    organizationId: view.organizationId,
    name: view.name,
    facilityType: view.facilityType,
    status: view.status,
    addressLine1: view.addressLine1 ?? null,
    addressLine2: view.addressLine2 ?? null,
    locality: view.locality ?? null,
    region: view.region ?? null,
    postalCode: view.postalCode ?? null,
    countryCode: view.countryCode ?? null,
    latitude: view.latitude ?? null,
    longitude: view.longitude ?? null,
    contactName: view.contactName ?? null,
    contactEmail: view.contactEmail ?? null,
    contactPhone: view.contactPhone ?? null,
    visibility: view.visibility ?? null,
    capabilityTags: [...(view.capabilityTags ?? [])],
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

/** Map the read code to an HTTP status. Read surface: no 409 (no concurrency mutation). */
function facilityReadErrorStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.INVALID_INPUT:
      return 400;
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.FORBIDDEN:
    case ErrorCode.PERMISSION_DENIED:
      return 403;
    case ErrorCode.FACILITY_NOT_FOUND:
      return 404;
    default:
      return 500;
  }
}

/** Translate any error into a safe HTTP result; unknown errors collapse to an opaque 500. */
export function facilityReadErrorToHttpResult(
  err: unknown,
  requestId: string,
): FacilityReadHttpResult {
  if (err instanceof AppError) {
    return {
      status: facilityReadErrorStatus(err.code),
      body: { status: 'error', code: err.code, message: err.message, requestId },
    };
  }
  return {
    status: 500,
    body: { status: 'error', code: 'INTERNAL', message: 'Internal server error.', requestId },
  };
}

/**
 * Handle GET /v1/facilities — list facilities for the authenticated tenant.
 *
 * Flow: resolve identity (tenant from auth, never the query) → enforce the `facility.read` gate →
 * parse + validate filters → call {@link FacilityReadStore.list} → map to stable, safe DTOs. No
 * writes, no outbox, no kernel calls occur.
 */
export async function handleFacilityList(
  deps: FacilityReadHttpDeps,
  req: FacilityListHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<FacilityReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveFacilityAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.FacilityRead, telemetry);

    const filter = parseFacilityListFilter(req.query);
    const result = await deps.readStore.list(tenantId, filter);

    const body: FacilityListResponseBody = {
      status: 'ok',
      items: result.items.map(toFacilityDto),
      page: {
        limit: clampHttpLimit(filter.limit),
        nextCursor: result.nextCursor !== undefined ? encodeCursor(result.nextCursor) : null,
      },
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.facilityRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'list',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.facilityRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'list',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return facilityReadErrorToHttpResult(err, requestId);
  }
}

/**
 * Handle GET /v1/facilities/:facilityId — inspect a single facility.
 *
 * Flow: resolve identity → enforce the `facility.read` gate → load the tenant-scoped row → map to
 * a stable, safe DTO. 404 when the facility does not exist FOR THE TENANT (a cross-tenant id is
 * indistinguishable from a missing id — existence is never revealed). No writes, no outbox, no
 * kernel calls occur.
 */
export async function handleFacilityDetail(
  deps: FacilityReadHttpDeps,
  req: FacilityDetailHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<FacilityReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveFacilityAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.FacilityRead, telemetry);

    if (req.facilityId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'facilityId path parameter is required.');
    }

    const view = await deps.readStore.getById(tenantId, req.facilityId);
    if (view === undefined) {
      throw new AppError(ErrorCode.FACILITY_NOT_FOUND, 'Facility not found.');
    }

    const body: FacilityDetailResponseBody = {
      status: 'ok',
      facility: toFacilityDto(view),
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.facilityRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'detail',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.facilityRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'detail',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return facilityReadErrorToHttpResult(err, requestId);
  }
}

/**
 * Handle GET /v1/organizations/:organizationId/facilities — list one organization's facilities
 * for the authenticated tenant.
 *
 * Flow: resolve identity → enforce the `facility.read` gate → parse + validate filters (the
 * organizationId is bound from the PATH — the path always wins over any query value) → call
 * {@link FacilityReadStore.list} → map to stable, safe DTOs. A missing or cross-tenant organization
 * id yields an EMPTY list (never reveals cross-tenant existence). No writes, no outbox, no kernel
 * calls occur.
 */
export async function handleOrganizationFacilityList(
  deps: FacilityReadHttpDeps,
  req: OrganizationFacilityListHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<FacilityReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveFacilityAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.FacilityRead, telemetry);

    if (req.organizationId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'organizationId path parameter is required.');
    }

    const filter = parseFacilityListFilter(req.query, req.organizationId.trim());
    const result = await deps.readStore.list(tenantId, filter);

    const body: OrganizationFacilityListResponseBody = {
      status: 'ok',
      items: result.items.map(toFacilityDto),
      page: {
        limit: clampHttpLimit(filter.limit),
        nextCursor: result.nextCursor !== undefined ? encodeCursor(result.nextCursor) : null,
      },
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.facilityRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'organization_facilities',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.facilityRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'organization_facilities',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return facilityReadErrorToHttpResult(err, requestId);
  }
}
