import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';

import {
  handleAffiliationHttpTransition,
  type AffiliationCommandExecutor,
} from '../../../../../src/http/AffiliationHttpAdapter.js';
import type {
  AffiliationApplicationTransitionRequest,
  AffiliationApplicationTransitionResponse,
} from '../../../../../src/domains/affiliation/AffiliationApplicationDtos.js';
import {
  handleEvidenceUpload,
  type EvidenceHttpDeps,
} from '../../../../../src/http/evidence/EvidenceHttpAdapter.js';
import { InMemoryEvidenceStorage } from '../../../../../src/governance/evidence/InMemoryEvidenceStorage.js';
import { GovernanceEvidenceService } from '../../../../../src/governance/evidence/GovernanceEvidenceService.js';
import { NoopEvidenceMalwareScanner } from '../../../../../src/governance/evidence/scanning/index.js';
import {
  handleWorkflowDecision,
  type WorkflowDecisionRecorder,
  type WorkflowHttpDeps,
} from '../../../../../src/http/workflow/WorkflowHttpAdapter.js';
import type {
  RecordWorkflowDecisionInput,
  WorkflowDecisionOutcome,
} from '../../../../../src/governance/workflow/WorkflowDecisionService.js';
import { EntraJwtAuthContextResolver } from '../../../../../src/http/auth/jwt/EntraJwtAuthContextResolver.js';
import type {
  JwtClaims,
  JwtVerifier,
} from '../../../../../src/http/auth/jwt/JwtVerifier.js';
import type { JwtClaimMapping } from '../../../../../src/http/auth/jwt/JwtClaimMapper.js';
import { fixedClock } from '../../../../../src/shared/time/clock.js';

/**
 * Endpoint integration: prove the affiliation, evidence, and workflow HTTP surfaces all derive
 * their TRUSTED tenant + actor from the validated JWT (via a fake verifier), ignoring any
 * caller-supplied `x-house-*` headers and body identity. NO real Entra/JWKS/DB/Azure is used.
 */

const MAPPING: JwtClaimMapping = {
  userIdClaim: 'oid',
  tenantIdClaim: 'tid',
  roleClaim: 'roles',
  permissionClaim: 'scp',
};

class FakeVerifier implements JwtVerifier {
  constructor(private readonly claims: JwtClaims) {}
  verify(): Promise<JwtClaims> {
    return Promise.resolve(this.claims);
  }
}

function jwtResolver(claims: JwtClaims): EntraJwtAuthContextResolver {
  return new EntraJwtAuthContextResolver(new FakeVerifier(claims), MAPPING);
}

/** Headers that try to spoof identity — the JWT resolver must ignore all of them. */
function spoofHeaders(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    authorization: 'Bearer aaa.bbb.ccc',
    'x-house-tenant-id': 'attacker-tenant',
    'x-house-actor-user-id': 'attacker',
    'x-house-actor-role-keys': 'admin',
    ...extra,
  };
}

class RecordingExecutor implements AffiliationCommandExecutor {
  public readonly calls: AffiliationApplicationTransitionRequest[] = [];
  executeCommand(
    _command: string,
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    this.calls.push(request);
    return Promise.resolve({
      status: 'executed',
      applicationId: 'app-1',
      fromState: 'draft',
      toState: 'submitted',
      transitionId: 'st-1',
      auditEventId: 'au-1',
    });
  }
}

class RecordingRecorder implements WorkflowDecisionRecorder {
  public readonly calls: RecordWorkflowDecisionInput[] = [];
  recordDecision(input: RecordWorkflowDecisionInput): Promise<WorkflowDecisionOutcome> {
    this.calls.push(input);
    return Promise.resolve({
      workflowInstanceId: input.workflowInstanceId,
      status: 'pending',
      currentStepCode: 'national_signoff',
      decidedStepCode: input.stepCode,
      decision: 'approve',
    });
  }
}

function evidenceDeps(): EvidenceHttpDeps {
  const storage = new InMemoryEvidenceStorage({ clock: fixedClock(0) });
  return {
    uploadService: new GovernanceEvidenceService(storage),
    storage,
    maxUploadBytes: 1024,
    scanner: new NoopEvidenceMalwareScanner({ clock: fixedClock(0) }),
    scanRequired: false,
  };
}

describe('JWT auth context across endpoints', () => {
  // (18) Affiliation endpoint uses the JWT-derived identity, not headers/body.
  it('(18) affiliation transition uses the JWT tenant + actor', async () => {
    const executor = new RecordingExecutor();
    const result = await handleAffiliationHttpTransition(
      executor,
      {
        applicationId: 'app-1',
        action: 'submit',
        headers: spoofHeaders(),
        body: { tenantId: 'attacker-tenant', context: { seasonId: '2025-26' } },
      },
      'req-aff',
      jwtResolver({ tid: 'tenant-jwt', oid: 'user-jwt', roles: ['reviewer'], scp: 'Affiliation.Submit' }),
    );
    expect(result.status).toBe(200);
    expect(executor.calls).toHaveLength(1);
    const sent = executor.calls[0]!;
    expect(sent.tenantId).toBe('tenant-jwt');
    expect(sent.actor.userId).toBe('user-jwt');
    expect(sent.actor.roleKeys).toEqual(['reviewer']);
    expect(sent.actor.permissionKeys).toEqual(['Affiliation.Submit']);
  });

  // (19) Evidence endpoint uses the JWT-derived tenant.
  it('(19) evidence upload uses the JWT tenant', async () => {
    const result = await handleEvidenceUpload(
      evidenceDeps(),
      {
        headers: spoofHeaders({ 'content-type': 'text/plain' }),
        content: Buffer.from('evidence bytes'),
      },
      'req-ev',
      jwtResolver({ tid: 'tenant-jwt', oid: 'records-officer' }),
    );
    expect(result.kind).toBe('json');
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(201);
    expect(String(result.body['storageKey'])).toContain('tenants/tenant-jwt/evidence/');
  });

  // (20) Workflow decision endpoint uses the JWT tenant + actor.
  it('(20) workflow decision uses the JWT tenant + actor', async () => {
    const recorder = new RecordingRecorder();
    const deps: WorkflowHttpDeps = { decisionService: recorder };
    const result = await handleWorkflowDecision(
      deps,
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: spoofHeaders(),
        body: { decision: 'approve' },
      },
      'req-wf',
      jwtResolver({ tid: 'tenant-jwt', oid: 'reviewer-jwt', roles: ['reviewer'] }),
    );
    expect(result.status).toBe(200);
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]).toMatchObject({
      tenantId: 'tenant-jwt',
      actorUserId: 'reviewer-jwt',
      stepCode: 'regional_signoff',
      decision: 'approve',
    });
  });

  // A missing bearer token blocks every endpoint with 401.
  it('blocks the affiliation endpoint when the bearer token is absent', async () => {
    const executor = new RecordingExecutor();
    const result = await handleAffiliationHttpTransition(
      executor,
      {
        applicationId: 'app-1',
        action: 'submit',
        headers: { 'x-house-tenant-id': 'attacker-tenant' },
        body: { context: { seasonId: '2025-26' } },
      },
      'req-noauth',
      jwtResolver({ tid: 'tenant-jwt', oid: 'user-jwt' }),
    );
    expect(result.status).toBe(401);
    expect(executor.calls).toHaveLength(0);
  });
});
