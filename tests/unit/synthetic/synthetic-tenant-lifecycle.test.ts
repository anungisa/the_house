/**
 * Synthetic tenant-lifecycle confidence suite.
 *
 * Proves — in a controlled, NSO-GENERIC, fully hermetic way — that a tenant-scoped lifecycle can
 * move through application submission, two-tier workflow review, approved execution through the
 * Governance Kernel, evidence handling, quarantine handling, outbox effects, authorization, and
 * observability WITHOUT leaking tenant data or sport-specific terminology.
 *
 * This suite assembles only EXISTING services (see SyntheticTenantLifecycleHarness). It adds no
 * production behavior, no new lifecycle states, and never contacts Azure/Entra/Service Bus/a real
 * AV engine. Tenant Alpha is the subject; Tenant Beta only ever proves isolation.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  SyntheticTenantLifecycleHarness,
  TENANT_ALPHA_ID,
  TENANT_BETA_ID,
  applicantActor,
  workflowReaderActor,
  securityReviewerActor,
  unauthorizedActor,
  EICAR_EVIDENCE_BYTES,
  CLEAN_EVIDENCE_BYTES,
  assertNoForbiddenTerms,
  assertTelemetryHasNoSensitiveValues,
} from '../../support/syntheticTenantLifecycle/index.js';
import {
  AFFILIATION_NATIONAL_STEP_CODE,
} from '../../../src/governance/workflow/AffiliationWorkflowPlanner.js';
import {
  EVIDENCE_QUARANTINE_RECORDED_MESSAGE_TYPE,
  EVIDENCE_QUARANTINE_REVIEWED_MESSAGE_TYPE,
} from '../../../src/governance/evidence/quarantine/EvidenceQuarantineTypes.js';
import { authorize, AuthorizationAction } from '../../../src/authz/index.js';
import { TelemetryCounters, TelemetryEvents } from '../../../src/observability/index.js';
import { ORGANIZATION_REGISTRY_CREATED_MESSAGE_TYPE } from '../../../src/domains/organization-registry/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const supportDir = join(here, '..', '..', 'support', 'syntheticTenantLifecycle');

// Bind the global TextDecoder locally (Node >=20) so lint's no-undef is satisfied.
const { TextDecoder } = globalThis;

/** Buffer-free utf8/latin1 decode of synthetic payloads for leakage assertions. */
function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

