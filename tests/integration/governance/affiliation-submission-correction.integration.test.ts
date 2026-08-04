import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import pg from 'pg';

import {
  AffiliationDraftService,
  InMemoryEvidenceReferenceValidator,
  PgAffiliationDraftStore,
  PgAffiliationLifecycleReader,
  PgRequirementCatalogStore,
  type RequirementResolutionContext,
} from '../../../src/domains/affiliation-requirements/index.js';
import { AffiliationSubmissionService } from '../../../src/domains/affiliation-submission/index.js';
import { AffiliationReviewService } from '../../../src/domains/affiliation-review/index.js';
import {
  createAffiliationDecisionService,
  createPgAffiliationApplicationService,
} from '../../../src/http/composition.js';
import { closePool, withTenantTransaction } from '../../../src/db/pool.js';
import { AppError, ErrorCode } from '../../../src/shared/errors/AppError.js';

const RUN = process.env.RUN_DB_TESTS === '1' && (process.env.DATABASE_URL ?? '') !== '';
const d = RUN ? describe : describe.skip;
const SEASON = '2025-26';
const CONTEXT: RequirementResolutionContext = {
  orgType: 'local',
  jurisdiction: 'member',
  pathway: 'new_affiliation',
  season: SEASON,
};

function buildDraftService(evidence: InMemoryEvidenceReferenceValidator): AffiliationDraftService {
  return new AffiliationDraftService({
    store: new PgAffiliationDraftStore(),
    catalog: new PgRequirementCatalogStore(),
    lifecycle: new PgAffiliationLifecycleReader(),
    evidenceValidator: evidence,
  });
}

async function completeDraft(input: {
  tenantId: string;
  organizationId: string;
  applicantUserId: string;
}): Promise<{ applicationId: string; version: number; drafts: AffiliationDraftService }> {
  // The affiliation_application -> season FK is immediate: seed the season before `initiate`
  // (which inserts the application head) so the FK is satisfied.
  await withTenantTransaction(input.tenantId, (client) =>
    client.query(
      `INSERT INTO affiliation.season (tenant_id, season_id, status, is_current)
       VALUES ($1, $2, 'published', true)
       ON CONFLICT (tenant_id, season_id) DO NOTHING`,
      [input.tenantId, SEASON],
    ),
  );
  const evidence = new InMemoryEvidenceReferenceValidator();
  const drafts = buildDraftService(evidence);
  let application = await drafts.initiate({
    ...input,
    actor: input.applicantUserId,
    seasonId: SEASON,
    context: CONTEXT,
  });
  application = await drafts.saveDraft({
    tenantId: input.tenantId,
    applicationId: application.applicationId,
    expectedVersion: Number(application.concurrencyToken),
    actor: input.applicantUserId,
    responses: [
      { requirementCode: 'ORG_PROFILE_CONFIRMATION', value: { acknowledged: true } },
      { requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'Dana' } },
      { requirementCode: 'GOVERNING_DOCUMENT', value: { attached: true } },
      { requirementCode: 'INSURANCE_CONFIRMATION', value: { confirmed: true } },
    ],
  });
  for (const [requirementCode, evidenceObjectId] of [
    ['GOVERNING_DOCUMENT', randomUUID()],
    ['INSURANCE_CONFIRMATION', randomUUID()],
  ] as const) {
    evidence.register({ tenantId: input.tenantId, evidenceObjectId, contentHash: evidenceObjectId });
    await drafts.associateEvidence({
      tenantId: input.tenantId,
      applicationId: application.applicationId,
      requirementCode,
      evidenceObjectId,
      contentHash: evidenceObjectId,
      contentType: 'application/pdf',
      actor: input.applicantUserId,
    });
  }
  application = await drafts.getProjection(input.tenantId, application.applicationId);
  return {
    applicationId: application.applicationId,
    version: Number(application.concurrencyToken),
    drafts,
  };
}

