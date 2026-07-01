import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAffiliationHttpServer } from '../../../../src/http/server.js';
import type { AffiliationCommandExecutor } from '../../../../src/http/AffiliationHttpAdapter.js';
import type {
  AffiliationApplicationTransitionRequest,
  AffiliationApplicationTransitionResponse,
} from '../../../../src/domains/affiliation/AffiliationApplicationDtos.js';
import type { WorkflowHttpDeps } from '../../../../src/http/workflow/WorkflowHttpAdapter.js';
import type { WorkflowReadHttpDeps } from '../../../../src/http/workflow/WorkflowReadHttpAdapter.js';
import { InMemoryWorkflowStore } from '../../../../src/governance/workflow/InMemoryWorkflowStore.js';
import type {
  WorkflowInstanceRecord,
  WorkflowStepRecord,
} from '../../../../src/governance/workflow/WorkflowTypes.js';
import type {
  WorkflowExecutionHttpDeps,
  WorkflowTransitionExecutor,
} from '../../../../src/http/workflow/WorkflowExecutionHttpAdapter.js';
import type {
  ExecuteApprovedWorkflowInput,
} from '../../../../src/governance/workflow/ApprovedWorkflowExecutionService.js';
import type { ExecuteApprovedTransitionResult } from '../../../../src/governance/types/TransitionTypes.js';
import type {
  RecordWorkflowDecisionInput,
  WorkflowDecisionOutcome,
} from '../../../../src/governance/workflow/WorkflowDecisionService.js';
import type { EvidenceHttpDeps } from '../../../../src/http/evidence/EvidenceHttpAdapter.js';
import { InMemoryEvidenceStorage } from '../../../../src/governance/evidence/InMemoryEvidenceStorage.js';
import { GovernanceEvidenceService } from '../../../../src/governance/evidence/GovernanceEvidenceService.js';
import { NoopEvidenceMalwareScanner } from '../../../../src/governance/evidence/scanning/index.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';

const { fetch } = globalThis;

/**
 * Transport tests for the workflow decision endpoint wired into the native HTTP server. They
 * drive the route over a short-lived ephemeral loopback listener and confirm the existing
 * affiliation and evidence routes still work when the workflow route is present. NO database,
 * NO Docker, NO real Azure are involved — the decision recorder is an in-process fake.
 */

class RecordingExecutor implements AffiliationCommandExecutor {
  public readonly calls: { command: string; request: AffiliationApplicationTransitionRequest }[] = [];
  executeCommand(
    command: string,
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    this.calls.push({ command, request });
    return Promise.resolve({
      status: 'executed',
      applicationId: 'app-1',
      fromState: 'draft',
      toState: 'submitted',
      transitionId: 'st-1',
      auditEventId: 'au-1',
    });
  }
}

class RecordingRecorder {
  public readonly calls: RecordWorkflowDecisionInput[] = [];
  recordDecision(input: RecordWorkflowDecisionInput): Promise<WorkflowDecisionOutcome> {
    this.calls.push(input);
    return Promise.resolve({
      workflowInstanceId: input.workflowInstanceId,
      status: input.decision === 'reject' ? 'rejected' : 'pending',
      ...(input.decision === 'approve' ? { currentStepCode: 'national_signoff' } : {}),
      decidedStepCode: input.stepCode,
      decision: input.decision,
    });
  }
}

function buildWorkflow(): { deps: WorkflowHttpDeps; recorder: RecordingRecorder } {
  const recorder = new RecordingRecorder();
  return { deps: { decisionService: recorder }, recorder };
}

class RecordingWorkflowExecutor implements WorkflowTransitionExecutor {
  public readonly calls: ExecuteApprovedWorkflowInput[] = [];
  execute(input: ExecuteApprovedWorkflowInput): Promise<ExecuteApprovedTransitionResult> {
    this.calls.push(input);
    return Promise.resolve({
      status: 'executed',
      transitionRequestId: 'tr-1',
      entityType: 'AffiliationApplication',
      entityId: 'app-1',
      trigger: 'approve',
      fromState: 'under_review',
      toState: 'approved',
      stateTransitionId: 'st-1',
      idempotencyKey: input.idempotencyKey,
    });
  }
}

function buildExecution(): {
  deps: WorkflowExecutionHttpDeps;
  executor: RecordingWorkflowExecutor;
} {
  const executor = new RecordingWorkflowExecutor();
  return { deps: { executor }, executor };
}

