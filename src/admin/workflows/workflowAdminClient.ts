/**
 * Workflow admin/reviewer surface — typed HTTP client.
 *
 * A THIN, framework-neutral client over the existing workflow HTTP APIs. It is the ONLY way
 * the admin surface talks to the backend: it never reaches the database, never bypasses an
 * endpoint, and never mutates lifecycle state on its own. The backend stays authoritative for
 * every workflow decision and for the single explicit execution.
 *
 * Design rules honored here:
 *   - Centralized error mapping: every call resolves to {@link ApiResult}; non-2xx never throws.
 *   - Identity is injected via {@link AuthHeaderProvider} (Entra bearer or local `x-house-*`);
 *     credentials are NEVER hardcoded and NEVER logged.
 *   - Execution requires an idempotency key (sent as the `Idempotency-Key` header); one is
 *     generated when the caller omits it. Execution is ALWAYS an explicit call — this client
 *     never auto-executes after a final approval.
 *   - The backend request id is preserved on the result when present.
 */

import { URLSearchParams } from 'node:url';

import type {
  ApiFailure,
  ApiResult,
  AuthHeaderProvider,
  ExecuteWorkflowOptions,
  FetchLike,
  HttpResponseLike,
  WorkflowAdminClientConfig,
  WorkflowAdminLogger,
  WorkflowDecisionResult,
  WorkflowDetail,
  WorkflowExecutionResult,
  WorkflowListFilters,
  WorkflowListPage,
  WorkflowStepDecision,
  WorkflowSummary,
} from './workflowAdminTypes.js';

/** Default transport: the runtime global `fetch`. A global `Response` satisfies the shape. */
const defaultFetch: FetchLike = (url, init) =>
  globalThis.fetch(url, init) as unknown as Promise<HttpResponseLike>;

