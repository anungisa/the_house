import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import { withTenantTransaction } from '../../db/pool.js';
import type { AffiliationApplicationService } from '../affiliation/AffiliationApplicationService.js';
import type {
  AffiliationReviewQueueFilter,
  AffiliationReviewQueueItem,
  AffiliationReviewerActor,
  StartAffiliationReviewInput,
} from './AffiliationReviewTypes.js';

const REVIEWER_ROLES = new Set(['reviewer', 'approver', 'admin', 'platform_admin']);
const GLOBAL_REVIEWER_ROLES = new Set(['admin', 'platform_admin']);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function assertReviewer(actor: AffiliationReviewerActor): void {
  if (!actor.roleKeys.some((role) => REVIEWER_ROLES.has(role))) {
    throw new AppError(ErrorCode.FORBIDDEN, 'Reviewer authority is required.');
  }
}

function actorScopeIds(actor: AffiliationReviewerActor): readonly string[] {
  return [
    actor.scopeId,
    actor.organizationId,
    actor.organizationUnitId,
    actor.nationalOrganizationId,
    actor.regionalOrganizationId,
    actor.localOrganizationId,
  ].filter((value): value is string => typeof value === 'string' && UUID.test(value));
}

function isGlobalReviewer(actor: AffiliationReviewerActor): boolean {
  return actor.roleKeys.some((role) => GLOBAL_REVIEWER_ROLES.has(role));
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export class AffiliationReviewService {
  constructor(private readonly transitions: AffiliationApplicationService) {}

  async listQueue(
    tenantId: string,
    actor: AffiliationReviewerActor,
    filter: AffiliationReviewQueueFilter = {},
  ): Promise<readonly AffiliationReviewQueueItem[]> {
    assertReviewer(actor);
    const scopeIds = actorScopeIds(actor);
    if (!isGlobalReviewer(actor) && scopeIds.length === 0) {
      throw new AppError(ErrorCode.FORBIDDEN, 'A delegated reviewer scope is required.');
    }
    return withTenantTransaction(tenantId, async (client) => {
      const rows = await client.query<{
        application_id: string;
        organization_id: string | null;
        season_id: string;
        application_type: string | null;
        current_state: 'submitted' | 'under_review';
        submitted_at: unknown;
        sequence: number;
        reviewer_user_id: string | null;
        assigned_at: unknown | null;
      }>(
        `SELECT a.id AS application_id, a.organization_id, a.season_id, a.application_type,
                es.current_state, ss.submitted_at, ss.sequence,
                ra.reviewer_user_id, ra.assigned_at
           FROM affiliation.affiliation_application a
           JOIN governance.entity_state es
             ON es.tenant_id = a.tenant_id
            AND es.entity_type = 'AffiliationApplication' AND es.entity_id = a.id
           JOIN LATERAL (
             SELECT submitted_at, sequence
               FROM affiliation.submission_snapshot
              WHERE application_id = a.id
              ORDER BY sequence DESC LIMIT 1
           ) ss ON true
      LEFT JOIN affiliation.review_assignment ra
             ON ra.tenant_id = a.tenant_id AND ra.application_id = a.id
            AND ra.released_at IS NULL
          WHERE es.current_state IN ('submitted', 'under_review')
            AND ($1::text IS NULL OR a.season_id = $1)
            AND ($2::text IS NULL OR es.current_state = $2)
            AND (
              $3::boolean
              OR a.organization_id = ANY($4::uuid[])
              OR a.organization_unit_id = ANY($4::uuid[])
              OR a.national_organization_id = ANY($4::uuid[])
              OR a.regional_organization_id = ANY($4::uuid[])
              OR a.local_organization_id = ANY($4::uuid[])
              OR a.scope_id = ANY($4::uuid[])
            )
            AND (
              es.current_state = 'submitted'
              OR ra.reviewer_user_id = $5
              OR $3::boolean
            )
          ORDER BY ss.submitted_at ASC, a.id ASC`,
        [
          filter.seasonId ?? null,
          filter.state ?? null,
          isGlobalReviewer(actor),
          scopeIds,
          actor.userId,
        ],
      );
      return rows.map((row) => ({
        applicationId: row.application_id,
        ...(row.organization_id !== null ? { organizationId: row.organization_id } : {}),
        seasonId: row.season_id,
        ...(row.application_type !== null ? { pathway: row.application_type } : {}),
        lifecycleState: row.current_state,
        submittedAt: toIso(row.submitted_at),
        submissionSequence: row.sequence,
        ...(row.reviewer_user_id !== null
          ? { assignedReviewerUserId: row.reviewer_user_id }
          : {}),
        ...(row.assigned_at !== null ? { assignedAt: toIso(row.assigned_at) } : {}),
      }));
    });
  }

  async startReview(input: StartAffiliationReviewInput): Promise<AffiliationReviewQueueItem> {
    assertReviewer(input.actor);
    const scopeIds = actorScopeIds(input.actor);
    if (!isGlobalReviewer(input.actor) && scopeIds.length === 0) {
      throw new AppError(ErrorCode.FORBIDDEN, 'A delegated reviewer scope is required.');
    }
    const visible = await this.listQueue(input.tenantId, input.actor, { state: 'submitted' });
    const item = visible.find((candidate) => candidate.applicationId === input.applicationId);
    if (item === undefined) {
      throw new AppError(
        ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND,
        'Affiliation application not found.',
      );
    }
    const result = await this.transitions.startAffiliationReview({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      actor: {
        userId: input.actor.userId,
        roleKeys: input.actor.roleKeys,
        ...(input.actor.scopeType !== undefined ? { scopeType: input.actor.scopeType } : {}),
        ...(input.actor.scopeId !== undefined ? { scopeId: input.actor.scopeId } : {}),
        ...(input.actor.organizationId !== undefined
          ? { organizationId: input.actor.organizationId }
          : {}),
        ...(input.actor.organizationUnitId !== undefined
          ? { organizationUnitId: input.actor.organizationUnitId }
          : {}),
        ...(input.actor.nationalOrganizationId !== undefined
          ? { nationalOrganizationId: input.actor.nationalOrganizationId }
          : {}),
        ...(input.actor.regionalOrganizationId !== undefined
          ? { regionalOrganizationId: input.actor.regionalOrganizationId }
          : {}),
        ...(input.actor.localOrganizationId !== undefined
          ? { localOrganizationId: input.actor.localOrganizationId }
          : {}),
      },
      context: {
        seasonId: item.seasonId,
        ...(item.organizationId !== undefined ? { organizationId: item.organizationId } : {}),
        ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
      },
      idempotencyKey: input.idempotencyKey,
    });
    if (result.status !== 'executed') {
      throw new AppError(
        ErrorCode.AFFILIATION_REVIEW_CONFLICT,
        'The affiliation could not be moved into review.',
      );
    }
    const refreshed = await this.listQueue(input.tenantId, input.actor, { state: 'under_review' });
    const assigned = refreshed.find((candidate) => candidate.applicationId === input.applicationId);
    if (assigned === undefined) {
      throw new AppError(ErrorCode.CONFIG_ERROR, 'Review started without a visible assignment.');
    }
    return assigned;
  }
}
