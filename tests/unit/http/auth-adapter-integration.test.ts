import { describe, it, expect } from 'vitest';
import {
  handleAffiliationHttpTransition,
  type AffiliationCommandExecutor,
  type AffiliationHttpRequest,
} from '../../../src/http/AffiliationHttpAdapter.js';
import { TrustedHeadersAuthContextResolver, TRUSTED_HEADER_NAMES } from '../../../src/http/auth/TrustedHeadersAuthContextResolver.js';
import { DemoAuthContextResolver } from '../../../src/http/auth/DemoAuthContextResolver.js';
import type {
  AffiliationApplicationTransitionRequest,
  AffiliationApplicationTransitionResponse,
} from '../../../src/domains/affiliation/AffiliationApplicationDtos.js';
import { ErrorCode } from '../../../src/shared/errors/AppError.js';

/**
 * Adapter + edge-identity integration tests.
 *
 * Prove the adapter uses the RESOLVED identity (not the request body) for tenant + actor in
 * trusted_headers mode, still rejects facts/unknown actions, maps auth failures to 401/403
 * with no stack leakage, and preserves the local/demo default behavior.
 */

class RecordingExecutor implements AffiliationCommandExecutor {
  public readonly calls: { command: string; request: AffiliationApplicationTransitionRequest }[] = [];
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

const trusted = new TrustedHeadersAuthContextResolver();
const demo = new DemoAuthContextResolver();

function trustedHeaders(over: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    [TRUSTED_HEADER_NAMES.tenantId]: 'tenant-trusted',
    [TRUSTED_HEADER_NAMES.actorUserId]: 'user-trusted',
    [TRUSTED_HEADER_NAMES.actorRoleKeys]: 'reviewer,admin',
    [TRUSTED_HEADER_NAMES.actorPermissionKeys]: 'p1',
    ...over,
  };
}

function req(over: Partial<AffiliationHttpRequest> & { body?: unknown } = {}): AffiliationHttpRequest {
  return {
    applicationId: over.applicationId ?? 'app-1',
    action: over.action ?? 'submit',
    headers: over.headers ?? {},
    body: 'body' in over ? over.body : { context: { seasonId: '2025-26' } },
  };
}

describe('adapter + trusted_headers resolver', () => {
  // (10) Trusted identity (from headers) reaches the domain boundary, ignoring the body.
  it('passes header-derived tenant and actor to the domain service', async () => {
    const executor = new RecordingExecutor();
    const result = await handleAffiliationHttpTransition(
      executor,
      req({ headers: trustedHeaders(), body: { context: { seasonId: '2025-26' } } }),
      'req-1',
      trusted,
    );
    expect(result.status).toBe(200);
    expect(executor.calls).toHaveLength(1);
    const sent = executor.calls[0]!.request;
    expect(sent.tenantId).toBe('tenant-trusted');
    expect(sent.actor.userId).toBe('user-trusted');
    expect(sent.actor.roleKeys).toEqual(['reviewer', 'admin']);
    expect(sent.actor.permissionKeys).toEqual(['p1']);
  });

  // (11) Idempotency-Key header behavior is unchanged under the new resolver path.
  it('still reconciles the Idempotency-Key header', async () => {
    const executor = new RecordingExecutor();
    await handleAffiliationHttpTransition(
      executor,
      req({
        headers: { ...trustedHeaders(), 'idempotency-key': 'idem-9' },
        body: { context: { seasonId: '2025-26' } },
      }),
      'req-2',
      trusted,
    );
    expect(executor.calls[0]!.request.idempotencyKey).toBe('idem-9');
  });

  // (12) Caller-supplied guard facts are still rejected (400) in trusted mode.
  it('rejects caller-supplied facts with 400', async () => {
    const executor = new RecordingExecutor();
    const result = await handleAffiliationHttpTransition(
      executor,
      req({ headers: trustedHeaders(), body: { context: { seasonId: '2025-26' }, facts: {} } }),
      'req-3',
      trusted,
    );
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  // (13) Unknown action still fails closed (400) in trusted mode.
  it('fails closed on an unknown action', async () => {
    const executor = new RecordingExecutor();
    const result = await handleAffiliationHttpTransition(
      executor,
      req({ action: 'teleport', headers: trustedHeaders() }),
      'req-4',
      trusted,
    );
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  // (14) Auth failures map to 401/403 with a stable code and no stack leakage.
  it('maps a missing trusted identity to 401 without leaking internals', async () => {
    const executor = new RecordingExecutor();
    const result = await handleAffiliationHttpTransition(
      executor,
      req({ headers: {}, body: { context: { seasonId: '2025-26' } } }),
      'req-5',
      trusted,
    );
    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ status: 'error', code: ErrorCode.UNAUTHENTICATED });
    expect(JSON.stringify(result.body)).not.toMatch(/stack|at Object|\.ts:/i);
    expect(executor.calls).toHaveLength(0);
  });

  it('maps a body-supplied actor override to 403', async () => {
    const executor = new RecordingExecutor();
    const result = await handleAffiliationHttpTransition(
      executor,
      req({ headers: trustedHeaders(), body: { actor: { userId: 'evil' } } }),
      'req-6',
      trusted,
    );
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ status: 'error', code: ErrorCode.FORBIDDEN });
    expect(executor.calls).toHaveLength(0);
  });
});

describe('adapter local/demo default', () => {
  // (17) Without trusted headers the adapter still works via the demo default (body-trusted).
  it('uses body identity when no resolver is provided (demo default)', async () => {
    const executor = new RecordingExecutor();
    const result = await handleAffiliationHttpTransition(executor, {
      applicationId: 'app-1',
      action: 'submit',
      headers: {},
      body: { tenantId: 'tenant-body', actor: { userId: 'user-body' }, context: { seasonId: '2025-26' } },
    });
    expect(result.status).toBe(200);
    expect(executor.calls[0]!.request.tenantId).toBe('tenant-body');
    expect(executor.calls[0]!.request.actor.userId).toBe('user-body');
  });

  it('behaves identically when the demo resolver is passed explicitly', async () => {
    const executor = new RecordingExecutor();
    await handleAffiliationHttpTransition(
      executor,
      {
        applicationId: 'app-1',
        action: 'submit',
        headers: {},
        body: { tenantId: 'tenant-body', actor: { userId: 'user-body' }, context: { seasonId: '2025-26' } },
      },
      'req-7',
      demo,
    );
    expect(executor.calls[0]!.request.tenantId).toBe('tenant-body');
  });
});
