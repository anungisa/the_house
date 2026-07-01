/**
 * Native Node HTTP server for the AffiliationApplication transition adapter.
 *
 * Deliberately framework-free (no Express/Fastify/Nest): it handles socket I/O, routing,
 * body size limiting, and JSON (de)serialization, then delegates ALL governed logic to
 * {@link handleAffiliationHttpTransition}. This keeps the adapter hostable identically by
 * Azure Container Apps, Azure Functions (custom handler), local dev, or tests.
 *
 * Route (chosen convention — see docs/architecture/affiliation-http-adapter.md):
 *   POST /v1/affiliation/applications/:applicationId/transitions/:action
 * where :action is the FSM trigger verb (submit, review_start, approve, reject, activate,
 * suspend, reinstate, revoke, close, archive).
 *
 * Liveness/readiness:
 *   GET /healthz  → 200 (process is up; deliberately shallow, no dependency I/O)
 *   GET /readyz   → 200 when wired (and, when a readiness probe is injected, the backing
 *                   database answers a bounded, tenant-agnostic `SELECT 1`); 503 not_ready
 *                   when the probe is unavailable.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Buffer } from 'node:buffer';
import { URLSearchParams } from 'node:url';
import { randomUUID } from 'node:crypto';
import { AppError, ErrorCode } from '../shared/errors/AppError.js';
import {
  errorToHttpResult,
  handleAffiliationHttpTransition,
  type AffiliationCommandExecutor,
  type AffiliationHttpResult,
} from './AffiliationHttpAdapter.js';
import type { AuthContextResolver } from './auth/AuthContextResolver.js';
import type { ReadinessCheck } from './readiness.js';
import {
  NOOP_TELEMETRY,
  startStopwatch,
  TelemetryAttributeKeys,
  TelemetryCounters,
  TelemetryDurations,
  type Telemetry,
} from '../observability/index.js';
import {
  evidenceErrorToHttpResult,
  handleEvidenceDownload,
  handleEvidenceUpload,
  handleQuarantineDetail,
  handleQuarantineDisposition,
  handleQuarantineList,
  type EvidenceHttpDeps,
  type EvidenceHttpResult,
  type EvidenceQuarantineHttpDeps,
} from './evidence/index.js';
import {
  handleWorkflowDecision,
  handleWorkflowExecution,
  handleWorkflowList,
  handleWorkflowDetail,
  workflowErrorToHttpResult,
  workflowExecutionErrorToHttpResult,
  type WorkflowExecutionHttpDeps,
  type WorkflowHttpDeps,
  type WorkflowReadHttpDeps,
} from './workflow/index.js';
import {
  handleOrganizationList,
  handleOrganizationDetail,
  type OrganizationReadHttpDeps,
} from './organization/index.js';
import {
  handleParticipantList,
  handleParticipantDetail,
  handleOrganizationParticipantList,
  handleParticipantCreate,
  handleParticipantUpdate,
  handleParticipantStatusTransition,
  handleOrganizationParticipantLink,
  handleOrganizationParticipantStatusTransition,
  type ParticipantReadHttpDeps,
  type ParticipantWriteHttpDeps,
} from './participant/index.js';
import {
  handleFacilityList,
  handleFacilityDetail,
  handleOrganizationFacilityList,
  handleFacilityCreate,
  handleFacilityUpdate,
  type FacilityReadHttpDeps,
  type FacilityWriteHttpDeps,
} from './facility/index.js';

export interface AffiliationHttpServerDeps {
  /** The domain command boundary (e.g. AffiliationApplicationService). */
  readonly executor: AffiliationCommandExecutor;
  /**
   * Edge-identity resolver. When omitted the adapter falls back to its LOCAL/DEMO default
   * (body-trusted). Production wiring injects a config-selected resolver (see composition).
   */
  readonly resolver?: AuthContextResolver;
  /** Max JSON body size in bytes (default 1 MiB) — a basic safeguard against oversized payloads. */
  readonly maxBodyBytes?: number;
  /**
   * Optional evidence payload transport. When provided, the narrow evidence upload/download
   * endpoints are served; when omitted they 404. Evidence storage is governance
   * infrastructure — these routes never touch governed tables or the kernel.
   */
  readonly evidence?: EvidenceHttpDeps;
  /**
   * Optional evidence QUARANTINE review transport. When provided, the read-only list/detail and
   * the disposition (reviewed/released/discarded) endpoints are served; when omitted they 404.
   * Quarantine is OPERATIONAL SECURITY metadata — these routes never store payload bytes, create
   * governed evidence, mutate governed state, or invoke the kernel.
   */
  readonly evidenceQuarantine?: EvidenceQuarantineHttpDeps;
  /**
   * Optional workflow decision transport. When provided, the narrow workflow decision
   * endpoint is served; when omitted it 404s. Recording a decision is METADATA only — it
   * never mutates governed state and never executes the pending lifecycle transition.
   */
  readonly workflow?: WorkflowHttpDeps;
  /**
   * Optional workflow execution transport. When provided, the explicit "execute the approved
   * transition" endpoint is served; when omitted it 404s. This is the only workflow surface
   * that causes a lifecycle transition, and it does so exclusively through the Governance
   * Kernel (never auto-invoked by the decision endpoint).
   */
  readonly workflowExecution?: WorkflowExecutionHttpDeps;
  /**
   * Optional workflow admin READ transport. When provided, the read-only list/detail endpoints
   * are served; when omitted they 404. These endpoints NEVER mutate governed state, never record
   * decisions, and never execute a transition — the execution-readiness field is a hint only.
   */
  readonly workflowRead?: WorkflowReadHttpDeps;
  /**
   * Optional Organization Registry READ transport. When provided, the read-only list/detail
   * endpoints are served; when omitted they 404. These endpoints NEVER mutate the registry,
   * enqueue outbox messages, touch governed state, or invoke the kernel — they are a thin,
   * tenant-isolated projection gated by the centralized `organization.read` action.
   */
  readonly organizationRead?: OrganizationReadHttpDeps;
  /**
   * Optional Participant Registry READ transport. When provided, the read-only participant
   * list/detail and organization-participant relationship list endpoints are served; when omitted
   * they 404. These endpoints NEVER mutate the registry, enqueue outbox messages, touch governed
   * state, or invoke the kernel — they are thin, tenant-isolated projections gated by the
   * centralized `participant.read` action.
   */
  readonly participantRead?: ParticipantReadHttpDeps;
  /**
   * Optional Participant Registry WRITE transport. When provided, `POST /v1/participants` (create),
   * `PATCH /v1/participants/:participantId` (update safe profile fields),
   * `POST /v1/participants/:participantId/status-transitions` (transition the reference-data
   * status), `POST /v1/organizations/:organizationId/participants` (record an
   * organization↔participant relationship), and
   * `POST /v1/organizations/:organizationId/participants/:relationshipId/status-transitions`
   * (transition an existing relationship's reference-data status) are served; when omitted those
   * methods 404/405. These
   * endpoints mutate the registry ONLY through the validated Participant Registry service (which
   * owns the transactional outbox) — they NEVER touch governed lifecycle state, NEVER invoke the
   * kernel, and NEVER mutate the read-only Organization Registry. Create/update are gated by the
   * centralized `participant.write` action; the status transition by the distinct
   * `participant.status.write` action; the organization-link create by the distinct
   * `participant.organization_link.write` action (none implies another, and none implies
   * `participant.read`). Transitioning an existing relationship's reference-data status reuses the
   * SAME `participant.organization_link.write` action.
   */
  readonly participantWrite?: ParticipantWriteHttpDeps;
  /**
   * Optional Facility Registry READ transport. When provided, the read-only facility list/detail
   * and an organization's facilities list endpoints are served; when omitted they 404. These
   * endpoints NEVER mutate the registry, enqueue outbox messages, touch governed state, invoke the
   * kernel, or mutate the Organization Registry — they are thin, tenant-isolated projections gated
   * by the centralized `facility.read` action.
   */
  readonly facilityRead?: FacilityReadHttpDeps;
  /**
   * Optional Facility Registry WRITE transport (phase 1: create + update). When provided,
   * `POST /v1/facilities` and `PATCH /v1/facilities/:facilityId` are served; when omitted they are
   * not wired (a known facility path returns 405 reflecting the wired transports, or 404 when no
   * facility transport is wired). Create/update go THROUGH the validated
   * `FacilityRegistryService` (the service owns the transactional outbox); the adapter never
   * enqueues directly, never touches governed state, never invokes the kernel, and never mutates
   * the Organization Registry. Gated by the centralized `facility.write` action. A facility STATUS
   * transition is a deliberately separate future pass — no status-transition route is wired.
   */
  readonly facilityWrite?: FacilityWriteHttpDeps;
  /**
   * Optional readiness probe for `/readyz`. When provided, the endpoint performs a bounded,
   * tenant-agnostic dependency check (e.g. database `SELECT 1`) and returns 503 when the
   * dependency is unavailable. When omitted, `/readyz` stays shallow (process-level only).
   */
  readonly readiness?: ReadinessCheck;
  /**
   * Optional telemetry sink for operational metrics (request count/duration/error count, plus
   * the per-surface counters/events emitted by the adapters). Defaults to a no-op when omitted.
   * Telemetry is VISIBILITY only: it never affects routing, governed state, or responses, and
   * emission failures are swallowed so they can never break request handling.
   */
  readonly telemetry?: Telemetry;
}

