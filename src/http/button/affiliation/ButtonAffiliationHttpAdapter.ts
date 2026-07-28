/**
 * The Button — club-affiliation DRAFT HTTP surface (Slice C), protocol-pure.
 *
 * Bounded, task-specific endpoints over {@link AffiliationDraftService}. Tenant + actor come
 * EXCLUSIVELY from the resolved {@link AuthContext}; the target organization is RE-AUTHORIZED
 * server-side against the actor's explicit organizational references AND an ACTIVE representative
 * authority. Cross-tenant or non-representable references fail closed as an opaque 404 (no
 * existence disclosure); an inactive/expired authority fails as 403.
 *
 * This surface NEVER exposes a generic kernel transition endpoint. Draft edits remain outside the
 * kernel; the Slice D submission command delegates to the bounded affiliation service, which alone
 * invokes the governed transition. Every error maps to a sanitized
 * `{ status, code, message, requestId }` envelope.
 */

import { randomUUID } from 'node:crypto';

import { AppError, ErrorCode } from '../../../shared/errors/AppError.js';
import type { AuthContext, AuthActor } from '../../auth/AuthContext.js';
import type { AuthContextResolver } from '../../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../../auth/DemoAuthContextResolver.js';
import { resolveOrganizationAuth } from '../../organization/organizationHttpAuth.js';
import type { OrganizationReadStore } from '../../organization/OrganizationReadHttpAdapter.js';
import type { OrganizationView } from '../../../domains/organization-registry/OrganizationTypes.js';
import {
  NOOP_TELEMETRY,
  TelemetryAttributeKeys,
  TelemetryCounters,
  TelemetryResult,
} from '../../../observability/index.js';
import type { Telemetry } from '../../../observability/index.js';
import type {
  JurisdictionResolver,
  RepresentativeAuthorityProvider,
} from '../ButtonContextService.js';
import type { AffiliationDraftService } from '../../../domains/affiliation-requirements/index.js';
import type {
  AffiliationSubmissionService,
  CorrectionReason,
} from '../../../domains/affiliation-submission/index.js';

const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

/** Bounded set of affiliation pathways a representative may initiate. */
const ALLOWED_PATHWAYS: ReadonlySet<string> = new Set(['new_affiliation', 'renewal']);

export interface ButtonAffiliationHttpRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly params: Readonly<{ applicationId?: string; linkId?: string; correctionId?: string }>;
  readonly body?: unknown;
}

export interface ButtonAffiliationHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface ButtonAffiliationHttpDeps {
  readonly service: AffiliationDraftService;
  /** Slice D command surface. Omitted by Slice C-only test/composition fixtures. */
  readonly submissions?: AffiliationSubmissionService;
  readonly organizations: OrganizationReadStore;
  readonly authorities: RepresentativeAuthorityProvider;
  readonly jurisdictions: JurisdictionResolver;
  readonly nowIso: () => string;
  readonly telemetry?: Telemetry;
}

function appErrorHttpStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.INVALID_INPUT:
    case ErrorCode.AFFILIATION_EVIDENCE_REFERENCE_INVALID:
      return 400;
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.PERMISSION_DENIED:
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND:
    case ErrorCode.AFFILIATION_REQUIREMENT_UNKNOWN:
    case ErrorCode.AFFILIATION_CORRECTION_NOT_FOUND:
      return 404;
    case ErrorCode.AFFILIATION_DRAFT_VERSION_CONFLICT:
    case ErrorCode.AFFILIATION_SUBMISSION_NOT_READY:
    case ErrorCode.AFFILIATION_CORRECTION_CONFLICT:
      return 409;
    default:
      return 500;
  }
}

function errorResult(err: unknown, requestId: string): ButtonAffiliationHttpResult {
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

/**
 * Re-authorize a target organization: it must be one the actor explicitly references, must exist
 * and be active for the tenant, AND the actor must hold an ACTIVE representative authority over it.
 * Non-representable / missing / cross-tenant => opaque 404 (no existence disclosure); inactive
 * authority => 403.
 */
async function authorizeOrganization(
  deps: ButtonAffiliationHttpDeps,
  auth: AuthContext,
  organizationId: string,
): Promise<OrganizationView> {
  const notFound = (): AppError =>
    new AppError(ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND, 'Affiliation application not found.');

  if (!representableOrganizationIds(auth.actor).includes(organizationId)) throw notFound();
  const org = await deps.organizations.getById(auth.tenantId, organizationId);
  if (org === undefined || org.status !== 'active') throw notFound();

  const authorities = await deps.authorities.authoritiesFor(auth.tenantId, auth.actor, [
    organizationId,
  ]);
  const authority = authorities.find((a) => a.organizationId === organizationId);
  if (authority === undefined || authority.status !== 'active') {
    throw new AppError(
      ErrorCode.FORBIDDEN,
      'Representative authority is not active for this organization.',
    );
  }
  return org;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(ErrorCode.INVALID_INPUT, `A non-empty '${field}' is required.`);
  }
  return value.trim();
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'A JSON object body is required.');
  }
  return body as Record<string, unknown>;
}

