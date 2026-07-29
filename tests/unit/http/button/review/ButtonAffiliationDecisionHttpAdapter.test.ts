import { describe, expect, it, vi } from 'vitest';

import type { AffiliationDecisionService } from '../../../../../src/domains/affiliation-review/index.js';
import {
  handleAffiliationActivation,
  handleAffiliationDecisionExecute,
  handleAffiliationDecisionProposal,
  handleAffiliationDecisionState,
  handleAffiliationTierDecision,
} from '../../../../../src/http/button/review/index.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const SCOPE = '22222222-2222-4222-8222-222222222222';
const APPLICATION = '33333333-3333-4333-8333-333333333333';
const WORKFLOW = '44444444-4444-4444-8444-444444444444';

function headers(role = 'reviewer'): Record<string, string> {
  return {
    'x-house-tenant-id': TENANT,
    'x-house-actor-user-id': 'reviewer-1',
    'x-house-actor-role-keys': role,
    'x-house-organization-id': SCOPE,
  };
}

const decisionState = {
  workflowInstanceId: WORKFLOW,
  outcome: 'reject' as const,
  status: 'pending' as const,
  currentStepCode: 'regional_signoff',
  executable: false,
  executed: false,
  steps: [],
};

describe('Button affiliation decision HTTP adapter', () => {
  it('returns no workflow as a successful empty decision state', async () => {
    const getState = vi.fn().mockResolvedValue(undefined);
    const result = await handleAffiliationDecisionState(
      { getState } as unknown as AffiliationDecisionService,
      { headers: headers(), query: {}, params: { applicationId: APPLICATION } },
      'req-state',
    );

    expect(result.status).toBe(200);
    expect(result.body['decisionState']).toBeNull();
    expect(getState).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ userId: 'reviewer-1', organizationId: SCOPE }),
      APPLICATION,
    );
  });

  it('creates a governed proposal with the trusted actor and idempotency key', async () => {
    const propose = vi.fn().mockResolvedValue(decisionState);
    const result = await handleAffiliationDecisionProposal(
      { propose } as unknown as AffiliationDecisionService,
      {
        headers: { ...headers(), 'idempotency-key': `decision:${APPLICATION}` },
        query: {},
        params: { applicationId: APPLICATION },
        body: { outcome: 'reject', reason: 'Requirements were not met.' },
      },
      'req-propose',
    );

    expect(result.status).toBe(201);
    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        applicationId: APPLICATION,
        outcome: 'reject',
        idempotencyKey: `decision:${APPLICATION}`,
      }),
    );
  });

  it('records only a valid tier decision', async () => {
    const decide = vi.fn().mockResolvedValue(decisionState);
    const result = await handleAffiliationTierDecision(
      { decide } as unknown as AffiliationDecisionService,
      {
        headers: headers('regional_reviewer'),
        query: {},
        params: { applicationId: APPLICATION },
        body: {
          workflowInstanceId: WORKFLOW,
          stepCode: 'regional_signoff',
          decision: 'approve',
          reason: 'Regional review complete.',
        },
      },
      'req-tier',
    );

    expect(result.status).toBe(200);
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowInstanceId: WORKFLOW,
        stepCode: 'regional_signoff',
        decision: 'approve',
      }),
    );
  });

  it('executes an approved workflow explicitly and rejects malformed outcomes', async () => {
    const execute = vi.fn().mockResolvedValue({
      lifecycleState: 'rejected',
      idempotentReplay: false,
    });
    const service = { execute } as unknown as AffiliationDecisionService;
    const result = await handleAffiliationDecisionExecute(
      service,
      {
        headers: { ...headers(), 'idempotency-key': `execute:${WORKFLOW}` },
        query: {},
        params: { applicationId: APPLICATION },
        body: { workflowInstanceId: WORKFLOW },
      },
      'req-execute',
    );
    expect(result.status).toBe(200);
    expect(result.body['execution']).toEqual({
      lifecycleState: 'rejected',
      idempotentReplay: false,
    });

    const invalid = await handleAffiliationDecisionProposal(
      service,
      {
        headers: headers(),
        query: {},
        params: { applicationId: APPLICATION },
        body: { outcome: 'maybe', reason: 'No.' },
      },
      'req-invalid',
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body['code']).toBe('INVALID_INPUT');
  });

  it('activates an approved application through the governed service', async () => {
    const activate = vi.fn().mockResolvedValue({
      lifecycleState: 'active',
      idempotentReplay: false,
    });
    const result = await handleAffiliationActivation(
      { activate } as unknown as AffiliationDecisionService,
      {
        headers: { ...headers(), 'idempotency-key': `activate:${APPLICATION}` },
        query: {},
        params: { applicationId: APPLICATION },
        body: { reason: 'Activate approved affiliation.' },
      },
      'req-activate',
    );

    expect(result.status).toBe(200);
    expect(result.body['activation']).toEqual({
      lifecycleState: 'active',
      idempotentReplay: false,
    });
    expect(activate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        applicationId: APPLICATION,
        idempotencyKey: `activate:${APPLICATION}`,
      }),
    );
  });
});