const DEFAULT_MAX_BODY_BYTES = 1_048_576;

const TRANSITION_ROUTE =
  /^\/v1\/affiliation\/applications\/([^/]+)\/transitions\/([^/]+)\/?$/;

const EVIDENCE_UPLOAD_PATH = '/v1/evidence/objects';
const EVIDENCE_DOWNLOAD_PATH = '/v1/evidence/objects/read';

/** GET list of quarantine events (exact path). */
const QUARANTINE_LIST_PATH = '/v1/evidence/quarantine';
/**
 * POST a disposition for one quarantine event. Checked BEFORE the detail route so the more
 * specific `.../disposition` path never collides with the single-segment detail route.
 */
const QUARANTINE_DISPOSITION_ROUTE =
  /^\/v1\/evidence\/quarantine\/([^/]+)\/disposition\/?$/;
/** GET a single quarantine event by id (single trailing segment only). */
const QUARANTINE_DETAIL_ROUTE = /^\/v1\/evidence\/quarantine\/([^/]+)\/?$/;

const WORKFLOW_DECISION_ROUTE =
  /^\/v1\/workflows\/([^/]+)\/steps\/([^/]+)\/decision\/?$/;

const WORKFLOW_EXECUTE_ROUTE = /^\/v1\/workflows\/([^/]+)\/execute\/?$/;

/** GET list of workflows (exact path). */
const WORKFLOW_LIST_PATH = '/v1/workflows';
/**
 * GET a single workflow by id. A single trailing segment only, so it never collides with the
 * decision (`.../steps/:code/decision`) or execute (`.../execute`) routes, which have more
 * segments.
 */
const WORKFLOW_DETAIL_ROUTE = /^\/v1\/workflows\/([^/]+)\/?$/;
/** GET list of organizations (exact path). */
const ORGANIZATION_LIST_PATH = '/v1/organizations';
/**
 * GET a single organization by id. A single trailing segment only; never collides with the
 * exact list path above.
 */
const ORGANIZATION_DETAIL_ROUTE = /^\/v1\/organizations\/([^/]+)\/?$/;
/**
 * GET the participant relationships for one organization. A two-segment path
 * (`.../:organizationId/participants`), so it never collides with the single-segment organization
 * detail route above.
 */
const ORGANIZATION_PARTICIPANTS_ROUTE = /^\/v1\/organizations\/([^/]+)\/participants\/?$/;
/**
 * POST an organization↔participant relationship reference-data status transition. A four-segment
 * path (`.../:organizationId/participants/:relationshipId/status-transitions`), so it never
 * collides with the two-segment organization-participants list/link route above (which anchors on a
 * trailing `participants` segment). Matched BEFORE that route in dispatch for clarity.
 */
const ORGANIZATION_PARTICIPANT_STATUS_TRANSITIONS_ROUTE =
  /^\/v1\/organizations\/([^/]+)\/participants\/([^/]+)\/status-transitions\/?$/;
/** GET list of participants (exact path). */
const PARTICIPANT_LIST_PATH = '/v1/participants';
/**
 * GET a single participant by id. A single trailing segment only; never collides with the exact
 * list path above.
 */
const PARTICIPANT_DETAIL_ROUTE = /^\/v1\/participants\/([^/]+)\/?$/;
/**
 * POST a participant reference-data status transition. A two-segment path
 * (`.../:participantId/status-transitions`), so it never collides with the single-segment
 * participant detail route above. Matched BEFORE the detail route in dispatch for clarity.
 */
const PARTICIPANT_STATUS_TRANSITIONS_ROUTE =
  /^\/v1\/participants\/([^/]+)\/status-transitions\/?$/;
/** GET list of facilities (exact path). */
const FACILITY_LIST_PATH = '/v1/facilities';
/**
 * GET a single facility by id. A single trailing segment only; never collides with the exact list
 * path above.
 */
const FACILITY_DETAIL_ROUTE = /^\/v1\/facilities\/([^/]+)\/?$/;
/**
 * GET one organization's facilities. A two-segment path (`.../:organizationId/facilities`) anchored
 * on a trailing `facilities` segment, so it never collides with the single-segment organization
 * detail route or the participant-anchored organization routes.
 */