describe('synthetic tenant lifecycle', () => {
  // (1) Tenant Alpha submits a synthetic affiliation application.
  it('(1) Tenant Alpha submits a synthetic application', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    const result = await h.submit('app-1');

    expect(h.tenantId).toBe(TENANT_ALPHA_ID);
    expect(result.status).toBe('executed');
    expect(result.fromState).toBe('draft');
    expect(result.toState).toBe('submitted');
  });

  // (2) Submission creates governed lifecycle state strictly through the kernel.
  it('(2) submission creates governed lifecycle state through the kernel', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    await h.submit('app-2');

    expect(h.entityState('app-2')).toBe('submitted');
    const journal = h.kernel.store.data.stateTransitions.filter(
      (t) => t.entityId === 'app-2' && t.trigger === 'submit',
    );
    expect(journal).toHaveLength(1);
    expect(h.outboxMessageTypes()).toContain('AffiliationApplication.submit');
  });

  // (3) An approval-required transition creates two-tier workflow review METADATA.
  it('(3) approval-required transition creates two-tier workflow metadata', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    const approval = await h.driveToApprovalRequest('app-3');

    expect(approval.status).toBe('approval_required');
    expect(approval.workflowInstanceId).toBeDefined();
    const detail = await h.workflowStore.getWorkflowDetail(
      h.tenantId,
      approval.workflowInstanceId as string,
    );
    expect(detail?.instance.status).toBe('pending');
    expect(detail?.steps).toHaveLength(2);
    // No governed state mutation occurred for the approval-required transition.
    expect(h.entityState('app-3')).toBe('under_review');
  });

  // (4) The first-tier (regional) reviewer records a regional approval.
  it('(4) regional reviewer records a regional approval', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    const approval = await h.driveToApprovalRequest('app-4');
    await h.recordRegionalDecision(approval.workflowInstanceId as string);

    const detail = await h.workflowStore.getWorkflowDetail(
      h.tenantId,
      approval.workflowInstanceId as string,
    );
    expect(detail?.instance.status).toBe('pending');
    expect(detail?.instance.currentStepCode).toBe(AFFILIATION_NATIONAL_STEP_CODE);
  });

  // (5) The second-tier (national) reviewer records the final national approval.
  it('(5) national reviewer records the national approval', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    const approval = await h.driveToApprovalRequest('app-5');
    await h.recordRegionalDecision(approval.workflowInstanceId as string);
    await h.recordNationalDecision(approval.workflowInstanceId as string);

    const detail = await h.workflowStore.getWorkflowDetail(
      h.tenantId,
      approval.workflowInstanceId as string,
    );
    expect(detail?.instance.status).toBe('approved');
  });

  // (6) Approved workflow execution moves the application to its governed state via the kernel.
  it('(6) approved workflow execution advances governed state through the kernel', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    const approval = await h.driveToApprovalRequest('app-6');
    await h.recordRegionalDecision(approval.workflowInstanceId as string);
    await h.recordNationalDecision(approval.workflowInstanceId as string);

    const result = await h.executeApprovedWorkflow({
      workflowInstanceId: approval.workflowInstanceId as string,
      idempotencyKey: 'app-6-exec',
    });

    expect(result.status).toBe('executed');
    expect(result.fromState).toBe('under_review');
    expect(result.toState).toBe('approved');
    expect(h.entityState('app-6')).toBe('approved');
  });

  // (7) Approved workflow execution is idempotent.
  it('(7) approved workflow execution is idempotent', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    const approval = await h.driveToApprovalRequest('app-7');
    await h.recordRegionalDecision(approval.workflowInstanceId as string);
    await h.recordNationalDecision(approval.workflowInstanceId as string);

    await h.executeApprovedWorkflow({
      workflowInstanceId: approval.workflowInstanceId as string,
      idempotencyKey: 'app-7-exec',
    });
    await h.executeApprovedWorkflow({
      workflowInstanceId: approval.workflowInstanceId as string,
      idempotencyKey: 'app-7-exec',
    });

    const executed = h.kernel.store.data.stateTransitions.filter(
      (t) => t.entityId === 'app-7' && t.trigger === 'approve',
    );
    expect(executed).toHaveLength(1);
    expect(h.entityState('app-7')).toBe('approved');
  });

  // (8) An unauthorized actor cannot read the workflow admin surface (fail closed).
  it('(8) unauthorized actor cannot read the workflow admin surface', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    await h.driveToApprovalRequest('app-8');

    const response = await h.httpListWorkflows({
      tenantId: TENANT_ALPHA_ID,
      actor: applicantActor,
    });
    expect(response.status).toBe(403);
    // The centralized policy agrees.
    expect(authorize(h.authActor(applicantActor), AuthorizationAction.WorkflowRead).allowed).toBe(
      false,
    );
  });

  // (9) An authorized workflow reader can list workflows for its tenant.
  it('(9) authorized workflow reader can list workflows', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    await h.driveToApprovalRequest('app-9');

    const response = await h.httpListWorkflows({
      tenantId: TENANT_ALPHA_ID,
      actor: workflowReaderActor,
    });
    expect(response.status).toBe(200);
    const items = response.body['items'] as unknown[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  // (10) Tenant Beta cannot see Tenant Alpha's workflow (cross-tenant isolation).
  it('(10) Tenant Beta cannot see Tenant Alpha workflows', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    await h.driveToApprovalRequest('app-10');

    // Over HTTP, an authorized reader scoped to Beta gets an empty list.
    const betaResponse = await h.httpListWorkflows({
      tenantId: TENANT_BETA_ID,
      actor: workflowReaderActor,
    });
    expect(betaResponse.status).toBe(200);
    expect((betaResponse.body['items'] as unknown[]).length).toBe(0);

    // And directly in the hermetic store, Beta sees nothing while Alpha sees the instance.
    const betaList = await h.listWorkflows(TENANT_BETA_ID);
    const alphaList = await h.listWorkflows(TENANT_ALPHA_ID);
    expect(betaList.items.length).toBe(0);
    expect(alphaList.items.length).toBeGreaterThanOrEqual(1);
  });

  // (11) A clean evidence upload stores metadata through the existing evidence abstraction.
  it('(11) clean evidence upload stores metadata via the evidence abstraction', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    const outcome = await h.uploadCleanEvidence();

    expect(outcome.outcome).toBe('stored');
    expect(h.storedEvidenceCount()).toBe(1);
  });

  // (12) An infected upload records a quarantine event and rejects the upload.
  it('(12) infected upload records quarantine and rejects the upload', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    const outcome = await h.uploadInfectedEvidence();

    expect(outcome.outcome).toBe('quarantined');
    const events = await h.quarantine.listQuarantineEvents(h.tenantId, {});
    expect(events.items).toHaveLength(1);
    expect(events.items[0]?.scanStatus).toBe('infected');
  });

  // (13) An infected upload never stores the payload bytes as normal evidence.
  it('(13) infected upload does not store evidence bytes as governed evidence', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    await h.uploadInfectedEvidence();

    expect(h.storedEvidenceCount()).toBe(0);
  });

  // (14) A security reviewer can disposition a quarantine event (reviewed).
  it('(14) security reviewer can mark a quarantine event reviewed', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    const outcome = await h.uploadInfectedEvidence();
    expect(outcome.outcome).toBe('quarantined');
    const quarantineEventId =
      outcome.outcome === 'quarantined' ? outcome.quarantineEventId : '';

    const disposition = (await h.disposeQuarantine({
      quarantineEventId,
      disposition: 'reviewed',
    })) as { newStatus: string };
    expect(disposition.newStatus).toBe('reviewed');

    // Authorization agrees: security reviewer may disposition; an unauthorized actor may not.
    expect(
      authorize(
        h.authActor(securityReviewerActor),
        AuthorizationAction.EvidenceQuarantineDisposition,
      ).allowed,
    ).toBe(true);
    expect(
      authorize(
        h.authActor(unauthorizedActor),
        AuthorizationAction.EvidenceQuarantineDisposition,
      ).allowed,
    ).toBe(false);
  });

  // (15) A quarantine disposition emits an outbox event.
  it('(15) quarantine disposition emits an outbox event', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    const outcome = await h.uploadInfectedEvidence();
    const quarantineEventId =
      outcome.outcome === 'quarantined' ? outcome.quarantineEventId : '';
    await h.disposeQuarantine({ quarantineEventId, disposition: 'reviewed' });

    expect(h.outboxMessageTypes()).toContain(EVIDENCE_QUARANTINE_REVIEWED_MESSAGE_TYPE);
  });

  // (16) The outbox contains the expected lifecycle and quarantine event types.
  it('(16) outbox contains expected lifecycle and quarantine event types', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    const approval = await h.driveToApprovalRequest('app-16');
    await h.recordRegionalDecision(approval.workflowInstanceId as string);
    await h.recordNationalDecision(approval.workflowInstanceId as string);
    await h.executeApprovedWorkflow({
      workflowInstanceId: approval.workflowInstanceId as string,
      idempotencyKey: 'app-16-exec',
    });
    const outcome = await h.uploadInfectedEvidence();
    const quarantineEventId =
      outcome.outcome === 'quarantined' ? outcome.quarantineEventId : '';
    await h.disposeQuarantine({ quarantineEventId, disposition: 'reviewed' });

    const types = h.outboxMessageTypes();
    expect(types).toContain('AffiliationApplication.submit');
    expect(types).toContain('AffiliationApplication.review_start');
    expect(types).toContain('AffiliationApplication.approve');
    expect(types).toContain(EVIDENCE_QUARANTINE_RECORDED_MESSAGE_TYPE);
    expect(types).toContain(EVIDENCE_QUARANTINE_REVIEWED_MESSAGE_TYPE);
  });

  // (17) Telemetry records the expected high-level counters/events via the existing seam.
  it('(17) telemetry records expected high-level counters and events', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    await h.driveToApprovalRequest('app-17');

    // An authorized read emits a workflow.read counter; an unauthorized read emits authz.denied.
    await h.httpListWorkflows({ tenantId: TENANT_ALPHA_ID, actor: workflowReaderActor });
    await h.httpListWorkflows({ tenantId: TENANT_ALPHA_ID, actor: applicantActor });

    expect(h.telemetry.counterTotal(TelemetryCounters.workflowRead)).toBeGreaterThanOrEqual(1);
    expect(h.telemetry.counterTotal(TelemetryCounters.authzDenied)).toBeGreaterThanOrEqual(1);
    expect(h.telemetry.hasEvent(TelemetryEvents.authzDenied)).toBe(true);
  });

  // (18) No raw tokens, evidence bytes, or connection strings leak into telemetry.
  it('(18) telemetry never leaks tokens, evidence bytes, or connection strings', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    await h.driveToApprovalRequest('app-18');
    await h.uploadInfectedEvidence();
    await h.httpListWorkflows({ tenantId: TENANT_ALPHA_ID, actor: workflowReaderActor });
    await h.httpListWorkflows({ tenantId: TENANT_ALPHA_ID, actor: applicantActor });

    assertTelemetryHasNoSensitiveValues(h.telemetry, [
      bytesToString(EICAR_EVIDENCE_BYTES),
      bytesToString(CLEAN_EVIDENCE_BYTES),
      'synthetic-placeholder-bearer-token',
      'synthetic-placeholder-connection-string',
    ]);
  });

  // (19) A quarantine disposition never mutates governed lifecycle state.
  it('(19) quarantine disposition does not mutate governed lifecycle state', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    const approval = await h.driveToApprovalRequest('app-19');
    await h.recordRegionalDecision(approval.workflowInstanceId as string);
    await h.recordNationalDecision(approval.workflowInstanceId as string);
    await h.executeApprovedWorkflow({
      workflowInstanceId: approval.workflowInstanceId as string,
      idempotencyKey: 'app-19-exec',
    });

    const transitionsBefore = h.kernel.store.data.stateTransitions.length;
    const stateBefore = h.entityState('app-19');

    const outcome = await h.uploadInfectedEvidence();
    const quarantineEventId =
      outcome.outcome === 'quarantined' ? outcome.quarantineEventId : '';
    await h.disposeQuarantine({ quarantineEventId, disposition: 'discarded' });

    expect(h.kernel.store.data.stateTransitions.length).toBe(transitionsBefore);
    expect(h.entityState('app-19')).toBe(stateBefore);
    expect(h.entityState('app-19')).toBe('approved');
  });

  // (21) An organization registered from an approved application is tenant-isolated reference data.
  it('(21) approved application projects a tenant-isolated registry organization', async () => {
    const h = new SyntheticTenantLifecycleHarness();
    const approval = await h.driveToApprovalRequest('app-21');
    await h.recordRegionalDecision(approval.workflowInstanceId as string);
    await h.recordNationalDecision(approval.workflowInstanceId as string);
    await h.executeApprovedWorkflow({
      workflowInstanceId: approval.workflowInstanceId as string,
      idempotencyKey: 'app-21-exec',
    });
    // The application is now governed-approved; registering an organization is a one-way
    // PROJECTION (no kernel call, no governed-state mutation).
    expect(h.entityState('app-21')).toBe('approved');

    const org = await h.registerOrganizationFromApprovedAffiliation({
      affiliationApplicationId: 'app-21',
      organizationType: 'local',
      displayName: 'Registered Local Organization',
    });

    // The organization belongs to Tenant Alpha and is readable by Tenant Alpha only.
    expect(org.tenantId).toBe(TENANT_ALPHA_ID);
    expect(org.status).toBe('active');
    expect(org.sourceEntityId).toBe('app-21');
    expect(await h.getOrganization(TENANT_ALPHA_ID, org.organizationId)).toBeDefined();
    // Tenant Beta cannot read Tenant Alpha's registry organization.
    expect(await h.getOrganization(TENANT_BETA_ID, org.organizationId)).toBeUndefined();
    expect(await h.listOrganizationIds(TENANT_BETA_ID)).toHaveLength(0);

    // A sanitized registry signal landed on the shared outbox, and telemetry recorded the create.
    expect(h.outboxMessageTypes()).toContain(ORGANIZATION_REGISTRY_CREATED_MESSAGE_TYPE);
    expect(h.telemetry.counterTotal(TelemetryCounters.organizationRegistryCreated)).toBe(1);
    expect(h.telemetry.hasEvent(TelemetryEvents.organizationRegistryCreated)).toBe(true);

    // Governed lifecycle state is untouched by the registry projection.
    expect(h.entityState('app-21')).toBe('approved');
  });

  // (20) No sport-specific terminology appears in the synthetic fixtures or this test file.
  it('(20) synthetic fixtures and test names carry no sport-specific terminology', () => {
    // assertions.ts is excluded: it intentionally ENUMERATES the banned terms in order to ban them.
    const files = readdirSync(supportDir).filter(
      (f) => f.endsWith('.ts') && f !== 'assertions.ts',
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(join(supportDir, file), 'utf8');
      assertNoForbiddenTerms(text, `support fixture ${file}`);
    }
    const selfText = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    assertNoForbiddenTerms(selfText, 'synthetic tenant lifecycle test file');
  });
});
