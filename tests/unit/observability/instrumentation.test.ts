import { describe, expect, it, afterEach } from 'vitest';
import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { InMemoryTelemetry } from '../../../src/observability/index.js';
import { createAffiliationHttpServer } from '../../../src/http/server.js';
import type { AffiliationCommandExecutor } from '../../../src/http/AffiliationHttpAdapter.js';
import type {
  AffiliationApplicationTransitionRequest,
  AffiliationApplicationTransitionResponse,
} from '../../../src/domains/affiliation/AffiliationApplicationDtos.js';
import { assertAuthorized, AuthorizationAction } from '../../../src/authz/index.js';
import type { AuthContext } from '../../../src/http/auth/AuthContext.js';
import { handleWorkflowList } from '../../../src/http/workflow/WorkflowReadHttpAdapter.js';
import { handleWorkflowDecision } from '../../../src/http/workflow/WorkflowHttpAdapter.js';
import { handleWorkflowExecution } from '../../../src/http/workflow/WorkflowExecutionHttpAdapter.js';
import { InMemoryWorkflowStore } from '../../../src/governance/workflow/InMemoryWorkflowStore.js';
import type {
  RecordWorkflowDecisionInput,
  WorkflowDecisionOutcome,
} from '../../../src/governance/workflow/WorkflowDecisionService.js';
import type { ExecuteApprovedWorkflowInput } from '../../../src/governance/workflow/ApprovedWorkflowExecutionService.js';
import type { ExecuteApprovedTransitionResult } from '../../../src/governance/types/TransitionTypes.js';
import { handleEvidenceUpload } from '../../../src/http/evidence/EvidenceHttpAdapter.js';
import { InMemoryEvidenceStorage } from '../../../src/governance/evidence/InMemoryEvidenceStorage.js';
import { GovernanceEvidenceService } from '../../../src/governance/evidence/GovernanceEvidenceService.js';
import {
  createEvidenceMalwareScanner,
  EICAR_TEST_SIGNATURE,
} from '../../../src/governance/evidence/scanning/index.js';
import type {
  EvidenceQuarantineRecorder,
  RecordBlockedUploadInput,
  RecordBlockedUploadResult,
} from '../../../src/governance/evidence/quarantine/index.js';
import { handleQuarantineDisposition } from '../../../src/http/evidence/EvidenceQuarantineHttpAdapter.js';
import { EvidenceQuarantineService } from '../../../src/governance/evidence/quarantine/EvidenceQuarantineService.js';
import { InMemoryEvidenceQuarantineStore } from '../../../src/governance/evidence/quarantine/InMemoryEvidenceQuarantineStore.js';
import { InMemoryOutboxStore } from '../../../src/governance/outbox/InMemoryOutboxStore.js';
import { OutboxWorkerRuntime } from '../../../src/workers/outbox/OutboxWorkerRuntime.js';
import type { OutboxWorkerRunnable } from '../../../src/workers/outbox/OutboxWorkerRuntime.js';
import type { ProcessBatchSummary } from '../../../src/workers/outbox/OutboxWorker.js';
import { fixedClock } from '../../../src/shared/time/clock.js';

const { fetch } = globalThis;
const flush = (): Promise<void> => new Promise((r) => delay(r, 0));

/**
 * Instrumentation tests: prove each runtime seam (HTTP, authz, workflow, evidence, quarantine,
 * outbox) emits the expected telemetry through an injected {@link InMemoryTelemetry}. Fully
 * hermetic — fakes/in-memory stores only; NO DB, Azure, Entra, AV, or Service Bus.
 */

class FakeExecutor implements AffiliationCommandExecutor {
  executeCommand(
    _command: string,
    _request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
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

class ThrowingExecutor implements AffiliationCommandExecutor {
  executeCommand(): Promise<AffiliationApplicationTransitionResponse> {
    return Promise.reject(new Error('internal boom'));
  }
}

const openServers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
});

