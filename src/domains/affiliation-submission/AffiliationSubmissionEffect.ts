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
    const raw = tx.raw?.();
    if (raw === undefined) {
      throw new AppError(
        ErrorCode.CONFIG_ERROR,
        'PgAffiliationSubmissionEffect requires a raw transaction client.',
      );
    }
    if (ctx.trigger === 'review_start') {
      await this.assignReviewer(raw, ctx);
      return undefined;
    }
    if (ctx.trigger !== 'submit') return undefined;

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

  private async assignReviewer(
    raw: DomainEffectQueryClient,
    ctx: DomainEffectContext,
  ): Promise<void> {
    const roles = new Set(ctx.actor.roles ?? []);
    const platformReviewer = roles.has('admin') || roles.has('platform_admin');
    const candidates: ReadonlyArray<readonly [string, string | undefined]> = [
      ['scope', ctx.actor.scopeId],
      ['organization', ctx.actor.organizationId],
      ['organization_unit', ctx.actor.organizationUnitId],
      ['national_organization', ctx.actor.nationalOrganizationId],
      ['regional_organization', ctx.actor.regionalOrganizationId],
      ['local_organization', ctx.actor.localOrganizationId],
    ];
    const scopedCandidates = candidates.filter(
      (candidate): candidate is readonly [string, string] =>
        typeof candidate[1] === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          candidate[1],
        ),
    );
    const rows = await raw.query<{
      organization_id: string | null;
      organization_unit_id: string | null;
      national_organization_id: string | null;
      regional_organization_id: string | null;
      local_organization_id: string | null;
      scope_id: string | null;
    }>(
      `SELECT organization_id, organization_unit_id, national_organization_id,
              regional_organization_id, local_organization_id, scope_id
         FROM affiliation.affiliation_application
        WHERE tenant_id = $1 AND id = $2`,
      [ctx.tenantId, ctx.entityId],
    );
    const application = rows[0];
    if (application === undefined) {
      throw new AppError(
        ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND,
        'The affiliation application was not found.',
      );
    }
    const applicationScopes = new Set(
      [
        application.organization_id,
        application.organization_unit_id,
        application.national_organization_id,
        application.regional_organization_id,
        application.local_organization_id,
        application.scope_id,
      ].filter((value): value is string => value !== null),
    );
    const matched = scopedCandidates.find(([, id]) => applicationScopes.has(id));
    if (!platformReviewer && matched === undefined) {
      throw new AppError(
        ErrorCode.PERMISSION_DENIED,
        'The reviewer is not authorized for this affiliation scope.',
      );
    }

    await raw.query(
      `INSERT INTO affiliation.review_assignment
         (tenant_id, application_id, reviewer_user_id, reviewer_scope_type,
          reviewer_scope_id, state_transition_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, application_id) DO NOTHING`,
      [
        ctx.tenantId,
        ctx.entityId,
        ctx.actor.actorId,
        platformReviewer ? 'platform' : matched?.[0],
        platformReviewer ? null : matched?.[1],
        ctx.stateTransitionId,
      ],
    );
  }
}
