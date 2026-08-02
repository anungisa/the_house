import { describe, expect, it, vi } from 'vitest';

import { AffiliationDecisionService } from '../../../../src/domains/affiliation-review/index.js';
import type { AffiliationApplicationService } from '../../../../src/domains/affiliation/index.js';
import type { AffiliationReviewService } from '../../../../src/domains/affiliation-review/index.js';
import type {
  WorkflowDecisionService,
  WorkflowStore,
} from '../../../../src/governance/workflow/index.js';
import type { ApprovedWorkflowExecutionService } from '../../../../src/governance/workflow/ApprovedWorkflowExecutionService.js';
import { ErrorCode } from '../../../../src/shared/errors/AppError.js';

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

describe('AffiliationDecisionService proposal conflict', () => {
  const workflowDetail = {
    instance: {
      id: 'wf-1',
      status: 'pending' as const,
      requestedToState: 'approved',
      executed: false,
    },
    steps: [],
  };

  function proposeService() {
    const reviews = {
      getCase: vi.fn().mockResolvedValue(reviewCase),
    } as unknown as AffiliationReviewService;
    const transitions = {
      approveAffiliationApplication: vi.fn(),
      rejectAffiliationApplication: vi.fn(),
    } as unknown as AffiliationApplicationService;
    const workflows = {
      // An existing APPROVE decision workflow is already open for this application.
      listWorkflows: vi
        .fn()
        .mockResolvedValue({ items: [{ id: 'wf-1', createdAt: '2026-01-01T00:00:00.000Z' }] }),
      getWorkflowDetail: vi.fn().mockResolvedValue(workflowDetail),
    } as unknown as WorkflowStore;
    return {
      transitions,
      service: new AffiliationDecisionService(
        reviews,
        transitions,
        workflows,
        {} as WorkflowDecisionService,
        {} as ApprovedWorkflowExecutionService,
      ),
    };
  }

  const actor = { userId: 'reviewer-1', roleKeys: ['reviewer'], organizationId: 'org-1' };

  it('returns the existing decision when the same outcome is re-proposed (idempotent)', async () => {
    const subject = proposeService();
    const result = await subject.service.propose({
      tenantId: 'tenant-1',
      applicationId: 'app-1',
      actor,
      outcome: 'approve',
      reason: 'Approve affiliation.',
      idempotencyKey: 'propose:app-1',
    });

    expect(result.outcome).toBe('approve');
    expect(subject.transitions.approveAffiliationApplication).not.toHaveBeenCalled();
  });

  it('rejects a conflicting outcome against an open decision (fail closed \u2192 AFFILIATION_REVIEW_CONFLICT)', async () => {
    const subject = proposeService();
    await expect(
      subject.service.propose({
        tenantId: 'tenant-1',
        applicationId: 'app-1',
        actor,
        outcome: 'reject',
        reason: 'Reject affiliation.',
        idempotencyKey: 'propose:app-1',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.AFFILIATION_REVIEW_CONFLICT });
    expect(subject.transitions.rejectAffiliationApplication).not.toHaveBeenCalled();
  });
});
