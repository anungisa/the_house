import { describe, it, expect } from 'vitest';
import { GovernanceKernel } from '../../../src/governance/kernel/GovernanceKernel.js';
import { GuardRegistry } from '../../../src/governance/guards/GuardRegistry.js';
import { AppError, ErrorCode } from '../../../src/shared/errors/AppError.js';
import type {
  TransitionActor,
  TransitionContext,
  TransitionInput,
} from '../../../src/governance/types/TransitionTypes.js';
import {
  buildKernelHarness,
  makeInput,
  memberActor,
  reviewerActor,
  ctx,
  ALL_PASS_FACTS,
} from '../../helpers/affiliationKernel.js';

/**
 * GovernanceKernel vertical-slice tests (AffiliationApplication v1), in-memory store.
 */
describe('GovernanceKernel.transition', () => {
  it('executes a low-risk transition (draft -> submitted) and enqueues exactly one outbox message', async () => {
    const h = buildKernelHarness();
    const result = await h.kernel.transition(
      makeInput({ entityId: 'app-1', trigger: 'submit', idempotencyKey: 'k1' }),
    );

    expect(result.status).toBe('executed');
    expect(result.fromState).toBe('draft');
    expect(result.toState).toBe('submitted');

    expect(h.store.data.entityStates).toHaveLength(1);
    expect(h.store.data.entityStates[0]!.currentState).toBe('submitted');
    expect(h.store.data.stateTransitions).toHaveLength(1);
    expect(h.store.data.auditEvents).toHaveLength(1);
    expect(h.store.data.outbox).toHaveLength(1);
    // Low-risk submit requires no evidence.
    expect(h.store.data.evidenceObjects).toHaveLength(0);
    // Outbox causation id is the state transition id.
    expect(h.store.data.outbox[0]!.causationId).toBe(h.store.data.stateTransitions[0]!.id);
    expect(h.store.data.outbox[0]!.dedupeKey).toBe('AffiliationApplication:app-1:k1');
  });

  it('denies an unknown transition (fail closed) with UNKNOWN_TRANSITION', async () => {
    const h = buildKernelHarness();
    // 'approve' is not valid from the initial 'draft' state.
    await expect(
      h.kernel.transition(
        makeInput({ entityId: 'app-2', trigger: 'approve', idempotencyKey: 'k1' }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.UNKNOWN_TRANSITION });
  });

  it('denies an unknown guard code (fail closed) with UNKNOWN_GUARD', async () => {
    // Build a harness but DO NOT register guard handlers; the seed still binds guards.
    const h = buildKernelHarness({ registerGuards: false });
    await expect(
      h.kernel.transition(
        makeInput({ entityId: 'app-3', trigger: 'submit', idempotencyKey: 'k1' }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.UNKNOWN_GUARD });
  });

  it('blocks a transition when a guard fails (rejected, no state mutation)', async () => {
    const h = buildKernelHarness();
    const result = await h.kernel.transition(
      makeInput({
        entityId: 'app-4',
        trigger: 'submit',
        idempotencyKey: 'k1',
        payload: { facts: { ...ALL_PASS_FACTS, requiredDocsPresent: false } },
      }),
    );

    expect(result.status).toBe('rejected');
    expect(result.reasonCode).toBe(ErrorCode.GUARD_FAILED);
    // No state created/mutated; no journal/audit/outbox.
    expect(h.store.data.entityStates).toHaveLength(0);
    expect(h.store.data.stateTransitions).toHaveLength(0);
    expect(h.store.data.outbox).toHaveLength(0);
    // Guard results ARE persisted for auditability.
    expect(h.store.data.guardResults.length).toBeGreaterThan(0);
  });

  it('denies a high-risk transition when the actor lacks reviewer scope (PERMISSION_DENIED)', async () => {
    const h = buildKernelHarness();
    await h.kernel.transition(makeInput({ entityId: 'app-5', trigger: 'submit', idempotencyKey: 's' }));
    await h.kernel.transition(
      makeInput({ entityId: 'app-5', trigger: 'review_start', idempotencyKey: 'r' }),
    );

    const result = await h.kernel.transition(
      makeInput({
        entityId: 'app-5',
        trigger: 'approve',
        idempotencyKey: 'a',
        actor: memberActor(),
      }),
    );
    expect(result.status).toBe('rejected');
    expect(result.reasonCode).toBe(ErrorCode.PERMISSION_DENIED);
    expect(h.store.data.entityStates[0]!.currentState).toBe('under_review');
  });

  it('creates a transition_request (approval_required) without mutating state, evidence, or outbox', async () => {
    const h = buildKernelHarness();
    await h.kernel.transition(makeInput({ entityId: 'app-6', trigger: 'submit', idempotencyKey: 's' }));
    await h.kernel.transition(
      makeInput({ entityId: 'app-6', trigger: 'review_start', idempotencyKey: 'r' }),
    );

    const result = await h.kernel.transition(
      makeInput({ entityId: 'app-6', trigger: 'approve', idempotencyKey: 'a' }),
    );

    expect(result.status).toBe('approval_required');
    expect(result.transitionRequestId).toBeDefined();
    expect(h.store.data.transitionRequests).toHaveLength(1);
    // No state mutation past under_review; no evidence; outbox only from submit + review_start.
    expect(h.store.data.entityStates[0]!.currentState).toBe('under_review');
    expect(h.store.data.evidenceObjects).toHaveLength(0);
    expect(h.store.data.outbox).toHaveLength(2);
  });

  it('writes evidence metadata for evidence-required executed transitions', async () => {
    const h = buildKernelHarness();
    await h.kernel.transition(makeInput({ entityId: 'app-7', trigger: 'submit', idempotencyKey: 's' }));
    await h.kernel.transition(
      makeInput({ entityId: 'app-7', trigger: 'review_start', idempotencyKey: 'r' }),
    );
    // Simulate an executed rejection (reject itself requires approval) to reach 'rejected'.
    h.store.data.entityStates[0]!.currentState = 'rejected';

    const result = await h.kernel.transition(
      makeInput({ entityId: 'app-7', trigger: 'close', idempotencyKey: 'c' }),
    );

    expect(result.status).toBe('executed');
    expect(result.toState).toBe('closed');
    expect(h.store.data.evidenceObjects).toHaveLength(1);
    expect(h.store.data.evidenceObjects[0]!.trigger).toBe('close');
  });

  it('evidence-required transition without a payload binding stays metadata-only', async () => {
    const h = buildKernelHarness();
    await h.kernel.transition(makeInput({ entityId: 'app-7a', trigger: 'submit', idempotencyKey: 's' }));
    await h.kernel.transition(
      makeInput({ entityId: 'app-7a', trigger: 'review_start', idempotencyKey: 'r' }),
    );
    h.store.data.entityStates[0]!.currentState = 'rejected';

    await h.kernel.transition(makeInput({ entityId: 'app-7a', trigger: 'close', idempotencyKey: 'c' }));

    expect(h.store.data.evidenceObjects).toHaveLength(1);
    expect(h.store.data.evidenceObjects[0]!.contentHash).toBeUndefined();
    expect(h.store.data.evidenceObjects[0]!.storageRef).toBeUndefined();
  });

  it('persists a supplied evidence payload binding onto kernel-created evidence metadata', async () => {
    const h = buildKernelHarness();
    await h.kernel.transition(makeInput({ entityId: 'app-7b', trigger: 'submit', idempotencyKey: 's' }));
    await h.kernel.transition(
      makeInput({ entityId: 'app-7b', trigger: 'review_start', idempotencyKey: 'r' }),
    );
    h.store.data.entityStates[0]!.currentState = 'rejected';

    const storageRef = JSON.stringify({
      provider: 'memory',
      container: 'evidence',
      key: 'tenants/t/evidence/e/' + 'a'.repeat(64),
      contentType: 'application/pdf',
      sizeBytes: 10,
      sha256: 'a'.repeat(64),
    });
    await h.kernel.transition(
      makeInput({
        entityId: 'app-7b',
        trigger: 'close',
        idempotencyKey: 'c',
        evidence: { contentHash: 'a'.repeat(64), storageRef },
      }),
    );

    expect(h.store.data.evidenceObjects).toHaveLength(1);
    expect(h.store.data.evidenceObjects[0]!.contentHash).toBe('a'.repeat(64));
    expect(h.store.data.evidenceObjects[0]!.storageRef).toBe(storageRef);
  });

  it('idempotent retry returns the previous result and does not duplicate writes', async () => {
    const h = buildKernelHarness();
    const input = makeInput({ entityId: 'app-8', trigger: 'submit', idempotencyKey: 'k1' });

    const first = await h.kernel.transition(input);
    const second = await h.kernel.transition(input);

    expect(first.status).toBe('executed');
    expect(second.status).toBe('idempotent_replay');
    expect(second.fromState).toBe('draft');
    expect(second.toState).toBe('submitted');

    expect(h.store.data.stateTransitions).toHaveLength(1);
    expect(h.store.data.outbox).toHaveLength(1);
    expect(h.store.data.entityStates).toHaveLength(1);
  });

  it('enforces tenant isolation: a different tenant cannot act on another tenant entity', async () => {
    const h = buildKernelHarness();
    await h.kernel.transition(makeInput({ entityId: 'app-9', trigger: 'submit', idempotencyKey: 's' }));
    await h.kernel.transition(
      makeInput({ entityId: 'app-9', trigger: 'review_start', idempotencyKey: 'r' }),
    );

    const tenantB = '22222222-2222-2222-2222-222222222222';
    await expect(
      h.kernel.transition(
        makeInput({
          entityId: 'app-9',
          trigger: 'approve',
          idempotencyKey: 'a',
          actor: reviewerActor(tenantB),
          context: ctx(tenantB),
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.UNKNOWN_TRANSITION });
  });

  it('rejects a cross-tenant request where actor and context tenants differ', async () => {
    const h = buildKernelHarness();
    const input: TransitionInput = makeInput({
      entityId: 'app-10',
      trigger: 'submit',
      idempotencyKey: 'k',
      actor: reviewerActor('33333333-3333-3333-3333-333333333333'),
      context: ctx('11111111-1111-1111-1111-111111111111'),
    });
    await expect(h.kernel.transition(input)).rejects.toBeInstanceOf(AppError);
    await expect(h.kernel.transition(input)).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
    });
  });

  it('fails closed when tenant context is missing', async () => {
    const h = buildKernelHarness();
    const input = makeInput({
      entityId: 'app-11',
      trigger: 'submit',
      idempotencyKey: 'k',
      context: { tenantId: '', scopeType: 'national_organization' },
    });
    await expect(h.kernel.transition(input)).rejects.toMatchObject({
      code: ErrorCode.TENANT_CONTEXT_MISSING,
    });
  });
});

/**
 * NSO-generic guarantee: core transition types must not require any curling-specific
 * fields (no ptsoId/clubId/curlerId). This compiles only because none are mandatory.
 */
describe('GovernanceKernel transition types stay NSO-generic', () => {
  it('builds a valid actor/context from generic scope fields alone', () => {
    const kernel = new GovernanceKernel({
      store: buildKernelHarness().store,
      guards: new GuardRegistry(),
    });
    expect(kernel).toBeInstanceOf(GovernanceKernel);

    const actor: TransitionActor = {
      actorId: 'a',
      tenantId: 't',
      scopeType: 'regional_organization',
    };
    const context: TransitionContext = { tenantId: 't', scopeType: 'regional_organization' };
    expect(actor.scopeType).toBe('regional_organization');
    expect(context.tenantId).toBe('t');
  });
});
