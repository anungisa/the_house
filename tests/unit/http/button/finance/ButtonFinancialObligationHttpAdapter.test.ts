import { describe, expect, it, vi } from 'vitest';

import type {
  FinancialObligationReviewService,
  FinancialObligationService,
} from '../../../../../src/domains/affiliation-finance/index.js';
import {
  handleFinancialObligationQueue,
  handleFinancialObligationReconciliation,
} from '../../../../../src/http/button/finance/index.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const SCOPE = '22222222-2222-4222-8222-222222222222';
const OBLIGATION = '33333333-3333-4333-8333-333333333333';

function headers(): Record<string, string> {
  return {
    'x-house-tenant-id': TENANT,
    'x-house-actor-user-id': 'finance-user',
    'x-house-actor-role-keys': 'financial_reconciler',
    'x-house-organization-id': SCOPE,
  };
}

describe('Button financial obligation HTTP adapter', () => {
  it('lists only through the tenant-scoped financial review service', async () => {
    const listQueue = vi.fn().mockResolvedValue([{ obligationId: OBLIGATION }]);
    const result = await handleFinancialObligationQueue(
      { listQueue } as unknown as FinancialObligationReviewService,
      { headers: headers() },
      'request-list',
    );

    expect(result.status).toBe(200);
    expect(result.body['items']).toEqual([{ obligationId: OBLIGATION }]);
    expect(listQueue).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        userId: 'finance-user',
        roleKeys: ['financial_reconciler'],
        organizationId: SCOPE,
      }),
    );
  });

  it('maps reconciliation to the governed command using trusted identity and idempotency', async () => {
    const executeCommand = vi.fn().mockResolvedValue({
      status: 'executed',
      obligationId: OBLIGATION,
      fromState: 'confirmed',
      toState: 'reconciled',
    });
    const result = await handleFinancialObligationReconciliation(
      { executeCommand } as unknown as FinancialObligationService,
      {
        headers: { ...headers(), 'idempotency-key': `reconcile:${OBLIGATION}` },
        params: { obligationId: OBLIGATION },
        body: { reason: 'Accounting-confirmed amount matches the assessment.' },
      },
      'request-reconcile',
    );

    expect(result.status).toBe(200);
    expect(executeCommand).toHaveBeenCalledWith(
      'reconcileObligation',
      expect.objectContaining({
        tenantId: TENANT,
        obligationId: OBLIGATION,
        idempotencyKey: `reconcile:${OBLIGATION}`,
        actor: expect.objectContaining({ userId: 'finance-user' }),
      }),
    );
  });
});
