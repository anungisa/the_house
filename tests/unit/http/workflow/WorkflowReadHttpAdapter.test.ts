import { describe, it, expect } from 'vitest';

import {
  handleWorkflowList,
  handleWorkflowDetail,
  type WorkflowReadHttpDeps,
} from '../../../../src/http/workflow/WorkflowReadHttpAdapter.js';
import { handleWorkflowDecision } from '../../../../src/http/workflow/WorkflowHttpAdapter.js';
import { handleWorkflowExecution } from '../../../../src/http/workflow/WorkflowExecutionHttpAdapter.js';
import type {
  RecordWorkflowDecisionInput,
  WorkflowDecisionOutcome,
} from '../../../../src/governance/workflow/WorkflowDecisionService.js';
import type { ExecuteApprovedWorkflowInput } from '../../../../src/governance/workflow/ApprovedWorkflowExecutionService.js';
import type { ExecuteApprovedTransitionResult } from '../../../../src/governance/types/TransitionTypes.js';
import { InMemoryWorkflowStore } from '../../../../src/governance/workflow/InMemoryWorkflowStore.js';
import { InMemoryGovernanceStore } from '../../../../src/governance/store/InMemoryGovernanceStore.js';
import type {
  WorkflowBacking,
  WorkflowInstanceRecord,
  WorkflowInstanceStatus,
  WorkflowReviewTier,
  WorkflowStepRecord,
} from '../../../../src/governance/workflow/WorkflowTypes.js';
import type {
  WorkflowListResult,
  WorkflowReadStore,
} from '../../../../src/governance/workflow/WorkflowStore.js';
import type { WorkflowDetailView } from '../../../../src/governance/workflow/WorkflowTypes.js';
import { DemoAuthContextResolver } from '../../../../src/http/auth/DemoAuthContextResolver.js';
import type { AuthContext } from '../../../../src/http/auth/AuthContext.js';
import type {
  AuthContextResolver,
  AuthResolveInput,
} from '../../../../src/http/auth/AuthContextResolver.js';

/**
 * Unit tests for the workflow admin READ HTTP adapter (list + detail).
 *
 * Protocol-pure: handlers are called directly with parsed request shapes. Identity is carried
 * in the shared `x-house-*` trusted-header contract. NO database, NO Docker, and NO real Azure
 * or Entra are required. These endpoints are READ-ONLY: they never mutate governed state,
 * record decisions, or execute a transition.
 */

const DEMO = new DemoAuthContextResolver();

/** Headers with a tenant + a workflow-read role (regional_reviewer grants read in v1). */
function readerHeaders(
  tenantId = 'tenant-a',
  userId = 'op-1',
  extra: Record<string, string> = {},
): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': userId,
    'x-house-actor-role-keys': 'regional_reviewer',
    ...extra,
  };
}

let seq = 0;
function makeInstance(over: Partial<WorkflowInstanceRecord> = {}): WorkflowInstanceRecord {
  seq += 1;
  const createdAt = over.createdAt ?? `2024-01-01T00:00:${String(seq).padStart(2, '0')}.000Z`;
  return {
    id: over.id ?? `wf-${seq}`,
    tenantId: over.tenantId ?? 'tenant-a',
    transitionRequestId: over.transitionRequestId ?? `tr-${seq}`,
    entityType: over.entityType ?? 'AffiliationApplication',
    entityId: over.entityId ?? `app-${seq}`,
    workflowType: over.workflowType ?? 'affiliation_two_tier_review',
    status: over.status ?? 'pending',
    currentStepCode: over.currentStepCode ?? 'regional_signoff',
    createdAt,
    updatedAt: over.updatedAt ?? createdAt,
  };
}

function makeStep(
  instanceId: string,
  stepCode: string,
  stepOrder: number,
  reviewTier: WorkflowReviewTier,
  over: Partial<WorkflowStepRecord> = {},
): WorkflowStepRecord {
  seq += 1;
  return {
    id: over.id ?? `step-${seq}`,
    tenantId: over.tenantId ?? 'tenant-a',
    workflowInstanceId: instanceId,
    stepCode,
    stepOrder,
    reviewTier,
    required: over.required ?? true,
    status: over.status ?? 'pending',
    assignedScopeType: over.assignedScopeType,
    assignedScopeId: over.assignedScopeId,
    assignedRoleKey:
      over.assignedRoleKey ??
      (reviewTier === 'regional_review' ? 'regional_reviewer' : 'national_reviewer'),
    decidedByUserId: over.decidedByUserId,
    decidedAt: over.decidedAt,
    decisionReason: over.decisionReason,
  };
}

function backing(over: Partial<WorkflowBacking> = {}): WorkflowBacking {
  return { instances: over.instances ?? [], steps: over.steps ?? [], decisions: over.decisions ?? [] };
}