/** Default idempotency-key generator: the runtime crypto UUID (Node 20+ and browsers). */
function defaultIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Join the base URL and a path, tolerating a trailing slash on the base. */
function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${path}`;
}

/** Append defined filter values as query parameters. */
function buildListQuery(filters: WorkflowListFilters): string {
  const params = new URLSearchParams();
  if (filters.status !== undefined) params.set('status', filters.status);
  if (filters.entityType !== undefined) params.set('entityType', filters.entityType);
  if (filters.entityId !== undefined) params.set('entityId', filters.entityId);
  if (filters.reviewTier !== undefined) params.set('reviewTier', filters.reviewTier);
  if (filters.assignedRoleKey !== undefined) params.set('assignedRoleKey', filters.assignedRoleKey);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.cursor !== undefined) params.set('cursor', filters.cursor);
  const qs = params.toString();
  return qs === '' ? '' : `?${qs}`;
}

/** A typed client for the workflow admin/reviewer surface. */
export class WorkflowAdminClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly authHeaderProvider: AuthHeaderProvider;
  private readonly generateIdempotencyKey: () => string;
  private readonly logger: WorkflowAdminLogger | undefined;

  constructor(config: WorkflowAdminClientConfig) {
    this.baseUrl = config.baseUrl;
    this.fetchImpl = config.fetch ?? defaultFetch;
    this.authHeaderProvider = config.authHeaderProvider ?? (() => ({}));
    this.generateIdempotencyKey = config.generateIdempotencyKey ?? defaultIdempotencyKey;
    this.logger = config.logger;
  }

  /** GET /v1/workflows — list workflow summaries for the authenticated tenant. */
  async listWorkflows(filters: WorkflowListFilters = {}): Promise<ApiResult<WorkflowListPage>> {
    const path = `/v1/workflows${buildListQuery(filters)}`;
    return this.request('GET', path, undefined, (body) => ({
      items: ((body['items'] as WorkflowSummary[] | undefined) ?? []).map((s) => s),
      nextCursor: asString(body['nextCursor']) ?? null,
    }));
  }

  /** GET /v1/workflows/:id — inspect a single workflow with its ordered steps. */
  async getWorkflowDetail(workflowInstanceId: string): Promise<ApiResult<WorkflowDetail>> {
    const path = `/v1/workflows/${encodeURIComponent(workflowInstanceId)}`;
    return this.request('GET', path, undefined, (body) => body as unknown as WorkflowDetail);
  }

  /**
   * POST /v1/workflows/:id/steps/:stepCode/decision — record an approve/reject decision on the
   * step currently awaiting one. The caller is responsible for targeting the current pending
   * step (see the view-model's actionable-step helper).
   */
  async recordWorkflowDecision(
    workflowInstanceId: string,
    stepCode: string,
    decision: WorkflowStepDecision,
    reason?: string,
  ): Promise<ApiResult<WorkflowDecisionResult>> {
    const path = `/v1/workflows/${encodeURIComponent(workflowInstanceId)}/steps/${encodeURIComponent(
      stepCode,
    )}/decision`;
    const payload: Record<string, unknown> = { decision };
    if (reason !== undefined) payload['reason'] = reason;
    return this.request('POST', path, { body: payload }, (body) => ({
      workflowInstanceId: asString(body['workflowInstanceId']) ?? workflowInstanceId,
      workflowStatus: body['workflowStatus'] as WorkflowDecisionResult['workflowStatus'],
      currentStepCode: asString(body['currentStepCode']) ?? null,
      decidedStepCode: asString(body['decidedStepCode']) ?? stepCode,
      decision: body['decision'] as WorkflowStepDecision,
    }));
  }

  /**
   * POST /v1/workflows/:id/execute — explicitly execute an APPROVED workflow's pending
   * transition exactly once. An idempotency key is always sent (generated when not supplied).
   * This is a deliberate, separate, audited command — never an automatic side effect.
   */
  async executeWorkflow(
    workflowInstanceId: string,
    options: ExecuteWorkflowOptions = {},
  ): Promise<ApiResult<WorkflowExecutionResult>> {
    const path = `/v1/workflows/${encodeURIComponent(workflowInstanceId)}/execute`;
    const idempotencyKey = options.idempotencyKey ?? this.generateIdempotencyKey();
    const payload: Record<string, unknown> = {};
    if (options.reason !== undefined) payload['reason'] = options.reason;
    return this.request(
      'POST',
      path,
      { body: payload, idempotencyKey },
      (body) => ({
        workflowInstanceId: asString(body['workflowInstanceId']) ?? workflowInstanceId,
        transitionRequestId: asString(body['transitionRequestId']) ?? '',
        entityType: asString(body['entityType']) ?? '',
        entityId: asString(body['entityId']) ?? '',
        trigger: asString(body['trigger']) ?? '',
        fromState: asString(body['fromState']) ?? '',
        toState: asString(body['toState']) ?? '',
        stateTransitionId: asString(body['stateTransitionId']) ?? null,
        idempotentReplay: body['idempotentReplay'] === true,
      }),
    );
  }

  /**
   * Shared request pipeline: assemble headers (auth + content-type + idempotency), send the
   * request, and map the response to {@link ApiResult}. Any thrown transport error and any
   * non-2xx response become a structured {@link ApiFailure}. Bearer tokens are never logged.
   */
  private async request<T>(
    method: string,
    path: string,
    opts: { body?: Record<string, unknown>; idempotencyKey?: string } | undefined,
    mapData: (body: Record<string, unknown>) => T,
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { accept: 'application/json' };
    const authHeaders = await this.authHeaderProvider();
    for (const [k, v] of Object.entries(authHeaders)) headers[k] = v;

    const init: { method: string; headers: Record<string, string>; body?: string } = {
      method,
      headers,
    };
    if (opts?.body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    if (opts?.idempotencyKey !== undefined) headers['idempotency-key'] = opts.idempotencyKey;

    const url = joinUrl(this.baseUrl, path);

    let response: HttpResponseLike;
    try {
      response = await this.fetchImpl(url, init);
    } catch (err) {
      const failure: ApiFailure = {
        ok: false,
        status: 0,
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network request failed.',
        requestId: null,
      };
      this.logger?.log({ method, path, status: 0, code: failure.code, requestId: null });
      return failure;
    }

    const body = await this.parseJson(response);
    const requestId = isRecord(body) ? asString(body['requestId']) ?? null : null;

    if (!response.ok) {
      const failure: ApiFailure = {
        ok: false,
        status: response.status,
        code: (isRecord(body) ? asString(body['code']) : undefined) ?? `HTTP_${response.status}`,
        message:
          (isRecord(body) ? asString(body['message']) : undefined) ??
          'The request failed. Please try again.',
        requestId,
      };
      this.logger?.log({
        method,
        path,
        status: failure.status,
        code: failure.code,
        requestId,
      });
      return failure;
    }

    this.logger?.log({ method, path, status: response.status, requestId });
    return {
      ok: true,
      data: mapData(isRecord(body) ? body : {}),
      requestId,
    };
  }

  /** Parse a JSON body defensively; an unparseable body becomes an empty record. */
  private async parseJson(response: HttpResponseLike): Promise<unknown> {
    let text: string;
    try {
      text = await response.text();
    } catch {
      return {};
    }
    if (text === '') return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }
}
