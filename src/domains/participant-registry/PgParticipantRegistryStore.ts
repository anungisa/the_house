/**
 * PostgreSQL {@link ParticipantRegistryStore} (integration).
 *
 * Writes the participant / organization-participant row AND its registry outbox message in the
 * SAME tenant-scoped transaction (transactional outbox: the row and the signal that announces it
 * commit together or not at all). Both tables are under FORCE RLS keyed on
 * governance.current_tenant_id(); each transaction sets `app.tenant_id` first, so a non-superuser,
 * non-BYPASSRLS role is tenant isolated — an organization or participant owned by another tenant
 * simply does not resolve.
 *
 * Business rules (enum/email validation, organization existence, archived-participant rules) live
 * in {@link ParticipantRegistryService}; this store only persists and reports a deterministic
 * outcome. `pool` is injectable; the default uses the shared pool (DATABASE_URL).
 */

import type pg from 'pg';
import { withTenantTransaction, type QueryClient } from '../../db/pool.js';
import type { OutboxEnqueueInput } from '../../governance/outbox/OutboxStore.js';
import {
  type CreateOrganizationLinkOutcome,
  type CreateParticipantOutcome,
  type ParticipantRegistryStore,
  type UpdateOrganizationLinkOutcome,
  type UpdateParticipantOutcome,
} from './ParticipantRegistryStore.js';
import {
  clampParticipantListLimit,
  type OrganizationParticipantListFilter,
  type OrganizationParticipantListResult,
  type OrganizationParticipantRecord,
  type OrganizationParticipantView,
  type ParticipantExternalRef,
  type ParticipantListFilter,
  type ParticipantListResult,
  type ParticipantRecord,
  type ParticipantStatus,
  type ParticipantView,
  type RelationshipStatus,
  type RelationshipType,
} from './ParticipantTypes.js';

type ParticipantRow = {
  id: string;
  tenant_id: string;
  display_name: string;
  given_name: string | null;
  family_name: string | null;
  email: string | null;
  status: string;
  external_refs: unknown;
  created_at: string;
  updated_at: string;
};

type LinkRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  participant_id: string;
  relationship_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
};

const PARTICIPANT_COLUMNS = `
  id, tenant_id, display_name, given_name, family_name, email, status, external_refs,
  created_at, updated_at`;

const LINK_COLUMNS = `
  id, tenant_id, organization_id, participant_id, relationship_type, status, start_date, end_date,
  created_at, updated_at`;

function parseExternalRefs(value: unknown): readonly ParticipantExternalRef[] | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(raw)) return undefined;
  const refs = raw
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
    .map((e) => ({ provider: String(e['provider']), externalId: String(e['externalId']) }));
  return refs.length > 0 ? refs : undefined;
}

function toParticipantView(row: ParticipantRow): ParticipantView {
  const refs = parseExternalRefs(row.external_refs);
  return {
    participantId: row.id,
    tenantId: row.tenant_id,
    displayName: row.display_name,
    status: row.status as ParticipantStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.given_name !== null ? { givenName: row.given_name } : {}),
    ...(row.family_name !== null ? { familyName: row.family_name } : {}),
    ...(row.email !== null ? { email: row.email } : {}),
    ...(refs !== undefined ? { externalRefs: refs } : {}),
  };
}

function toLinkView(row: LinkRow): OrganizationParticipantView {
  return {
    relationshipId: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    participantId: row.participant_id,
    relationshipType: row.relationship_type as RelationshipType,
    status: row.status as RelationshipStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.start_date !== null ? { startDate: row.start_date } : {}),
    ...(row.end_date !== null ? { endDate: row.end_date } : {}),
  };
}

function externalRefsParam(refs: readonly ParticipantExternalRef[] | undefined): string | null {
  return refs !== undefined ? JSON.stringify(refs.map((r) => ({ ...r }))) : null;
}

async function enqueueOutbox(client: QueryClient, outbox: OutboxEnqueueInput): Promise<string> {
  const rows = await client.query<{ id: string }>(
    `INSERT INTO governance.outbox_message
       (tenant_id, message_type, payload, status, max_retries, dedupe_key, correlation_id, causation_id)
     VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)
     ON CONFLICT (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL
     DO UPDATE SET tenant_id = governance.outbox_message.tenant_id
     RETURNING id`,
    [
      outbox.tenantId,
      outbox.messageType,
      JSON.stringify(outbox.payload),
      outbox.maxRetries,
      outbox.dedupeKey,
      outbox.correlationId ?? null,
      outbox.causationId ?? null,
    ],
  );
  return rows[0]!.id;
}

export class PgParticipantRegistryStore implements ParticipantRegistryStore {
  constructor(private readonly pool?: pg.Pool) {}

