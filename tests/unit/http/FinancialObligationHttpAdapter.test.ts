import { describe, it, expect } from 'vitest';
import {
  handleFinancialObligationHttpTransition,
  type FinancialObligationCommandExecutor,
  type FinancialObligationHttpRequest,
} from '../../../src/http/finance/FinancialObligationHttpAdapter.js';
import { FINANCIAL_OBLIGATION_COMMANDS } from '../../../src/domains/affiliation-finance/index.js';
import { RECONCILE_OBLIGATION_COMMAND } from '../../../src/domains/affiliation-finance/FinancialObligationCommands.js';
import type {
  FinancialObligationTransitionRequest,
  FinancialObligationTransitionResponse,
} from '../../../src/domains/affiliation-finance/index.js';
import { AppError, ErrorCode } from '../../../src/shared/errors/AppError.js';

/**
 * AffiliationFinancialObligation HTTP adapter unit tests.
 *
 * The adapter is a THIN, protocol-pure transport ({ status, body }) over the domain boundary
 * (`executeCommand`). These proofs show it: routes every action through the boundary exactly once
 * with the mapped command, takes tenant/actor from the trusted identity context (not governed
 * facts), rejects caller-supplied guard facts, and maps response DTOs / thrown AppErrors to the
 * documented HTTP status codes without leaking internals.
 */

class RecordingExecutor implements FinancialObligationCommandExecutor {
  public readonly calls: { command: string; request: FinancialObligationTransitionRequest }[] = [];
  constructor(
    private readonly response: FinancialObligationTransitionResponse = {
      status: 'executed',
      obligationId: 'obl-1',
      fromState: 'unassessed',
      toState: 'assessed',
    },
  ) {}
  executeCommand(
    command: string,
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse> {
    this.calls.push({ command, request });
    return Promise.resolve(this.response);
  }
}

/** An executor that always throws the given AppError (proves error mapping). */
class ThrowingExecutor implements FinancialObligationCommandExecutor {
  constructor(private readonly err: unknown) {}
  executeCommand(): Promise<FinancialObligationTransitionResponse> {
    return Promise.reject(this.err);
  }
}

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenantId: 'tenant-1',
    actor: { userId: 'user-1', roleKeys: ['financial_assessor'] },
    idempotencyKey: 'k1',
    ...over,
  };
}

function httpReq(
  over: Partial<FinancialObligationHttpRequest> & { body?: unknown } = {},
): FinancialObligationHttpRequest {
  return {
    obligationId: over.obligationId ?? 'obl-1',
    action: over.action ?? 'assess',
    headers: over.headers ?? {},
    body: 'body' in over ? over.body : validBody(),
  };
}

describe('AffiliationFinancialObligation HTTP adapter', () => {
  it('routes a valid assess to executeCommand exactly once with the mapped command', async () => {
    const executor = new RecordingExecutor();
    const result = await handleFinancialObligationHttpTransition(executor, httpReq());
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0]!.command).toBe('assessObligation');
    expect(executor.calls[0]!.request.obligationId).toBe('obl-1');
    // Tenant + actor come from the trusted context, not from governed facts.
    expect(executor.calls[0]!.request.tenantId).toBe('tenant-1');
    expect(executor.calls[0]!.request.actor.userId).toBe('user-1');
    expect(result.status).toBe(200);
  });

  it('maps every 1:1 URL action to its domain command', async () => {
    for (const [command, action] of Object.entries(FINANCIAL_OBLIGATION_COMMANDS)) {
      const executor = new RecordingExecutor();
      await handleFinancialObligationHttpTransition(executor, httpReq({ action }));
      expect(executor.calls[0]!.command).toBe(command);
    }
  });

  it('maps the reconcile action to the deterministic reconcile command', async () => {
    const executor = new RecordingExecutor();
    await handleFinancialObligationHttpTransition(executor, httpReq({ action: 'reconcile' }));
    expect(executor.calls[0]!.command).toBe(RECONCILE_OBLIGATION_COMMAND);
  });

  it('rejects record_mismatch as a client action (system-derived only)', async () => {
    const executor = new RecordingExecutor();
    const result = await handleFinancialObligationHttpTransition(
      executor,
      httpReq({ action: 'record_mismatch' }),
    );
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  it('rejects an unknown action with 400 and never calls the boundary', async () => {
    const executor = new RecordingExecutor();
    const result = await handleFinancialObligationHttpTransition(
      executor,
      httpReq({ action: 'frobnicate' }),
    );
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  it('rejects caller-supplied guard facts with 400', async () => {
    const executor = new RecordingExecutor();
    const result = await handleFinancialObligationHttpTransition(
      executor,
      httpReq({ body: validBody({ facts: { accountingConfirmed: true } }) }),
    );
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  it('reads command details from body.details and forwards them to the boundary', async () => {
    const executor = new RecordingExecutor();
    await handleFinancialObligationHttpTransition(
      executor,
      httpReq({
        action: 'confirm',
        body: validBody({
          reason: 'accounting confirmation',
          details: { externalReference: 'ACC-1', amount: '100.00', currency: 'CAD' },
        }),
      }),
    );
    expect(executor.calls[0]!.command).toBe('confirmObligation');
    expect(executor.calls[0]!.request.details).toEqual({
      externalReference: 'ACC-1',
      amount: '100.00',
      currency: 'CAD',
    });
    expect(executor.calls[0]!.request.reason).toBe('accounting confirmation');
  });

  it('rejects an Idempotency-Key header that disagrees with the body key (400)', async () => {
    const executor = new RecordingExecutor();
    const result = await handleFinancialObligationHttpTransition(
      executor,
      httpReq({ headers: { 'idempotency-key': 'other' }, body: validBody({ idempotencyKey: 'k1' }) }),
    );
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  it('maps a rejected (permission) response DTO to 403', async () => {
    const executor = new RecordingExecutor({
      status: 'rejected',
      obligationId: 'obl-1',
      code: ErrorCode.PERMISSION_DENIED,
      message: 'not authorized',
    });
    const result = await handleFinancialObligationHttpTransition(executor, httpReq());
    expect(result.status).toBe(403);
  });

  it('maps a thrown FINANCIAL_OBLIGATION_NOT_FOUND to 404', async () => {
    const executor = new ThrowingExecutor(
      new AppError(ErrorCode.FINANCIAL_OBLIGATION_NOT_FOUND, 'missing'),
    );
    const result = await handleFinancialObligationHttpTransition(executor, httpReq());
    expect(result.status).toBe(404);
    expect(result.body['code']).toBe(ErrorCode.FINANCIAL_OBLIGATION_NOT_FOUND);
  });

  it('never leaks a non-AppError as anything but a generic 500', async () => {
    const executor = new ThrowingExecutor(new Error('SELECT * FROM secret'));
    const result = await handleFinancialObligationHttpTransition(executor, httpReq());
    expect(result.status).toBe(500);
    expect(result.body['message']).toBe('Internal server error.');
    expect(JSON.stringify(result.body)).not.toContain('secret');
  });
});
