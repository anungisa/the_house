import { describe, it, expect } from 'vitest';
import {
  handleAffiliationHttpTransition,
  type AffiliationCommandExecutor,
  type AffiliationHttpRequest,
} from '../../../src/http/AffiliationHttpAdapter.js';
import { AffiliationApplicationService } from '../../../src/domains/affiliation/AffiliationApplicationService.js';
import { AFFILIATION_APPLICATION_COMMANDS } from '../../../src/domains/affiliation/AffiliationApplicationCommands.js';
import type {
  AffiliationApplicationTransitionRequest,
  AffiliationApplicationTransitionResponse,
} from '../../../src/domains/affiliation/AffiliationApplicationDtos.js';
import type {
  TransitionInput,
  TransitionResult,
} from '../../../src/governance/types/TransitionTypes.js';
import type { AffiliationKernelPort } from '../../../src/domains/affiliation/AffiliationApplicationService.js';
import { ErrorCode } from '../../../src/shared/errors/AppError.js';

/**
 * HTTP adapter unit tests.
 *
 * These prove the adapter is a THIN transport over the existing domain boundary:
 *  - it routes every request through `executeCommand` (never a store/kernel directly),
 *  - it reconciles idempotency + rejects caller facts,
 *  - it maps response DTOs / thrown AppErrors to the documented HTTP status codes, and
 *  - it never leaks internal/SQL errors.
 *
 * No real HTTP server is needed: the adapter is protocol-pure (`{ status, body }`).
 */

// --- A recording fake of the domain boundary (proves the adapter calls executeCommand). ---
class RecordingExecutor implements AffiliationCommandExecutor {
  public readonly calls: { command: string; request: AffiliationApplicationTransitionRequest }[] =
    [];
  constructor(
    private readonly response: AffiliationApplicationTransitionResponse = {
      status: 'executed',
      applicationId: 'app-1',
      fromState: 'draft',
      toState: 'submitted',
      transitionId: 'st-1',
      auditEventId: 'au-1',
    },
  ) {}
  executeCommand(
    command: string,
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    this.calls.push({ command, request });
    return Promise.resolve(this.response);
  }
}

// --- A fake kernel so the REAL service (validation + mapping) runs in the adapter path. ---
class FakeKernel implements AffiliationKernelPort {
  public readonly calls: TransitionInput[] = [];
  constructor(private readonly produce: () => TransitionResult) {}
  transition(input: TransitionInput): Promise<TransitionResult> {
    this.calls.push(input);
    return Promise.resolve(this.produce());
  }
}

function realService(produce: () => TransitionResult): AffiliationApplicationService {
  return new AffiliationApplicationService(new FakeKernel(produce));
}

function executedKernelResult(over: Partial<TransitionResult> = {}): TransitionResult {
  return {
    status: 'executed',
    entityType: 'AffiliationApplication',
    entityId: 'app-1',
    trigger: 'submit',
    fromState: 'draft',
    toState: 'submitted',
    stateTransitionId: 'st-1',
    auditEventId: 'au-1',
    idempotencyKey: 'k1',
    ...over,
  };
}

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenantId: 'tenant-1',
    actor: { userId: 'user-1', roleKeys: ['reviewer'] },
    context: { seasonId: '2025-26' },
    idempotencyKey: 'k1',
    reason: 'because',
    ...over,
  };
}

function httpReq(
  over: Partial<AffiliationHttpRequest> & { body?: unknown } = {},
): AffiliationHttpRequest {
  return {
    applicationId: over.applicationId ?? 'app-1',
    action: over.action ?? 'submit',
    headers: over.headers ?? {},
    body: 'body' in over ? over.body : validBody(),
  };
}