function submissionService(deps: ButtonAffiliationHttpDeps): AffiliationSubmissionService {
  if (deps.submissions === undefined) {
    throw new AppError(ErrorCode.CONFIG_ERROR, 'Affiliation submission is not configured.');
  }
  return deps.submissions;
}

/** Parse the optimistic-concurrency precondition from `If-Match` header or body.expectedVersion. */
function parseExpectedVersion(
  headers: Readonly<Record<string, string | undefined>>,
  body: Record<string, unknown>,
): number {
  const ifMatch = headers['if-match'];
  let raw: string | undefined;
  if (typeof ifMatch === 'string' && ifMatch.trim() !== '') {
    raw = ifMatch.trim().replace(/^W\//, '').replace(/^"/, '').replace(/"$/, '');
  } else if (typeof body['expectedVersion'] === 'number') {
    raw = String(body['expectedVersion']);
  } else if (typeof body['expectedVersion'] === 'string') {
    raw = body['expectedVersion'];
  }
  if (raw === undefined) {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      "An 'If-Match' precondition (draft version) is required to save.",
    );
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError(ErrorCode.INVALID_INPUT, "The 'If-Match' precondition is not a valid version.");
  }
  return parsed;
}

function etagHeaders(token: string): Record<string, string> {
  return { ETag: `"${token}"` };
}

function emit(
  deps: ButtonAffiliationHttpDeps,
  operation: string,
  result: (typeof TelemetryResult)[keyof typeof TelemetryResult],
): void {
  (deps.telemetry ?? NOOP_TELEMETRY).incrementCounter(
    TelemetryCounters.buttonAffiliationOperation,
    1,
    {
      [TelemetryAttributeKeys.operation]: operation,
      [TelemetryAttributeKeys.result]: result,
    },
  );
}

/** GET /v1/button/affiliation — overview (begin vs resume) for an org+season. */
export async function handleAffiliationOverview(
  deps: ButtonAffiliationHttpDeps,
  req: ButtonAffiliationHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ButtonAffiliationHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, req.headers);
    const organizationId = requireString(req.query['organizationId'], 'organizationId');
    const seasonId = requireString(req.query['season'], 'season');
    const pathway = normalizePathway(req.query['pathway']);
    await authorizeOrganization(deps, auth, organizationId);
    const overview = await deps.service.getOverview({
      tenantId: auth.tenantId,
      organizationId,
      seasonId,
      pathway,
    });
    emit(deps, 'overview', TelemetryResult.success);
    return { status: 200, body: { status: 'ok', requestId, overview } };
  } catch (err) {
    emit(deps, 'overview', TelemetryResult.failure);
    return errorResult(err, requestId);
  }
}

/** POST /v1/button/affiliation/applications — initiate or resume (idempotent). */
export async function handleAffiliationInitiate(
  deps: ButtonAffiliationHttpDeps,
  req: ButtonAffiliationHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ButtonAffiliationHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, req.headers);
    const body = asRecord(req.body);
    const organizationId = requireString(body['organizationId'], 'organizationId');
    const seasonId = requireString(body['seasonId'], 'seasonId');
    const pathway = normalizePathway(body['pathway']);
    const org = await authorizeOrganization(deps, auth, organizationId);
    const jurisdiction = deps.jurisdictions.jurisdictionFor(org, auth.actor).code;
    const application = await deps.service.initiate({
      tenantId: auth.tenantId,
      organizationId,
      seasonId,
      actor: auth.actor.userId,
      context: { orgType: org.organizationType, jurisdiction, pathway, season: seasonId },
    });
    emit(deps, 'initiate', TelemetryResult.success);
    return {
      status: 200,
      body: { status: 'ok', requestId, application },
      headers: etagHeaders(application.concurrencyToken),
    };
  } catch (err) {
    emit(deps, 'initiate', TelemetryResult.failure);
    return errorResult(err, requestId);
  }
}

/** GET /v1/button/affiliation/applications/:applicationId — full projection. */
export async function handleAffiliationGet(
  deps: ButtonAffiliationHttpDeps,
  req: ButtonAffiliationHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ButtonAffiliationHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, req.headers);
    const applicationId = requireString(req.params.applicationId, 'applicationId');
    const application = await deps.service.getProjection(auth.tenantId, applicationId);
    await authorizeOrganization(deps, auth, application.organizationId);
    emit(deps, 'detail', TelemetryResult.success);
    return {
      status: 200,
      body: { status: 'ok', requestId, application },
      headers: etagHeaders(application.concurrencyToken),
    };
  } catch (err) {
    emit(deps, 'detail', TelemetryResult.failure);
    return errorResult(err, requestId);
  }
}