  async createParticipant(
    record: ParticipantRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<CreateParticipantOutcome> {
    return withTenantTransaction(
      record.tenantId,
      async (client) => {
        const existing = await client.query<ParticipantRow>(
          `SELECT ${PARTICIPANT_COLUMNS} FROM participant_registry.participant
             WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [record.tenantId, record.participantId],
        );
        if (existing.length > 0) {
          return { outcome: 'conflict', view: toParticipantView(existing[0]!) } as const;
        }

        await client.query(
          `INSERT INTO participant_registry.participant
             (id, tenant_id, display_name, given_name, family_name, email, status, external_refs,
              created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
          [
            record.participantId,
            record.tenantId,
            record.displayName,
            record.givenName ?? null,
            record.familyName ?? null,
            record.email ?? null,
            record.status,
            externalRefsParam(record.externalRefs),
            record.createdAt,
            record.updatedAt,
          ],
        );
        const outboxMessageId = await enqueueOutbox(client, outbox);
        return { outcome: 'created', view: { ...record }, outboxMessageId } as const;
      },
      this.pool,
    );
  }

  async updateParticipant(
    record: ParticipantRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<UpdateParticipantOutcome> {
    return withTenantTransaction(
      record.tenantId,
      async (client) => {
        const locked = await client.query<{ id: string }>(
          `SELECT id FROM participant_registry.participant
             WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [record.tenantId, record.participantId],
        );
        if (locked.length === 0) {
          return { outcome: 'not_found' } as const;
        }

        const updated = await client.query<ParticipantRow>(
          `UPDATE participant_registry.participant
             SET display_name = $3,
                 given_name = $4,
                 family_name = $5,
                 email = $6,
                 status = $7,
                 external_refs = $8::jsonb,
                 updated_at = $9
           WHERE tenant_id = $1 AND id = $2
           RETURNING ${PARTICIPANT_COLUMNS}`,
          [
            record.tenantId,
            record.participantId,
            record.displayName,
            record.givenName ?? null,
            record.familyName ?? null,
            record.email ?? null,
            record.status,
            externalRefsParam(record.externalRefs),
            record.updatedAt,
          ],
        );
        const outboxMessageId = await enqueueOutbox(client, outbox);
        return { outcome: 'updated', view: toParticipantView(updated[0]!), outboxMessageId } as const;
      },
      this.pool,
    );
  }

  async getParticipantById(tenantId: string, participantId: string): Promise<ParticipantView | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<ParticipantRow>(
          `SELECT ${PARTICIPANT_COLUMNS} FROM participant_registry.participant
             WHERE tenant_id = $1 AND id = $2`,
          [tenantId, participantId],
        );
        return rows.length > 0 ? toParticipantView(rows[0]!) : undefined;
      },
      this.pool,
    );
  }

  async listParticipants(
    tenantId: string,
    filter: ParticipantListFilter,
  ): Promise<ParticipantListResult> {
    const limit = clampParticipantListLimit(filter.limit);
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const params: unknown[] = [tenantId];
        const where: string[] = ['tenant_id = $1'];
        if (filter.status !== undefined) {
          params.push(filter.status);
          where.push(`status = $${params.length}`);
        }
        if (filter.email !== undefined) {
          params.push(filter.email);
          where.push(`email = $${params.length}`);
        }
        if (filter.cursor !== undefined) {
          params.push(filter.cursor.createdAt);
          const createdAtParam = params.length;
          params.push(filter.cursor.id);
          const idParam = params.length;
          where.push(
            `(created_at > $${createdAtParam} OR (created_at = $${createdAtParam} AND id > $${idParam}))`,
          );
        }
        params.push(limit + 1);
        const limitParam = params.length;

        const rows = await client.query<ParticipantRow>(
          `SELECT ${PARTICIPANT_COLUMNS} FROM participant_registry.participant
             WHERE ${where.join(' AND ')}
           ORDER BY created_at ASC, id ASC
           LIMIT $${limitParam}`,
          params,
        );

        const page = rows.slice(0, limit);
        const items = page.map(toParticipantView);
        const result: { items: ParticipantView[]; nextCursor?: { createdAt: string; id: string } } = {
          items,
        };
        if (rows.length > limit && page.length > 0) {
          const last = page[page.length - 1]!;
          result.nextCursor = { createdAt: last.created_at, id: last.id };
        }
        return result;
      },
      this.pool,
    );
  }

  async createOrganizationLink(
    record: OrganizationParticipantRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<CreateOrganizationLinkOutcome> {
    return withTenantTransaction(
      record.tenantId,
      async (client) => {
        const existing = await client.query<LinkRow>(
          `SELECT ${LINK_COLUMNS} FROM participant_registry.organization_participant
             WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [record.tenantId, record.relationshipId],
        );
        if (existing.length > 0) {
          return { outcome: 'conflict', view: toLinkView(existing[0]!) } as const;
        }

        await client.query(
          `INSERT INTO participant_registry.organization_participant
             (id, tenant_id, organization_id, participant_id, relationship_type, status,
              start_date, end_date, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            record.relationshipId,
            record.tenantId,
            record.organizationId,
            record.participantId,
            record.relationshipType,
            record.status,
            record.startDate ?? null,
            record.endDate ?? null,
            record.createdAt,
            record.updatedAt,
          ],
        );
        const outboxMessageId = await enqueueOutbox(client, outbox);
        return { outcome: 'created', view: { ...record }, outboxMessageId } as const;
      },
      this.pool,
    );
  }

  async updateOrganizationLink(
    record: OrganizationParticipantRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<UpdateOrganizationLinkOutcome> {
    return withTenantTransaction(
      record.tenantId,
      async (client) => {
        const locked = await client.query<{ id: string }>(
          `SELECT id FROM participant_registry.organization_participant
             WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [record.tenantId, record.relationshipId],
        );
        if (locked.length === 0) {
          return { outcome: 'not_found' } as const;
        }

        const updated = await client.query<LinkRow>(
          `UPDATE participant_registry.organization_participant
             SET status = $3,
                 start_date = $4,
                 end_date = $5,
                 updated_at = $6
           WHERE tenant_id = $1 AND id = $2
           RETURNING ${LINK_COLUMNS}`,
          [
            record.tenantId,
            record.relationshipId,
            record.status,
            record.startDate ?? null,
            record.endDate ?? null,
            record.updatedAt,
          ],
        );
        const outboxMessageId = await enqueueOutbox(client, outbox);
        return { outcome: 'updated', view: toLinkView(updated[0]!), outboxMessageId } as const;
      },
      this.pool,
    );
  }

  async getOrganizationLinkById(
    tenantId: string,
    relationshipId: string,
  ): Promise<OrganizationParticipantView | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<LinkRow>(
          `SELECT ${LINK_COLUMNS} FROM participant_registry.organization_participant
             WHERE tenant_id = $1 AND id = $2`,
          [tenantId, relationshipId],
        );
        return rows.length > 0 ? toLinkView(rows[0]!) : undefined;
      },
      this.pool,
    );
  }

