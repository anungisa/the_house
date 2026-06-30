import { describe, it, expect } from 'vitest';
import { URL } from 'node:url';
import { WorkflowAdminClient } from '../../../../src/admin/workflows/workflowAdminClient.js';
import type {
  FetchLike,
  HttpRequestInit,
  HttpResponseLike,
  WorkflowAdminLogEvent,
} from '../../../../src/admin/workflows/workflowAdminTypes.js';

/**
 * Unit tests for the framework-neutral workflow admin HTTP client. The client is the ONLY way
 * the admin surface talks to the backend; these tests use an injected fake transport so they
 * never contact a real server, Entra/JWKS, or a database.
 */

function jsonResponse(status: number, body: unknown): HttpResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: { get: () => null },
  };
}

interface RecordedCall {
  readonly url: string;
  readonly init: HttpRequestInit;
}

/** A recording fake transport that returns queued responses (or repeats the last one). */
function recordingFetch(responses: HttpResponseLike[]): {
  fetch: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  let i = 0;
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    const res = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return Promise.resolve(res!);
  };
  return { fetch, calls };
}

const BASE = 'http://127.0.0.1:3100';

const SUMMARY = {
  workflowInstanceId: 'wf-1',
  transitionRequestId: 'tr-1',
  entityType: 'AffiliationApplication',
  entityId: 'app-1',
  workflowType: 'affiliation_two_tier_review',
  status: 'pending',
  currentStepCode: 'regional_signoff',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  execution: { executable: false, reason: 'workflow_not_approved' },
};

const DETAIL = {
  status: 'ok',
  workflowInstanceId: 'wf-1',
  transitionRequestId: 'tr-1',
  entityType: 'AffiliationApplication',
  entityId: 'app-1',
  workflowType: 'affiliation_two_tier_review',
  workflowStatus: 'pending',
  currentStepCode: 'regional_signoff',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  steps: [
    {
      stepCode: 'regional_signoff',
      stepOrder: 1,
      reviewTier: 'regional_review',
      required: true,
      status: 'pending',
      assignedRoleKey: 'regional_reviewer',
      decidedByUserId: null,
      decidedAt: null,
      decisionReason: null,
    },
  ],
  execution: { executable: false, reason: 'workflow_not_approved' },
  requestId: 'req-detail',
};

