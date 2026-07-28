import { describe, it, expect } from 'vitest';
import {
  handleStandingHttpTransition,
  type StandingCommandExecutor,
  type StandingHttpRequest,
} from '../../../src/http/standing/AffiliationStandingHttpAdapter.js';
import { STANDING_COMMANDS } from '../../../src/domains/affiliation-standing/index.js';
import type {
  StandingTransitionRequest,
  StandingTransitionResponse,
} from '../../../src/domains/affiliation-standing/index.js';
import { AppError, ErrorCode } from '../../../src/shared/errors/AppError.js';

/**
 * AffiliationStanding HTTP adapter unit tests.
 *
 * The adapter is a THIN, protocol-pure transport ({ status, body }) over the domain boundary
 * (`executeCommand`). These proofs show it: routes every action through the boundary exactly once
 * with the mapped command, takes tenant/actor from the trusted identity context (not governed
 * facts), rejects caller-supplied guard facts, forwards command details, and maps response DTOs /
 * thrown AppErrors to the documented HTTP status codes without leaking internals.
 */

class RecordingExecutor implements StandingCommandExecutor {
  public readonly calls: { command: string; request: StandingTransitionRequest }[] = [];
  constructor(
    private readonly response: StandingTransitionResponse = {
      status: 'executed',
      standingId: 'std-1',
      fromState: 'unopened',
      toState: 'pending',
    },
  ) {}
  executeCommand(
    command: string,
    request: StandingTransitionRequest,
  ): Promise<StandingTransitionResponse> {
    this.calls.push({ command, request });
    return Promise.resolve(this.response);
  }
}

/** An executor that always throws the given error (proves error mapping). */
class ThrowingExecutor implements StandingCommandExecutor {
  constructor(private readonly err: unknown) {}
  executeCommand(): Promise<StandingTransitionResponse> {
    return Promise.reject(this.err);
  }
}

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenantId: 'tenant-1',
    actor: { userId: 'user-1', roleKeys: ['standing_registrar'] },
    idempotencyKey: 'k1',
    ...over,
  };
}

function httpReq(
  over: Partial<StandingHttpRequest> & { body?: unknown } = {},
): StandingHttpRequest {
  return {
    standingId: over.standingId ?? 'std-1',
    action: over.action ?? 'open',
    headers: over.headers ?? {},
    body: 'body' in over ? over.body : validBody(),
  };
}

describe('AffiliationStanding HTTP adapter', () => {
  it('routes a valid open to executeCommand exactly once with the mapped command', async () => {
    const executor = new RecordingExecutor();
    const result = await handleStandingHttpTransition(executor, httpReq());
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0]!.command).toBe('openStanding');
    expect(executor.calls[0]!.request.standingId).toBe('std-1');
    // Tenant + actor come from the trusted context, not from governed facts.
    expect(executor.calls[0]!.request.tenantId).toBe('tenant-1');
    expect(executor.calls[0]!.request.actor.userId).toBe('user-1');
    expect(result.status).toBe(200);
  });

  it('maps every 1:1 URL action to its domain command (action verb == trigger)', async () => {
    for (const [command, action] of Object.entries(STANDING_COMMANDS)) {
      const executor = new RecordingExecutor();
      await handleStandingHttpTransition(executor, httpReq({ action }));
      expect(executor.calls[0]!.command).toBe(command);
    }
  });

  it('maps the renew_active action to the renewActiveStanding command', async () => {
    const executor = new RecordingExecutor();
    await handleStandingHttpTransition(executor, httpReq({ action: 'renew_active' }));
    expect(executor.calls[0]!.command).toBe('renewActiveStanding');
  });

  it('rejects an unknown action with 400 and never calls the boundary', async () => {
    const executor = new RecordingExecutor();
    const result = await handleStandingHttpTransition(
      executor,
      httpReq({ action: 'frobnicate' }),
    );
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  it('rejects caller-supplied guard facts with 400', async () => {
    const executor = new RecordingExecutor();
    const result = await handleStandingHttpTransition(
      executor,
      httpReq({ body: validBody({ facts: { withinEffectivePeriod: true } }) }),
    );
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  it('rejects a non-object body with 400', async () => {
    const executor = new RecordingExecutor();
    const result = await handleStandingHttpTransition(executor, httpReq({ body: 'nope' }));
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  it('reads command details from body.details and forwards them to the boundary', async () => {
    const executor = new RecordingExecutor();
    await handleStandingHttpTransition(
      executor,
      httpReq({
        action: 'renew',
        body: validBody({
          reason: 'renewal for next season',
          details: {
            pathway: 'continuity',
            effectiveFrom: '2026-01-01T00:00:00.000Z',
            effectiveUntil: '2027-01-01T00:00:00.000Z',
          },
        }),
      }),
    );
    expect(executor.calls[0]!.command).toBe('renewStanding');
    expect(executor.calls[0]!.request.details).toEqual({
      pathway: 'continuity',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveUntil: '2027-01-01T00:00:00.000Z',
    });
    expect(executor.calls[0]!.request.reason).toBe('renewal for next season');
  });

  it('takes the idempotency key from the Idempotency-Key header when the body omits it', async () => {
    const executor = new RecordingExecutor();
    await handleStandingHttpTransition(
      executor,
      httpReq({
        headers: { 'idempotency-key': 'hk-1' },
        body: { tenantId: 'tenant-1', actor: { userId: 'user-1', roleKeys: ['standing_registrar'] } },
      }),
    );
    expect(executor.calls[0]!.request.idempotencyKey).toBe('hk-1');
  });

  it('rejects an Idempotency-Key header that disagrees with the body key (400)', async () => {
    const executor = new RecordingExecutor();
    const result = await handleStandingHttpTransition(
      executor,
      httpReq({ headers: { 'idempotency-key': 'other' }, body: validBody({ idempotencyKey: 'k1' }) }),
    );
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  it('maps a rejected (permission) response DTO to 403', async () => {
    const executor = new RecordingExecutor({
      status: 'rejected',
      standingId: 'std-1',
      code: ErrorCode.PERMISSION_DENIED,
      message: 'not authorized',
    });
    const result = await handleStandingHttpTransition(executor, httpReq());
    expect(result.status).toBe(403);
  });

  it('maps a rejected (guard) response DTO to 409', async () => {
    const executor = new RecordingExecutor({
      status: 'rejected',
      standingId: 'std-1',
      code: ErrorCode.GUARD_FAILED,
      message: 'guard failed',
      failedGuards: ['STANDING_TERM_HAS_ENDED'],
    });
    const result = await handleStandingHttpTransition(executor, httpReq());
    expect(result.status).toBe(409);
  });

  it('maps a thrown AFFILIATION_STANDING_NOT_FOUND to 404', async () => {
    const executor = new ThrowingExecutor(
      new AppError(ErrorCode.AFFILIATION_STANDING_NOT_FOUND, 'missing'),
    );
    const result = await handleStandingHttpTransition(executor, httpReq());
    expect(result.status).toBe(404);
    expect(result.body['code']).toBe(ErrorCode.AFFILIATION_STANDING_NOT_FOUND);
  });

  it('never leaks a non-AppError as anything but a generic 500', async () => {
    const executor = new ThrowingExecutor(new Error('SELECT * FROM secret'));
    const result = await handleStandingHttpTransition(executor, httpReq());
    expect(result.status).toBe(500);
    expect(result.body['message']).toBe('Internal server error.');
    expect(JSON.stringify(result.body)).not.toContain('secret');
  });
});
