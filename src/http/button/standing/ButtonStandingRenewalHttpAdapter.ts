/**
 * The Button — bounded STANDING RENEWAL initiation HTTP surface, protocol-pure.
 *
 * A single, task-specific command: `POST /v1/button/affiliation/standing/:standingId/renewals`.
 * It lets an authorized representative START (or RESUME) the renewal of a standing they hold an
 * ACTIVE authority over — by routing them INTO the existing affiliation-application workflow
 * ({@link AffiliationDraftService}). It NEVER executes the governed standing-renewal transition:
 * `renew` / `renew_active` stay with the Governance Kernel and the segregated standing_renewal
 * authority. It NEVER creates a second application workflow — a renewal is an ordinary
 * `renewal`-pathway affiliation application, additionally attributed to the standing.
 *
 * Everything the browser could assert is RE-RESOLVED server-side: the actor's active authority, the
 * target organization, the target season (must be current + open), the governing jurisdiction, and
 * the renewal posture (derived from the SAME record the renewal is attributed to). The source
 * standing version and source season are taken from the server-resolved record, never the request.
 * Errors map to a sanitized `{ status, code, message, requestId }` envelope; a foreign/out-of-scope
 * standing is an opaque 404 (no existence disclosure).
 */

import { randomUUID } from 'node:crypto';

import type { AffiliationDraftService } from '../../../domains/affiliation-requirements/index.js';
import type {
  StandingRenewalEligibilityService,
  StandingReviewService,
} from '../../../domains/affiliation-standing/index.js';
import { AppError, ErrorCode } from '../../../shared/errors/AppError.js';
import type { AuthContextResolver } from '../../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../../auth/DemoAuthContextResolver.js';
import { resolveOrganizationAuth } from '../../organization/organizationHttpAuth.js';
import {
  authorizeJurisdiction,
  authorizeOrganization,
  authorizeSeason,
  requireStringField,
  type OrganizationInitiationAuthDeps,
} from '../affiliation/ButtonAffiliationHttpAdapter.js';

const DEFAULT_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Dependencies for the bounded standing-renewal initiation surface. */
export interface ButtonStandingRenewalHttpDeps extends OrganizationInitiationAuthDeps {
  /** The single governed application workflow a renewal is routed into. */
  readonly draft: AffiliationDraftService;
  /** Scoped standing read model — resolves the standing the renewal is attributed to. */
  readonly standing: StandingReviewService;
  /** Server-derived renewal posture (eligible / in_progress / not_eligible / reconciliation). */
  readonly eligibility: StandingRenewalEligibilityService;
}

export interface ButtonStandingRenewalHttpRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly params?: Readonly<{ standingId?: string }>;
  readonly body?: unknown;
}

export interface ButtonStandingRenewalHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

function appErrorHttpStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.INVALID_INPUT:
      return 400;
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.PERMISSION_DENIED:
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND:
    case ErrorCode.AFFILIATION_STANDING_NOT_FOUND:
      return 404;
    case ErrorCode.SEASON_UNAVAILABLE:
    case ErrorCode.JURISDICTION_UNAVAILABLE:
    case ErrorCode.STANDING_RENEWAL_NOT_ELIGIBLE:
    case ErrorCode.STANDING_RENEWAL_RECONCILIATION_REQUIRED:
      return 409;
    default:
      return 500;
  }
}

function errorResult(err: unknown, requestId: string): ButtonStandingRenewalHttpResult {
  if (err instanceof AppError) {
    return {
      status: appErrorHttpStatus(err.code),
      body: { status: 'error', code: err.code, message: err.message, requestId },
    };
  }
  return {
    status: 500,
    body: { status: 'error', code: 'INTERNAL', message: 'Internal server error.', requestId },
  };
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'A JSON object body is required.');
  }
  return body as Record<string, unknown>;
}

/**
 * POST /v1/button/affiliation/standing/:standingId/renewals — start or resume a standing's renewal.
 *
 * Requires an `Idempotency-Key` header and a `{ targetSeasonId }` body. Responses:
 *  - 201 — a NEW renewal application was created and attributed to the standing;
 *  - 200 — an idempotent replay OR an already-in-progress renewal (resume): `{ renewalApplicationId }`;
 *  - 404 — the standing is unknown, another tenant's, or outside the actor's authority (opaque);
 *  - 403 — the actor's authority over the standing's organization is not active;
 *  - 409 — season/jurisdiction unavailable, not eligible, or lifecycle reconciliation required.
 */