d('affiliation submission and controlled correction (PostgreSQL integration)', () => {
  beforeAll(async () => {
    const admin = new pg.Pool({
      connectionString: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    try {
      const runtimeUser = new URL(process.env.DATABASE_URL ?? '').username;
      const role = `"${runtimeUser.replace(/"/gu, '""')}"`;
      await admin.query(`GRANT USAGE ON SCHEMA governance, affiliation TO ${role}`);
      await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA governance TO ${role}`);
      await admin.query(
        `GRANT INSERT, UPDATE ON governance.entity_state, governance.transition_request,
           governance.outbox_message TO ${role}`,
      );
      await admin.query(
        `GRANT INSERT ON governance.state_transition, governance.transition_guard_result,
           governance.audit_event, governance.evidence_object TO ${role}`,
      );
      await admin.query(`GRANT EXECUTE ON FUNCTION governance.current_tenant_id() TO ${role}`);
    } finally {
      await admin.end();
    }
  });

  afterAll(async () => {
    await closePool();
  });

  it('atomically submits once, persists evidence, and replays the immutable receipt', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    const applicantUserId = randomUUID();
    const draft = await completeDraft({ tenantId, organizationId, applicantUserId });
    const submissions = new AffiliationSubmissionService(createPgAffiliationApplicationService());
    const command = {
      tenantId,
      applicationId: draft.applicationId,
      expectedDraftVersion: draft.version,
      idempotencyKey: `submit:${draft.applicationId}:${draft.version}`,
      actorUserId: applicantUserId,
      actorRoleKeys: ['applicant'],
      seasonId: SEASON,
      organizationId,
    };

    const receipt = await submissions.submit(command);
    expect(await submissions.submit(command)).toEqual(receipt);
    expect(receipt).toMatchObject({ sequence: 1, sourceDraftVersion: draft.version });

    await withTenantTransaction(tenantId, async (client) => {
      const snapshots = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM affiliation.submission_snapshot
          WHERE application_id = $1`,
        [draft.applicationId],
      );
      const state = await client.query<{ current_state: string }>(
        `SELECT current_state FROM governance.entity_state
          WHERE entity_type = 'AffiliationApplication' AND entity_id = $1`,
        [draft.applicationId],
      );
      const evidence = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM governance.evidence_object
          WHERE entity_type = 'AffiliationApplication' AND entity_id = $1 AND trigger = 'submit'`,
        [draft.applicationId],
      );
      expect(snapshots[0]?.n).toBe(1);
      expect(state[0]?.current_state).toBe('submitted');
      expect(evidence[0]?.n).toBe(1);
    });

    const otherTenantCanSee = await withTenantTransaction(randomUUID(), (client) =>
      client.query(`SELECT id FROM affiliation.submission_snapshot WHERE application_id = $1`, [
        draft.applicationId,
      ]),
    );
    expect(otherTenantCanSee).toEqual([]);
  });

  it('opens bounded editing, rejects out-of-scope writes, and resolves exactly once on resubmit', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    const applicantUserId = randomUUID();
    const reviewerUserId = randomUUID();
    const draft = await completeDraft({ tenantId, organizationId, applicantUserId });
    const submissions = new AffiliationSubmissionService(createPgAffiliationApplicationService());
    await submissions.submit({
      tenantId,
      applicationId: draft.applicationId,
      expectedDraftVersion: draft.version,
      idempotencyKey: `submit:${draft.applicationId}:${draft.version}`,
      actorUserId: applicantUserId,
      actorRoleKeys: ['applicant'],
      seasonId: SEASON,
      organizationId,
    });
    const correction = await submissions.openCorrection({
      tenantId,
      applicationId: draft.applicationId,
      reviewerUserId,
      reviewerRoleKeys: ['reviewer'],
      reviewerOrganizationId: organizationId,
      reasons: [{ requirementCode: 'PRIMARY_CONTACT_DETAILS', reason: 'Add a direct phone number.' }],
    });

    await expect(
      draft.drafts.saveDraft({
        tenantId,
        applicationId: draft.applicationId,
        expectedVersion: draft.version,
        actor: applicantUserId,
        responses: [{ requirementCode: 'ORG_PROFILE_CONFIRMATION', value: { acknowledged: false } }],
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.AFFILIATION_CORRECTION_CONFLICT,
    } satisfies Partial<AppError>);

    const corrected = await draft.drafts.saveDraft({
      tenantId,
      applicationId: draft.applicationId,
      expectedVersion: draft.version,
      actor: applicantUserId,
      responses: [
        {
          requirementCode: 'PRIMARY_CONTACT_DETAILS',
          value: { name: 'Dana', phone: '+1 555 0100' },
        },
      ],
    });
    const idempotencyKey = `resubmit:${correction.correctionRequestId}:${corrected.concurrencyToken}`;
    const receipt = await submissions.resubmitCorrection({
      tenantId,
      applicationId: draft.applicationId,
      correctionRequestId: correction.correctionRequestId,
      expectedDraftVersion: Number(corrected.concurrencyToken),
      idempotencyKey,
      actorUserId: applicantUserId,
    });
    expect(receipt.sequence).toBe(2);
    expect(
      await submissions.resubmitCorrection({
        tenantId,
        applicationId: draft.applicationId,
        correctionRequestId: correction.correctionRequestId,
        expectedDraftVersion: Number(corrected.concurrencyToken),
        idempotencyKey,
        actorUserId: applicantUserId,
      }),
    ).toEqual(receipt);

    await withTenantTransaction(tenantId, async (client) => {
      const rows = await client.query<{ status: string; resolution_snapshot_id: string | null }>(
        `SELECT status, resolution_snapshot_id FROM affiliation.correction_request WHERE id = $1`,
        [correction.correctionRequestId],
      );
      const snapshots = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM affiliation.submission_snapshot
          WHERE application_id = $1`,
        [draft.applicationId],
      );
      const outbox = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM governance.outbox_message
          WHERE message_type = 'affiliation.correction.resubmitted'
            AND payload->>'entityId' = $1`,
        [draft.applicationId],
      );
      expect(rows[0]).toMatchObject({ status: 'resolved', resolution_snapshot_id: receipt.receiptId });
      expect(snapshots[0]?.n).toBe(2);
      expect(outbox[0]?.n).toBe(1);
    });
  });

  it('serves the review case from the corrected resubmission snapshot (shape parity)', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    const applicantUserId = randomUUID();
    const reviewerUserId = randomUUID();
    const draft = await completeDraft({ tenantId, organizationId, applicantUserId });
    const transitions = createPgAffiliationApplicationService();
    const submissions = new AffiliationSubmissionService(transitions);
    const reviews = new AffiliationReviewService(transitions);
    await submissions.submit({
      tenantId,
      applicationId: draft.applicationId,
      expectedDraftVersion: draft.version,
      idempotencyKey: `submit:${draft.applicationId}:${draft.version}`,
      actorUserId: applicantUserId,
      actorRoleKeys: ['applicant'],
      seasonId: SEASON,
      organizationId,
    });

    const reviewer = {
      userId: reviewerUserId,
      roleKeys: ['reviewer'],
      scopeType: 'local_organization' as const,
      organizationId,
    };
    await reviews.startReview({
      tenantId,
      applicationId: draft.applicationId,
      actor: reviewer,
      idempotencyKey: `review-start:${draft.applicationId}`,
    });

    const correction = await submissions.openCorrection({
      tenantId,
      applicationId: draft.applicationId,
      reviewerUserId,
      reviewerRoleKeys: ['reviewer'],
      reviewerOrganizationId: organizationId,
      reasons: [{ requirementCode: 'PRIMARY_CONTACT_DETAILS', reason: 'Add a direct phone number.' }],
    });

    const corrected = await draft.drafts.saveDraft({
      tenantId,
      applicationId: draft.applicationId,
      expectedVersion: draft.version,
      actor: applicantUserId,
      responses: [
        {
          requirementCode: 'PRIMARY_CONTACT_DETAILS',
          value: { name: 'Dana', phone: '+1 555 0100' },
        },
      ],
    });
    const receipt = await submissions.resubmitCorrection({
      tenantId,
      applicationId: draft.applicationId,
      correctionRequestId: correction.correctionRequestId,
      expectedDraftVersion: Number(corrected.concurrencyToken),
      idempotencyKey: `resubmit:${correction.correctionRequestId}:${corrected.concurrencyToken}`,
      actorUserId: applicantUserId,
    });
    expect(receipt.sequence).toBe(2);

    // Regression guard: getCase reads the LATEST (resubmitted) submission snapshot. Its requirement
    // shape must match the initial submission snapshot (`code`/`version`), or getCase throws
    // CONFIG_ERROR and the assigned reviewer can never act on a corrected application.
    const reviewCase = await reviews.getCase(tenantId, reviewer, draft.applicationId);
    expect(reviewCase.requirements).toHaveLength(4);
    for (const requirement of reviewCase.requirements) {
      expect(requirement.code).not.toBe('');
      expect(requirement.version).toBeGreaterThan(0);
      expect(requirement.titleEn).not.toBe('');
    }
    expect(
      reviewCase.requirements.find((item) => item.code === 'PRIMARY_CONTACT_DETAILS')?.response,
    ).toMatchObject({ phone: '+1 555 0100' });
  });

  it('filters the reviewer queue by resource scope and assigns review atomically', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    const applicantUserId = randomUUID();
    const reviewerUserId = randomUUID();
    const draft = await completeDraft({ tenantId, organizationId, applicantUserId });
    const transitions = createPgAffiliationApplicationService();
    const submissions = new AffiliationSubmissionService(transitions);
    const reviews = new AffiliationReviewService(transitions);
    await submissions.submit({
      tenantId,
      applicationId: draft.applicationId,
      expectedDraftVersion: draft.version,
      idempotencyKey: `submit:${draft.applicationId}:${draft.version}`,
      actorUserId: applicantUserId,
      actorRoleKeys: ['applicant'],
      seasonId: SEASON,
      organizationId,
    });

    const outOfScope = await reviews.listQueue(tenantId, {
      userId: randomUUID(),
      roleKeys: ['reviewer'],
      organizationId: randomUUID(),
    });
    expect(outOfScope).toEqual([]);

    const reviewer = {
      userId: reviewerUserId,
      roleKeys: ['reviewer'],
      scopeType: 'local_organization' as const,
      organizationId,
    };
    expect(await reviews.listQueue(tenantId, reviewer)).toHaveLength(1);
    const assigned = await reviews.startReview({
      tenantId,
      applicationId: draft.applicationId,
      actor: reviewer,
      idempotencyKey: `review-start:${draft.applicationId}`,
    });
    expect(assigned).toMatchObject({
      applicationId: draft.applicationId,
      lifecycleState: 'under_review',
      assignedReviewerUserId: reviewerUserId,
    });
    const reviewCase = await reviews.getCase(tenantId, reviewer, draft.applicationId);
    expect(reviewCase.requirements).toHaveLength(4);
    expect(reviewCase.requirements.find((item) => item.code === 'GOVERNING_DOCUMENT')).toMatchObject({
      response: { attached: true },
      evidence: [
        expect.objectContaining({
          contentType: 'application/pdf',
        }),
      ],
    });
    expect(
      reviewCase.requirements
        .flatMap((item) => item.evidence)
        .some((item) => 'contentHash' in item),
    ).toBe(false);
    await expect(
      reviews.getCase(
        tenantId,
        { ...reviewer, userId: randomUUID() },
        draft.applicationId,
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND,
    } satisfies Partial<AppError>);

    const decisionService = createAffiliationDecisionService();
    const proposed = await decisionService.propose({
      tenantId,
      applicationId: draft.applicationId,
      actor: reviewer,
      outcome: 'approve',
      reason: 'Submitted evidence establishes eligibility.',
      idempotencyKey: `decision-proposal:${draft.applicationId}:approve`,
    });
    expect(proposed).toMatchObject({
      outcome: 'approve',
      status: 'pending',
      currentStepCode: 'regional_signoff',
      executable: false,
    });
    const stateBeforeDecisions = await withTenantTransaction(tenantId, (client) =>
      client.query<{ current_state: string }>(
        `SELECT current_state FROM governance.entity_state
          WHERE entity_type = 'AffiliationApplication' AND entity_id = $1`,
        [draft.applicationId],
      ),
    );
    expect(stateBeforeDecisions[0]?.current_state).toBe('under_review');

    const regional = {
      userId: randomUUID(),
      roleKeys: ['regional_reviewer'],
      scopeType: 'local_organization' as const,
      organizationId,
    };
    const regionalApproved = await decisionService.decide({
      tenantId,
      applicationId: draft.applicationId,
      actor: regional,
      workflowInstanceId: proposed.workflowInstanceId,
      stepCode: 'regional_signoff',
      decision: 'approve',
      reason: 'Regional review supports the proposed approval.',
    });
    expect(regionalApproved.currentStepCode).toBe('national_signoff');
    const national = {
      userId: randomUUID(),
      roleKeys: ['national_reviewer'],
      scopeType: 'local_organization' as const,
      organizationId,
    };
    const fullyApproved = await decisionService.decide({
      tenantId,
      applicationId: draft.applicationId,
      actor: national,
      workflowInstanceId: proposed.workflowInstanceId,
      stepCode: 'national_signoff',
      decision: 'approve',
      reason: 'National review confirms the proposed approval.',
    });
    expect(fullyApproved).toMatchObject({ status: 'approved', executable: true });
    const executed = await decisionService.execute({
      tenantId,
      applicationId: draft.applicationId,
      actor: reviewer,
      workflowInstanceId: proposed.workflowInstanceId,
      idempotencyKey: `decision-execution:${proposed.workflowInstanceId}`,
    });
    expect(executed).toEqual({ lifecycleState: 'approved', idempotentReplay: false });
    await withTenantTransaction(tenantId, (client) =>
      client.query(
        `INSERT INTO affiliation.season (tenant_id, season_id, status, is_current)
         VALUES ($1, $2, 'published', true)
         ON CONFLICT (tenant_id, season_id) DO UPDATE SET status = 'published', is_current = true`,
        [tenantId, SEASON],
      ),
    );
    const activated = await decisionService.activate({
      tenantId,
      applicationId: draft.applicationId,
      actor: reviewer,
      idempotencyKey: `activation:${draft.applicationId}`,
      reason: 'Activate the approved affiliation.',
    });
    expect(activated).toEqual({ lifecycleState: 'active', idempotentReplay: false });
    await expect(
      decisionService.activate({
        tenantId,
        applicationId: draft.applicationId,
        actor: reviewer,
        idempotencyKey: `activation:${draft.applicationId}`,
      }),
    ).resolves.toEqual({ lifecycleState: 'active', idempotentReplay: true });

    await withTenantTransaction(tenantId, async (client) => {
      const state = await client.query<{ current_state: string }>(
        `SELECT current_state FROM governance.entity_state
          WHERE entity_type = 'AffiliationApplication' AND entity_id = $1`,
        [draft.applicationId],
      );
      const assignment = await client.query<{
        reviewer_user_id: string;
        reviewer_scope_id: string;
        state_transition_id: string;
      }>(
        `SELECT reviewer_user_id, reviewer_scope_id, state_transition_id
           FROM affiliation.review_assignment WHERE application_id = $1`,
        [draft.applicationId],
      );
      expect(state[0]?.current_state).toBe('active');
      expect(assignment[0]).toMatchObject({
        reviewer_user_id: reviewerUserId,
        reviewer_scope_id: organizationId,
      });
      expect(assignment[0]?.state_transition_id).toBeTruthy();
    });
  });
});