/** PUT /v1/button/affiliation/applications/:applicationId/draft — save responses (If-Match). */
export async function handleAffiliationSaveDraft(
  deps: ButtonAffiliationHttpDeps,
  req: ButtonAffiliationHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ButtonAffiliationHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, req.headers);
    const applicationId = requireString(req.params.applicationId, 'applicationId');
    const body = asRecord(req.body);
    const expectedVersion = parseExpectedVersion(req.headers, body);
    const responses = parseResponses(body['responses']);

    // Authorize BEFORE mutating (opaque 404 for wrong-org / cross-tenant).
    const current = await deps.service.getProjection(auth.tenantId, applicationId);
    await authorizeOrganization(deps, auth, current.organizationId);

    const application = await deps.service.saveDraft({
      tenantId: auth.tenantId,
      applicationId,
      expectedVersion,
      actor: auth.actor.userId,
      responses,
    });
    emit(deps, 'save_draft', TelemetryResult.success);
    return {
      status: 200,
      body: { status: 'ok', requestId, application },
      headers: etagHeaders(application.concurrencyToken),
    };
  } catch (err) {
    emit(deps, 'save_draft', TelemetryResult.failure);
    return errorResult(err, requestId);
  }
}

/** POST /v1/button/affiliation/applications/:applicationId/evidence-links — associate evidence. */
export async function handleAffiliationAssociateEvidence(
  deps: ButtonAffiliationHttpDeps,
  req: ButtonAffiliationHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ButtonAffiliationHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, req.headers);
    const applicationId = requireString(req.params.applicationId, 'applicationId');
    const body = asRecord(req.body);
    const requirementCode = requireString(body['requirementCode'], 'requirementCode');
    const evidenceObjectId = requireString(body['evidenceObjectId'], 'evidenceObjectId');
    const contentHash = requireString(body['contentHash'], 'contentHash');
    const contentType = requireString(body['contentType'], 'contentType');
    const displayName =
      typeof body['displayName'] === 'string' && body['displayName'].trim() !== ''
        ? body['displayName'].trim()
        : undefined;

    const current = await deps.service.getProjection(auth.tenantId, applicationId);
    await authorizeOrganization(deps, auth, current.organizationId);

    const { projection, link } = await deps.service.associateEvidence({
      tenantId: auth.tenantId,
      applicationId,
      requirementCode,
      evidenceObjectId,
      contentHash,
      contentType,
      ...(displayName !== undefined ? { displayName } : {}),
      actor: auth.actor.userId,
    });
    emit(deps, 'associate_evidence', TelemetryResult.success);
    return {
      status: 200,
      body: { status: 'ok', requestId, application: projection, link },
      headers: etagHeaders(projection.concurrencyToken),
    };
  } catch (err) {
    emit(deps, 'associate_evidence', TelemetryResult.failure);
    return errorResult(err, requestId);
  }
}

/** DELETE /v1/button/affiliation/applications/:applicationId/evidence-links/:linkId. */
export async function handleAffiliationRemoveEvidence(
  deps: ButtonAffiliationHttpDeps,
  req: ButtonAffiliationHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ButtonAffiliationHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, req.headers);
    const applicationId = requireString(req.params.applicationId, 'applicationId');
    const linkId = requireString(req.params.linkId, 'linkId');

    const current = await deps.service.getProjection(auth.tenantId, applicationId);
    await authorizeOrganization(deps, auth, current.organizationId);

    const application = await deps.service.removeEvidence({
      tenantId: auth.tenantId,
      applicationId,
      linkId,
      actor: auth.actor.userId,
    });
    emit(deps, 'remove_evidence', TelemetryResult.success);
    return {
      status: 200,
      body: { status: 'ok', requestId, application },
      headers: etagHeaders(application.concurrencyToken),
    };
  } catch (err) {
    emit(deps, 'remove_evidence', TelemetryResult.failure);
    return errorResult(err, requestId);
  }
}