describe('AffiliationApplication HTTP adapter', () => {
  // (1) A valid request reaches the domain boundary exactly once with the mapped command.
  it('routes a valid submit to executeCommand exactly once with the mapped command', async () => {
    const executor = new RecordingExecutor();
    const result = await handleAffiliationHttpTransition(executor, httpReq({ action: 'submit' }));
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0]!.command).toBe('submitAffiliationApplication');
    expect(executor.calls[0]!.request.applicationId).toBe('app-1');
    expect(result.status).toBe(200);
  });

  // (1b) Every URL action maps to its domain command (single source of truth).
  it('maps every URL action to its domain command', async () => {
    for (const [command, action] of Object.entries(AFFILIATION_APPLICATION_COMMANDS)) {
      const executor = new RecordingExecutor();
      await handleAffiliationHttpTransition(executor, httpReq({ action }));
      expect(executor.calls[0]!.command).toBe(command);
    }
  });

  // (2) The Idempotency-Key header is passed through to the domain request.
  it('passes the Idempotency-Key header through to the request', async () => {
    const executor = new RecordingExecutor();
    await handleAffiliationHttpTransition(
      executor,
      httpReq({ headers: { 'idempotency-key': 'hdr-key' }, body: validBody({ idempotencyKey: undefined }) }),
    );
    expect(executor.calls[0]!.request.idempotencyKey).toBe('hdr-key');
  });

  // (3) The body idempotencyKey is used when no header is present.
  it('uses the body idempotencyKey when no header is present', async () => {
    const executor = new RecordingExecutor();
    await handleAffiliationHttpTransition(
      executor,
      httpReq({ body: validBody({ idempotencyKey: 'body-key' }) }),
    );
    expect(executor.calls[0]!.request.idempotencyKey).toBe('body-key');
  });

  // (4) A header/body idempotency-key mismatch is rejected (fail closed), boundary not called.
  it('rejects a mismatched Idempotency-Key header and body key', async () => {
    const executor = new RecordingExecutor();
    const result = await handleAffiliationHttpTransition(
      executor,
      httpReq({
        headers: { 'idempotency-key': 'hdr-key' },
        body: validBody({ idempotencyKey: 'body-key' }),
      }),
    );
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  // (5) A missing tenantId is rejected (domain validation surfaced as 400).
  it('rejects a request missing tenantId with 400', async () => {
    const service = realService(() => executedKernelResult());
    const result = await handleAffiliationHttpTransition(
      service,
      httpReq({ body: validBody({ tenantId: undefined }) }),
    );
    expect(result.status).toBe(400);
    expect(result.body['code']).toBe(ErrorCode.INVALID_INPUT);
  });

  // (6) A missing actor.userId is rejected with 400.
  it('rejects a request missing actor.userId with 400', async () => {
    const service = realService(() => executedKernelResult());
    const result = await handleAffiliationHttpTransition(
      service,
      httpReq({ body: validBody({ actor: { roleKeys: ['reviewer'] } }) }),
    );
    expect(result.status).toBe(400);
  });

  // (7) A missing idempotency key (neither header nor body) is rejected with 400.
  it('rejects a request with no idempotency key with 400', async () => {
    const service = realService(() => executedKernelResult());
    const result = await handleAffiliationHttpTransition(
      service,
      httpReq({ body: validBody({ idempotencyKey: undefined }) }),
    );
    expect(result.status).toBe(400);
  });

  // (8) An unknown URL action fails closed (400), boundary not called.
  it('fails closed on an unknown transition action', async () => {
    const executor = new RecordingExecutor();
    const result = await handleAffiliationHttpTransition(
      executor,
      httpReq({ action: 'frobnicate' }),
    );
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  // (9) An executed kernel result maps to HTTP 200.
  it('maps an executed result to 200', async () => {
    const service = realService(() => executedKernelResult());
    const result = await handleAffiliationHttpTransition(service, httpReq());
    expect(result.status).toBe(200);
    expect(result.body['status']).toBe('executed');
    expect(result.body['toState']).toBe('submitted');
    expect(typeof result.body['requestId']).toBe('string');
  });

  // (10) An approval-required kernel result maps to HTTP 202.
  it('maps an approval-required result to 202', async () => {
    const service = realService(() => ({
      status: 'approval_required',
      entityType: 'AffiliationApplication',
      entityId: 'app-1',
      trigger: 'approve',
      fromState: 'under_review',
      toState: 'approved',
      transitionRequestId: 'tr-1',
      idempotencyKey: 'k1',
    }));
    const result = await handleAffiliationHttpTransition(
      service,
      httpReq({ action: 'approve', body: validBody() }),
    );
    expect(result.status).toBe(202);
    expect(result.body['status']).toBe('approval_required');
  });

  // (11) A guard failure (rejected) maps to HTTP 409 with failed guard codes.
  it('maps a guard failure rejection to 409 with failedGuards', async () => {
    const service = realService(() => ({
      status: 'rejected',
      entityType: 'AffiliationApplication',
      entityId: 'app-1',
      trigger: 'submit',
      fromState: 'draft',
      toState: 'submitted',
      reasonCode: ErrorCode.GUARD_FAILED,
      reasonMessage: 'Guard failed: AFFILIATION_REQUIRED_FIELDS_COMPLETE',
      guardResults: [
        {
          guardCode: 'AFFILIATION_REQUIRED_FIELDS_COMPLETE',
          passed: false,
          message: 'Required fields incomplete.',
        },
      ],
      idempotencyKey: 'k1',
    }));
    const result = await handleAffiliationHttpTransition(service, httpReq());
    expect(result.status).toBe(409);
    expect(result.body['status']).toBe('rejected');
    expect(result.body['code']).toBe(ErrorCode.GUARD_FAILED);
    expect(result.body['failedGuards']).toEqual(['AFFILIATION_REQUIRED_FIELDS_COMPLETE']);
  });

  // (12) A permission denial (rejected) maps to HTTP 403.
  it('maps a permission denial rejection to 403', async () => {
    const service = realService(() => ({
      status: 'rejected',
      entityType: 'AffiliationApplication',
      entityId: 'app-1',
      trigger: 'approve',
      fromState: 'under_review',
      toState: 'approved',
      reasonCode: ErrorCode.PERMISSION_DENIED,
      reasonMessage: 'Permission denied.',
      idempotencyKey: 'k1',
    }));
    const result = await handleAffiliationHttpTransition(
      service,
      httpReq({ action: 'approve', body: validBody() }),
    );
    expect(result.status).toBe(403);
    expect(result.body['code']).toBe(ErrorCode.PERMISSION_DENIED);
  });

  // (13) An internal/raw error is collapsed to an opaque 500 (no leakage).
  it('does not leak internal/raw errors', async () => {
    const service = realService(() => {
      throw new Error('SELECT secret_column FROM users WHERE password = $1');
    });
    const result = await handleAffiliationHttpTransition(service, httpReq());
    expect(result.status).toBe(500);
    expect(result.body['code']).toBe('INTERNAL');
    expect(result.body['message']).toBe('Internal server error.');
    expect(JSON.stringify(result.body)).not.toContain('secret_column');
    expect(JSON.stringify(result.body)).not.toContain('SELECT');
  });

  // (14) Sport-specific fields are NOT required: a minimal NSO-generic body executes.
  it('does not require sport-specific fields', async () => {
    const executor = new RecordingExecutor();
    const result = await handleAffiliationHttpTransition(
      executor,
      httpReq({
        body: {
          tenantId: 'tenant-1',
          actor: { userId: 'user-1', roleKeys: ['reviewer'] },
          context: { seasonId: '2025-26' },
          idempotencyKey: 'k1',
        },
      }),
    );
    expect(result.status).toBe(200);
    // No curling-specific keys ever reach the boundary.
    const forwarded = JSON.stringify(executor.calls[0]!.request);
    for (const banned of ['ptsoId', 'clubId', 'curlerId', 'bonspielId']) {
      expect(forwarded).not.toContain(banned);
    }
  });

  // (15) The adapter calls the domain boundary (executeCommand) — never a store/kernel.
  it('calls the domain command boundary, not stores or the kernel', async () => {
    const executor = new RecordingExecutor();
    await handleAffiliationHttpTransition(executor, httpReq({ action: 'submit' }));
    // The ONLY governed interaction is a single executeCommand call on the boundary.
    expect(executor.calls).toHaveLength(1);
    expect(Object.keys(executor)).not.toContain('store');
    expect(Object.keys(executor)).not.toContain('kernel');
  });

  // (16) A caller-supplied `facts` field is rejected (guards derive from persisted state).
  it('rejects caller-supplied guard facts', async () => {
    const executor = new RecordingExecutor();
    const result = await handleAffiliationHttpTransition(
      executor,
      httpReq({ body: validBody({ facts: { feesPaid: true } }) }),
    );
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });
});