const ORGANIZATION_FACILITIES_ROUTE = /^\/v1\/organizations\/([^/]+)\/facilities\/?$/;
function sendJson(res: ServerResponse, result: AffiliationHttpResult): void {
  const payload = JSON.stringify(result.body);
  res.writeHead(result.status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload).toString(),
  });
  res.end(payload);
}

/** Read and JSON-parse the request body, enforcing a size cap. Returns undefined for an empty body. */
async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'Request body exceeds the maximum allowed size.');
    }
    chunks.push(buf);
  }
  if (total === 0) {
    return undefined;
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(ErrorCode.INVALID_INPUT, 'Request body is not valid JSON.');
  }
}

function headerMap(req: IncomingMessage): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    out[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }
  return out;
}

/** Read the raw request body bytes, enforcing a size cap. */
async function readRawBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'Request body exceeds the maximum allowed size.');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/** Send a raw-bytes response (used for evidence downloads). */
function sendBytes(
  res: ServerResponse,
  status: number,
  contentType: string,
  body: Uint8Array,
): void {
  const buf = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': buf.byteLength.toString(),
  });
  res.end(buf);
}

/** Dispatch an evidence result as either JSON metadata/error or raw bytes. */
function sendEvidence(res: ServerResponse, result: EvidenceHttpResult): void {
  if (result.kind === 'bytes') {
    sendBytes(res, result.status, result.contentType, result.body);
    return;
  }
  sendJson(res, { status: result.status, body: result.body });
}

/** Serve the narrow evidence upload/download endpoints. */
async function handleEvidenceRoute(
  req: IncomingMessage,
  res: ServerResponse,
  evidence: EvidenceHttpDeps,
  path: string,
  requestId: string,
  resolver: AuthContextResolver | undefined,
  jsonMaxBytes: number,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'POST') {
    res.setHeader('allow', 'POST');
    sendJson(res, {
      status: 405,
      body: {
        status: 'error',
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only POST is allowed for evidence endpoints.',
        requestId,
      },
    });
    return;
  }

  const headers = headerMap(req);

  if (path === EVIDENCE_UPLOAD_PATH) {
    let content: Buffer;
    try {
      content = await readRawBody(req, evidence.maxUploadBytes);
    } catch (err) {
      sendEvidence(res, evidenceErrorToHttpResult(err, requestId));
      return;
    }
    const result = await handleEvidenceUpload(evidence, { headers, content }, requestId, resolver);
    sendEvidence(res, result);
    return;
  }

  // EVIDENCE_DOWNLOAD_PATH — small JSON body carrying the storage reference.
  let body: unknown;
  try {
    body = await readJsonBody(req, jsonMaxBytes);
  } catch (err) {
    sendEvidence(res, evidenceErrorToHttpResult(err, requestId));
    return;
  }
  const result = await handleEvidenceDownload(evidence, { headers, body }, requestId, resolver);
  sendEvidence(res, result);
}

/**
 * Serve the narrow evidence quarantine REVIEW endpoints: GET list, GET detail, POST disposition.
 * Returns true when the path matched a quarantine route (handled), false otherwise. These routes
 * are operational-security metadata only — they never store bytes, create governed evidence,
 * mutate governed state, or invoke the kernel.
 */
async function handleEvidenceQuarantineRoute(
  req: IncomingMessage,
  res: ServerResponse,
  quarantine: EvidenceQuarantineHttpDeps,
  path: string,
  requestId: string,
  resolver: AuthContextResolver | undefined,
  jsonMaxBytes: number,
): Promise<boolean> {
  const method = req.method ?? 'GET';

  // POST .../:id/disposition — checked first (most specific path).
  const dispositionMatch = QUARANTINE_DISPOSITION_ROUTE.exec(path);
  if (dispositionMatch !== null) {
    if (method !== 'POST') {
      res.setHeader('allow', 'POST');
      sendJson(res, {
        status: 405,
        body: {
          status: 'error',
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only POST is allowed for the quarantine disposition endpoint.',
          requestId,
        },
      });
      return true;
    }
    const quarantineEventId = decodeURIComponent(dispositionMatch[1] ?? '');
    let body: unknown;
    try {
      body = await readJsonBody(req, jsonMaxBytes);
    } catch (err) {
      sendJson(res, errorToHttpResult(err, requestId));
      return true;
    }
    const result = await handleQuarantineDisposition(
      quarantine,
      { quarantineEventId, headers: headerMap(req), body },
      requestId,
      resolver,
    );
    sendJson(res, result);
    return true;
  }

  // GET /v1/evidence/quarantine — list.
  if (path === QUARANTINE_LIST_PATH) {
    if (method !== 'GET') {
      res.setHeader('allow', 'GET');
      sendJson(res, {
        status: 405,
        body: {
          status: 'error',
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only GET is allowed for the quarantine list endpoint.',
          requestId,
        },
      });
      return true;
    }
    const result = await handleQuarantineList(
      quarantine,
      { headers: headerMap(req), query: queryMap(req.url) },
      requestId,
      resolver,
    );
    sendJson(res, result);
    return true;
  }

  // GET /v1/evidence/quarantine/:id — detail.
  const detailMatch = QUARANTINE_DETAIL_ROUTE.exec(path);
  if (detailMatch !== null) {
    if (method !== 'GET') {
      res.setHeader('allow', 'GET');
      sendJson(res, {
        status: 405,
        body: {
          status: 'error',
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only GET is allowed for the quarantine detail endpoint.',
          requestId,
        },
      });
      return true;
    }
    const quarantineEventId = decodeURIComponent(detailMatch[1] ?? '');
    const result = await handleQuarantineDetail(
      quarantine,
      { quarantineEventId, headers: headerMap(req) },
      requestId,
      resolver,
    );
    sendJson(res, result);
    return true;
  }

  return false;
}

