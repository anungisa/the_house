import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type {
  DomainEffectContext,
  DomainEffectQueryClient,
  DomainEffectResult,
  GovernanceTx,
  TransitionDomainEffect,
} from '../../governance/kernel/ports.js';

interface DraftAggregateRow extends Record<string, unknown> {
  application_id: string;
  organization_id: string | null;
  season_id: string;
  pathway: string | null;
  version: number;
  requirements: unknown;
  responses: unknown;
  evidence: unknown;
  incomplete_count: string | number;
}

function requiredInteger(payload: Readonly<Record<string, unknown>>, key: string): number {
  const value = payload[key];
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new AppError(ErrorCode.INVALID_INPUT, `A positive integer '${key}' is required.`);
  }
  return Number(value);
}

/**
 * Persists the first immutable submission snapshot on the SAME PostgreSQL connection and inside
 * the SAME transaction as the governed `submit` transition. A failed readiness/version check
 * therefore rolls back the entity state, journal, audit, snapshot, and outbox together.
 */
export class PgAffiliationSubmissionEffect implements TransitionDomainEffect {
  async apply(tx: GovernanceTx, ctx: DomainEffectContext): Promise<DomainEffectResult | void> {
    if (ctx.trigger !== 'submit') return undefined;
    const raw = tx.raw?.();
    if (raw === undefined) {
      throw new AppError(
        ErrorCode.CONFIG_ERROR,
        'PgAffiliationSubmissionEffect requires a raw transaction client.',
      );
    }

    const expectedVersion = requiredInteger(ctx.payload, 'expectedDraftVersion');
    const aggregate = await this.loadAggregate(raw, ctx.tenantId, ctx.entityId);
    if (aggregate === undefined) {
      throw new AppError(
        ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND,
        'The affiliation application was not found.',
      );
    }
    if (aggregate.version !== expectedVersion) {
      throw new AppError(
        ErrorCode.AFFILIATION_DRAFT_VERSION_CONFLICT,
        'The application changed before it could be submitted.',
        { details: { currentVersion: aggregate.version } },
      );
    }
    if (Number(aggregate.incomplete_count) !== 0) {
      throw new AppError(
        ErrorCode.AFFILIATION_SUBMISSION_NOT_READY,
        'The application is not complete enough to submit.',
      );
    }

    const sequenceRows = await raw.query<{ next_sequence: number }>(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
         FROM affiliation.submission_snapshot
        WHERE tenant_id = $1 AND application_id = $2`,
      [ctx.tenantId, ctx.entityId],
    );
    const sequence = Number(sequenceRows[0]?.next_sequence ?? 1);
    const snapshot = {
      applicationId: aggregate.application_id,
      tenantId: ctx.tenantId,
      organizationId: aggregate.organization_id,
      seasonId: aggregate.season_id,
      pathway: aggregate.pathway,
      requirementVersions: aggregate.requirements,
      responses: aggregate.responses,
      evidenceReferences: aggregate.evidence,
      completeness: { eligibleForSubmission: true, incompleteCount: 0 },
      sourceDraftVersion: aggregate.version,
      submittedBy: ctx.actor.actorId,
      correlationId: ctx.context.correlationId,
      causationId: ctx.context.causationId,
      governedTransition: {
        stateTransitionId: ctx.stateTransitionId,
        fromState: ctx.fromState,
        toState: ctx.toState,
      },
      sequence,
    };

    await raw.query(
      `INSERT INTO affiliation.submission_snapshot
         (tenant_id, application_id, sequence, source_draft_version, idempotency_key,
          state_transition_id, snapshot, submitted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        ctx.tenantId,
        ctx.entityId,
        sequence,
        aggregate.version,
        String(ctx.payload.submissionIdempotencyKey ?? ''),
        ctx.stateTransitionId,
        JSON.stringify(snapshot),
        ctx.actor.actorId,
      ],
    );
    return {
      evidenceManifest: {
        submissionSequence: sequence,
        sourceDraftVersion: aggregate.version,
      },
    };
  }

  private async loadAggregate(
    raw: DomainEffectQueryClient,
    tenantId: string,
    applicationId: string,
  ): Promise<DraftAggregateRow | undefined> {
    const rows = await raw.query<DraftAggregateRow>(
      `SELECT a.id AS application_id, a.organization_id, a.season_id,
              a.application_type AS pathway, d.version,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'code', ar.requirement_code,
                  'version', ar.requirement_version,
                  'appliesBecause', ar.applies_because,
                  'evidenceRequired', rd.evidence_required
                ) ORDER BY ar.requirement_code)
                  FROM affiliation.application_requirement ar
                  JOIN affiliation.requirement_definition rd
                    ON rd.code = ar.requirement_code AND rd.version = ar.requirement_version
                 WHERE ar.tenant_id = $1 AND ar.application_id = $2
              ), '[]'::jsonb) AS requirements,
              COALESCE((
                SELECT jsonb_object_agg(dr.requirement_code, dr.response_value)
                  FROM affiliation.draft_response dr
                 WHERE dr.tenant_id = $1 AND dr.application_id = $2
              ), '{}'::jsonb) AS responses,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'requirementCode', de.requirement_code,
                  'evidenceObjectId', de.evidence_object_id,
                  'contentHash', de.content_hash,
                  'contentType', de.content_type,
                  'displayName', de.display_name
                ) ORDER BY de.requirement_code, de.associated_at)
                  FROM affiliation.draft_evidence_link de
                 WHERE de.tenant_id = $1 AND de.application_id = $2
              ), '[]'::jsonb) AS evidence,
              (
                SELECT COUNT(*)
                  FROM affiliation.application_requirement ar
                  JOIN affiliation.requirement_definition rd
                    ON rd.code = ar.requirement_code AND rd.version = ar.requirement_version
             LEFT JOIN affiliation.draft_response dr
                    ON dr.tenant_id = ar.tenant_id AND dr.application_id = ar.application_id
                   AND dr.requirement_code = ar.requirement_code
                 WHERE ar.tenant_id = $1 AND ar.application_id = $2
                   AND (
                     dr.requirement_code IS NULL OR dr.response_value = '{}'::jsonb
                     OR (
                       rd.evidence_required
                       AND NOT EXISTS (
                         SELECT 1 FROM affiliation.draft_evidence_link de
                          WHERE de.tenant_id = ar.tenant_id
                            AND de.application_id = ar.application_id
                            AND de.requirement_code = ar.requirement_code
                       )
                     )
                   )
              ) AS incomplete_count
         FROM affiliation.affiliation_application a
         JOIN affiliation.application_draft d
           ON d.tenant_id = a.tenant_id AND d.application_id = a.id
        WHERE a.tenant_id = $1 AND a.id = $2
        FOR UPDATE OF d`,
      [tenantId, applicationId],
    );
    return rows[0];
  }
}
