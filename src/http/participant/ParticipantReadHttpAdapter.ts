/**
 * Participant Registry READ HTTP adapter — protocol-pure list/detail handlers.
 *
 * These are THIN, READ-ONLY transport adapters over the Participant Registry read store. They let
 * an authorized operator list tenant-scoped participants, inspect a single participant, and list
 * an organization's participant relationships. They perform NO writes whatsoever.
 *
 * Architectural boundaries (DO NOT violate):
 *  - Read-only: they NEVER mutate the registry, NEVER touch governance.entity_state, NEVER
 *    enqueue an outbox message, and NEVER invoke the Governance Kernel. They only call the narrow
 *    read port ({@link ParticipantReadStore}: list participants + get participant + list
 *    organization relationships).
 *  - Tenant comes EXCLUSIVELY from the resolved {@link AuthContext}. Query/path inputs never carry
 *    identity; any tenantId in the query is IGNORED. Cross-tenant rows are invisible (the Pg store
 *    applies RLS per read; the in-memory store filters by tenant), so a detail read of another
 *    tenant's participant returns 404 — it never reveals cross-tenant existence.
 *  - The organization-participants list filters relationships by the path `organizationId` WITHIN
 *    the caller's tenant. It does NOT perform a separate organization-existence probe: a missing
 *    or cross-tenant organization id simply yields an EMPTY relationship list (never a signal of
 *    cross-tenant existence). This is the documented contract for that route.
 *  - Authorization is enforced by the centralized policy (src/authz): the actor must be authorized
 *    for the `participant.read` action. The policy is the single source of truth for
 *    role/permission mappings and emits the `authz.denied` signal on denial.
 *
 * PRIVACY: the participant DTO carries a contact `email` (the minimal identifying attribute an
 * authorized same-tenant operator may read). That email NEVER appears in telemetry or outbox
 * signals — only in the authorized read response body.
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
import { requireTenant, resolveParticipantAuth } from './participantHttpAuth.js';
import {
  isParticipantStatus,
  isRelationshipStatus,
  isRelationshipType,
  PARTICIPANT_LIST_DEFAULT_LIMIT,
  PARTICIPANT_STATUSES,
  RELATIONSHIP_STATUSES,
  RELATIONSHIP_TYPES,
  type OrganizationParticipantListFilter,
  type OrganizationParticipantListResult,
  type OrganizationParticipantView,
  type ParticipantListCursor,
  type ParticipantListFilter,
  type ParticipantListResult,
  type ParticipantView,
} from '../../domains/participant-registry/ParticipantTypes.js';
import type {
  OrganizationParticipantDto,
  OrganizationParticipantListHttpRequest,
  OrganizationParticipantListResponseBody,
  ParticipantDetailHttpRequest,
  ParticipantDetailResponseBody,
  ParticipantDto,
  ParticipantListHttpRequest,
  ParticipantListResponseBody,
} from './ParticipantReadHttpDtos.js';

/** Default resolver mirrors the other read adapters: demo identity unless one is supplied. */
const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

/**
 * The MAXIMUM page size the HTTP read surface allows. The domain store permits up to 200, but the
 * HTTP edge intentionally caps lower (100) to bound response size for external callers. A
 * requested limit above the cap is clamped down (not rejected); a non-integer/negative limit is
 * rejected with 400.
 */
export const PARTICIPANT_HTTP_LIST_MAX_LIMIT = 100;

/** Clamp a requested page size into the HTTP-allowed range (default 50, max 100). */
function clampHttpLimit(limit: number | undefined): number {
  if (limit === undefined) return PARTICIPANT_LIST_DEFAULT_LIMIT;
  if (limit < 1) return 1;
  return Math.min(limit, PARTICIPANT_HTTP_LIST_MAX_LIMIT);
}

/**
 * Narrow READ-ONLY port the adapter depends on. Both the in-memory and Pg registry stores satisfy
 * this (it is a structural subset of `ParticipantRegistryStore`), so neither create nor update is
 * reachable from the HTTP read surface.
 */
