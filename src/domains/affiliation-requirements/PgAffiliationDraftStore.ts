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
  SaveDraftInput,
  StoredEvidenceLinkRow,
  StoredResponseRow,
} from './AffiliationDraftStore.js';

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export class PgAffiliationDraftStore implements AffiliationDraftStore {
  constructor(private readonly pool: pg.Pool = getPool()) {}

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
