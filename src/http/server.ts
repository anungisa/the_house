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
  evidenceErrorToHttpResult,
  handleEvidenceDownload,
  handleEvidenceUpload,
  type EvidenceHttpDeps,
  type EvidenceHttpResult,
} from './evidence/index.js';
import {
  handleWorkflowDecision,
  handleWorkflowExecution,
  workflowErrorToHttpResult,
  workflowExecutionErrorToHttpResult,
  type WorkflowExecutionHttpDeps,
  type WorkflowHttpDeps,
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
   * Optional readiness probe for `/readyz`. When provided, the endpoint performs a bounded,
   * tenant-agnostic dependency check (e.g. database `SELECT 1`) and returns 503 when the
   * dependency is unavailable. When omitted, `/readyz` stays shallow (process-level only).
   */
  readonly readiness?: ReadinessCheck;
}

const DEFAULT_MAX_BODY_BYTES = 1_048_576;

const TRANSITION_ROUTE =
  /^\/v1\/affiliation\/applications\/([^/]+)\/transitions\/([^/]+)\/?$/;

const EVIDENCE_UPLOAD_PATH = '/v1/evidence/objects';
const EVIDENCE_DOWNLOAD_PATH = '/v1/evidence/objects/read';

const WORKFLOW_DECISION_ROUTE =
  /^\/v1\/workflows\/([^/]+)\/steps\/([^/]+)\/decision\/?$/;

const WORKFLOW_EXECUTE_ROUTE = /^\/v1\/workflows\/([^/]+)\/execute\/?$/;

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
  return createServer((req, res) => {
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