/** POST /v1/button/affiliation/applications/:applicationId/submissions. */
export async function handleAffiliationSubmit(
  deps: ButtonAffiliationHttpDeps,
  req: ButtonAffiliationHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ButtonAffiliationHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, req.headers);
    const applicationId = requireString(req.params.applicationId, 'applicationId');
    const body = asRecord(req.body);
    const expectedDraftVersion = parseExpectedVersion(req.headers, body);
    const idempotencyKey = requireString(
      req.headers['idempotency-key'] ?? body['idempotencyKey'],
      'Idempotency-Key',
    );
    const current = await deps.service.getProjection(auth.tenantId, applicationId);
    await authorizeOrganization(deps, auth, current.organizationId);
    const receipt = await submissionService(deps).submit({
      tenantId: auth.tenantId,
      applicationId,
      expectedDraftVersion,
      idempotencyKey,
      actorUserId: auth.actor.userId,
      actorRoleKeys: auth.actor.roleKeys,
      seasonId: current.seasonId,
      organizationId: current.organizationId,
      correlationId: requestId,
    });
    emit(deps, 'submit', TelemetryResult.success);
    return { status: 201, body: { status: 'ok', requestId, receipt } };
  } catch (err) {
    emit(deps, 'submit', TelemetryResult.failure);
    return errorResult(err, requestId);
  }
}

/** POST /v1/button/affiliation/applications/:applicationId/corrections (reviewer-only). */
export async function handleAffiliationOpenCorrection(
  deps: ButtonAffiliationHttpDeps,
  req: ButtonAffiliationHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ButtonAffiliationHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, req.headers);
    const applicationId = requireString(req.params.applicationId, 'applicationId');
    const body = asRecord(req.body);
    const reasons = parseCorrectionReasons(body['reasons']);
    const correction = await submissionService(deps).openCorrection({
      tenantId: auth.tenantId,
      applicationId,
      reviewerUserId: auth.actor.userId,
      reviewerRoleKeys: auth.actor.roleKeys,
      reasons,
    });
    emit(deps, 'open_correction', TelemetryResult.success);
    return { status: 201, body: { status: 'ok', requestId, correction } };
  } catch (err) {
    emit(deps, 'open_correction', TelemetryResult.failure);
    return errorResult(err, requestId);
  }
}

/** POST /applications/:id/corrections/:correctionId/resubmissions. */
export async function handleAffiliationResubmitCorrection(
  deps: ButtonAffiliationHttpDeps,
  req: ButtonAffiliationHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<ButtonAffiliationHttpResult> {
  try {
    const auth = await resolveOrganizationAuth(resolver, req.headers);
    const applicationId = requireString(req.params.applicationId, 'applicationId');
    const correctionRequestId = requireString(req.params.correctionId, 'correctionId');
    const body = asRecord(req.body);
    const expectedDraftVersion = parseExpectedVersion(req.headers, body);
    const idempotencyKey = requireString(
      req.headers['idempotency-key'] ?? body['idempotencyKey'],
      'Idempotency-Key',
    );
    const current = await deps.service.getProjection(auth.tenantId, applicationId);
    await authorizeOrganization(deps, auth, current.organizationId);
    const receipt = await submissionService(deps).resubmitCorrection({
      tenantId: auth.tenantId,
      applicationId,
      correctionRequestId,
      expectedDraftVersion,
      idempotencyKey,
      actorUserId: auth.actor.userId,
    });
    emit(deps, 'resubmit_correction', TelemetryResult.success);
    return { status: 201, body: { status: 'ok', requestId, receipt } };
  } catch (err) {
    emit(deps, 'resubmit_correction', TelemetryResult.failure);
    return errorResult(err, requestId);
  }
}

function normalizePathway(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'new_affiliation';
  if (typeof value !== 'string' || !ALLOWED_PATHWAYS.has(value)) {
    throw new AppError(ErrorCode.INVALID_INPUT, "Unknown affiliation 'pathway'.");
  }
  return value;
}

function parseResponses(
  value: unknown,
): readonly { readonly requirementCode: string; readonly value: Record<string, unknown> }[] {
  if (!Array.isArray(value)) {
    throw new AppError(ErrorCode.INVALID_INPUT, "'responses' must be an array.");
  }
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new AppError(ErrorCode.INVALID_INPUT, `responses[${index}] must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    const requirementCode = requireString(record['requirementCode'], `responses[${index}].requirementCode`);
    const responseValue = record['value'];
    if (responseValue === null || typeof responseValue !== 'object' || Array.isArray(responseValue)) {
      throw new AppError(ErrorCode.INVALID_INPUT, `responses[${index}].value must be an object.`);
    }
    return { requirementCode, value: responseValue as Record<string, unknown> };
  });
}

function parseCorrectionReasons(value: unknown): readonly CorrectionReason[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppError(ErrorCode.INVALID_INPUT, "'reasons' must be a non-empty array.");
  }
  return value.map((entry, index) => {
    const record = asRecord(entry);
    return {
      requirementCode: requireString(
        record['requirementCode'],
        `reasons[${index}].requirementCode`,
      ),
      reason: requireString(record['reason'], `reasons[${index}].reason`),
    };
  });
}