describe('WorkflowAdminClient', () => {
  // (1) Lists workflows and maps the page + applies filters to the query string.
  it('lists workflows and forwards filters as query parameters', async () => {
    const { fetch, calls } = recordingFetch([
      jsonResponse(200, { status: 'ok', items: [SUMMARY], nextCursor: 'cur-2', requestId: 'req-list' }),
    ]);
    const client = new WorkflowAdminClient({ baseUrl: BASE, fetch });

    const result = await client.listWorkflows({ status: 'pending', reviewTier: 'national_review', limit: 25 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]?.workflowInstanceId).toBe('wf-1');
    expect(result.data.nextCursor).toBe('cur-2');
    expect(result.requestId).toBe('req-list');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.init.method).toBe('GET');
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/v1/workflows');
    expect(url.searchParams.get('status')).toBe('pending');
    expect(url.searchParams.get('reviewTier')).toBe('national_review');
    expect(url.searchParams.get('limit')).toBe('25');
  });

  // (2) Fetches a single workflow's detail.
  it('fetches workflow detail and maps the ordered steps', async () => {
    const { fetch, calls } = recordingFetch([jsonResponse(200, DETAIL)]);
    const client = new WorkflowAdminClient({ baseUrl: BASE, fetch });

    const result = await client.getWorkflowDetail('wf-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.workflowInstanceId).toBe('wf-1');
    expect(result.data.workflowStatus).toBe('pending');
    expect(result.data.steps.map((s) => s.stepCode)).toEqual(['regional_signoff']);
    expect(calls[0]?.url).toBe(`${BASE}/v1/workflows/wf-1`);
    expect(calls[0]?.init.method).toBe('GET');
  });

  // (3) Records an approve decision against the targeted step.
  it('records an approve decision with the decision body', async () => {
    const { fetch, calls } = recordingFetch([
      jsonResponse(200, {
        status: 'recorded',
        workflowInstanceId: 'wf-1',
        workflowStatus: 'pending',
        currentStepCode: 'national_signoff',
        decidedStepCode: 'regional_signoff',
        decision: 'approve',
        requestId: 'req-dec',
      }),
    ]);
    const client = new WorkflowAdminClient({ baseUrl: BASE, fetch });

    const result = await client.recordWorkflowDecision('wf-1', 'regional_signoff', 'approve');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.decision).toBe('approve');
    expect(result.data.currentStepCode).toBe('national_signoff');
    expect(calls[0]?.url).toBe(`${BASE}/v1/workflows/wf-1/steps/regional_signoff/decision`);
    expect(calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init.body!)).toEqual({ decision: 'approve' });
  });

  // (4) Records a reject decision, forwarding the optional reason.
  it('records a reject decision and forwards the reason', async () => {
    const { fetch, calls } = recordingFetch([
      jsonResponse(200, {
        status: 'recorded',
        workflowInstanceId: 'wf-1',
        workflowStatus: 'rejected',
        currentStepCode: null,
        decidedStepCode: 'regional_signoff',
        decision: 'reject',
        requestId: 'req-rej',
      }),
    ]);
    const client = new WorkflowAdminClient({ baseUrl: BASE, fetch });

    const result = await client.recordWorkflowDecision(
      'wf-1',
      'regional_signoff',
      'reject',
      'Incomplete documentation.',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.decision).toBe('reject');
    expect(result.data.workflowStatus).toBe('rejected');
    expect(JSON.parse(calls[0]!.init.body!)).toEqual({
      decision: 'reject',
      reason: 'Incomplete documentation.',
    });
  });

  // (5) Executes an approved workflow, always sending an idempotency key.
  it('executes an approved workflow and sends a generated idempotency key', async () => {
    const { fetch, calls } = recordingFetch([
      jsonResponse(200, {
        status: 'executed',
        workflowInstanceId: 'wf-1',
        transitionRequestId: 'tr-1',
        entityType: 'AffiliationApplication',
        entityId: 'app-1',
        trigger: 'approve',
        fromState: 'under_review',
        toState: 'approved',
        stateTransitionId: 'st-1',
        idempotentReplay: false,
        requestId: 'req-exec',
      }),
    ]);
    const client = new WorkflowAdminClient({
      baseUrl: BASE,
      fetch,
      generateIdempotencyKey: () => 'fixed-key-123',
    });

    const result = await client.executeWorkflow('wf-1', { reason: 'Approved for activation.' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.toState).toBe('approved');
    expect(result.data.idempotentReplay).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE}/v1/workflows/wf-1/execute`);
    expect(calls[0]?.init.headers['idempotency-key']).toBe('fixed-key-123');
    expect(JSON.parse(calls[0]!.init.body!)).toEqual({ reason: 'Approved for activation.' });
  });

  // (5) A caller-supplied idempotency key is preferred over the generator.
  it('prefers a caller-supplied idempotency key', async () => {
    const { fetch, calls } = recordingFetch([
      jsonResponse(200, {
        status: 'executed',
        workflowInstanceId: 'wf-1',
        transitionRequestId: 'tr-1',
        entityType: 'AffiliationApplication',
        entityId: 'app-1',
        trigger: 'approve',
        fromState: 'under_review',
        toState: 'approved',
        stateTransitionId: null,
        idempotentReplay: true,
        requestId: 'req-exec-2',
      }),
    ]);
    const client = new WorkflowAdminClient({ baseUrl: BASE, fetch });

    await client.executeWorkflow('wf-1', { idempotencyKey: 'caller-key' });
    expect(calls[0]?.init.headers['idempotency-key']).toBe('caller-key');
  });

  // (6) Non-2xx responses are mapped to a structured failure (never thrown).
  it('maps a non-2xx API error to a structured failure', async () => {
    const { fetch } = recordingFetch([
      jsonResponse(409, {
        status: 'error',
        code: 'WORKFLOW_NOT_APPROVED',
        message: 'The workflow is not approved.',
        requestId: 'req-err',
      }),
    ]);
    const client = new WorkflowAdminClient({ baseUrl: BASE, fetch });

    const result = await client.executeWorkflow('wf-1', { idempotencyKey: 'k' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.code).toBe('WORKFLOW_NOT_APPROVED');
    expect(result.message).toBe('The workflow is not approved.');
    expect(result.requestId).toBe('req-err');
  });

  // (6) A transport-level error becomes a structured NETWORK_ERROR failure.
  it('maps a transport error to a structured NETWORK_ERROR failure', async () => {
    const failingFetch: FetchLike = () => Promise.reject(new Error('connection refused'));
    const client = new WorkflowAdminClient({ baseUrl: BASE, fetch: failingFetch });

    const result = await client.listWorkflows();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(0);
    expect(result.code).toBe('NETWORK_ERROR');
  });

  // (13) Bearer tokens are sent to the server but NEVER passed to the logger.
  it('sends the Authorization header but never logs the bearer token', async () => {
    const { fetch, calls } = recordingFetch([
      jsonResponse(200, { status: 'ok', items: [], nextCursor: null, requestId: 'req-1' }),
    ]);
    const events: WorkflowAdminLogEvent[] = [];
    const SECRET = 'super-secret-bearer-token-xyz';
    const client = new WorkflowAdminClient({
      baseUrl: BASE,
      fetch,
      authHeaderProvider: () => ({ Authorization: `Bearer ${SECRET}` }),
      logger: { log: (e) => events.push(e) },
    });

    await client.listWorkflows();

    // The token IS sent on the wire.
    expect(calls[0]?.init.headers['Authorization']).toBe(`Bearer ${SECRET}`);
    // The token is NEVER present in any log event.
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toContain(SECRET);
    expect(JSON.stringify(events)).not.toContain('Bearer');
  });

  // (12) Recording a decision NEVER chains an execute call — execution stays explicit.
  it('does not auto-execute after recording a decision (single request only)', async () => {
    const { fetch, calls } = recordingFetch([
      jsonResponse(200, {
        status: 'recorded',
        workflowInstanceId: 'wf-1',
        workflowStatus: 'approved',
        currentStepCode: null,
        decidedStepCode: 'national_signoff',
        decision: 'approve',
        requestId: 'req-final',
      }),
    ]);
    const client = new WorkflowAdminClient({ baseUrl: BASE, fetch });

    await client.recordWorkflowDecision('wf-1', 'national_signoff', 'approve');

    // Exactly one request, and it is the decision request — no execute was triggered.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.endsWith('/decision')).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/execute'))).toBe(false);
  });
});