async function start(
  executor: AffiliationCommandExecutor,
  telemetry: InMemoryTelemetry,
): Promise<string> {
  const server = createAffiliationHttpServer({ executor, telemetry });
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const TRANSITION_BODY = {
  tenantId: 'tenant-1',
  actor: { userId: 'user-1', roleKeys: ['platform_admin'] },
  context: { seasonId: '2025-26' },
  idempotencyKey: 'k1',
  reason: 'because',
};

describe('observability HTTP instrumentation', () => {
  // (11) the HTTP server emits a request count.
  it('(11) emits http.request.count for a handled request', async () => {
    const telemetry = new InMemoryTelemetry();
    const base = await start(new FakeExecutor(), telemetry);
    await fetch(`${base}/healthz`);
    await flush();
    expect(telemetry.counterTotal('http.request.count')).toBeGreaterThanOrEqual(1);
    const signal = telemetry.signalsNamed('http.request.count')[0]!;
    expect(signal.attributes['route']).toBe('GET /healthz');
  });

  // (12) the HTTP server emits a request duration.
  it('(12) emits http.request.duration_ms for a handled request', async () => {
    const telemetry = new InMemoryTelemetry();
    const base = await start(new FakeExecutor(), telemetry);
    await fetch(`${base}/healthz`);
    await flush();
    expect(telemetry.durations('http.request.duration_ms').length).toBeGreaterThanOrEqual(1);
  });

  // (13) a 5xx response emits an error count.
  it('(13) emits http.request.error.count for a 5xx response', async () => {
    const telemetry = new InMemoryTelemetry();
    const base = await start(new ThrowingExecutor(), telemetry);
    const res = await fetch(
      `${base}/v1/affiliation/applications/app-1/transitions/submit`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(TRANSITION_BODY),
      },
    );
    await res.text();
    await flush();
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(telemetry.counterTotal('http.request.error.count')).toBeGreaterThanOrEqual(1);
  });

  // (14) HTTP telemetry never captures a raw Authorization header (or any secret).
  it('(14) HTTP telemetry excludes the raw Authorization header', async () => {
    const telemetry = new InMemoryTelemetry();
    const base = await start(new FakeExecutor(), telemetry);
    await fetch(`${base}/healthz`, {
      headers: { authorization: 'Bearer super-secret-token-xyz' },
    });
    await flush();
    const serialized = JSON.stringify(telemetry.snapshot());
    expect(serialized).not.toContain('super-secret-token-xyz');
    expect(serialized).not.toContain('authorization');
  });
});

describe('observability authz instrumentation', () => {
  // (15) a denied authorization emits the denied counter + event.
  it('(15) authz denial emits a denied metric and event', () => {
    const telemetry = new InMemoryTelemetry();
    const deniedAuth: AuthContext = {
      tenantId: 'tenant-a',
      mode: 'demo',
      actor: { userId: 'u1', roleKeys: [], permissionKeys: [] },
    };
    expect(() =>
      assertAuthorized(deniedAuth, AuthorizationAction.WorkflowRead, telemetry),
    ).toThrow();
    expect(telemetry.counterTotal('authz.denied.count')).toBe(1);
    expect(telemetry.hasEvent('authz.denied')).toBe(true);
    const signal = telemetry.signalsNamed('authz.denied.count')[0]!;
    expect(signal.attributes['action']).toBe('workflow.read');
  });
});

describe('observability workflow instrumentation', () => {
  const reader = {
    'x-house-tenant-id': 'tenant-a',
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'regional_reviewer',
  };

  // (16) workflow read emits a metric.
  it('(16) workflow list emits workflow.read.count', async () => {
    const telemetry = new InMemoryTelemetry();
    const store = new InMemoryWorkflowStore({ instances: [], steps: [], decisions: [] });
    const result = await handleWorkflowList(
      { readStore: store, telemetry },
      { headers: reader, query: {} },
      'req-16',
    );
    expect(result.status).toBe(200);
    expect(telemetry.counterTotal('workflow.read.count')).toBe(1);
    expect(telemetry.signalsNamed('workflow.read.count')[0]!.attributes['operation']).toBe('list');
  });

  // (17) workflow decision emits a metric (+ duration + event).
  it('(17) workflow decision emits workflow.decision.count', async () => {
    const telemetry = new InMemoryTelemetry();
    const recorder = {
      recordDecision(_input: RecordWorkflowDecisionInput): Promise<WorkflowDecisionOutcome> {
        return Promise.resolve({
          workflowInstanceId: 'wf-1',
          status: 'pending',
          currentStepCode: 'national_signoff',
          decidedStepCode: 'regional_signoff',
          decision: 'approve',
        });
      },
    };
    const result = await handleWorkflowDecision(
      { decisionService: recorder, telemetry },
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: reader,
        body: { decision: 'approve' },
      },
      'req-17',
    );
    expect(result.status).toBe(200);
    expect(telemetry.counterTotal('workflow.decision.count')).toBe(1);
    expect(telemetry.durations('workflow.decision.duration_ms').length).toBe(1);
    expect(telemetry.hasEvent('workflow.decision.recorded')).toBe(true);
  });

  // (18) workflow execution emits a metric.
  it('(18) workflow execution emits workflow.execution.count', async () => {
    const telemetry = new InMemoryTelemetry();
    const executor = {
      execute(input: ExecuteApprovedWorkflowInput): Promise<ExecuteApprovedTransitionResult> {
        return Promise.resolve({
          status: 'executed',
          transitionRequestId: 'tr-1',
          entityType: 'AffiliationApplication',
          entityId: input.workflowInstanceId,
          trigger: 'approve',
          fromState: 'under_review',
          toState: 'approved',
          idempotencyKey: 'idem-1',
        });
      },
    };
    const result = await handleWorkflowExecution(
      { executor, telemetry },
      {
        workflowInstanceId: 'wf-1',
        headers: { ...reader, 'x-house-actor-role-keys': 'workflow_admin', 'idempotency-key': 'idem-1' },
        body: {},
      },
      'req-18',
    );
    expect(result.status).toBe(200);
    expect(telemetry.counterTotal('workflow.execution.count')).toBe(1);
    expect(telemetry.hasEvent('workflow.execution.requested')).toBe(true);
  });
});