/** Serve the narrow workflow decision endpoint (metadata only — never executes a transition). */
async function handleWorkflowRoute(
  req: IncomingMessage,
  res: ServerResponse,
  workflow: WorkflowHttpDeps,
  match: RegExpExecArray,
  requestId: string,
  resolver: AuthContextResolver | undefined,
  maxBytes: number,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'POST') {
    res.setHeader('allow', 'POST');
    sendJson(res, {
      status: 405,
      body: {
        status: 'error',
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only POST is allowed for the workflow decision endpoint.',
        requestId,
      },
    });
    return;
  }

  const workflowInstanceId = decodeURIComponent(match[1] ?? '');
  const stepCode = decodeURIComponent(match[2] ?? '');

  let body: unknown;
  try {
    body = await readJsonBody(req, maxBytes);
  } catch (err) {
    sendJson(res, workflowErrorToHttpResult(err, requestId));
    return;
  }

  const result = await handleWorkflowDecision(
    workflow,
    { workflowInstanceId, stepCode, headers: headerMap(req), body },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/**
 * Serve the explicit workflow execution endpoint. This is the only workflow surface that
 * causes a lifecycle transition, and it does so exclusively through the Governance Kernel.
 */
async function handleWorkflowExecuteRoute(
  req: IncomingMessage,
  res: ServerResponse,
  workflowExecution: WorkflowExecutionHttpDeps,
  match: RegExpExecArray,
  requestId: string,
  resolver: AuthContextResolver | undefined,
  maxBytes: number,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'POST') {
    res.setHeader('allow', 'POST');
    sendJson(res, {
      status: 405,
      body: {
        status: 'error',
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only POST is allowed for the workflow execution endpoint.',
        requestId,
      },
    });
    return;
  }

  const workflowInstanceId = decodeURIComponent(match[1] ?? '');

  let body: unknown;
  try {
    body = await readJsonBody(req, maxBytes);
  } catch (err) {
    sendJson(res, workflowExecutionErrorToHttpResult(err, requestId));
    return;
  }

  const result = await handleWorkflowExecution(
    workflowExecution,
    { workflowInstanceId, headers: headerMap(req), body },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/** Parse the query string of a request URL into a flat record (first value wins per key). */
function queryMap(url: string | undefined): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  const qIndex = (url ?? '').indexOf('?');
  if (qIndex < 0) return out;
  const params = new URLSearchParams((url ?? '').slice(qIndex + 1));
  for (const [key, value] of params) {
    if (!(key in out)) out[key] = value;
  }
  return out;
}

/** Serve the read-only workflow list endpoint (GET only). */
async function handleWorkflowListRoute(
  req: IncomingMessage,
  res: ServerResponse,
  workflowRead: WorkflowReadHttpDeps,
  requestId: string,
  resolver: AuthContextResolver | undefined,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    res.setHeader('allow', 'GET');
    sendJson(res, {
      status: 405,
      body: {
        status: 'error',
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET is allowed for the workflow list endpoint.',
        requestId,
      },
    });
    return;
  }
  const result = await handleWorkflowList(
    workflowRead,
    { headers: headerMap(req), query: queryMap(req.url) },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/** Serve the read-only workflow detail endpoint (GET only). */
async function handleWorkflowDetailRoute(
  req: IncomingMessage,
  res: ServerResponse,
  workflowRead: WorkflowReadHttpDeps,
  match: RegExpExecArray,
  requestId: string,
  resolver: AuthContextResolver | undefined,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    res.setHeader('allow', 'GET');
    sendJson(res, {
      status: 405,
      body: {
        status: 'error',
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET is allowed for the workflow detail endpoint.',
        requestId,
      },
    });
    return;
  }
  const workflowInstanceId = decodeURIComponent(match[1] ?? '');
  const result = await handleWorkflowDetail(
    workflowRead,
    { workflowInstanceId, headers: headerMap(req) },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/** Serve the read-only organization list endpoint (GET only). */
async function handleOrganizationListRoute(
  req: IncomingMessage,
  res: ServerResponse,
  organizationRead: OrganizationReadHttpDeps,
  requestId: string,
  resolver: AuthContextResolver | undefined,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    res.setHeader('allow', 'GET');
    sendJson(res, {
      status: 405,
      body: {
        status: 'error',
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET is allowed for the organization list endpoint.',
        requestId,
      },
    });
    return;
  }
  const result = await handleOrganizationList(
    organizationRead,
    { headers: headerMap(req), query: queryMap(req.url) },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/** Serve the read-only organization detail endpoint (GET only). */
async function handleOrganizationDetailRoute(
  req: IncomingMessage,
  res: ServerResponse,
  organizationRead: OrganizationReadHttpDeps,
  match: RegExpExecArray,
  requestId: string,
  resolver: AuthContextResolver | undefined,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    res.setHeader('allow', 'GET');
    sendJson(res, {
      status: 405,
      body: {
        status: 'error',
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET is allowed for the organization detail endpoint.',
        requestId,
      },
    });
    return;
  }
  const organizationId = decodeURIComponent(match[1] ?? '');
  const result = await handleOrganizationDetail(
    organizationRead,
    { organizationId, headers: headerMap(req) },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/** Serve the read-only participant list endpoint (GET only). */
async function handleParticipantListRoute(
  req: IncomingMessage,
  res: ServerResponse,
  participantRead: ParticipantReadHttpDeps,
  requestId: string,
  resolver: AuthContextResolver | undefined,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    res.setHeader('allow', 'GET');
    sendJson(res, {
      status: 405,
      body: {
        status: 'error',
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET is allowed for the participant list endpoint.',
        requestId,
      },
    });
    return;
  }
  const result = await handleParticipantList(
    participantRead,
    { headers: headerMap(req), query: queryMap(req.url) },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/** Serve the read-only participant detail endpoint (GET only). */
async function handleParticipantDetailRoute(
  req: IncomingMessage,
  res: ServerResponse,
  participantRead: ParticipantReadHttpDeps,
  match: RegExpExecArray,
  requestId: string,
  resolver: AuthContextResolver | undefined,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    res.setHeader('allow', 'GET');
    sendJson(res, {
      status: 405,
      body: {
        status: 'error',
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET is allowed for the participant detail endpoint.',
        requestId,
      },
    });
    return;
  }
  const participantId = decodeURIComponent(match[1] ?? '');
  const result = await handleParticipantDetail(
    participantRead,
    { participantId, headers: headerMap(req) },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/** Serve the read-only facility list endpoint (GET only). */
async function handleFacilityListRoute(
  req: IncomingMessage,
  res: ServerResponse,
  facilityRead: FacilityReadHttpDeps,
  requestId: string,
  resolver: AuthContextResolver | undefined,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    res.setHeader('allow', 'GET');
    sendJson(res, {
      status: 405,
      body: {
        status: 'error',
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET is allowed for the facility list endpoint.',
        requestId,
      },
    });
    return;
  }
  const result = await handleFacilityList(
    facilityRead,
    { headers: headerMap(req), query: queryMap(req.url) },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/** Serve the read-only facility detail endpoint (GET only). */
async function handleFacilityDetailRoute(
  req: IncomingMessage,
  res: ServerResponse,
  facilityRead: FacilityReadHttpDeps,
  match: RegExpExecArray,
  requestId: string,
  resolver: AuthContextResolver | undefined,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    res.setHeader('allow', 'GET');
    sendJson(res, {
      status: 405,
      body: {
        status: 'error',
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET is allowed for the facility detail endpoint.',
        requestId,
      },
    });
    return;
  }
  const facilityId = decodeURIComponent(match[1] ?? '');
  const result = await handleFacilityDetail(
    facilityRead,
    { facilityId, headers: headerMap(req) },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/** Serve the read-only organization-facilities list endpoint (GET only). */
async function handleOrganizationFacilityListRoute(
  req: IncomingMessage,
  res: ServerResponse,
  facilityRead: FacilityReadHttpDeps,
  match: RegExpExecArray,
  requestId: string,
  resolver: AuthContextResolver | undefined,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    res.setHeader('allow', 'GET');
    sendJson(res, {
      status: 405,
      body: {
        status: 'error',
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET is allowed for the organization facilities endpoint.',
        requestId,
      },
    });
    return;
  }
  const organizationId = decodeURIComponent(match[1] ?? '');
  const result = await handleOrganizationFacilityList(
    facilityRead,
    { organizationId, headers: headerMap(req), query: queryMap(req.url) },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/** Serve the phase-1 facility CREATE endpoint (`POST /v1/facilities`). */
async function handleFacilityCreateRoute(
  req: IncomingMessage,
  res: ServerResponse,
  facilityWrite: FacilityWriteHttpDeps,
  requestId: string,
  resolver: AuthContextResolver | undefined,
  maxBytes: number,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req, maxBytes);
  } catch (err) {
    sendJson(res, errorToHttpResult(err, requestId));
    return;
  }
  const result = await handleFacilityCreate(
    facilityWrite,
    { headers: headerMap(req), body },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/** Serve the phase-1 facility UPDATE endpoint (`PATCH /v1/facilities/:facilityId`). */
async function handleFacilityUpdateRoute(
  req: IncomingMessage,
  res: ServerResponse,
  facilityWrite: FacilityWriteHttpDeps,
  match: RegExpExecArray,
  requestId: string,
  resolver: AuthContextResolver | undefined,
  maxBytes: number,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req, maxBytes);
  } catch (err) {
    sendJson(res, errorToHttpResult(err, requestId));
    return;
  }
  const facilityId = decodeURIComponent(match[1] ?? '');
  const result = await handleFacilityUpdate(
    facilityWrite,
    { facilityId, headers: headerMap(req), body },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/**
 * The HTTP methods available on the facility COLLECTION path (`/v1/facilities`) given the wired
 * transports: GET when read is wired, POST when phase-1 write is wired. Used to build the `Allow`
 * header for a 405.
 */
function facilityCollectionAllow(deps: AffiliationHttpServerDeps): string[] {
  const methods: string[] = [];
  if (deps.facilityRead !== undefined) methods.push('GET');
  if (deps.facilityWrite !== undefined) methods.push('POST');
  return methods;
}

/**
 * The HTTP methods available on the facility ITEM path (`/v1/facilities/:id`) given the wired
 * transports: GET when read is wired, PATCH when phase-1 write is wired.
 */
function facilityItemAllow(deps: AffiliationHttpServerDeps): string[] {
  const methods: string[] = [];
  if (deps.facilityRead !== undefined) methods.push('GET');
  if (deps.facilityWrite !== undefined) methods.push('PATCH');
  return methods;
}

/** Emit a 405 for a known facility path with the correct `Allow` header. */
function sendFacilityMethodNotAllowed(
  res: ServerResponse,
  requestId: string,
  allow: string[],
): void {
  res.setHeader('allow', allow.join(', '));
  sendJson(res, {
    status: 405,
    body: {
      status: 'error',
      code: 'METHOD_NOT_ALLOWED',
      message: `Method not allowed. Allowed: ${allow.join(', ')}.`,
      requestId,
    },
  });
}

async function handleOrganizationParticipantListRoute(
  req: IncomingMessage,
  res: ServerResponse,
  participantRead: ParticipantReadHttpDeps,
  match: RegExpExecArray,
  requestId: string,
  resolver: AuthContextResolver | undefined,
): Promise<void> {
  const organizationId = decodeURIComponent(match[1] ?? '');
  const result = await handleOrganizationParticipantList(
    participantRead,
    { organizationId, headers: headerMap(req), query: queryMap(req.url) },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/**
 * Serve the organization-participant LINK endpoint
 * (`POST /v1/organizations/:organizationId/participants`) — record a reference-data relationship.
 */
async function handleOrganizationParticipantLinkRoute(
  req: IncomingMessage,
  res: ServerResponse,
  participantWrite: ParticipantWriteHttpDeps,
  match: RegExpExecArray,
  requestId: string,
  resolver: AuthContextResolver | undefined,
  maxBytes: number,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req, maxBytes);
  } catch (err) {
    sendJson(res, errorToHttpResult(err, requestId));
    return;
  }
  const organizationId = decodeURIComponent(match[1] ?? '');
  const result = await handleOrganizationParticipantLink(
    participantWrite,
    { organizationId, headers: headerMap(req), body },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/** Serve the phase-1 participant CREATE endpoint (`POST /v1/participants`). */
async function handleParticipantCreateRoute(
  req: IncomingMessage,
  res: ServerResponse,
  participantWrite: ParticipantWriteHttpDeps,
  requestId: string,
  resolver: AuthContextResolver | undefined,
  maxBytes: number,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req, maxBytes);
  } catch (err) {
    sendJson(res, errorToHttpResult(err, requestId));
    return;
  }
  const result = await handleParticipantCreate(
    participantWrite,
    { headers: headerMap(req), body },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/** Serve the phase-1 participant UPDATE endpoint (`PATCH /v1/participants/:participantId`). */
async function handleParticipantUpdateRoute(
  req: IncomingMessage,
  res: ServerResponse,
  participantWrite: ParticipantWriteHttpDeps,
  match: RegExpExecArray,
  requestId: string,
  resolver: AuthContextResolver | undefined,
  maxBytes: number,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req, maxBytes);
  } catch (err) {
    sendJson(res, errorToHttpResult(err, requestId));
    return;
  }
  const participantId = decodeURIComponent(match[1] ?? '');
  const result = await handleParticipantUpdate(
    participantWrite,
    { participantId, headers: headerMap(req), body },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/**
 * Serve the participant status-transition endpoint
 * (`POST /v1/participants/:participantId/status-transitions`).
 */
async function handleParticipantStatusTransitionRoute(
  req: IncomingMessage,
  res: ServerResponse,
  participantWrite: ParticipantWriteHttpDeps,
  match: RegExpExecArray,
  requestId: string,
  resolver: AuthContextResolver | undefined,
  maxBytes: number,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req, maxBytes);
  } catch (err) {
    sendJson(res, errorToHttpResult(err, requestId));
    return;
  }
  const participantId = decodeURIComponent(match[1] ?? '');
  const result = await handleParticipantStatusTransition(
    participantWrite,
    { participantId, headers: headerMap(req), body },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/**
 * Serve the organization-participant relationship status-transition endpoint
 * (`POST /v1/organizations/:organizationId/participants/:relationshipId/status-transitions`) —
 * transition an existing reference-data relationship's status.
 */
async function handleOrganizationParticipantStatusTransitionRoute(
  req: IncomingMessage,
  res: ServerResponse,
  participantWrite: ParticipantWriteHttpDeps,
  match: RegExpExecArray,
  requestId: string,
  resolver: AuthContextResolver | undefined,
  maxBytes: number,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req, maxBytes);
  } catch (err) {
    sendJson(res, errorToHttpResult(err, requestId));
    return;
  }
  const organizationId = decodeURIComponent(match[1] ?? '');
  const relationshipId = decodeURIComponent(match[2] ?? '');
  const result = await handleOrganizationParticipantStatusTransition(
    participantWrite,
    { organizationId, relationshipId, headers: headerMap(req), body },
    requestId,
    resolver,
  );
  sendJson(res, result);
}

/**
 * The HTTP methods available on the participant COLLECTION path (`/v1/participants`) given the
 * wired transports: GET when read is wired, POST when phase-1 write is wired. Used to build the
 * `Allow` header for a 405.
 */
function participantCollectionAllow(deps: AffiliationHttpServerDeps): string[] {
  const methods: string[] = [];
  if (deps.participantRead !== undefined) methods.push('GET');
  if (deps.participantWrite !== undefined) methods.push('POST');
  return methods;
}

/**
 * The HTTP methods available on the participant ITEM path (`/v1/participants/:id`) given the wired
 * transports: GET when read is wired, PATCH when phase-1 write is wired.
 */
function participantItemAllow(deps: AffiliationHttpServerDeps): string[] {
  const methods: string[] = [];
  if (deps.participantRead !== undefined) methods.push('GET');
  if (deps.participantWrite !== undefined) methods.push('PATCH');
  return methods;
}

/** Emit a 405 for a known participant path with the correct `Allow` header. */
function sendParticipantMethodNotAllowed(
  res: ServerResponse,
  requestId: string,
  allow: string[],
): void {
  res.setHeader('allow', allow.join(', '));
  sendJson(res, {
    status: 405,
    body: {
      status: 'error',
      code: 'METHOD_NOT_ALLOWED',
      message: `Method not allowed. Allowed: ${allow.join(', ')}.`,
      requestId,
    },
  });
}

/**
 * Classify a request into a STABLE, low-cardinality route label for telemetry. Returns the
 * route PATTERN (with `:id` placeholders) — never the raw URL — so resource identifiers and
 * query values never become metric attributes. Unmatched paths collapse to `unmatched`.
 */
function classifyRoute(method: string, path: string): string {
  if (method === 'GET' && path === '/healthz') return 'GET /healthz';
  if (method === 'GET' && path === '/readyz') return 'GET /readyz';
  if (path === EVIDENCE_UPLOAD_PATH) return `${method} /v1/evidence/objects`;
  if (path === EVIDENCE_DOWNLOAD_PATH) return `${method} /v1/evidence/objects/read`;
  if (QUARANTINE_DISPOSITION_ROUTE.test(path)) {
    return `${method} /v1/evidence/quarantine/:id/disposition`;
  }
  if (path === QUARANTINE_LIST_PATH) return `${method} /v1/evidence/quarantine`;
  if (QUARANTINE_DETAIL_ROUTE.test(path)) return `${method} /v1/evidence/quarantine/:id`;
  if (WORKFLOW_DECISION_ROUTE.test(path)) {
    return `${method} /v1/workflows/:id/steps/:code/decision`;
  }
  if (WORKFLOW_EXECUTE_ROUTE.test(path)) return `${method} /v1/workflows/:id/execute`;
  if (path === WORKFLOW_LIST_PATH) return `${method} /v1/workflows`;
  if (WORKFLOW_DETAIL_ROUTE.test(path)) return `${method} /v1/workflows/:id`;
  if (path === ORGANIZATION_LIST_PATH) return `${method} /v1/organizations`;
  if (ORGANIZATION_PARTICIPANT_STATUS_TRANSITIONS_ROUTE.test(path)) {
    return `${method} /v1/organizations/:id/participants/:id/status-transitions`;
  }
  if (ORGANIZATION_PARTICIPANTS_ROUTE.test(path)) {
    return `${method} /v1/organizations/:id/participants`;
  }
  if (ORGANIZATION_FACILITIES_ROUTE.test(path)) {
    return `${method} /v1/organizations/:id/facilities`;
  }
  if (ORGANIZATION_DETAIL_ROUTE.test(path)) return `${method} /v1/organizations/:id`;
  if (path === PARTICIPANT_LIST_PATH) return `${method} /v1/participants`;
  if (PARTICIPANT_STATUS_TRANSITIONS_ROUTE.test(path)) {
    return `${method} /v1/participants/:id/status-transitions`;
  }
  if (PARTICIPANT_DETAIL_ROUTE.test(path)) return `${method} /v1/participants/:id`;
  if (path === FACILITY_LIST_PATH) return `${method} /v1/facilities`;
  if (FACILITY_DETAIL_ROUTE.test(path)) return `${method} /v1/facilities/:id`;
  if (TRANSITION_ROUTE.test(path)) {
    return `${method} /v1/affiliation/applications/:id/transitions/:action`;
  }
  return 'unmatched';
}

/**
 * Emit HTTP-level operational metrics for one completed request. Captures method, the route
 * PATTERN (never the raw URL with ids), status code, and duration. Deliberately omits the raw
 * Authorization header, raw URL query values, request body, and uploaded bytes. Best-effort:
 * the underlying telemetry swallows exporter errors, and this is only ever called from a
 * `finish` listener so it can never affect the response.
 */
function emitHttpMetrics(
  telemetry: Telemetry,
  method: string,
  route: string,
  statusCode: number,
  elapsedMs: number,
): void {
  const attributes = {
    [TelemetryAttributeKeys.method]: method,
    [TelemetryAttributeKeys.route]: route,
    [TelemetryAttributeKeys.status]: statusCode,
  };
  telemetry.incrementCounter(TelemetryCounters.httpRequest, 1, attributes);
  telemetry.recordDuration(TelemetryDurations.httpRequest, elapsedMs, attributes);
  if (statusCode >= 500) {
    telemetry.incrementCounter(TelemetryCounters.httpRequestError, 1, attributes);
  }
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AffiliationHttpServerDeps,
  maxBytes: number,
): Promise<void> {
  const requestId = randomUUID();
  const method = req.method ?? 'GET';
  const path = (req.url ?? '/').split('?')[0] ?? '/';

  // Liveness: process is up. Deliberately shallow (no dependency I/O).
  if (method === 'GET' && path === '/healthz') {
    sendJson(res, { status: 200, body: { status: 'ok', requestId } });
    return;
  }

  // Readiness: process is wired, plus an optional bounded dependency probe. Stays shallow
  // (process-level only) when no readiness check is wired.
  if (method === 'GET' && path === '/readyz') {
    const checks: Record<string, string> = { process: 'ok', config: 'ok' };
    if (deps.readiness !== undefined) {
      try {
        await deps.readiness.checkDatabase();
        checks['database'] = 'ok';
      } catch {
        // Never leak probe internals; surface a non-ready status only.
        checks['database'] = 'unavailable';
        sendJson(res, { status: 503, body: { status: 'not_ready', checks, requestId } });
        return;
      }
    }
    sendJson(res, { status: 200, body: { status: 'ok', checks, requestId } });
    return;
  }

  // Evidence payload transport (only when wired).
  if (
    deps.evidence !== undefined &&
    (path === EVIDENCE_UPLOAD_PATH || path === EVIDENCE_DOWNLOAD_PATH)
  ) {
    await handleEvidenceRoute(req, res, deps.evidence, path, requestId, deps.resolver, maxBytes);
    return;
  }

  // Evidence quarantine review transport (only when wired). Distinct path prefix from upload.
  if (deps.evidenceQuarantine !== undefined) {
    const handled = await handleEvidenceQuarantineRoute(
      req,
      res,
      deps.evidenceQuarantine,
      path,
      requestId,
      deps.resolver,
      maxBytes,
    );
    if (handled) return;
  }

  // Workflow decision transport (only when wired).
  if (deps.workflow !== undefined) {
    const workflowMatch = WORKFLOW_DECISION_ROUTE.exec(path);
    if (workflowMatch !== null) {
      await handleWorkflowRoute(
        req,
        res,
        deps.workflow,
        workflowMatch,
        requestId,
        deps.resolver,
        maxBytes,
      );
      return;
    }
  }

  // Workflow execution transport (only when wired). Distinct path from the decision route.
  if (deps.workflowExecution !== undefined) {
    const executeMatch = WORKFLOW_EXECUTE_ROUTE.exec(path);
    if (executeMatch !== null) {
      await handleWorkflowExecuteRoute(
        req,
        res,
        deps.workflowExecution,
        executeMatch,
        requestId,
        deps.resolver,
        maxBytes,
      );
      return;
    }
  }

  // Workflow admin READ transport (only when wired). GET list + GET detail; read-only.
  if (deps.workflowRead !== undefined && method === 'GET') {
    if (path === WORKFLOW_LIST_PATH) {
      await handleWorkflowListRoute(req, res, deps.workflowRead, requestId, deps.resolver);
      return;
    }
    const detailMatch = WORKFLOW_DETAIL_ROUTE.exec(path);
    if (detailMatch !== null) {
      await handleWorkflowDetailRoute(
        req,
        res,
        deps.workflowRead,
        detailMatch,
        requestId,
        deps.resolver,
      );
      return;
    }
  }

  // Organization Registry READ transport (only when wired). GET list + GET detail; read-only.
  // The path is matched first, then the method, so a non-GET request to an organization route
  // returns 405 (Method Not Allowed) rather than falling through to the transition 404.
  if (deps.organizationRead !== undefined) {
    if (path === ORGANIZATION_LIST_PATH) {
      await handleOrganizationListRoute(req, res, deps.organizationRead, requestId, deps.resolver);
      return;
    }
    const orgDetailMatch = ORGANIZATION_DETAIL_ROUTE.exec(path);
    if (orgDetailMatch !== null) {
      await handleOrganizationDetailRoute(
        req,
        res,
        deps.organizationRead,
        orgDetailMatch,
        requestId,
        deps.resolver,
      );
      return;
    }
  }

  // Participant Registry transport (read and/or write, only when wired). The path is matched
  // first, then the method: GET serves the read projection (when read is wired); POST on the
  // collection creates, PATCH on the item updates, and POST on the item's status-transitions
  // sub-resource changes the reference-data status (when write is wired). Any other method on a
  // known participant path returns 405 with the correct `Allow` header (reflecting the wired
  // transports) rather than a 404 fall-through. The status-transitions path (two segments) is
  // matched explicitly BEFORE the single-segment item route. The organization-participant
  // relationship list is READ-ONLY, but its per-relationship status-transitions sub-resource
  // (four segments) accepts POST when write is wired and is matched BEFORE the two-segment list.
  if (deps.participantRead !== undefined || deps.participantWrite !== undefined) {
    const orgParticipantStatusMatch =
      ORGANIZATION_PARTICIPANT_STATUS_TRANSITIONS_ROUTE.exec(path);
    if (orgParticipantStatusMatch !== null) {
      if (method === 'POST' && deps.participantWrite !== undefined) {
        await handleOrganizationParticipantStatusTransitionRoute(
          req,
          res,
          deps.participantWrite,
          orgParticipantStatusMatch,
          requestId,
          deps.resolver,
          maxBytes,
        );
        return;
      }
      // Known relationship status-transition sub-resource: only POST is supported. Return 405 when
      // the write transport is wired; when write is NOT wired the route does not exist → fall
      // through to 404 (don't advertise a route the server cannot serve).
      if (deps.participantWrite !== undefined) {
        sendParticipantMethodNotAllowed(res, requestId, ['POST']);
        return;
      }
      // Write transport not wired → fall through to 404.
    }
    const orgParticipantsMatch = ORGANIZATION_PARTICIPANTS_ROUTE.exec(path);
    if (orgParticipantsMatch !== null) {
      if (method === 'POST' && deps.participantWrite !== undefined) {
        await handleOrganizationParticipantLinkRoute(
          req,
          res,
          deps.participantWrite,
          orgParticipantsMatch,
          requestId,
          deps.resolver,
          maxBytes,
        );
        return;
      }
      if (method === 'GET' && deps.participantRead !== undefined) {
        await handleOrganizationParticipantListRoute(
          req,
          res,
          deps.participantRead,
          orgParticipantsMatch,
          requestId,
          deps.resolver,
        );
        return;
      }
      // Known org-participants path but an unsupported method/transport: return 405 with the
      // `Allow` header reflecting the wired transports (GET when read is wired, POST when write is
      // wired). Never advertise a method the server cannot serve.
      const orgParticipantsAllow: string[] = [];
      if (deps.participantRead !== undefined) orgParticipantsAllow.push('GET');
      if (deps.participantWrite !== undefined) orgParticipantsAllow.push('POST');
      if (orgParticipantsAllow.length > 0) {
        sendParticipantMethodNotAllowed(res, requestId, orgParticipantsAllow);
        return;
      }
      // Neither transport can serve this path → fall through to 404.
    } else if (path === PARTICIPANT_LIST_PATH) {
      if (method === 'GET' && deps.participantRead !== undefined) {
        await handleParticipantListRoute(req, res, deps.participantRead, requestId, deps.resolver);
        return;
      }
      if (method === 'POST' && deps.participantWrite !== undefined) {
        await handleParticipantCreateRoute(
          req,
          res,
          deps.participantWrite,
          requestId,
          deps.resolver,
          maxBytes,
        );
        return;
      }
      sendParticipantMethodNotAllowed(res, requestId, participantCollectionAllow(deps));
      return;
    } else {
      const participantStatusMatch = PARTICIPANT_STATUS_TRANSITIONS_ROUTE.exec(path);
      if (participantStatusMatch !== null) {
        if (method === 'POST' && deps.participantWrite !== undefined) {
          await handleParticipantStatusTransitionRoute(
            req,
            res,
            deps.participantWrite,
            participantStatusMatch,
            requestId,
            deps.resolver,
            maxBytes,
          );
          return;
        }
        // Known status-transition sub-resource: only POST is supported. Return 405 when the write
        // transport is wired; when write is NOT wired the route does not exist → fall through to
        // 404 (don't advertise a route the server cannot serve).
        if (deps.participantWrite !== undefined) {
          sendParticipantMethodNotAllowed(res, requestId, ['POST']);
          return;
        }
      } else {
        const participantDetailMatch = PARTICIPANT_DETAIL_ROUTE.exec(path);
        if (participantDetailMatch !== null) {
          if (method === 'GET' && deps.participantRead !== undefined) {
            await handleParticipantDetailRoute(
              req,
              res,
              deps.participantRead,
              participantDetailMatch,
              requestId,
              deps.resolver,
            );
            return;
          }
          if (method === 'PATCH' && deps.participantWrite !== undefined) {
            await handleParticipantUpdateRoute(
              req,
              res,
              deps.participantWrite,
              participantDetailMatch,
              requestId,
              deps.resolver,
              maxBytes,
            );
            return;
          }
          sendParticipantMethodNotAllowed(res, requestId, participantItemAllow(deps));
          return;
        }
      }
    }
  }

  // Facility Registry transport (only when a read or write transport is wired). READ is GET-only
  // (an organization's facilities, the facility list, and a single facility). WRITE (phase 1) adds
  // POST to the collection (create) and PATCH to the item (update). The org-facilities path (two
  // segments anchored on a trailing `facilities`) is matched BEFORE the single-segment facility
  // routes; it is disjoint from every organization/participant route and stays GET-only. A facility
  // STATUS-transition sub-resource (two segments) is deliberately NOT wired — it never matches a
  // facility route here and falls through to 404. Writes go THROUGH the validated service (which
  // owns the transactional outbox); the adapter never enqueues outbox, touches governed state,
  // invokes the kernel, or mutates the Organization Registry.
  if (deps.facilityRead !== undefined || deps.facilityWrite !== undefined) {
    const orgFacilitiesMatch = ORGANIZATION_FACILITIES_ROUTE.exec(path);
    if (orgFacilitiesMatch !== null) {
      if (method === 'GET' && deps.facilityRead !== undefined) {
        await handleOrganizationFacilityListRoute(
          req,
          res,
          deps.facilityRead,
          orgFacilitiesMatch,
          requestId,
          deps.resolver,
        );
        return;
      }
      // Known org-facilities path but an unsupported method/transport: GET-only when read is wired.
      if (deps.facilityRead !== undefined) {
        sendFacilityMethodNotAllowed(res, requestId, ['GET']);
        return;
      }
      // Read transport not wired → fall through to 404.
    } else if (path === FACILITY_LIST_PATH) {
      if (method === 'GET' && deps.facilityRead !== undefined) {
        await handleFacilityListRoute(req, res, deps.facilityRead, requestId, deps.resolver);
        return;
      }
      if (method === 'POST' && deps.facilityWrite !== undefined) {
        await handleFacilityCreateRoute(
          req,
          res,
          deps.facilityWrite,
          requestId,
          deps.resolver,
          maxBytes,
        );
        return;
      }
      sendFacilityMethodNotAllowed(res, requestId, facilityCollectionAllow(deps));
      return;
    } else {
      const facilityDetailMatch = FACILITY_DETAIL_ROUTE.exec(path);
      if (facilityDetailMatch !== null) {
        if (method === 'GET' && deps.facilityRead !== undefined) {
          await handleFacilityDetailRoute(
            req,
            res,
            deps.facilityRead,
            facilityDetailMatch,
            requestId,
            deps.resolver,
          );
          return;
        }
        if (method === 'PATCH' && deps.facilityWrite !== undefined) {
          await handleFacilityUpdateRoute(
            req,
            res,
            deps.facilityWrite,
            facilityDetailMatch,
            requestId,
            deps.resolver,
            maxBytes,
          );
          return;
        }
        sendFacilityMethodNotAllowed(res, requestId, facilityItemAllow(deps));
        return;
      }
    }
  }

  const match = TRANSITION_ROUTE.exec(path);
  if (match === null) {
    sendJson(res, {
      status: 404,
      body: { status: 'error', code: 'NOT_FOUND', message: 'Resource not found.', requestId },
    });
    return;
  }

  if (method !== 'POST') {
    res.setHeader('allow', 'POST');
    sendJson(res, {
      status: 405,
      body: {
        status: 'error',
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only POST is allowed for transition endpoints.',
        requestId,
      },
    });
    return;
  }

  const applicationId = decodeURIComponent(match[1] ?? '');
  const action = decodeURIComponent(match[2] ?? '');

  let body: unknown;
  try {
    body = await readJsonBody(req, maxBytes);
  } catch (err) {
    sendJson(res, errorToHttpResult(err, requestId));
    return;
  }

  const result = await handleAffiliationHttpTransition(
    deps.executor,
    { applicationId, action, headers: headerMap(req), body },
    requestId,
    deps.resolver,
  );
  sendJson(res, result);
}

/**
 * Build (but do not start) a native HTTP server bound to the affiliation transition
 * adapter. Caller controls `listen()` so the same factory serves dev, prod, and tests.
 */
export function createAffiliationHttpServer(deps: AffiliationHttpServerDeps): Server {
  const maxBytes = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  return createServer((req, res) => {
    // Capture HTTP-level metrics once the response is fully sent. Using `finish` means we
    // observe the real status code regardless of which handler produced it (including the
    // last-resort error path) without coupling telemetry into every handler.
    const stop = startStopwatch();
    const method = req.method ?? 'GET';
    const route = classifyRoute(method, (req.url ?? '/').split('?')[0] ?? '/');
    res.on('finish', () => {
      emitHttpMetrics(telemetry, method, route, res.statusCode, stop());
    });
    handleRequest(req, res, deps, maxBytes).catch((err: unknown) => {
      // Last-resort guard: never leak internals; never crash the process on a bad request.
      const requestId = randomUUID();
      try {
        sendJson(res, errorToHttpResult(err, requestId));
      } catch {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        }
        res.end(
          JSON.stringify({ status: 'error', code: 'INTERNAL', message: 'Internal server error.', requestId }),
        );
      }
    });
  });
}