export async function handleButtonStandingRenewalInitiate(
  deps: ButtonStandingRenewalHttpDeps,
  request: ButtonStandingRenewalHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_RESOLVER,
): Promise<ButtonStandingRenewalHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, request.headers);

    const standingId = request.params?.standingId;
    if (typeof standingId !== 'string' || !UUID.test(standingId)) {
      throw new AppError(ErrorCode.INVALID_INPUT, "A valid 'standingId' is required.");
    }
    const idempotencyKey = requireStringField(request.headers['idempotency-key'], 'Idempotency-Key');
    const body = asRecord(request.body);
    const targetSeasonId = requireStringField(body['targetSeasonId'], 'targetSeasonId');

    // Locate the standing across ALL held authorities (any status). An out-of-scope / cross-tenant
    // standing is invisible => opaque 404.
    const authorities = await deps.authorities.authoritiesFor(
      auth.tenantId,
      auth.actor,
      deps.nowIso(),
    );
    const scopeOrgIds = authorities.map((a) => a.organizationId);
    const record = await deps.standing.getStanding(auth.tenantId, standingId, scopeOrgIds);
    if (record === undefined) {
      return {
        status: 404,
        body: { status: 'error', code: 'NOT_FOUND', message: 'Standing not found.', requestId },
      };
    }

    // Re-authorize the standing's organization: no authority => opaque 404; inactive authority
    // or inactive org => 403 / 404. A trusted identity alone never satisfies this.
    const org = await authorizeOrganization(deps, auth, record.organizationId);

    // The target season is re-validated against the governed catalog (must be current + open); a
    // browser-supplied flag is ignored.
    await authorizeSeason(deps, auth.tenantId, targetSeasonId, true);
    // The organization must resolve to a governing jurisdiction (fail closed otherwise).
    const jurisdiction = await authorizeJurisdiction(deps, auth.tenantId, org);

    // Derive the renewal posture from the SAME record we would attribute the renewal to.
    const eligibility = await deps.eligibility.evaluateForRecord(
      auth.tenantId,
      record,
      deps.nowIso(),
    );

    if (eligibility.posture === 'in_progress') {
      return {
        status: 200,
        body: {
          status: 'ok',
          requestId,
          posture: 'in_progress',
          resumed: true,
          renewalApplicationId: eligibility.renewalApplicationId,
        },
      };
    }

    if (eligibility.posture === 'reconciliation_required') {
      throw new AppError(
        ErrorCode.STANDING_RENEWAL_RECONCILIATION_REQUIRED,
        'This standing cannot be renewed until its governed status is reconciled.',
      );
    }

    if (eligibility.posture !== 'eligible') {
      throw new AppError(
        ErrorCode.STANDING_RENEWAL_NOT_ELIGIBLE,
        'This standing is not currently eligible for renewal.',
      );
    }

    // The requested target season must be one the server independently offered.
    const offered = eligibility.targetSeasons.some((s) => s.id === targetSeasonId);
    if (!offered) {
      throw new AppError(
        ErrorCode.STANDING_RENEWAL_NOT_ELIGIBLE,
        'The selected season is not an available renewal target for this standing.',
      );
    }

    const { application, created } = await deps.draft.initiateDetailed({
      tenantId: auth.tenantId,
      organizationId: record.organizationId,
      seasonId: targetSeasonId,
      actor: auth.actor.userId,
      context: {
        orgType: org.organizationType,
        jurisdiction,
        pathway: 'renewal',
        season: targetSeasonId,
      },
      renewal: {
        standingId,
        sourceStandingVersion: record.standingVersion,
        sourceSeasonId: record.season,
        targetSeasonId,
        idempotencyKey,
        correlationId: requestId,
        causationId: idempotencyKey,
      },
    });

    return {
      status: created ? 201 : 200,
      body: {
        status: 'ok',
        requestId,
        posture: 'eligible',
        created,
        resumed: !created,
        renewalApplicationId: application.applicationId,
        application,
      },
    };
  } catch (error) {
    return errorResult(error, requestId);
  }
}
