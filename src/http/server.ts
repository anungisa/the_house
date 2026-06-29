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
 *   GET /healthz  → 200 (process is up)
 *   GET /readyz   → 200 (adapter wired; deeper dependency checks are a future pass)
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
import {
  evidenceErrorToHttpResult,
  handleEvidenceDownload,
  handleEvidenceUpload,
  type EvidenceHttpDeps,
  type EvidenceHttpResult,
} from './evidence/index.js';

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
}

const DEFAULT_MAX_BODY_BYTES = 1_048_576;

const TRANSITION_ROUTE =
  /^\/v1\/affiliation\/applications\/([^/]+)\/transitions\/([^/]+)\/?$/;

const EVIDENCE_UPLOAD_PATH = '/v1/evidence/objects';
const EVIDENCE_DOWNLOAD_PATH = '/v1/evidence/objects/read';

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

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AffiliationHttpServerDeps,
  maxBytes: number,
): Promise<void> {
  const requestId = randomUUID();
  const method = req.method ?? 'GET';
  const path = (req.url ?? '/').split('?')[0] ?? '/';

  // Liveness / readiness.
  if (method === 'GET' && (path === '/healthz' || path === '/readyz')) {
    sendJson(res, { status: 200, body: { status: 'ok', requestId } });
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