function deps(store: WorkflowReadStore): WorkflowReadHttpDeps {
  return { readStore: store };
}

describe('workflow admin read HTTP adapter', () => {
  // (1) list requires authentication (no tenant identity → 401).
  it('(1) list requires authentication', async () => {
    const store = new InMemoryWorkflowStore(backing());
    const result = await handleWorkflowList(
      deps(store),
      { headers: {}, query: {} },
      'req-1',
      DEMO,
    );
    expect(result.status).toBe(401);
  });

  // (2) list requires the workflow-read permission OR a reviewer role.
  it('(2) list denies an authenticated actor lacking read access (403)', async () => {
    const store = new InMemoryWorkflowStore(backing());
    const result = await handleWorkflowList(
      deps(store),
      {
        headers: {
          'x-house-tenant-id': 'tenant-a',
          'x-house-actor-user-id': 'op-1',
          'x-house-actor-role-keys': 'member',
        },
        query: {},
      },
      'req-2',
      DEMO,
    );
    expect(result.status).toBe(403);
  });

  // (2b) the workflow.read permission alone grants access.
  it('(2b) list allows an actor holding the workflow.read permission', async () => {
    const inst = makeInstance();
    const store = new InMemoryWorkflowStore(backing({ instances: [inst] }));
    const result = await handleWorkflowList(
      deps(store),
      {
        headers: {
          'x-house-tenant-id': 'tenant-a',
          'x-house-actor-user-id': 'op-1',
          'x-house-actor-permission-keys': 'workflow.read',
        },
        query: {},
      },
      'req-2b',
      DEMO,
    );
    expect(result.status).toBe(200);
  });

  // (3) list returns a pending workflow summary with an execution hint.
  it('(3) list returns a pending workflow summary', async () => {
    const inst = makeInstance({ id: 'wf-a', status: 'pending', transitionRequestId: 'tr-a' });
    const store = new InMemoryWorkflowStore(backing({ instances: [inst] }));
    const result = await handleWorkflowList(
      deps(store),
      { headers: readerHeaders(), query: {} },
      'req-3',
      DEMO,
    );
    expect(result.status).toBe(200);
    const items = result.body['items'] as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      workflowInstanceId: 'wf-a',
      transitionRequestId: 'tr-a',
      entityType: 'AffiliationApplication',
      status: 'pending',
      execution: { executable: false, reason: 'workflow_not_approved' },
    });
  });

  // (4) list filters by status.
  it('(4) list filters by status', async () => {
    const pending = makeInstance({ id: 'wf-p', status: 'pending' });
    const approved = makeInstance({ id: 'wf-ap', status: 'approved' });
    const store = new InMemoryWorkflowStore(backing({ instances: [pending, approved] }));
    const result = await handleWorkflowList(
      deps(store),
      { headers: readerHeaders(), query: { status: 'approved' } },
      'req-4',
      DEMO,
    );
    const items = result.body['items'] as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      workflowInstanceId: 'wf-ap',
      status: 'approved',
      execution: { executable: true, reason: null },
    });
  });

  // (5) list filters by reviewTier (matches instances that have a step in that tier).
  it('(5) list filters by reviewTier', async () => {
    const regionalOnly = makeInstance({ id: 'wf-r' });
    const nationalOnly = makeInstance({ id: 'wf-n' });
    const steps = [
      makeStep('wf-r', 'regional_signoff', 1, 'regional_review'),
      makeStep('wf-n', 'national_signoff', 1, 'national_review'),
    ];
    const store = new InMemoryWorkflowStore(
      backing({ instances: [regionalOnly, nationalOnly], steps }),
    );
    const result = await handleWorkflowList(
      deps(store),
      { headers: readerHeaders(), query: { reviewTier: 'national_review' } },
      'req-5',
      DEMO,
    );
    const items = result.body['items'] as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ workflowInstanceId: 'wf-n' });
  });

  // (6) list enforces the maximum page size (limit clamped to 100).
  it('(6) list clamps an oversized limit to the maximum page size', async () => {
    const instances = Array.from({ length: 150 }, (_, i) =>
      makeInstance({ id: `wf-${i}`, createdAt: `2024-02-01T00:00:00.${String(i).padStart(3, '0')}Z` }),
    );
    const store = new InMemoryWorkflowStore(backing({ instances }));
    const result = await handleWorkflowList(
      deps(store),
      { headers: readerHeaders(), query: { limit: '1000' } },
      'req-6',
      DEMO,
    );
    const items = result.body['items'] as unknown[];
    expect(items).toHaveLength(100);
    // A nextCursor is present because more rows remain.
    expect(result.body['nextCursor']).not.toBeNull();
  });

  // (7) detail returns the steps in step_order.
  it('(7) detail returns steps in order', async () => {
    const inst = makeInstance({ id: 'wf-d', status: 'pending' });
    const steps = [
      makeStep('wf-d', 'national_signoff', 2, 'national_review'),
      makeStep('wf-d', 'regional_signoff', 1, 'regional_review'),
    ];
    const store = new InMemoryWorkflowStore(backing({ instances: [inst], steps }));
    const result = await handleWorkflowDetail(
      deps(store),
      { workflowInstanceId: 'wf-d', headers: readerHeaders() },
      'req-7',
      DEMO,
    );
    expect(result.status).toBe(200);
    const stepDtos = result.body['steps'] as Array<Record<string, unknown>>;
    expect(stepDtos.map((s) => s['stepCode'])).toEqual(['regional_signoff', 'national_signoff']);
  });

  // (8) detail readiness is false for a pending workflow.
  it('(8) detail readiness false for pending', async () => {
    const inst = makeInstance({ id: 'wf-pp', status: 'pending' });
    const store = new InMemoryWorkflowStore(backing({ instances: [inst] }));
    const result = await handleWorkflowDetail(
      deps(store),
      { workflowInstanceId: 'wf-pp', headers: readerHeaders() },
      'req-8',
      DEMO,
    );
    expect(result.body['execution']).toEqual({
      executable: false,
      reason: 'workflow_not_approved',
    });
  });

  // (9) detail readiness is true for an approved workflow.
  it('(9) detail readiness true for approved', async () => {
    const inst = makeInstance({ id: 'wf-ok', status: 'approved', currentStepCode: undefined });
    const store = new InMemoryWorkflowStore(backing({ instances: [inst] }));
    const result = await handleWorkflowDetail(
      deps(store),
      { workflowInstanceId: 'wf-ok', headers: readerHeaders() },
      'req-9',
      DEMO,
    );
    expect(result.body['execution']).toEqual({ executable: true, reason: null });
  });

  // (9b) an approved+executed workflow reports already-executed via the executed marker.
  it('(9b) detail readiness reports already-executed for a consumed request', async () => {
    const inst = makeInstance({ id: 'wf-x', status: 'approved', transitionRequestId: 'tr-x' });
    const store = new InMemoryWorkflowStore(
      backing({ instances: [inst] }),
      undefined,
      (trId) => trId === 'tr-x',
    );
    const result = await handleWorkflowDetail(
      deps(store),
      { workflowInstanceId: 'wf-x', headers: readerHeaders() },
      'req-9b',
      DEMO,
    );
    expect(result.body['execution']).toEqual({
      executable: false,
      reason: 'workflow_already_executed',
    });
  });

  // (10) detail returns 404 for an unknown instance.
  it('(10) detail 404 for unknown instance', async () => {
    const store = new InMemoryWorkflowStore(backing());
    const result = await handleWorkflowDetail(
      deps(store),
      { workflowInstanceId: 'nope', headers: readerHeaders() },
      'req-10',
      DEMO,
    );
    expect(result.status).toBe(404);
  });

  // (11) invalid query → 400.
  it('(11) list rejects an invalid status value with 400', async () => {
    const store = new InMemoryWorkflowStore(backing());
    const result = await handleWorkflowList(
      deps(store),
      { headers: readerHeaders(), query: { status: 'bogus' } },
      'req-11',
      DEMO,
    );
    expect(result.status).toBe(400);
  });

  it('(11b) list rejects a non-positive limit with 400', async () => {
    const store = new InMemoryWorkflowStore(backing());
    const result = await handleWorkflowList(
      deps(store),
      { headers: readerHeaders(), query: { limit: '0' } },
      'req-11b',
      DEMO,
    );
    expect(result.status).toBe(400);
  });

  it('(11c) list rejects a malformed cursor with 400', async () => {
    const store = new InMemoryWorkflowStore(backing());
    const result = await handleWorkflowList(
      deps(store),
      { headers: readerHeaders(), query: { cursor: 'not-a-real-cursor!!!' } },
      'req-11c',
      DEMO,
    );
    expect(result.status).toBe(400);
  });

  // (12) JWT-derived auth context flows through the read adapter via a fake resolver.
  it('(12) JWT-derived auth context works through the read adapter', async () => {
    const inst = makeInstance({ id: 'wf-jwt' });
    const store = new InMemoryWorkflowStore(backing({ instances: [inst] }));
    // A fake entra_jwt resolver: ignores headers/body, returns a fixed verified identity.
    const jwtResolver: AuthContextResolver = {
      mode: 'entra_jwt',
      resolve(_input: AuthResolveInput): AuthContext {
        return {
          tenantId: 'tenant-a',
          actor: {
            userId: 'jwt-user',
            roleKeys: ['national_reviewer'],
            permissionKeys: [],
          },
          mode: 'entra_jwt',
        };
      },
    };
    const result = await handleWorkflowList(
      deps(store),
      { headers: { authorization: 'Bearer token' }, query: {} },
      'req-12',
      jwtResolver,
    );
    expect(result.status).toBe(200);
    const items = result.body['items'] as unknown[];
    expect(items).toHaveLength(1);
  });

  // (13) the decision endpoint still works (regression: read pass did not break it).
  it('(13) decision endpoint still records a decision', async () => {
    const calls: RecordWorkflowDecisionInput[] = [];
    const recorder = {
      recordDecision(input: RecordWorkflowDecisionInput): Promise<WorkflowDecisionOutcome> {
        calls.push(input);
        return Promise.resolve({
          workflowInstanceId: 'wf-1',
          status: 'pending' as WorkflowInstanceStatus,
          currentStepCode: 'national_signoff',
          decidedStepCode: 'regional_signoff',
          decision: 'approve',
        });
      },
    };
    const result = await handleWorkflowDecision(
      { decisionService: recorder },
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: {
          'x-house-tenant-id': 'tenant-a',
          'x-house-actor-user-id': 'reviewer-1',
          'x-house-actor-role-keys': 'regional_reviewer',
        },
        body: { decision: 'approve' },
      },
      'req-13',
      DEMO,
    );
    expect(result.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  // (14) the execution endpoint still works (regression).
  it('(14) execution endpoint still executes', async () => {
    const executor = {
      execute(input: ExecuteApprovedWorkflowInput): Promise<ExecuteApprovedTransitionResult> {
        return Promise.resolve({
          status: 'executed',
          transitionRequestId: 'tr-1',
          entityType: 'AffiliationApplication',
          entityId: input.workflowInstanceId,
          trigger: 'approve',
          fromState: 'under_review',
          toState: 'approved',
          idempotencyKey: 'idem-1',
        });
      },
    };
    const result = await handleWorkflowExecution(
      { executor },
      {
        workflowInstanceId: 'wf-1',
        headers: {
          'x-house-tenant-id': 'tenant-a',
          'x-house-actor-user-id': 'op-1',
          'x-house-actor-role-keys': 'workflow_admin',
          'idempotency-key': 'idem-1',
        },
        body: {},
      },
      'req-14',
      DEMO,
    );
    expect(result.status).toBe(200);
  });

  // (15) read endpoints do not mutate governance entity_state.
  it('(15) list + detail do not mutate entity_state', async () => {
    const govStore = new InMemoryGovernanceStore();
    // Seed a workflow instance directly into the shared backing.
    const inst = makeInstance({ id: 'wf-ro', tenantId: 'tenant-a' });
    govStore.workflowBacking.instances.push(inst);
    const store = new InMemoryWorkflowStore(govStore.workflowBacking);
    const before = govStore.entityStateSnapshots.length;

    await handleWorkflowList(deps(store), { headers: readerHeaders(), query: {} }, 'req-15a', DEMO);
    await handleWorkflowDetail(
      deps(store),
      { workflowInstanceId: 'wf-ro', headers: readerHeaders() },
      'req-15b',
      DEMO,
    );

    expect(govStore.entityStateSnapshots.length).toBe(before);
    expect(govStore.data.stateTransitions).toHaveLength(0);
  });

  // (16) no sport-specific fields are required or returned (NSO-generic projection).
  it('(16) responses use NSO-generic fields only', async () => {
    const inst = makeInstance({ id: 'wf-g', status: 'pending' });
    const steps = [makeStep('wf-g', 'regional_signoff', 1, 'regional_review')];
    const store = new InMemoryWorkflowStore(backing({ instances: [inst], steps }));
    const result = await handleWorkflowDetail(
      deps(store),
      { workflowInstanceId: 'wf-g', headers: readerHeaders() },
      'req-16',
      DEMO,
    );
    const sportTerms = /ptso|\bma\b|curl|bonspiel|\bclub\b|\bcc\b/i;
    expect(sportTerms.test(JSON.stringify(result.body))).toBe(false);
  });

  // (extra) a fake read store satisfies the narrow port (no governance/DB coupling needed).
  it('accepts any WorkflowReadStore implementation', async () => {
    const fake: WorkflowReadStore = {
      listWorkflows(): Promise<WorkflowListResult> {
        return Promise.resolve({ items: [] });
      },
      getWorkflowDetail(): Promise<WorkflowDetailView | undefined> {
        return Promise.resolve(undefined);
      },
    };
    const result = await handleWorkflowList(
      deps(fake),
      { headers: readerHeaders(), query: {} },
      'req-extra',
      DEMO,
    );
    expect(result.status).toBe(200);
    expect(result.body['items']).toEqual([]);
  });
});
