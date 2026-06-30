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
