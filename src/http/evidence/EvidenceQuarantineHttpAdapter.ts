/**
 * Evidence quarantine REVIEW/DISPOSITION HTTP adapter — protocol-pure list/detail/disposition.
 *
 * These handlers let an authorized SECURITY OPERATOR triage the quarantine queue: list events,
 * inspect one, and record a disposition (reviewed/released/discarded). They are deliberately
 * narrow and translate raw HTTP shapes into calls against {@link EvidenceQuarantineReviewer}.
 *
 * Architectural boundaries (DO NOT violate — quarantine is OPERATIONAL SECURITY, not lifecycle
 * governance):
 *  - They NEVER store raw payload bytes, create governance.evidence_object rows, approve/reject
 *    a domain application, mutate governance.entity_state, execute a workflow, or call the
 *    Governance Kernel. A disposition only advances the quarantine event's own status and emits
 *    a sanitized outbox event.
 *  - "Released" is a security DISPOSITION (false-positive/acceptable metadata). Because the
 *    infected bytes were never retained, release does NOT restore or create an evidence upload;
 *    a still-needed document must be re-uploaded through the normal evidence path and re-scanned.
 *  - Tenant comes EXCLUSIVELY from the resolved {@link AuthContext}; query/path/body inputs
 *    never carry identity.
 *  - Authorization is a v1 local gate: read requires `evidence.quarantine.read` (or a security
 *    role); disposition requires `evidence.quarantine.disposition` (or a security role).
 *    Centralized authorization policy is future work.
 */

import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import { ForbiddenError } from '../auth/AuthErrors.js';
import type { AuthContext } from '../auth/AuthContext.js';
import type { AuthContextResolver } from '../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../auth/DemoAuthContextResolver.js';
import { requireActorUserId, requireTenant, resolveEvidenceAuth } from './evidenceHttpAuth.js';
import type { EvidenceQuarantineReviewer } from '../../governance/evidence/quarantine/index.js';
import {
  QUARANTINE_LIST_MAX_LIMIT,
  type QuarantineDisposition,
  type QuarantineEventView,
  type QuarantineListCursor,
  type QuarantineListFilter,
  type QuarantineScanStatus,
  type QuarantineStatus,
} from '../../governance/evidence/quarantine/index.js';
import type {
  QuarantineDetailHttpRequest,
  QuarantineDetailResponseBody,
  QuarantineDispositionHttpRequest,
  QuarantineDispositionResponseBody,
  QuarantineEventDto,
  QuarantineListHttpRequest,
  QuarantineListResponseBody,
} from './EvidenceQuarantineHttpDtos.js';

/** Default resolver mirrors the other evidence adapters: demo identity unless one is supplied. */
const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

/** Permission that grants quarantine read access. */
const QUARANTINE_READ_PERMISSION = 'evidence.quarantine.read';
/** Permission that grants quarantine disposition access. */
const QUARANTINE_DISPOSITION_PERMISSION = 'evidence.quarantine.disposition';
/** Security roles that implicitly grant quarantine access (v1 gate; centralized policy later). */
const SECURITY_ROLES: readonly string[] = ['security_reviewer', 'security_admin'];

const VALID_QUARANTINE_STATUSES: readonly QuarantineStatus[] = [
  'recorded',
  'notified',
  'reviewed',
  'released',
  'discarded',
];
const VALID_SCAN_STATUSES: readonly QuarantineScanStatus[] = ['infected', 'error', 'skipped'];

/** Dependencies for the quarantine review adapter: just the narrow reviewer port. */
export interface EvidenceQuarantineHttpDeps {
  readonly reviewer: EvidenceQuarantineReviewer;
}

/** Protocol-pure result: an HTTP status code and a JSON-serializable body. */
export interface EvidenceQuarantineHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

/** Read gate: fails CLOSED unless the actor holds the read permission or a security role. */
function requireQuarantineReadAccess(auth: AuthContext): void {
  const hasPermission = auth.actor.permissionKeys.includes(QUARANTINE_READ_PERMISSION);
  const hasRole = auth.actor.roleKeys.some((r) => SECURITY_ROLES.includes(r));
  if (!hasPermission && !hasRole) {
    throw new ForbiddenError(
      'Quarantine read access requires the evidence.quarantine.read permission or a security role.',
    );
  }
}

