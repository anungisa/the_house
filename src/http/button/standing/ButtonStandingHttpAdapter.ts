/**
 * The Button — club-affiliation STANDING read HTTP surface (Slice F), protocol-pure.
 *
 * Bounded, task-specific, READ-ONLY endpoints over {@link StandingReviewService}. Tenant + actor
 * come EXCLUSIVELY from the resolved {@link AuthContext}. The representative's ACTIVE authority is
 * re-resolved server-side ({@link RepresentativeAuthorityProvider}); ONLY the organization ids the
 * actor actively represents are passed to the read service. A standing outside that active scope
 * (or another tenant's) is never disclosed — the queue simply omits it and the detail resolves to
 * an opaque 404 (no existence disclosure).
 *
 * This surface NEVER mutates governed lifecycle state, NEVER invokes the kernel, and NEVER exposes
 * renewal initiation (a governed command deferred to a later slice). Every error maps to a
 * sanitized `{ status, code, message, requestId }` envelope. `status` is the kernel-owned governed
 * lifecycle state (never asserted by the caller); expiry hints are clock-derived only.
 */

import { randomUUID } from 'node:crypto';

import type {
  StandingReviewRecord,
  StandingReviewService,
} from '../../../domains/affiliation-standing/index.js';
import { AppError, ErrorCode } from '../../../shared/errors/AppError.js';
import type { AuthActor, AuthContext } from '../../auth/AuthContext.js';
import type { AuthContextResolver } from '../../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../../auth/DemoAuthContextResolver.js';
import { resolveOrganizationAuth } from '../../organization/organizationHttpAuth.js';
import type { RepresentativeAuthorityProvider } from '../ButtonContextService.js';

const DEFAULT_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const DAY_MS = 86_400_000;

/** Dependencies for the Button standing read surface. */
export interface ButtonStandingHttpDeps {
  readonly standing: StandingReviewService;
  /** Server-side source of representative authority + validity (never the browser). */
  readonly authorities: RepresentativeAuthorityProvider;
  /** Injected clock for representative-safe, clock-derived expiry hints. */
  readonly nowIso: () => string;
}

export interface ButtonStandingHttpRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly params?: Readonly<{ standingId?: string }>;
}

export interface ButtonStandingHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

/**
 * A representative-safe standing projection. `status` is the governed lifecycle state (kernel-owned,
 * never asserted by the caller); `isExpired`/`daysUntilExpiry` are clock-derived hints only.
 */
export interface StandingView {
  readonly standingId: string;
  readonly affiliationApplicationId: string;
  readonly organizationId: string;
  readonly season: string;
  readonly status: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string;
  readonly standingVersion: number;
  readonly pathway: string;
  readonly isExpired: boolean;
  readonly daysUntilExpiry: number | null;
}

/** The actor's explicit organizational references (fail closed — the browser cannot widen this). */
function representableOrganizationIds(actor: AuthActor): readonly string[] {
  const ids = [
    actor.organizationId,
    actor.localOrganizationId,
    actor.scopeId,
    actor.organizationUnitId,
  ].filter((id): id is string => typeof id === 'string' && id.trim() !== '');
  return [...new Set(ids)];
}

/** Resolve the organization ids over which the actor holds an ACTIVE representative authority. */
async function activeAuthorityOrganizationIds(
  deps: ButtonStandingHttpDeps,
  auth: AuthContext,
): Promise<readonly string[]> {
  const orgIds = representableOrganizationIds(auth.actor);
  if (orgIds.length === 0) return [];
  const authorities = await deps.authorities.authoritiesFor(auth.tenantId, auth.actor, orgIds);
  return authorities.filter((a) => a.status === 'active').map((a) => a.organizationId);
}

function toView(record: StandingReviewRecord, nowMs: number): StandingView {
  const untilMs = Date.parse(record.effectiveUntil);
  const isExpired = Number.isFinite(untilMs) ? nowMs >= untilMs : false;
  const daysUntilExpiry =
    !isExpired && Number.isFinite(untilMs) ? Math.ceil((untilMs - nowMs) / DAY_MS) : null;
  return {
    standingId: record.standingId,
    affiliationApplicationId: record.affiliationApplicationId,
    organizationId: record.organizationId,
    season: record.season,
    status: record.lifecycleState,
    effectiveFrom: record.effectiveFrom,
    effectiveUntil: record.effectiveUntil,
    standingVersion: record.standingVersion,
    pathway: record.pathway,
    isExpired,
    daysUntilExpiry,
  };
}

function errorResult(error: unknown, requestId: string): ButtonStandingHttpResult {
  if (error instanceof AppError) {
    const status =
      error.code === ErrorCode.UNAUTHENTICATED
        ? 401
        : error.code === ErrorCode.FORBIDDEN || error.code === ErrorCode.PERMISSION_DENIED
          ? 403
          : error.code === ErrorCode.INVALID_INPUT
            ? 400
            : 500;
    return {
      status,
      body: { status: 'error', code: error.code, message: error.message, requestId },
    };
  }
  return {
    status: 500,
    body: { status: 'error', code: 'INTERNAL', message: 'Internal server error.', requestId },
  };
}

/** GET /v1/button/affiliation/standing — list the standings in the representative's active scope. */
export async function handleButtonStandingQueue(
  deps: ButtonStandingHttpDeps,
  request: ButtonStandingHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_RESOLVER,
): Promise<ButtonStandingHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, request.headers);
    const orgIds = await activeAuthorityOrganizationIds(deps, auth);
    const records = await deps.standing.listForOrganizations(auth.tenantId, orgIds);
    const nowMs = Date.parse(deps.nowIso());
    const items = records.map((record) => toView(record, nowMs));
    return { status: 200, body: { status: 'ok', requestId, items } };
  } catch (error) {
    return errorResult(error, requestId);
  }
}

/** GET /v1/button/affiliation/standing/:standingId — one standing in the active scope (opaque 404). */
export async function handleButtonStandingDetail(
  deps: ButtonStandingHttpDeps,
  request: ButtonStandingHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_RESOLVER,
): Promise<ButtonStandingHttpResult> {
  const standingId = request.params?.standingId;
  if (typeof standingId !== 'string' || !UUID.test(standingId)) {
    return errorResult(
      new AppError(ErrorCode.INVALID_INPUT, "'standingId' is required."),
      requestId,
    );
  }
  try {
    const auth = await resolveOrganizationAuth(resolver, request.headers);
    const orgIds = await activeAuthorityOrganizationIds(deps, auth);
    const record = await deps.standing.getStanding(auth.tenantId, standingId, orgIds);
    if (record === undefined) {
      return {
        status: 404,
        body: { status: 'error', code: 'NOT_FOUND', message: 'Standing not found.', requestId },
      };
    }
    const nowMs = Date.parse(deps.nowIso());
    return { status: 200, body: { status: 'ok', requestId, standing: toView(record, nowMs) } };
  } catch (error) {
    return errorResult(error, requestId);
  }
}