describe('observability evidence + quarantine instrumentation', () => {
  class CapturingQuarantine implements EvidenceQuarantineRecorder {
    recordBlockedUpload(_input: RecordBlockedUploadInput): Promise<RecordBlockedUploadResult> {
      return Promise.resolve({ quarantineEventId: 'quar-1' });
    }
  }

  // (19) a malware-rejected upload emits the rejected + quarantine-recorded metrics.
  it('(19) evidence upload rejected emits rejection + quarantine metrics', async () => {
    const telemetry = new InMemoryTelemetry();
    const storage = new InMemoryEvidenceStorage({ clock: fixedClock(0) });
    const result = await handleEvidenceUpload(
      {
        uploadService: new GovernanceEvidenceService(storage),
        storage,
        maxUploadBytes: 1024,
        scanner: createEvidenceMalwareScanner(
          { mode: 'signature', required: false, testSignaturesEnabled: true },
          { clock: fixedClock(0) },
        ),
        scanRequired: false,
        quarantine: new CapturingQuarantine(),
        includeQuarantineEventIdInResponse: true,
        telemetry,
      },
      {
        headers: {
          'x-house-tenant-id': 'tenant-a',
          'x-house-actor-user-id': 'user-1',
          'content-type': 'text/plain',
        },
        content: Buffer.concat([Buffer.from('doc '), Buffer.from(EICAR_TEST_SIGNATURE.pattern)]),
      },
      'req-19',
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(422);
    expect(telemetry.counterTotal('evidence.upload.rejected.count')).toBe(1);
    expect(telemetry.counterTotal('evidence.quarantine.recorded.count')).toBe(1);
    expect(telemetry.hasEvent('evidence.quarantine.recorded')).toBe(true);
  });

  // (20) a quarantine disposition emits the disposition metric + event.
  it('(20) quarantine disposition emits the disposition metric', async () => {
    const telemetry = new InMemoryTelemetry();
    const outbox = new InMemoryOutboxStore();
    const store = new InMemoryEvidenceQuarantineStore(outbox);
    const service = new EvidenceQuarantineService(store, { maxRetries: 5 });
    const seeded = await service.recordBlockedUpload({
      tenantId: 'tenant-a',
      contentType: 'application/pdf',
      sizeBytes: 10,
      contentHash: 'deadbeef',
      scanStatus: 'infected',
      scanner: 'signature',
      requestId: 'seed-1',
    });

    const result = await handleQuarantineDisposition(
      { reviewer: service, telemetry },
      {
        quarantineEventId: seeded.quarantineEventId,
        headers: {
          'x-house-tenant-id': 'tenant-a',
          'x-house-actor-user-id': 'sec-op-1',
          'x-house-actor-permission-keys': 'evidence.quarantine.disposition',
        },
        body: { disposition: 'reviewed' },
      },
      'req-20',
    );
    expect(result.status).toBe(200);
    expect(telemetry.counterTotal('evidence.quarantine.disposition.count')).toBe(1);
    expect(telemetry.hasEvent('evidence.quarantine.disposition.recorded')).toBe(true);
  });
});

describe('observability outbox worker instrumentation', () => {
  class FakeWorker implements OutboxWorkerRunnable {
    constructor(private readonly summary: ProcessBatchSummary) {}
    processBatch(): Promise<ProcessBatchSummary> {
      return Promise.resolve(this.summary);
    }
  }

  // (21) the outbox worker runtime emits a batch metric per processed batch.
  it('(21) outbox worker emits outbox.batch.count', async () => {
    const telemetry = new InMemoryTelemetry();
    const worker = new FakeWorker({
      claimed: 2,
      published: 2,
      rescheduled: 0,
      failed: 0,
      recoveredLeases: 0,
    });
    const runtime = new OutboxWorkerRuntime({
      worker,
      config: {
        intervalMs: 5000,
        runOnce: true,
        workerId: 'test-worker',
        batchSize: 25,
        lockSeconds: 60,
        serviceBusEnabled: false,
      },
      log: () => {},
      telemetry,
    });
    await runtime.start();
    expect(telemetry.counterTotal('outbox.batch.count')).toBe(1);
    expect(telemetry.durations('outbox.batch.duration_ms').length).toBe(1);
    expect(telemetry.counterTotal('outbox.message.published.count')).toBe(2);
    expect(telemetry.hasEvent('outbox.batch.completed')).toBe(true);
  });
});
