/**
 * PostgreSQL {@link AffiliationDraftStore} — RLS-enforced draft persistence in the `affiliation`
 * schema (migration 0016). Every operation runs inside {@link withTenantTransaction}, so
 * `app.tenant_id` is set transaction-locally and RLS applies to every row touched. The store
 * NEVER writes governed lifecycle state and NEVER invokes the kernel.
 *
 * Concurrency: `saveDraft` locks the draft head `FOR UPDATE` and checks the optimistic version;
 * a mismatch returns a deterministic `version_conflict` (never a lost update). Initiation is
 * serialized per subject with a transaction advisory lock so two racing initiations cannot create
 * two applications for the same (tenant, org, season, pathway).
 */

import pg from 'pg';
import {
  getPool,
  selectForUpdate,
  withTenantTransaction,
  type QueryClient,
} from '../../db/pool.js';
import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type {
  AddEvidenceLinkInput,
  AddEvidenceLinkResult,
  AffiliationDraftStore,
  BoundRequirementRow,
  DraftApplicationHead,
  DraftHead,
  DraftMutationResult,
  DraftSnapshot,
  InitiateApplicationInput,
  RemoveEvidenceLinkInput,
  RemoveEvidenceLinkResult,
  RenewalInitiationContext,
  SaveDraftInput,
  StoredEvidenceLinkRow,
  StoredResponseRow,
} from './AffiliationDraftStore.js';

/** Governed outbox message type for a renewal application being started against a standing. */
export const STANDING_RENEWAL_APPLICATION_INITIATED_MESSAGE_TYPE =
  'standing.renewal_application.initiated';

