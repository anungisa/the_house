import { describe, it, expect } from 'vitest';
import { AppError, ErrorCode } from '../../../../src/shared/errors/AppError.js';
import type {
  TransitionInput,
  TransitionResult,
} from '../../../../src/governance/types/TransitionTypes.js';
import {
  AffiliationApplicationService,
  type AffiliationKernelPort,
} from '../../../../src/domains/affiliation/AffiliationApplicationService.js';
import {
  AFFILIATION_APPLICATION_COMMANDS,
} from '../../../../src/domains/affiliation/AffiliationApplicationCommands.js';
import { handleAffiliationApplicationTransition } from '../../../../src/domains/affiliation/AffiliationApplicationHandler.js';
import { suggestIdempotencyKey } from '../../../../src/domains/affiliation/AffiliationApplicationErrors.js';
import type { AffiliationApplicationTransitionRequest } from '../../../../src/domains/affiliation/AffiliationApplicationDtos.js';

/**
 * Boundary unit tests — fake kernel only. These prove the domain API boundary reaches the
 * governed path WITHOUT bypassing it: the service's only collaborator is the kernel's
 * transition() method; it owns no store/tx and cannot mutate governed state.
 */

class FakeKernel implements AffiliationKernelPort {
  public readonly calls: TransitionInput[] = [];
  constructor(private readonly result: TransitionResult) {}
  transition(input: TransitionInput): Promise<TransitionResult> {
    this.calls.push(input);
    return Promise.resolve(this.result);
  }
}