export interface ParticipantReadStore {
  listParticipants(tenantId: string, filter: ParticipantListFilter): Promise<ParticipantListResult>;
  getParticipantById(
    tenantId: string,
    participantId: string,
  ): Promise<ParticipantView | undefined>;
  listOrganizationParticipants(
    tenantId: string,
    filter: OrganizationParticipantListFilter,
  ): Promise<OrganizationParticipantListResult>;
}

/** Dependencies for the read adapter: just the narrow read store and optional telemetry. */
export interface ParticipantReadHttpDeps {
  readonly readStore: ParticipantReadStore;
  /**
   * Optional telemetry sink. Emits a `participant.registry.read.count` counter tagged with the
   * operation (list/detail/organization_links) and result (success/failure). Visibility only —
   * never affects reads or authorization, and never carries identifiers, headers, email, or
   * secrets.
   */
  readonly telemetry?: Telemetry;
}

/** Protocol-pure result: an HTTP status code and a JSON-serializable body. */
export interface ParticipantReadHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

/** Encode a keyset cursor as an opaque base64url token. */
function encodeCursor(cursor: ParticipantListCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Decode an opaque cursor token; throws INVALID_INPUT when malformed. */
function decodeCursor(token: string): ParticipantListCursor {
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

/** Parse and validate the participant list query into a store filter. Throws INVALID_INPUT on bad input. */
function parseParticipantListFilter(
  query: Readonly<Record<string, string | undefined>>,
): ParticipantListFilter {
  const filter: {
    status?: ParticipantView['status'];
    email?: string;
    limit?: number;
    cursor?: ParticipantListCursor;
  } = {};

  const status = query['status'];
  if (status !== undefined && status !== '') {
    if (!isParticipantStatus(status)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `status must be one of: ${PARTICIPANT_STATUSES.join(', ')}.`,
      );
    }
    filter.status = status;
  }

  // Exact-match email filter. Normalized (trimmed + lowercased) to mirror how the registry stores
  // it — so the predicate matches stored rows safely without any pattern/wildcard search.
  const email = query['email'];
  if (email !== undefined && email.trim() !== '') {
    filter.email = email.trim().toLowerCase();
  }

  const limit = parseLimit(query);
  if (limit !== undefined) filter.limit = clampHttpLimit(limit);

  const cursorRaw = query['cursor'];
  if (cursorRaw !== undefined && cursorRaw !== '') filter.cursor = decodeCursor(cursorRaw);

  return filter;
}

/**
 * Parse and validate the organization-participant list query into a store filter, binding the
 * organizationId from the path. Throws INVALID_INPUT on bad input.
 */
function parseOrganizationParticipantListFilter(
  organizationId: string,
  query: Readonly<Record<string, string | undefined>>,
): OrganizationParticipantListFilter {
  const filter: {
    organizationId: string;
    participantId?: string;
    relationshipType?: OrganizationParticipantView['relationshipType'];
    status?: OrganizationParticipantView['status'];
    limit?: number;
    cursor?: ParticipantListCursor;
  } = { organizationId };

  const participantId = query['participantId'];
  if (participantId !== undefined && participantId.trim() !== '') {
    filter.participantId = participantId.trim();
  }

  const relationshipType = query['relationshipType'];
  if (relationshipType !== undefined && relationshipType !== '') {
    if (!isRelationshipType(relationshipType)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `relationshipType must be one of: ${RELATIONSHIP_TYPES.join(', ')}.`,
      );
    }
    filter.relationshipType = relationshipType;
  }

  const status = query['status'];
  if (status !== undefined && status !== '') {
    if (!isRelationshipStatus(status)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `status must be one of: ${RELATIONSHIP_STATUSES.join(', ')}.`,
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

/** Project a canonical participant view onto the CLOSED, null-normalized wire DTO. */
function toParticipantDto(view: ParticipantView): ParticipantDto {
  return {
    tenantId: view.tenantId,
    participantId: view.participantId,
    displayName: view.displayName,
    givenName: view.givenName ?? null,
    familyName: view.familyName ?? null,
    email: view.email ?? null,
    status: view.status,
    externalRefs: (view.externalRefs ?? []).map((r) => ({
      provider: r.provider,
      externalId: r.externalId,
    })),
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

/** Project a canonical relationship view onto the CLOSED, null-normalized wire DTO. */
function toOrganizationParticipantDto(
  view: OrganizationParticipantView,
): OrganizationParticipantDto {
  return {
    tenantId: view.tenantId,
    relationshipId: view.relationshipId,
    organizationId: view.organizationId,
    participantId: view.participantId,
    relationshipType: view.relationshipType,
    status: view.status,
    startDate: view.startDate ?? null,
    endDate: view.endDate ?? null,
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
    case ErrorCode.PARTICIPANT_NOT_FOUND:
      return 404;
    default:
      return 500;
  }
}

/** Translate any error into a safe HTTP result; unknown errors collapse to an opaque 500. */
export function participantReadErrorToHttpResult(
  err: unknown,
  requestId: string,
): ParticipantReadHttpResult {
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
 * Handle GET /v1/participants — list participants for the authenticated tenant.
 *
 * Flow: resolve identity (tenant from auth, never the query) → enforce the `participant.read`
 * gate → parse + validate filters → call {@link ParticipantReadStore.listParticipants} → map to
 * stable, safe DTOs. No writes, no outbox, no kernel calls occur.
 */
export async function handleParticipantList(
  deps: ParticipantReadHttpDeps,
  req: ParticipantListHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ParticipantReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveParticipantAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.ParticipantRead, telemetry);

    const filter = parseParticipantListFilter(req.query);
    const result = await deps.readStore.listParticipants(tenantId, filter);

    const body: ParticipantListResponseBody = {
      status: 'ok',
      items: result.items.map(toParticipantDto),
      page: {
        limit: clampHttpLimit(filter.limit),
        nextCursor: result.nextCursor !== undefined ? encodeCursor(result.nextCursor) : null,
      },
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.participantRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'list',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.participantRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'list',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return participantReadErrorToHttpResult(err, requestId);
  }
}

/**
 * Handle GET /v1/participants/:participantId — inspect a single participant.
 *
 * Flow: resolve identity → enforce the `participant.read` gate → load the tenant-scoped row →
 * map to a stable, safe DTO. 404 when the participant does not exist FOR THE TENANT (a
 * cross-tenant id is indistinguishable from a missing id — existence is never revealed). No
 * writes, no outbox, no kernel calls occur.
 */
export async function handleParticipantDetail(
  deps: ParticipantReadHttpDeps,
  req: ParticipantDetailHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ParticipantReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveParticipantAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.ParticipantRead, telemetry);

    if (req.participantId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'participantId path parameter is required.');
    }

    const view = await deps.readStore.getParticipantById(tenantId, req.participantId);
    if (view === undefined) {
      throw new AppError(ErrorCode.PARTICIPANT_NOT_FOUND, 'Participant not found.');
    }

    const body: ParticipantDetailResponseBody = {
      status: 'ok',
      participant: toParticipantDto(view),
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.participantRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'detail',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.participantRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'detail',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return participantReadErrorToHttpResult(err, requestId);
  }
}

/**
 * Handle GET /v1/organizations/:organizationId/participants — list one organization's participant
 * relationships for the authenticated tenant.
 *
 * Flow: resolve identity → enforce the `participant.read` gate → parse + validate filters (the
 * organizationId is bound from the path) → call
 * {@link ParticipantReadStore.listOrganizationParticipants} → map to stable, safe DTOs. A missing
 * or cross-tenant organization id yields an EMPTY list (never reveals cross-tenant existence). No
 * writes, no outbox, no kernel calls occur.
 */
export async function handleOrganizationParticipantList(
  deps: ParticipantReadHttpDeps,
  req: OrganizationParticipantListHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ParticipantReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveParticipantAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.ParticipantRead, telemetry);

    if (req.organizationId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'organizationId path parameter is required.');
    }

    const filter = parseOrganizationParticipantListFilter(req.organizationId.trim(), req.query);
    const result = await deps.readStore.listOrganizationParticipants(tenantId, filter);

    const body: OrganizationParticipantListResponseBody = {
      status: 'ok',
      items: result.items.map(toOrganizationParticipantDto),
      page: {
        limit: clampHttpLimit(filter.limit),
        nextCursor: result.nextCursor !== undefined ? encodeCursor(result.nextCursor) : null,
      },
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.participantRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'organization_links',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.participantRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'organization_links',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return participantReadErrorToHttpResult(err, requestId);
  }
}
