import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import { withTenantTransaction, type QueryClient } from '../../db/pool.js';
import type { AffiliationApplicationService } from '../affiliation/AffiliationApplicationService.js';
import type {
  CorrectionRequestView,
  OpenCorrectionInput,
  ResubmitCorrectionInput,
  SubmissionReceipt,
  SubmitAffiliationInput,
} from './AffiliationSubmissionTypes.js';

const REVIEWER_ROLES = new Set(['reviewer', 'approver', 'admin', 'platform_admin']);

function requireReviewer(roles: readonly string[]): void {
  if (!roles.some((role) => REVIEWER_ROLES.has(role))) {
    throw new AppError(ErrorCode.FORBIDDEN, 'Reviewer authority is required.');
  }
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export class AffiliationSubmissionService {
  constructor(private readonly transitions: AffiliationApplicationService) {}

  async submit(input: SubmitAffiliationInput): Promise<SubmissionReceipt> {
    const result = await this.transitions.submitAffiliationApplication({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      actor: {
        userId: input.actorUserId,
        roleKeys: input.actorRoleKeys,
        organizationId: input.organizationId,
      },
      context: {
        seasonId: input.seasonId,
        organizationId: input.organizationId,
        ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
        ...(input.causationId !== undefined ? { causationId: input.causationId } : {}),
      },
      idempotencyKey: input.idempotencyKey,
      payload: {
        expectedDraftVersion: input.expectedDraftVersion,
        submissionIdempotencyKey: input.idempotencyKey,
      },
    });
    if (result.status === 'approval_required') {
      throw new AppError(
        ErrorCode.AFFILIATION_SUBMISSION_NOT_READY,
        'Submission unexpectedly requires approval.',
      );
    }
    if (result.status === 'rejected') {
      throw new AppError(
        result.code === ErrorCode.PERMISSION_DENIED
          ? ErrorCode.FORBIDDEN
          : ErrorCode.AFFILIATION_SUBMISSION_NOT_READY,
        result.message,
      );
    }
    return this.receiptByIdempotency(
      input.tenantId,
      input.applicationId,
      input.idempotencyKey,
    );
  }

  async openCorrection(input: OpenCorrectionInput): Promise<CorrectionRequestView> {
    requireReviewer(input.reviewerRoleKeys);
    if (input.reasons.length === 0) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'At least one correction reason is required.');
    }
    const codes = [...new Set(input.reasons.map((reason) => reason.requirementCode.trim()))];
    if (codes.some((code) => code === '') || input.reasons.some((reason) => reason.reason.trim() === '')) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'Correction reasons require a requirement code and non-empty reason.',
      );
    }

    return withTenantTransaction(input.tenantId, async (client) => {
      const application = await client.query<{
        applicant_user_id: string | null;
        current_state: string | null;
      }>(
        `SELECT a.applicant_user_id, es.current_state
           FROM affiliation.affiliation_application a
           JOIN governance.entity_state es
             ON es.tenant_id = a.tenant_id AND es.entity_type = 'AffiliationApplication'
            AND es.entity_id = a.id
          WHERE a.id = $1
          FOR UPDATE OF a`,
        [input.applicationId],
      );
      const app = application[0];
      if (app === undefined) {
        throw new AppError(
          ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND,
          'Affiliation application not found.',
        );
      }
      if (app.applicant_user_id === input.reviewerUserId) {
        throw new AppError(ErrorCode.FORBIDDEN, 'A representative cannot review their own application.');
      }
      if (app.current_state !== 'submitted' && app.current_state !== 'under_review') {
        throw new AppError(
          ErrorCode.AFFILIATION_CORRECTION_CONFLICT,
          'Corrections can only be requested for a submitted application.',
        );
      }

      const bound = await client.query<{ requirement_code: string }>(
        `SELECT requirement_code
           FROM affiliation.application_requirement
          WHERE application_id = $1 AND requirement_code = ANY($2::text[])`,
        [input.applicationId, codes],
      );
      if (bound.length !== codes.length) {
        throw new AppError(
          ErrorCode.AFFILIATION_REQUIREMENT_UNKNOWN,
          'A correction reason references an unknown requirement.',
        );
      }

      let inserted: { id: string; opened_at: unknown }[];
      try {
        inserted = await client.query<{ id: string; opened_at: unknown }>(
          `INSERT INTO affiliation.correction_request
             (tenant_id, application_id, requirement_codes, reasons, opened_by)
           VALUES ($1, $2, $3, $4::jsonb, $5)
           RETURNING id, opened_at`,
          [
            input.tenantId,
            input.applicationId,
            codes,
            JSON.stringify(input.reasons),
            input.reviewerUserId,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new AppError(
            ErrorCode.AFFILIATION_CORRECTION_CONFLICT,
            'An open correction request already exists.',
          );
        }
        throw error;
      }
      const row = inserted[0];
      if (row === undefined) throw new Error('Failed to create correction request.');
      await client.query(
        `INSERT INTO affiliation.correction_event
           (tenant_id, correction_request_id, event_type, actor, detail)
         VALUES ($1, $2, 'opened', $3, $4::jsonb)`,
        [input.tenantId, row.id, input.reviewerUserId, JSON.stringify({ requirementCodes: codes })],
      );
      await this.recordDomainEvent(client, {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        action: 'affiliation_correction_opened',
        messageType: 'affiliation.correction.opened',
        actorUserId: input.reviewerUserId,
        dedupeKey: `affiliation-correction-opened:${row.id}`,
        payload: {
          correctionRequestId: row.id,
          requirementCodes: codes,
          reasons: input.reasons,
        },
      });
      return {
        correctionRequestId: row.id,
        applicationId: input.applicationId,
        status: 'open',
        requirementCodes: codes,
        reasons: input.reasons,
        openedAt: toIso(row.opened_at),
      };
    });
  }

  async resubmitCorrection(input: ResubmitCorrectionInput): Promise<SubmissionReceipt> {
    return withTenantTransaction(input.tenantId, async (client) => {
      const replay = await this.receiptRow(
        client,
        input.applicationId,
        input.idempotencyKey,
      );
      if (replay !== undefined) return replay;

      const correctionRows = await client.query<{
        id: string;
        status: string;
        requirement_codes: string[];
        applicant_user_id: string | null;
      }>(
        `SELECT cr.id, cr.status, cr.requirement_codes, a.applicant_user_id
           FROM affiliation.correction_request cr
           JOIN affiliation.affiliation_application a
             ON a.tenant_id = cr.tenant_id AND a.id = cr.application_id
          WHERE cr.id = $1 AND cr.application_id = $2
          FOR UPDATE OF cr`,
        [input.correctionRequestId, input.applicationId],
      );
      const correction = correctionRows[0];
      if (correction === undefined) {
        throw new AppError(
          ErrorCode.AFFILIATION_CORRECTION_NOT_FOUND,
          'Correction request not found.',
        );
      }
      if (correction.status !== 'open') {
        throw new AppError(
          ErrorCode.AFFILIATION_CORRECTION_CONFLICT,
          'The correction request is no longer open.',
        );
      }
      if (correction.applicant_user_id !== input.actorUserId) {
        throw new AppError(
          ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND,
          'Affiliation application not found.',
        );
      }

      const draftRows = await client.query<{ version: number }>(
        `SELECT version FROM affiliation.application_draft
          WHERE application_id = $1 FOR UPDATE`,
        [input.applicationId],
      );
      const draftVersion = draftRows[0]?.version;
      if (draftVersion === undefined) {
        throw new AppError(
          ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND,
          'Affiliation application not found.',
        );
      }
      if (draftVersion !== input.expectedDraftVersion) {
        throw new AppError(
          ErrorCode.AFFILIATION_DRAFT_VERSION_CONFLICT,
          'The application changed before it could be resubmitted.',
          { details: { currentVersion: draftVersion } },
        );
      }
      await this.assertComplete(client, input.applicationId);

      const sequenceRows = await client.query<{ next_sequence: number }>(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
           FROM affiliation.submission_snapshot
          WHERE application_id = $1`,
        [input.applicationId],
      );
      const sequence = Number(sequenceRows[0]?.next_sequence ?? 1);
      const snapshot = await this.snapshotDocument(
        client,
        input.tenantId,
        input.applicationId,
        draftVersion,
        input.actorUserId,
        sequence,
        input.correctionRequestId,
      );
      const inserted = await client.query<{
        id: string;
        submitted_at: unknown;
      }>(
        `INSERT INTO affiliation.submission_snapshot
           (tenant_id, application_id, sequence, source_draft_version, idempotency_key,
            snapshot, submitted_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         RETURNING id, submitted_at`,
        [
          input.tenantId,
          input.applicationId,
          sequence,
          draftVersion,
          input.idempotencyKey,
          JSON.stringify(snapshot),
          input.actorUserId,
        ],
      );
      const receipt = inserted[0];
      if (receipt === undefined) throw new Error('Failed to create corrected submission receipt.');
      const resolved = await client.query(
        `UPDATE affiliation.correction_request
            SET status = 'resolved', resolved_by = $3, resolved_at = now(),
                resolution_snapshot_id = $4
          WHERE id = $1 AND application_id = $2 AND status = 'open'
          RETURNING id`,
        [input.correctionRequestId, input.applicationId, input.actorUserId, receipt.id],
      );
      if (resolved.length !== 1) {
        throw new AppError(
          ErrorCode.AFFILIATION_CORRECTION_CONFLICT,
          'The correction request was already resolved.',
        );
      }
      await client.query(
        `INSERT INTO affiliation.correction_event
           (tenant_id, correction_request_id, event_type, actor, detail)
         VALUES ($1, $2, 'resolved', $3, $4::jsonb)`,
        [
          input.tenantId,
          input.correctionRequestId,
          input.actorUserId,
          JSON.stringify({ submissionSnapshotId: receipt.id, sequence }),
        ],
      );
      await this.recordDomainEvent(client, {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        action: 'affiliation_correction_resubmitted',
        messageType: 'affiliation.correction.resubmitted',
        actorUserId: input.actorUserId,
        dedupeKey: `affiliation-correction-resubmitted:${receipt.id}`,
        payload: {
          correctionRequestId: input.correctionRequestId,
          submissionSnapshotId: receipt.id,
          sequence,
          sourceDraftVersion: draftVersion,
        },
      });
      return {
        receiptId: receipt.id,
        applicationId: input.applicationId,
        sequence,
        sourceDraftVersion: draftVersion,
        submittedAt: toIso(receipt.submitted_at),
        submittedBy: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      };
    });
  }

  private receiptByIdempotency(
    tenantId: string,
    applicationId: string,
    idempotencyKey: string,
  ): Promise<SubmissionReceipt> {
    return withTenantTransaction(tenantId, async (client) => {
      const receipt = await this.receiptRow(client, applicationId, idempotencyKey);
      if (receipt === undefined) {
        throw new AppError(
          ErrorCode.CONFIG_ERROR,
          'The governed submission completed without an immutable receipt.',
        );
      }
      return receipt;
    });
  }

  private async receiptRow(
    client: QueryClient,
    applicationId: string,
    idempotencyKey: string,
  ): Promise<SubmissionReceipt | undefined> {
    const rows = await client.query<{
      id: string;
      sequence: number;
      source_draft_version: number;
      submitted_at: unknown;
      submitted_by: string;
      state_transition_id: string | null;
    }>(
      `SELECT id, sequence, source_draft_version, submitted_at, submitted_by, state_transition_id
         FROM affiliation.submission_snapshot
        WHERE application_id = $1 AND idempotency_key = $2`,
      [applicationId, idempotencyKey],
    );
    const row = rows[0];
    if (row === undefined) return undefined;
    return {
      receiptId: row.id,
      applicationId,
      sequence: row.sequence,
      sourceDraftVersion: row.source_draft_version,
      submittedAt: toIso(row.submitted_at),
      submittedBy: row.submitted_by,
      ...(row.state_transition_id !== null ? { stateTransitionId: row.state_transition_id } : {}),
      idempotencyKey,
    };
  }

  private async assertComplete(client: QueryClient, applicationId: string): Promise<void> {
    const rows = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM affiliation.application_requirement ar
         JOIN affiliation.requirement_definition rd
           ON rd.code = ar.requirement_code AND rd.version = ar.requirement_version
    LEFT JOIN affiliation.draft_response dr
           ON dr.tenant_id = ar.tenant_id AND dr.application_id = ar.application_id
          AND dr.requirement_code = ar.requirement_code
        WHERE ar.application_id = $1
          AND (
            dr.requirement_code IS NULL OR dr.response_value = '{}'::jsonb
            OR (rd.evidence_required AND NOT EXISTS (
              SELECT 1 FROM affiliation.draft_evidence_link de
               WHERE de.tenant_id = ar.tenant_id
                 AND de.application_id = ar.application_id
                 AND de.requirement_code = ar.requirement_code
            ))
          )`,
      [applicationId],
    );
    if ((rows[0]?.n ?? 0) !== 0) {
      throw new AppError(
        ErrorCode.AFFILIATION_SUBMISSION_NOT_READY,
        'The application is not complete enough to resubmit.',
      );
    }
  }

  private async snapshotDocument(
    client: QueryClient,
    tenantId: string,
    applicationId: string,
    draftVersion: number,
    actorUserId: string,
    sequence: number,
    correctionRequestId: string,
  ): Promise<Record<string, unknown>> {
    const rows = await client.query<{
      organization_id: string | null;
      season_id: string;
      application_type: string | null;
      requirements: unknown;
      responses: unknown;
      evidence: unknown;
    }>(
      `SELECT a.organization_id, a.season_id, a.application_type,
              COALESCE((SELECT jsonb_agg(to_jsonb(ar) - 'tenant_id' ORDER BY ar.requirement_code)
                FROM affiliation.application_requirement ar WHERE ar.application_id = a.id), '[]') AS requirements,
              COALESCE((SELECT jsonb_object_agg(dr.requirement_code, dr.response_value)
                FROM affiliation.draft_response dr WHERE dr.application_id = a.id), '{}') AS responses,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'requirementCode', de.requirement_code, 'evidenceObjectId', de.evidence_object_id,
                'contentHash', de.content_hash, 'contentType', de.content_type,
                'displayName', de.display_name) ORDER BY de.associated_at)
                FROM affiliation.draft_evidence_link de WHERE de.application_id = a.id), '[]') AS evidence
         FROM affiliation.affiliation_application a WHERE a.id = $1`,
      [applicationId],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new AppError(
        ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND,
        'Affiliation application not found.',
      );
    }
    return {
      applicationId,
      tenantId,
      organizationId: row.organization_id,
      seasonId: row.season_id,
      pathway: row.application_type,
      requirementVersions: row.requirements,
      responses: row.responses,
      evidenceReferences: row.evidence,
      completeness: { eligibleForSubmission: true, incompleteCount: 0 },
      sourceDraftVersion: draftVersion,
      submittedBy: actorUserId,
      sequence,
      correctionRequestId,
    };
  }

  private async recordDomainEvent(
    client: QueryClient,
    input: {
      tenantId: string;
      applicationId: string;
      action: string;
      messageType: string;
      actorUserId: string;
      dedupeKey: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO governance.audit_event
         (tenant_id, entity_type, entity_id, action, actor_user_id, payload)
       VALUES ($1, 'AffiliationApplication', $2, $3, $4, $5::jsonb)`,
      [
        input.tenantId,
        input.applicationId,
        input.action,
        input.actorUserId,
        JSON.stringify(input.payload),
      ],
    );
    await client.query(
      `INSERT INTO governance.outbox_message
         (tenant_id, message_type, payload, status, max_retries, dedupe_key)
       VALUES ($1, $2, $3::jsonb, 'pending', 10, $4)`,
      [
        input.tenantId,
        input.messageType,
        JSON.stringify({
          entityType: 'AffiliationApplication',
          entityId: input.applicationId,
          actorUserId: input.actorUserId,
          ...input.payload,
        }),
        input.dedupeKey,
      ],
    );
  }
}