function executedResult(over: Partial<TransitionResult> = {}): TransitionResult {
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

function validRequest(
  over: Partial<AffiliationApplicationTransitionRequest> = {},
): AffiliationApplicationTransitionRequest {
  return {
    tenantId: 'tenant-1',
    applicationId: 'app-1',
    actor: { userId: 'user-1', roleKeys: ['reviewer'] },
    context: { seasonId: '2025-26' },
    idempotencyKey: 'k1',
    reason: 'because',
    ...over,
  };
}

describe('AffiliationApplication domain API boundary', () => {
  // (1) each command maps to exactly one correct trigger
  it('maps every command to its correct FSM trigger', async () => {
    for (const [command, trigger] of Object.entries(AFFILIATION_APPLICATION_COMMANDS)) {
      const kernel = new FakeKernel(executedResult({ trigger }));
      const service = new AffiliationApplicationService(kernel);
      await service.executeCommand(command, validRequest());
      expect(kernel.calls).toHaveLength(1);
      expect(kernel.calls[0]!.trigger).toBe(trigger);
      expect(kernel.calls[0]!.entityType).toBe('AffiliationApplication');
    }
  });

  // (2-5) DTO validation rejects missing required fields
  it('rejects a request missing tenantId', async () => {
    const service = new AffiliationApplicationService(new FakeKernel(executedResult()));
    await expect(
      service.submitAffiliationApplication(validRequest({ tenantId: '' })),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects a request missing applicationId', async () => {
    const service = new AffiliationApplicationService(new FakeKernel(executedResult()));
    await expect(
      service.submitAffiliationApplication(validRequest({ applicationId: '' })),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects a request missing actor.userId', async () => {
    const service = new AffiliationApplicationService(new FakeKernel(executedResult()));
    await expect(
      service.submitAffiliationApplication(validRequest({ actor: { userId: '' } })),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects a request missing idempotencyKey', async () => {
    const service = new AffiliationApplicationService(new FakeKernel(executedResult()));
    await expect(
      service.submitAffiliationApplication(validRequest({ idempotencyKey: '' })),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects a high-risk command missing reason', async () => {
    const service = new AffiliationApplicationService(new FakeKernel(executedResult()));
    await expect(
      service.approveAffiliationApplication(validRequest({ reason: undefined })),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  // (6) unknown command fails closed (no kernel call)
  it('fails closed on an unknown command', async () => {
    const kernel = new FakeKernel(executedResult());
    const service = new AffiliationApplicationService(kernel);
    await expect(
      handleAffiliationApplicationTransition(service, 'deleteAffiliationApplication', validRequest()),
    ).rejects.toBeInstanceOf(AppError);
    expect(kernel.calls).toHaveLength(0);
  });

  // (7) service calls kernel.transition() exactly once for a valid command
  it('calls kernel.transition() exactly once for a valid command', async () => {
    const kernel = new FakeKernel(executedResult());
    const service = new AffiliationApplicationService(kernel);
    await service.submitAffiliationApplication(validRequest());
    expect(kernel.calls).toHaveLength(1);
  });

  // (8) service never mutates state directly — outcome state is derived solely from the kernel
  it('derives outcome state from the kernel, never inventing state', async () => {
    const kernel = new FakeKernel(executedResult({ fromState: 'draft', toState: 'submitted' }));
    const service = new AffiliationApplicationService(kernel);
    const res = await service.submitAffiliationApplication(validRequest());
    expect(res.status).toBe('executed');
    if (res.status === 'executed') {
      // toState comes from the kernel result, not from the boundary.
      expect(res.toState).toBe('submitted');
    }
    // The only governed interaction is the single kernel call.
    expect(kernel.calls).toHaveLength(1);
  });

  // (9) executed -> executed DTO (with surfaced governed-record ids, no raw rows)
  it('maps an executed kernel result to an executed response DTO', async () => {
    const kernel = new FakeKernel(
      executedResult({ evidenceObjectId: 'ev-1', stateTransitionId: 'st-9', auditEventId: 'au-9' }),
    );
    const service = new AffiliationApplicationService(kernel);
    const res = await service.submitAffiliationApplication(validRequest());
    expect(res).toEqual({
      status: 'executed',
      applicationId: 'app-1',
      fromState: 'draft',
      toState: 'submitted',
      transitionId: 'st-9',
      auditEventId: 'au-9',
      evidenceObjectId: 'ev-1',
    });
  });

  // (10) approval_required -> approval_required DTO
  it('maps an approval_required kernel result to an approval_required response DTO', async () => {
    const kernel = new FakeKernel({
      status: 'approval_required',
      entityType: 'AffiliationApplication',
      entityId: 'app-1',
      trigger: 'approve',
      fromState: 'under_review',
      toState: 'approved',
      transitionRequestId: 'req-1',
      idempotencyKey: 'k1',
    });
    const service = new AffiliationApplicationService(kernel);
    const res = await service.approveAffiliationApplication(validRequest());
    expect(res).toEqual({
      status: 'approval_required',
      applicationId: 'app-1',
      transitionRequestId: 'req-1',
      currentState: 'under_review',
      requestedToState: 'approved',
    });
  });

  // (11) rejected -> rejected DTO with failed guard codes
  it('maps a rejected kernel result to a rejected response DTO', async () => {
    const kernel = new FakeKernel({
      status: 'rejected',
      entityType: 'AffiliationApplication',
      entityId: 'app-1',
      trigger: 'approve',
      fromState: 'under_review',
      toState: 'approved',
      reasonCode: ErrorCode.GUARD_FAILED,
      reasonMessage: 'Fees unpaid.',
      guardResults: [
        { guardCode: 'AFFILIATION_FEES_PAID', passed: false, message: 'unpaid' },
        { guardCode: 'AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS', passed: true },
      ],
      idempotencyKey: 'k1',
    });
    const service = new AffiliationApplicationService(kernel);
    const res = await service.approveAffiliationApplication(validRequest());
    expect(res).toEqual({
      status: 'rejected',
      applicationId: 'app-1',
      code: ErrorCode.GUARD_FAILED,
      message: 'Fees unpaid.',
      failedGuards: ['AFFILIATION_FEES_PAID'],
    });
  });

  // (12) idempotency key passes through to the kernel unchanged
  it('passes the idempotency key through to the kernel unchanged', async () => {
    const kernel = new FakeKernel(executedResult());
    const service = new AffiliationApplicationService(kernel);
    await service.submitAffiliationApplication(validRequest({ idempotencyKey: 'caller-key-xyz' }));
    expect(kernel.calls[0]!.idempotencyKey).toBe('caller-key-xyz');
  });

  // (13) NSO-generic scope/hierarchy fields are preserved through the mapper
  it('preserves NSO-generic scope and hierarchy fields', async () => {
    const kernel = new FakeKernel(executedResult());
    const service = new AffiliationApplicationService(kernel);
    await service.submitAffiliationApplication(
      validRequest({
        actor: {
          userId: 'user-1',
          roleKeys: ['reviewer'],
          permissionKeys: ['affiliation:submit'],
          scopeType: 'national_organization',
          nationalOrganizationId: 'nat-1',
          regionalOrganizationId: 'reg-1',
          localOrganizationId: 'loc-1',
          organizationId: 'org-1',
          organizationUnitId: 'ou-1',
        },
        context: {
          seasonId: '2025-26',
          scopeType: 'national_organization',
          nationalOrganizationId: 'nat-1',
          correlationId: 'corr-1',
        },
      }),
    );
    const input = kernel.calls[0]!;
    expect(input.actor.scopeType).toBe('national_organization');
    expect(input.actor.nationalOrganizationId).toBe('nat-1');
    expect(input.actor.regionalOrganizationId).toBe('reg-1');
    expect(input.actor.localOrganizationId).toBe('loc-1');
    expect(input.actor.roles).toEqual(['reviewer']);
    expect(input.context.nationalOrganizationId).toBe('nat-1');
    expect(input.context.correlationId).toBe('corr-1');
    // seasonId + permissionKeys carried as opaque workflow metadata (no FSM season state).
    expect(input.context.workflowMetadata).toMatchObject({
      seasonId: '2025-26',
      permissionKeys: ['affiliation:submit'],
    });
  });

  // (14) core DTOs require no curling/sport-specific fields
  it('accepts a request built from NSO-generic fields only (no sport-specific fields)', async () => {
    const kernel = new FakeKernel(executedResult());
    const service = new AffiliationApplicationService(kernel);
    // Compiles and runs using only generic fields — no ptsoId/clubId/curlerId required.
    const res = await service.submitAffiliationApplication({
      tenantId: 'tenant-1',
      applicationId: 'app-1',
      actor: { userId: 'user-1' },
      context: { seasonId: '2025-26' },
      idempotencyKey: suggestIdempotencyKey({
        tenantId: 'tenant-1',
        applicationId: 'app-1',
        trigger: 'submit',
        seasonId: '2025-26',
        actorUserId: 'user-1',
      }),
    });
    expect(res.status).toBe('executed');
  });

  it('suggests a deterministic idempotency key shape', () => {
    expect(
      suggestIdempotencyKey({
        tenantId: 't',
        applicationId: 'a',
        trigger: 'approve',
        seasonId: 's',
        actorUserId: 'u',
      }),
    ).toBe('t:AffiliationApplication:a:approve:s:u');
  });
});
