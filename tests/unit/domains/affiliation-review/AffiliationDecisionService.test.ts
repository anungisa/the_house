import { describe, expect, it, vi } from 'vitest';

import { AffiliationDecisionService } from '../../../../src/domains/affiliation-review/index.js';
import type { AffiliationApplicationService } from '../../../../src/domains/affiliation/index.js';
import type { AffiliationReviewService } from '../../../../src/domains/affiliation-review/index.js';
import type {
  WorkflowDecisionService,
  WorkflowStore,
} from '../../../../src/governance/workflow/index.js';
import type { ApprovedWorkflowExecutionService } from '../../../../src/governance/workflow/ApprovedWorkflowExecutionService.js';

const reviewCase = {
  applicationId: 'app-1',
  organizationId: 'org-1',
  seasonId: '2026',
  lifecycleState: 'approved' as const,
  submissionSequence: 1,
  submittedAt: '2026-01-01T00:00:00.000Z',
  assignedReviewerUserId: 'reviewer-1',
  requirements: [],
};

function service(
  lifecycleState: 'approved' | 'active',
  activateAffiliationApplication = vi.fn().mockResolvedValue({
    status: 'executed',
    applicationId: 'app-1',
    fromState: 'approved',
    toState: 'active',
  }),
): { service: AffiliationDecisionService; activateAffiliationApplication: ReturnType<typeof vi.fn> } {
  const reviews = {
    getCase: vi.fn().mockResolvedValue({ ...reviewCase, lifecycleState }),
  } as unknown as AffiliationReviewService;
  const transitions = { activateAffiliationApplication } as unknown as AffiliationApplicationService;
  return {
    service: new AffiliationDecisionService(
      reviews,
      transitions,
      {} as WorkflowStore,
      {} as WorkflowDecisionService,
      {} as ApprovedWorkflowExecutionService,
    ),
    activateAffiliationApplication,
  };
}

describe('AffiliationDecisionService activation', () => {
  it('routes approved activation through the governed application service', async () => {
    const subject = service('approved');
    const result = await subject.service.activate({
      tenantId: 'tenant-1',
      applicationId: 'app-1',
      actor: {
        userId: 'reviewer-1',
        roleKeys: ['reviewer'],
        organizationId: 'org-1',
      },
      idempotencyKey: 'activate:app-1',
      reason: 'Activate approved affiliation.',
    });

    expect(result).toEqual({ lifecycleState: 'active', idempotentReplay: false });
    expect(subject.activateAffiliationApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        applicationId: 'app-1',
        idempotencyKey: 'activate:app-1',
        context: { seasonId: '2026', organizationId: 'org-1' },
      }),
    );
  });

  it('treats an already-active case as an idempotent replay', async () => {
    const subject = service('active');
    await expect(
      subject.service.activate({
        tenantId: 'tenant-1',
        applicationId: 'app-1',
        actor: { userId: 'reviewer-1', roleKeys: ['reviewer'] },
        idempotencyKey: 'activate:app-1',
      }),
    ).resolves.toEqual({ lifecycleState: 'active', idempotentReplay: true });
    expect(subject.activateAffiliationApplication).not.toHaveBeenCalled();
  });
});