/** Disposition gate: fails CLOSED unless the actor holds the disposition permission or a role. */
function requireQuarantineDispositionAccess(auth: AuthContext): void {
  const hasPermission = auth.actor.permissionKeys.includes(QUARANTINE_DISPOSITION_PERMISSION);
  const hasRole = auth.actor.roleKeys.some((r) => SECURITY_ROLES.includes(r));
  if (!hasPermission && !hasRole) {
    throw new ForbiddenError(
      'Quarantine disposition requires the evidence.quarantine.disposition permission or a security role.',
    );
  }
}

/** Encode a keyset cursor as an opaque base64url token. */
function encodeCursor(cursor: QuarantineListCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Decode an opaque cursor token; throws INVALID_INPUT when malformed. */
function decodeCursor(token: string): QuarantineListCursor {
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
function parseListFilter(query: Readonly<Record<string, string | undefined>>): QuarantineListFilter {
  const filter: {
    quarantineStatus?: QuarantineStatus;
    scanStatus?: QuarantineScanStatus;
    limit?: number;
    cursor?: QuarantineListCursor;
  } = {};

  const status = query['status'];
  if (status !== undefined && status !== '') {
    if (!VALID_QUARANTINE_STATUSES.includes(status as QuarantineStatus)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `status must be one of: ${VALID_QUARANTINE_STATUSES.join(', ')}.`,
      );
    }
    filter.quarantineStatus = status as QuarantineStatus;
  }

  const scanStatus = query['scanStatus'];
  if (scanStatus !== undefined && scanStatus !== '') {
    if (!VALID_SCAN_STATUSES.includes(scanStatus as QuarantineScanStatus)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `scanStatus must be one of: ${VALID_SCAN_STATUSES.join(', ')}.`,
      );
    }
    filter.scanStatus = scanStatus as QuarantineScanStatus;
  }

  const limitRaw = query['limit'];
  if (limitRaw !== undefined && limitRaw !== '') {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'limit must be a positive integer.');
    }
    filter.limit = Math.min(parsed, QUARANTINE_LIST_MAX_LIMIT);
  }

  const cursorRaw = query['cursor'];
  if (cursorRaw !== undefined && cursorRaw !== '') filter.cursor = decodeCursor(cursorRaw);

  return filter;
}

function toDto(view: QuarantineEventView): QuarantineEventDto {
  return {
    quarantineEventId: view.quarantineEventId,
    evidenceObjectId: view.evidenceObjectId ?? null,
    sourceFilename: view.sourceFilename ?? null,
    contentType: view.contentType,
    sizeBytes: view.sizeBytes,
    contentHash: view.contentHash,
    scanStatus: view.scanStatus,
    scanner: view.scanner,
    signatureVersion: view.signatureVersion ?? null,
    threatName: view.threatName ?? null,
    reason: view.reason ?? null,
    quarantineStatus: view.quarantineStatus,
    uploadActorUserId: view.uploadActorUserId ?? null,
    reviewedByUserId: view.reviewedByUserId ?? null,
    reviewedAt: view.reviewedAt ?? null,
    dispositionReason: view.dispositionReason ?? null,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Map a quarantine error code to an HTTP status. */
function quarantineErrorStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.INVALID_INPUT:
    case ErrorCode.EVIDENCE_QUARANTINE_INVALID_DISPOSITION:
      return 400;
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.FORBIDDEN:
    case ErrorCode.PERMISSION_DENIED:
      return 403;
    case ErrorCode.EVIDENCE_QUARANTINE_NOT_FOUND:
      return 404;
    case ErrorCode.EVIDENCE_QUARANTINE_DISPOSITION_CONFLICT:
      return 409;
    default:
      return 500;
  }
}

