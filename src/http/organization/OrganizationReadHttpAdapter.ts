/**
 * Organization Registry READ HTTP adapter — protocol-pure list + detail handlers.
 *
 * These are THIN, READ-ONLY transport adapters over the Organization Registry read store. They
 * let an authorized operator list tenant-scoped organizations and inspect a single organization.
 * They perform NO writes whatsoever.
 *
 * Architectural boundaries (DO NOT violate):
 *  - Read-only: they NEVER mutate the registry, NEVER touch governance.entity_state, NEVER
 *    enqueue an outbox message, and NEVER invoke the Governance Kernel. They only call the
 *    narrow read port ({@link OrganizationReadStore}: list + getById).
 *  - Tenant comes EXCLUSIVELY from the resolved {@link AuthContext}. Query/path inputs never
 *    carry identity; any tenantId in the query is IGNORED. Cross-tenant rows are invisible (the
 *    Pg store applies RLS per read; the in-memory store filters by tenant), so a detail read of
 *    another tenant's organization returns 404 — it never reveals cross-tenant existence.
 *  - Authorization is enforced by the centralized policy (src/authz): the actor must be
 *    authorized for the `organization.read` action. The policy is the single source of truth for
 *    role/permission mappings and emits the `authz.denied` signal on denial.
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
import { requireTenant, resolveOrganizationAuth } from './organizationHttpAuth.js';
import {
  clampOrganizationListLimit,
  isOrganizationStatus,
  isOrganizationType,
  ORGANIZATION_STATUSES,
  ORGANIZATION_TYPES,
  type OrganizationListCursor,
  type OrganizationListFilter,
  type OrganizationListResult,
  type OrganizationView,
} from '../../domains/organization-registry/OrganizationTypes.js';
import type {
  OrganizationDetailHttpRequest,
  OrganizationDetailResponseBody,
  OrganizationDto,
  OrganizationListHttpRequest,
  OrganizationListResponseBody,
} from './OrganizationReadHttpDtos.js';

/** Default resolver mirrors the other read adapters: demo identity unless one is supplied. */
const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

/**
 * Narrow READ-ONLY port the adapter depends on. Both the in-memory and Pg registry stores
 * satisfy this (it is a structural subset of `OrganizationRegistryStore`), so neither create
 * nor update is reachable from the HTTP read surface.
 */
export interface OrganizationReadStore {
  list(tenantId: string, filter: OrganizationListFilter): Promise<OrganizationListResult>;
  getById(tenantId: string, organizationId: string): Promise<OrganizationView | undefined>;
}

/** Dependencies for the read adapter: just the narrow read store and optional telemetry. */
export interface OrganizationReadHttpDeps {
  readonly readStore: OrganizationReadStore;
  /**
   * Optional telemetry sink. Emits an `organization.registry.read.count` counter tagged with the
   * operation (list/detail) and result (success/failure). Visibility only — never affects reads
   * or authorization, and never carries identifiers, headers, or secrets.
   */
  readonly telemetry?: Telemetry;
}

/** Protocol-pure result: an HTTP status code and a JSON-serializable body. */
export interface OrganizationReadHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

/** Encode a keyset cursor as an opaque base64url token. */
function encodeCursor(cursor: OrganizationListCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Decode an opaque cursor token; throws INVALID_INPUT when malformed. */
function decodeCursor(token: string): OrganizationListCursor {
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

/** Parse and validate the list query into a store filter. Throws INVALID_INPUT on bad input. */
function parseListFilter(query: Readonly<Record<string, string | undefined>>): OrganizationListFilter {
  const filter: {
    organizationType?: OrganizationView['organizationType'];
    status?: OrganizationView['status'];
    parentOrganizationId?: string;
    limit?: number;
    cursor?: OrganizationListCursor;
  } = {};

  const organizationType = query['organizationType'];
  if (organizationType !== undefined && organizationType !== '') {
    if (!isOrganizationType(organizationType)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `organizationType must be one of: ${ORGANIZATION_TYPES.join(', ')}.`,
      );
    }
    filter.organizationType = organizationType;
  }

  const status = query['status'];
  if (status !== undefined && status !== '') {
    if (!isOrganizationStatus(status)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `status must be one of: ${ORGANIZATION_STATUSES.join(', ')}.`,
      );
    }
    filter.status = status;
  }

  const parentOrganizationId = query['parentOrganizationId'];
  if (parentOrganizationId !== undefined && parentOrganizationId.trim() !== '') {
    filter.parentOrganizationId = parentOrganizationId.trim();
  }

  const limitRaw = query['limit'];
  if (limitRaw !== undefined && limitRaw !== '') {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'limit must be a positive integer.');
    }
    filter.limit = parsed;
  }

  const cursorRaw = query['cursor'];
  if (cursorRaw !== undefined && cursorRaw !== '') filter.cursor = decodeCursor(cursorRaw);

  return filter;
}