/** Stable outbox dedupe key: exactly one publish per (tenant, standing, target season). */
export function renewalApplicationInitiatedDedupeKey(
  tenantId: string,
  standingId: string,
  targetSeasonId: string,
): string {
  return `${STANDING_RENEWAL_APPLICATION_INITIATED_MESSAGE_TYPE}:${tenantId}:${standingId}:${targetSeasonId}`;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export class PgAffiliationDraftStore implements AffiliationDraftStore {
  constructor(private readonly pool: pg.Pool = getPool()) {}

  /**
   * null => ordinary pre-submission draft (all bound requirements editable);
   * Set => submitted posture with an open bounded correction;
   * empty Set => read-only lifecycle posture.
   */
  private async editableRequirementCodes(
    client: QueryClient,
    applicationId: string,
  ): Promise<ReadonlySet<string> | null> {
    const states = await client.query<{ current_state: string }>(
      `SELECT current_state FROM governance.entity_state
        WHERE entity_type = 'AffiliationApplication' AND entity_id = $1`,
      [applicationId],
    );
    const state = states[0]?.current_state;
    if (state === undefined || state === 'draft') return null;
    if (state !== 'submitted' && state !== 'under_review') return new Set();
    const correction = await client.query<{ requirement_codes: string[] }>(
      `SELECT requirement_codes
         FROM affiliation.correction_request
        WHERE application_id = $1 AND status = 'open'
        FOR UPDATE`,
      [applicationId],
    );
    return new Set(correction[0]?.requirement_codes ?? []);
  }

  async findApplicationBySubject(
    tenantId: string,
    organizationId: string,
    seasonId: string,
    pathway: string,
  ): Promise<DraftApplicationHead | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client) => this.selectHeadBySubject(client, tenantId, organizationId, seasonId, pathway),
      this.pool,
    );
  }

  private async selectHeadBySubject(
    client: QueryClient,
    tenantId: string,
    organizationId: string,
    seasonId: string,
    pathway: string,
  ): Promise<DraftApplicationHead | undefined> {
    const rows = await client.query<{
      id: string;
      organization_id: string | null;
      season_id: string;
      application_type: string | null;
      applicant_user_id: string | null;
    }>(
      `SELECT id, organization_id, season_id, application_type, applicant_user_id
         FROM affiliation.affiliation_application
        WHERE organization_id = $1 AND season_id = $2 AND application_type = $3
        ORDER BY created_at ASC
        LIMIT 1`,
      [organizationId, seasonId, pathway],
    );
    const r = rows[0];
    if (r === undefined) return undefined;
    return {
      applicationId: r.id,
      tenantId,
      organizationId: r.organization_id ?? organizationId,
      seasonId: r.season_id,
      pathway: r.application_type ?? pathway,
      ...(r.applicant_user_id !== null ? { applicantUserId: r.applicant_user_id } : {}),
    };
  }

  async initiateApplication(
    input: InitiateApplicationInput,
  ): Promise<{ head: DraftApplicationHead; created: boolean }> {
    // Store invariant (fails closed): a renewal-pathway application MUST carry a governed renewal
    // context, and a renewal context MUST NOT ride any other pathway. This is the single physical
    // gate that stops a browser from starting an un-attributed renewal application.
    if (input.pathway === 'renewal' && input.renewal === undefined) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'A renewal application requires a governed renewal context.',
      );
    }
    if (input.pathway !== 'renewal' && input.renewal !== undefined) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'A renewal context is only valid for the renewal pathway.',
      );
    }
    if (input.renewal !== undefined && input.renewal.targetSeasonId !== input.seasonId) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'The renewal target season must match the application season.',
      );
    }

    return withTenantTransaction(
      input.tenantId,
      async (client) => {
        // Serialize concurrent initiations for the same subject (no unique constraint on the
        // shared application table): both racers block on the same advisory lock, so the second
        // sees the first's committed row.
        const subjectKey = `${input.tenantId}|${input.organizationId}|${input.seasonId}|${input.pathway}`;
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [subjectKey]);

        const existing = await this.selectHeadBySubject(
          client,
          input.tenantId,
          input.organizationId,
          input.seasonId,
          input.pathway,
        );
        if (existing !== undefined) return { head: existing, created: false };

        const inserted = await client.query<{ id: string }>(
          `INSERT INTO affiliation.affiliation_application
             (tenant_id, season_id, organization_id, application_type, applicant_user_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [input.tenantId, input.seasonId, input.organizationId, input.pathway, input.actor],
        );
        const applicationId = inserted[0]?.id;
        if (applicationId === undefined) {
          throw new Error('Failed to insert affiliation application head.');
        }

        await client.query(
          `INSERT INTO affiliation.application_draft
             (application_id, tenant_id, version, last_saving_actor)
           VALUES ($1, $2, 1, $3)`,
          [applicationId, input.tenantId, input.actor],
        );

        for (const b of input.bindings) {
          await client.query(
            `INSERT INTO affiliation.application_requirement
               (tenant_id, application_id, requirement_code, requirement_version, applies_because)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (tenant_id, application_id, requirement_code) DO NOTHING`,
            [input.tenantId, applicationId, b.requirementCode, b.requirementVersion, b.appliesBecause],
          );
        }

        await client.query(
          `INSERT INTO affiliation.draft_change_event
             (tenant_id, application_id, actor, event_type, detail)
           VALUES ($1, $2, $3, 'application_initiated', '{}'::jsonb)`,
          [input.tenantId, applicationId, input.actor],
        );

        // Renewal attribution — written in the SAME transaction as the application it attributes.
        if (input.renewal !== undefined) {
          await this.attributeRenewal(client, {
            tenantId: input.tenantId,
            renewalApplicationId: applicationId,
            organizationId: input.organizationId,
            actor: input.actor,
            renewal: input.renewal,
          });
        }

        return {
          head: {
            applicationId,
            tenantId: input.tenantId,
            organizationId: input.organizationId,
            seasonId: input.seasonId,
            pathway: input.pathway,
            applicantUserId: input.actor,
          },
          created: true,
        };
      },
      this.pool,
    );
  }

  /**
   * Attribute a newly-created renewal application to the standing it renews. Writes the immutable
   * renewal link and, ONLY when the link is genuinely new (not an idempotent replay), the audit
   * event and transactional outbox message — all inside the caller's transaction. NEVER mutates
   * governed standing state; the standing's lifecycle transition remains the kernel's alone.
   */
  private async attributeRenewal(
    client: QueryClient,
    args: {
      tenantId: string;
      renewalApplicationId: string;
      organizationId: string;
      actor: string;
      renewal: RenewalInitiationContext;
    },
  ): Promise<void> {
    const { tenantId, renewalApplicationId, organizationId, actor, renewal } = args;

    // Defense in depth: the standing must exist for this tenant (also enforced by the link FK; a
    // pre-check yields a clean domain error instead of a raw constraint violation).
    const standingRows = await client.query<{ id: string }>(
      `SELECT id FROM affiliation_standing.affiliation_standing
        WHERE id = $1 AND tenant_id = $2`,
      [renewal.standingId, tenantId],
    );
    if (standingRows[0] === undefined) {
      throw new AppError(
        ErrorCode.AFFILIATION_STANDING_NOT_FOUND,
        'The standing to renew was not found for this tenant.',
      );
    }

    const linkRows = await client.query<{ id: string }>(
      `INSERT INTO affiliation_standing.renewal_application_link
         (tenant_id, renewal_application_id, standing_id, source_standing_version,
          source_season_id, target_season_id, initiated_by, idempotency_key,
          correlation_id, causation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [
        tenantId,
        renewalApplicationId,
        renewal.standingId,
        renewal.sourceStandingVersion,
        renewal.sourceSeasonId,
        renewal.targetSeasonId,
        actor,
        renewal.idempotencyKey,
        renewal.correlationId ?? null,
        renewal.causationId ?? null,
      ],
    );

    // Idempotent replay (same idempotency key): the link already exists — do not re-emit audit or
    // outbox. A fresh link (row returned) is the sole trigger for the governed side effects.
    if (linkRows[0] === undefined) return;

    const payload = {
      standingId: renewal.standingId,
      renewalApplicationId,
      organizationId,
      sourceStandingVersion: renewal.sourceStandingVersion,
      sourceSeasonId: renewal.sourceSeasonId,
      targetSeasonId: renewal.targetSeasonId,
    };

    await client.query(
      `INSERT INTO governance.audit_event
         (tenant_id, entity_type, entity_id, action, trigger, from_state, to_state,
          actor_user_id, correlation_id, causation_id, payload)
       VALUES ($1, 'AffiliationStanding', $2, 'renewal_application_initiated', NULL, NULL, NULL,
               $3, $4, $5, $6)`,
      [
        tenantId,
        renewal.standingId,
        actor,
        renewal.correlationId ?? null,
        renewal.causationId ?? null,
        JSON.stringify(payload),
      ],
    );

    await client.query(
      `INSERT INTO governance.outbox_message
         (tenant_id, message_type, payload, status, max_retries, dedupe_key,
          correlation_id, causation_id)
       VALUES ($1, $2, $3, 'pending', 8, $4, $5, $6)
       ON CONFLICT (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL
       DO UPDATE SET tenant_id = governance.outbox_message.tenant_id`,
      [
        tenantId,
        STANDING_RENEWAL_APPLICATION_INITIATED_MESSAGE_TYPE,
        JSON.stringify(payload),
        renewalApplicationInitiatedDedupeKey(tenantId, renewal.standingId, renewal.targetSeasonId),
        renewal.correlationId ?? null,
        renewal.causationId ?? null,
      ],
    );
  }

  async getSnapshot(tenantId: string, applicationId: string): Promise<DraftSnapshot | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const headRows = await client.query<{
          id: string;
          organization_id: string | null;
          season_id: string;
          application_type: string | null;
          applicant_user_id: string | null;
        }>(
          `SELECT id, organization_id, season_id, application_type, applicant_user_id
             FROM affiliation.affiliation_application
            WHERE id = $1`,
          [applicationId],
        );
        const h = headRows[0];
        if (h === undefined) return undefined;

        const draftRows = await client.query<{
          version: number;
          last_saved_at: Date | string;
          last_saving_actor: string | null;
        }>(
          `SELECT version, last_saved_at, last_saving_actor
             FROM affiliation.application_draft
            WHERE application_id = $1`,
          [applicationId],
        );
        const d = draftRows[0];
        if (d === undefined) return undefined;

        const bindingRows = await client.query<{
          requirement_code: string;
          requirement_version: number;
          applies_because: string;
        }>(
          `SELECT requirement_code, requirement_version, applies_because
             FROM affiliation.application_requirement
            WHERE application_id = $1
            ORDER BY bound_at ASC`,
          [applicationId],
        );

        const responseRows = await client.query<{
          requirement_code: string;
          response_value: Record<string, unknown>;
        }>(
          `SELECT requirement_code, response_value
             FROM affiliation.draft_response
            WHERE application_id = $1`,
          [applicationId],
        );

        const evidenceRows = await client.query<{
          id: string;
          requirement_code: string;
          evidence_object_id: string;
          content_hash: string;
          content_type: string;
          display_name: string | null;
          associated_at: Date | string;
        }>(
          `SELECT id, requirement_code, evidence_object_id, content_hash, content_type,
                  display_name, associated_at
             FROM affiliation.draft_evidence_link
            WHERE application_id = $1
            ORDER BY associated_at ASC`,
          [applicationId],
        );

        const head: DraftApplicationHead = {
          applicationId: h.id,
          tenantId,
          organizationId: h.organization_id ?? '',
          seasonId: h.season_id,
          pathway: h.application_type ?? '',
          ...(h.applicant_user_id !== null ? { applicantUserId: h.applicant_user_id } : {}),
        };
        const draft: DraftHead = {
          applicationId,
          version: d.version,
          lastSavedAt: toIso(d.last_saved_at),
          ...(d.last_saving_actor !== null ? { lastSavingActor: d.last_saving_actor } : {}),
        };
        const bindings: BoundRequirementRow[] = bindingRows.map((b) => ({
          requirementCode: b.requirement_code,
          requirementVersion: b.requirement_version,
          appliesBecause: b.applies_because,
        }));
        const responses: StoredResponseRow[] = responseRows.map((r) => ({
          requirementCode: r.requirement_code,
          value: r.response_value,
        }));
        const evidence: StoredEvidenceLinkRow[] = evidenceRows.map((e) => ({
          linkId: e.id,
          requirementCode: e.requirement_code,
          evidenceObjectId: e.evidence_object_id,
          contentHash: e.content_hash,
          contentType: e.content_type,
          ...(e.display_name !== null ? { displayName: e.display_name } : {}),
          associatedAt: toIso(e.associated_at),
        }));

        return { head, draft, bindings, responses, evidence };
      },
      this.pool,
    );
  }

  async saveDraft(input: SaveDraftInput): Promise<DraftMutationResult> {
    return withTenantTransaction(
      input.tenantId,
      async (client) => {
        const locked = await selectForUpdate<{ version: number }>(
          client,
          `SELECT version FROM affiliation.application_draft WHERE application_id = $1`,
          [input.applicationId],
        );
        const current = locked[0];
        if (current === undefined) return { ok: false, reason: 'not_found' } as const;
        if (current.version !== input.expectedVersion) {
          return { ok: false, reason: 'version_conflict', currentVersion: current.version } as const;
        }
        const editable = await this.editableRequirementCodes(client, input.applicationId);
        if (editable !== null) {
          if (editable.size === 0) return { ok: false, reason: 'not_editable' } as const;
          if (input.responses.some((response) => !editable.has(response.requirementCode))) {
            return { ok: false, reason: 'outside_correction_scope' } as const;
          }
        }

        const boundRows = await client.query<{ requirement_code: string }>(
          `SELECT requirement_code FROM affiliation.application_requirement WHERE application_id = $1`,
          [input.applicationId],
        );
        const bound = new Set(boundRows.map((r) => r.requirement_code));

        for (const r of input.responses) {
          if (!bound.has(r.requirementCode)) continue;
          await client.query(
            `INSERT INTO affiliation.draft_response
               (tenant_id, application_id, requirement_code, response_value, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, now())
             ON CONFLICT (tenant_id, application_id, requirement_code)
             DO UPDATE SET response_value = EXCLUDED.response_value, updated_at = now()`,
            [input.tenantId, input.applicationId, r.requirementCode, JSON.stringify(r.value)],
          );
        }

        const updated = await client.query<{ version: number; last_saved_at: Date | string }>(
          `UPDATE affiliation.application_draft
              SET version = version + 1, last_saved_at = now(), last_saving_actor = $2
            WHERE application_id = $1
            RETURNING version, last_saved_at`,
          [input.applicationId, input.actor],
        );
        const row = updated[0];
        if (row === undefined) return { ok: false, reason: 'not_found' } as const;

        await client.query(
          `INSERT INTO affiliation.draft_change_event
             (tenant_id, application_id, actor, event_type, detail)
           VALUES ($1, $2, $3, 'draft_saved', $4::jsonb)`,
          [
            input.tenantId,
            input.applicationId,
            input.actor,
            JSON.stringify({ codes: input.responses.map((r) => r.requirementCode) }),
          ],
        );

        return { ok: true, newVersion: row.version, lastSavedAt: toIso(row.last_saved_at) } as const;
      },
      this.pool,
    );
  }

  async addEvidenceLink(input: AddEvidenceLinkInput): Promise<AddEvidenceLinkResult> {
    return withTenantTransaction(
      input.tenantId,
      async (client) => {
        const locked = await selectForUpdate<{ version: number }>(
          client,
          `SELECT version FROM affiliation.application_draft WHERE application_id = $1`,
          [input.applicationId],
        );
        if (locked[0] === undefined) return { ok: false, reason: 'not_found' } as const;
        const editable = await this.editableRequirementCodes(client, input.applicationId);
        if (editable !== null) {
          if (editable.size === 0) return { ok: false, reason: 'not_editable' } as const;
          if (!editable.has(input.requirementCode)) {
            return { ok: false, reason: 'outside_correction_scope' } as const;
          }
        }

        const boundRows = await client.query<{ requirement_code: string }>(
          `SELECT requirement_code FROM affiliation.application_requirement
            WHERE application_id = $1 AND requirement_code = $2`,
          [input.applicationId, input.requirementCode],
        );
        if (boundRows[0] === undefined) return { ok: false, reason: 'unknown_requirement' } as const;

        const linkRows = await client.query<{ id: string; associated_at: Date | string }>(
          `INSERT INTO affiliation.draft_evidence_link
             (tenant_id, application_id, requirement_code, evidence_object_id,
              content_hash, content_type, display_name, associated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (tenant_id, application_id, requirement_code, evidence_object_id)
           DO UPDATE SET content_hash = EXCLUDED.content_hash
           RETURNING id, associated_at`,
          [
            input.tenantId,
            input.applicationId,
            input.requirementCode,
            input.evidenceObjectId,
            input.contentHash,
            input.contentType,
            input.displayName ?? null,
            input.actor,
          ],
        );
        const linkRow = linkRows[0];
        if (linkRow === undefined) throw new Error('Failed to associate evidence link.');

        const updated = await client.query<{ version: number }>(
          `UPDATE affiliation.application_draft
              SET version = version + 1, last_saved_at = now(), last_saving_actor = $2
            WHERE application_id = $1
            RETURNING version`,
          [input.applicationId, input.actor],
        );

        await client.query(
          `INSERT INTO affiliation.draft_change_event
             (tenant_id, application_id, actor, event_type, detail)
           VALUES ($1, $2, $3, 'evidence_associated', $4::jsonb)`,
          [
            input.tenantId,
            input.applicationId,
            input.actor,
            JSON.stringify({ requirementCode: input.requirementCode }),
          ],
        );

        const link: StoredEvidenceLinkRow = {
          linkId: linkRow.id,
          requirementCode: input.requirementCode,
          evidenceObjectId: input.evidenceObjectId,
          contentHash: input.contentHash,
          contentType: input.contentType,
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          associatedAt: toIso(linkRow.associated_at),
        };
        return { ok: true, link, newVersion: updated[0]?.version ?? locked[0].version + 1 } as const;
      },
      this.pool,
    );
  }

  async removeEvidenceLink(input: RemoveEvidenceLinkInput): Promise<RemoveEvidenceLinkResult> {
    return withTenantTransaction(
      input.tenantId,
      async (client) => {
        const locked = await selectForUpdate<{ version: number }>(
          client,
          `SELECT version FROM affiliation.application_draft WHERE application_id = $1`,
          [input.applicationId],
        );
        if (locked[0] === undefined) return { ok: false, reason: 'not_found' } as const;
        const editable = await this.editableRequirementCodes(client, input.applicationId);
        if (editable !== null) {
          if (editable.size === 0) return { ok: false, reason: 'not_editable' } as const;
          const link = await client.query<{ requirement_code: string }>(
            `SELECT requirement_code FROM affiliation.draft_evidence_link
              WHERE application_id = $1 AND id = $2`,
            [input.applicationId, input.linkId],
          );
          const requirementCode = link[0]?.requirement_code;
          if (requirementCode === undefined) return { ok: false, reason: 'not_found' } as const;
          if (!editable.has(requirementCode)) {
            return { ok: false, reason: 'outside_correction_scope' } as const;
          }
        }

        const deleted = await client.query<{ id: string }>(
          `DELETE FROM affiliation.draft_evidence_link
            WHERE application_id = $1 AND id = $2
            RETURNING id`,
          [input.applicationId, input.linkId],
        );
        if (deleted[0] === undefined) return { ok: false, reason: 'not_found' } as const;

        const updated = await client.query<{ version: number }>(
          `UPDATE affiliation.application_draft
              SET version = version + 1, last_saved_at = now(), last_saving_actor = $2
            WHERE application_id = $1
            RETURNING version`,
          [input.applicationId, input.actor],
        );

        await client.query(
          `INSERT INTO affiliation.draft_change_event
             (tenant_id, application_id, actor, event_type, detail)
           VALUES ($1, $2, $3, 'evidence_unlinked', $4::jsonb)`,
          [input.tenantId, input.applicationId, input.actor, JSON.stringify({ linkId: input.linkId })],
        );

        return { ok: true, newVersion: updated[0]?.version ?? locked[0].version + 1 } as const;
      },
      this.pool,
    );
  }
}