  async findActiveOrganizationLink(
    tenantId: string,
    organizationId: string,
    participantId: string,
    relationshipType: RelationshipType,
  ): Promise<OrganizationParticipantView | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<LinkRow>(
          `SELECT ${LINK_COLUMNS} FROM participant_registry.organization_participant
             WHERE tenant_id = $1 AND organization_id = $2 AND participant_id = $3
               AND relationship_type = $4 AND status <> 'ended'
           ORDER BY created_at ASC, id ASC
           LIMIT 1`,
          [tenantId, organizationId, participantId, relationshipType],
        );
        return rows.length > 0 ? toLinkView(rows[0]!) : undefined;
      },
      this.pool,
    );
  }

  async listOrganizationParticipants(
    tenantId: string,
    filter: OrganizationParticipantListFilter,
  ): Promise<OrganizationParticipantListResult> {
    const limit = clampParticipantListLimit(filter.limit);
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const params: unknown[] = [tenantId];
        const where: string[] = ['tenant_id = $1'];
        if (filter.organizationId !== undefined) {
          params.push(filter.organizationId);
          where.push(`organization_id = $${params.length}`);
        }
        if (filter.participantId !== undefined) {
          params.push(filter.participantId);
          where.push(`participant_id = $${params.length}`);
        }
        if (filter.relationshipType !== undefined) {
          params.push(filter.relationshipType);
          where.push(`relationship_type = $${params.length}`);
        }
        if (filter.status !== undefined) {
          params.push(filter.status);
          where.push(`status = $${params.length}`);
        }
        if (filter.cursor !== undefined) {
          params.push(filter.cursor.createdAt);
          const createdAtParam = params.length;
          params.push(filter.cursor.id);
          const idParam = params.length;
          where.push(
            `(created_at > $${createdAtParam} OR (created_at = $${createdAtParam} AND id > $${idParam}))`,
          );
        }
        params.push(limit + 1);
        const limitParam = params.length;

        const rows = await client.query<LinkRow>(
          `SELECT ${LINK_COLUMNS} FROM participant_registry.organization_participant
             WHERE ${where.join(' AND ')}
           ORDER BY created_at ASC, id ASC
           LIMIT $${limitParam}`,
          params,
        );

        const page = rows.slice(0, limit);
        const items = page.map(toLinkView);
        const result: {
          items: OrganizationParticipantView[];
          nextCursor?: { createdAt: string; id: string };
        } = { items };
        if (rows.length > limit && page.length > 0) {
          const last = page[page.length - 1]!;
          result.nextCursor = { createdAt: last.created_at, id: last.id };
        }
        return result;
      },
      this.pool,
    );
  }
}