/** Project a canonical view onto the CLOSED, null-normalized wire DTO. */
function toOrganizationDto(view: OrganizationView): OrganizationDto {
  return {
    tenantId: view.tenantId,
    organizationId: view.organizationId,
    organizationType: view.organizationType,
    displayName: view.displayName,
    legalName: view.legalName ?? null,
    status: view.status,
    parentOrganizationId: view.parentOrganizationId ?? null,
    source: view.source,
    sourceEntityType: view.sourceEntityType ?? null,
    sourceEntityId: view.sourceEntityId ?? null,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

/** Map the read code to an HTTP status. Read surface: no 409 (no concurrency mutation). */
function readAppErrorStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.INVALID_INPUT:
      return 400;
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.FORBIDDEN:
    case ErrorCode.PERMISSION_DENIED:
      return 403;
    case ErrorCode.ORGANIZATION_NOT_FOUND:
      return 404;
    default:
      return 500;
  }
}

/** Translate any error into a safe HTTP result; unknown errors collapse to an opaque 500. */
export function organizationReadErrorToHttpResult(
  err: unknown,
  requestId: string,
): OrganizationReadHttpResult {
  if (err instanceof AppError) {
    return {
      status: readAppErrorStatus(err.code),
      body: { status: 'error', code: err.code, message: err.message, requestId },
    };
  }
  return {
    status: 500,
    body: { status: 'error', code: 'INTERNAL', message: 'Internal server error.', requestId },
  };
}

/**
 * Handle GET /v1/organizations — list organizations for the authenticated tenant.
 *
 * Flow: resolve identity (tenant from auth, never the query) → enforce the `organization.read`
 * gate → parse + validate filters → call {@link OrganizationReadStore.list} → map to stable,
 * safe DTOs. No writes, no outbox, no kernel calls occur.
 */
export async function handleOrganizationList(
  deps: OrganizationReadHttpDeps,
  req: OrganizationListHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<OrganizationReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveOrganizationAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.OrganizationRead, telemetry);

    const filter = parseListFilter(req.query);
    const result = await deps.readStore.list(tenantId, filter);

    const body: OrganizationListResponseBody = {
      status: 'ok',
      items: result.items.map(toOrganizationDto),
      page: {
        limit: clampOrganizationListLimit(filter.limit),
        nextCursor: result.nextCursor !== undefined ? encodeCursor(result.nextCursor) : null,
      },
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.organizationRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'list',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.organizationRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'list',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return organizationReadErrorToHttpResult(err, requestId);
  }
}

/**
 * Handle GET /v1/organizations/:organizationId — inspect a single organization.
 *
 * Flow: resolve identity → enforce the `organization.read` gate → load the tenant-scoped row →
 * map to a stable, safe DTO. 404 when the organization does not exist FOR THE TENANT (a
 * cross-tenant id is indistinguishable from a missing id — existence is never revealed). No
 * writes, no outbox, no kernel calls occur.
 */
export async function handleOrganizationDetail(
  deps: OrganizationReadHttpDeps,
  req: OrganizationDetailHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<OrganizationReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveOrganizationAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.OrganizationRead, telemetry);

    if (req.organizationId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'organizationId path parameter is required.');
    }

    const view = await deps.readStore.getById(tenantId, req.organizationId);
    if (view === undefined) {
      throw new AppError(ErrorCode.ORGANIZATION_NOT_FOUND, 'Organization not found.');
    }

    const body: OrganizationDetailResponseBody = {
      status: 'ok',
      organization: toOrganizationDto(view),
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.organizationRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'detail',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.organizationRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'detail',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return organizationReadErrorToHttpResult(err, requestId);
  }
}