/** Translate any error into a safe HTTP result; unknown errors collapse to an opaque 500. */
export function quarantineErrorToHttpResult(
  err: unknown,
  requestId: string,
): EvidenceQuarantineHttpResult {
  if (err instanceof AppError) {
    return {
      status: quarantineErrorStatus(err.code),
      body: { status: 'error', code: err.code, message: err.message, requestId },
    };
  }
  return {
    status: 500,
    body: { status: 'error', code: 'INTERNAL', message: 'Internal server error.', requestId },
  };
}

/** Handle GET /v1/evidence/quarantine — list quarantine events for the authenticated tenant. */
export async function handleQuarantineList(
  deps: EvidenceQuarantineHttpDeps,
  req: QuarantineListHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<EvidenceQuarantineHttpResult> {
  try {
    const auth = await resolveEvidenceAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    requireQuarantineReadAccess(auth);

    const filter = parseListFilter(req.query);
    const result = await deps.reviewer.listQuarantineEvents(tenantId, filter);

    const body: QuarantineListResponseBody = {
      status: 'ok',
      items: result.items.map(toDto),
      nextCursor: result.nextCursor !== undefined ? encodeCursor(result.nextCursor) : null,
      requestId,
    };
    return { status: 200, body };
  } catch (err) {
    return quarantineErrorToHttpResult(err, requestId);
  }
}

/** Handle GET /v1/evidence/quarantine/:quarantineEventId — inspect a single quarantine event. */
export async function handleQuarantineDetail(
  deps: EvidenceQuarantineHttpDeps,
  req: QuarantineDetailHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<EvidenceQuarantineHttpResult> {
  try {
    const auth = await resolveEvidenceAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    requireQuarantineReadAccess(auth);

    if (req.quarantineEventId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'quarantineEventId path parameter is required.');
    }

    const view = await deps.reviewer.getQuarantineEvent(tenantId, req.quarantineEventId);
    if (view === undefined) {
      throw new AppError(ErrorCode.EVIDENCE_QUARANTINE_NOT_FOUND, 'Quarantine event not found.');
    }

    const body: QuarantineDetailResponseBody = {
      status: 'ok',
      event: toDto(view),
      requestId,
    };
    return { status: 200, body };
  } catch (err) {
    return quarantineErrorToHttpResult(err, requestId);
  }
}

/**
 * Handle POST /v1/evidence/quarantine/:quarantineEventId/disposition — record an operator
 * disposition (reviewed/released/discarded). Identity (tenant + acting operator) comes from the
 * trusted headers; the body carries only `disposition` + optional `reason`.
 */
export async function handleQuarantineDisposition(
  deps: EvidenceQuarantineHttpDeps,
  req: QuarantineDispositionHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<EvidenceQuarantineHttpResult> {
  try {
    const auth = await resolveEvidenceAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    const actorUserId = requireActorUserId(auth);
    requireQuarantineDispositionAccess(auth);

    if (req.quarantineEventId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'quarantineEventId path parameter is required.');
    }
    if (!isPlainObject(req.body)) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'Request body must be a JSON object.');
    }
    const dispositionRaw = req.body['disposition'];
    if (typeof dispositionRaw !== 'string' || dispositionRaw.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'disposition is required.');
    }
    const reasonRaw = req.body['reason'];
    if (reasonRaw !== undefined && typeof reasonRaw !== 'string') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'reason must be a string when provided.');
    }
    const reason = typeof reasonRaw === 'string' && reasonRaw.trim() !== '' ? reasonRaw.trim() : undefined;

    const result = await deps.reviewer.recordQuarantineDisposition({
      tenantId,
      quarantineEventId: req.quarantineEventId,
      // The service validates this against the allowed disposition set (fails closed otherwise).
      disposition: dispositionRaw.trim() as QuarantineDisposition,
      actorUserId,
      requestId,
      ...(reason !== undefined ? { reason } : {}),
    });

    const body: QuarantineDispositionResponseBody = {
      status: 'ok',
      quarantineEventId: result.quarantineEventId,
      previousStatus: result.previousStatus,
      newStatus: result.newStatus,
      disposition: dispositionRaw.trim() as QuarantineDisposition,
      requestId,
    };
    return { status: 200, body };
  } catch (err) {
    return quarantineErrorToHttpResult(err, requestId);
  }
}