function buildEvidence(maxUploadBytes = 1024): EvidenceHttpDeps {
  const storage = new InMemoryEvidenceStorage({ clock: fixedClock(0) });
  return {
    uploadService: new GovernanceEvidenceService(storage),
    storage,
    maxUploadBytes,
    scanner: new NoopEvidenceMalwareScanner({ clock: fixedClock(0) }),
    scanRequired: false,
  };
}

const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => resolve());
        }),
    ),
  );
});

async function start(opts: {
  workflow?: WorkflowHttpDeps;
  workflowExecution?: WorkflowExecutionHttpDeps;
  workflowRead?: WorkflowReadHttpDeps;
  evidence?: EvidenceHttpDeps;
}): Promise<string> {
  const server = createAffiliationHttpServer({
    executor: new RecordingExecutor(),
    ...(opts.workflow !== undefined ? { workflow: opts.workflow } : {}),
    ...(opts.workflowExecution !== undefined ? { workflowExecution: opts.workflowExecution } : {}),
    ...(opts.workflowRead !== undefined ? { workflowRead: opts.workflowRead } : {}),
    ...(opts.evidence !== undefined ? { evidence: opts.evidence } : {}),
  });
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const ID_HEADERS = {
  'x-house-tenant-id': 'tenant-a',
  'x-house-actor-user-id': 'reviewer-1',
  'x-house-actor-role-keys': 'workflow_admin',
};

describe('workflow decision HTTP server transport', () => {
  // Records a decision through the server and returns the stable response DTO.
  it('records a decision through the wired route', async () => {
    const { deps, recorder } = buildWorkflow();
    const base = await start({ workflow: deps });

    const res = await fetch(`${base}/v1/workflows/wf-1/steps/regional_signoff/decision`, {
      method: 'POST',
      headers: { ...ID_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['status']).toBe('recorded');
    expect(body['workflowInstanceId']).toBe('wf-1');
    expect(body['decidedStepCode']).toBe('regional_signoff');
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]?.tenantId).toBe('tenant-a');
    expect(recorder.calls[0]?.actorUserId).toBe('reviewer-1');
  });

  // GET on the decision route is rejected with 405.
  it('rejects a non-POST method with 405', async () => {
    const { deps } = buildWorkflow();
    const base = await start({ workflow: deps });
    const res = await fetch(`${base}/v1/workflows/wf-1/steps/regional_signoff/decision`, {
      method: 'GET',
    });
    expect(res.status).toBe(405);
  });

  // When the workflow transport is NOT wired, the route 404s (no accidental exposure).
  it('404s the decision route when workflow transport is not wired', async () => {
    const base = await start({});
    const res = await fetch(`${base}/v1/workflows/wf-1/steps/regional_signoff/decision`, {
      method: 'POST',
      headers: { ...ID_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(res.status).toBe(404);
  });

  // (15) Existing affiliation and evidence routes still work with the workflow route present.
  it('(15) keeps the affiliation and evidence routes working alongside the workflow route', async () => {
    const { deps } = buildWorkflow();
    const base = await start({ workflow: deps, evidence: buildEvidence() });

    // Affiliation transition route still executes.
    const aff = await fetch(`${base}/v1/affiliation/applications/app-1/transitions/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId: 'tenant-a',
        actor: { userId: 'member-1', roleKeys: [], permissionKeys: [] },
        idempotencyKey: 'idem-1',
      }),
    });
    expect(aff.status).toBe(200);

    // Evidence upload route still stores bytes.
    const ev = await fetch(`${base}/v1/evidence/objects`, {
      method: 'POST',
      headers: { ...ID_HEADERS, 'content-type': 'text/plain' },
      body: 'evidence-bytes',
    });
    expect(ev.status).toBe(201);

    // Workflow decision route works in the same server.
    const wf = await fetch(`${base}/v1/workflows/wf-1/steps/regional_signoff/decision`, {
      method: 'POST',
      headers: { ...ID_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(wf.status).toBe(200);
  });
});

describe('workflow execution HTTP server transport', () => {
  // Executes an approved transition through the wired route and returns the response DTO.
  it('executes through the wired route', async () => {
    const { deps, executor } = buildExecution();
    const base = await start({ workflowExecution: deps });

    const res = await fetch(`${base}/v1/workflows/wf-1/execute`, {
      method: 'POST',
      headers: { ...ID_HEADERS, 'content-type': 'application/json', 'idempotency-key': 'exec-1' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['status']).toBe('executed');
    expect(body['workflowInstanceId']).toBe('wf-1');
    expect(body['toState']).toBe('approved');
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0]?.idempotencyKey).toBe('exec-1');
  });

  // GET on the execute route is rejected with 405.
  it('rejects a non-POST method with 405', async () => {
    const { deps } = buildExecution();
    const base = await start({ workflowExecution: deps });
    const res = await fetch(`${base}/v1/workflows/wf-1/execute`, { method: 'GET' });
    expect(res.status).toBe(405);
  });

  // When the execution transport is NOT wired, the route 404s (no accidental exposure).
  it('404s the execute route when execution transport is not wired', async () => {
    const base = await start({});
    const res = await fetch(`${base}/v1/workflows/wf-1/execute`, {
      method: 'POST',
      headers: { ...ID_HEADERS, 'content-type': 'application/json', 'idempotency-key': 'exec-1' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});

/** Build an in-memory workflow-read transport seeded with one pending instance + step. */
function buildWorkflowRead(): WorkflowReadHttpDeps {
  const instance: WorkflowInstanceRecord = {
    id: 'wf-1',
    tenantId: 'tenant-a',
    transitionRequestId: 'tr-1',
    entityType: 'AffiliationApplication',
    entityId: 'app-1',
    workflowType: 'affiliation_two_tier_review',
    status: 'pending',
    currentStepCode: 'regional_signoff',
    createdAt: '2024-01-01T00:00:01.000Z',
    updatedAt: '2024-01-01T00:00:01.000Z',
  };
  const step: WorkflowStepRecord = {
    id: 'step-1',
    tenantId: 'tenant-a',
    workflowInstanceId: 'wf-1',
    stepCode: 'regional_signoff',
    stepOrder: 1,
    reviewTier: 'regional_review',
    required: true,
    status: 'pending',
    assignedScopeType: undefined,
    assignedScopeId: undefined,
    assignedRoleKey: 'regional_reviewer',
    decidedByUserId: undefined,
    decidedAt: undefined,
    decisionReason: undefined,
  };
  const store = new InMemoryWorkflowStore({ instances: [instance], steps: [step], decisions: [] });
  return { readStore: store };
}

/**
 * Server-transport coverage for the workflow-admin READ routes (list + detail) and for malformed
 * request bodies on the decision/execute write routes. The read routes are dispatched only for GET
 * and previously had no server-level test; the malformed-body cases drive the body-parse catch
 * blocks that convert invalid JSON into a deterministic 400 error DTO.
 */
describe('workflow read + malformed-body HTTP server transport (negative paths)', () => {
  it('serves GET /v1/workflows (list) when the read transport is wired', async () => {
    const base = await start({ workflowRead: buildWorkflowRead() });
    const res = await fetch(`${base}/v1/workflows`, { headers: ID_HEADERS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items.length).toBe(1);
  });

  it('serves GET /v1/workflows/:id (detail) when the read transport is wired', async () => {
    const base = await start({ workflowRead: buildWorkflowRead() });
    const res = await fetch(`${base}/v1/workflows/wf-1`, { headers: ID_HEADERS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { workflowInstanceId: string };
    expect(body.workflowInstanceId).toBe('wf-1');
  });

  it('404s the workflow list route when the read transport is not wired', async () => {
    const base = await start({});
    const res = await fetch(`${base}/v1/workflows`, { headers: ID_HEADERS });
    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed JSON body on the decision route', async () => {
    const { deps } = buildWorkflow();
    const base = await start({ workflow: deps });
    const res = await fetch(`${base}/v1/workflows/wf-1/steps/regional_signoff/decision`, {
      method: 'POST',
      headers: { ...ID_HEADERS, 'content-type': 'application/json' },
      body: '{not valid json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('error');
  });

  it('returns 400 for a malformed JSON body on the execute route', async () => {
    const { deps } = buildExecution();
    const base = await start({ workflowExecution: deps });
    const res = await fetch(`${base}/v1/workflows/wf-1/execute`, {
      method: 'POST',
      headers: { ...ID_HEADERS, 'content-type': 'application/json', 'idempotency-key': 'exec-1' },
      body: '{not valid json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('error');
  });
});
