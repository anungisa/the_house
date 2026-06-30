/**
 * PostgreSQL {@link OrganizationRegistryStore} (integration).
 *
 * Writes the organization row AND its registry outbox message in the SAME tenant-scoped
 * transaction (transactional outbox: the row and the signal that announces it commit together
 * or not at all). The table is under FORCE RLS keyed on governance.current_tenant_id(); each
 * transaction sets `app.tenant_id` first, so a non-superuser, non-BYPASSRLS role is tenant
 * isolated — a parent id owned by another tenant simply does not resolve.
 *
 * Business rules (enum validation, parent existence, cycle detection, source-reference rules)
 * live in {@link OrganizationRegistryService}; this store only persists and reports a
 * deterministic outcome. `pool` is injectable; the default uses the shared pool (DATABASE_URL).
 */

import type pg from 'pg';
import { withTenantTransaction, type QueryClient } from '../../db/pool.js';
import type { OutboxEnqueueInput } from '../../governance/outbox/OutboxStore.js';
import {
  type CreateOrganizationOutcome,
  type OrganizationRegistryStore,
  type UpdateOrganizationOutcome,
} from './OrganizationRegistryStore.js';
import {
  clampOrganizationListLimit,
  type OrganizationListFilter,
  type OrganizationListResult,
  type OrganizationRecord,
  type OrganizationSource,
  type OrganizationStatus,
  type OrganizationType,
  type OrganizationView,
} from './OrganizationTypes.js';

type OrganizationRow = {
  id: string;
  tenant_id: string;
  organization_type: string;
  display_name: string;
  legal_name: string | null;
  status: string;
  parent_organization_id: string | null;
  source: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  created_at: string;
  updated_at: string;
};

const VIEW_COLUMNS = `
  id, tenant_id, organization_type, display_name, legal_name, status, parent_organization_id,
  source, source_entity_type, source_entity_id, created_at, updated_at`;

function toView(row: OrganizationRow): OrganizationView {
  return {
    organizationId: row.id,
    tenantId: row.tenant_id,
    organizationType: row.organization_type as OrganizationType,
    displayName: row.display_name,
    status: row.status as OrganizationStatus,
    source: row.source as OrganizationSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.legal_name !== null ? { legalName: row.legal_name } : {}),
    ...(row.parent_organization_id !== null
      ? { parentOrganizationId: row.parent_organization_id }
      : {}),
    ...(row.source_entity_type !== null ? { sourceEntityType: row.source_entity_type } : {}),
    ...(row.source_entity_id !== null ? { sourceEntityId: row.source_entity_id } : {}),
  };
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

export class PgOrganizationRegistryStore implements OrganizationRegistryStore {
  constructor(private readonly pool?: pg.Pool) {}

  async create(
    record: OrganizationRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<CreateOrganizationOutcome> {
    return withTenantTransaction(
      record.tenantId,
      async (client) => {
        const existing = await client.query<OrganizationRow>(
          `SELECT ${VIEW_COLUMNS} FROM organization_registry.organization
             WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [record.tenantId, record.organizationId],
        );
        if (existing.length > 0) {
          return { outcome: 'conflict', view: toView(existing[0]!) } as const;
        }

        await client.query(
          `INSERT INTO organization_registry.organization
             (id, tenant_id, organization_type, display_name, legal_name, status,
              parent_organization_id, source, source_entity_type, source_entity_id,
              created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            record.organizationId,
            record.tenantId,
            record.organizationType,
            record.displayName,
            record.legalName ?? null,
            record.status,
            record.parentOrganizationId ?? null,
            record.source,
            record.sourceEntityType ?? null,
            record.sourceEntityId ?? null,
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

  async update(
    record: OrganizationRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<UpdateOrganizationOutcome> {
    return withTenantTransaction(
      record.tenantId,
      async (client) => {
        const locked = await client.query<{ id: string }>(
          `SELECT id FROM organization_registry.organization
             WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [record.tenantId, record.organizationId],
        );
        if (locked.length === 0) {
          return { outcome: 'not_found' } as const;
        }

        const updated = await client.query<OrganizationRow>(
          `UPDATE organization_registry.organization
             SET display_name = $3,
                 legal_name = $4,
                 status = $5,
                 parent_organization_id = $6,
                 updated_at = $7
           WHERE tenant_id = $1 AND id = $2
           RETURNING ${VIEW_COLUMNS}`,
          [
            record.tenantId,
            record.organizationId,
            record.displayName,
            record.legalName ?? null,
            record.status,
            record.parentOrganizationId ?? null,
            record.updatedAt,
          ],
        );
        const outboxMessageId = await enqueueOutbox(client, outbox);
        return { outcome: 'updated', view: toView(updated[0]!), outboxMessageId } as const;
      },
      this.pool,
    );
  }

  async getById(tenantId: string, organizationId: string): Promise<OrganizationView | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<OrganizationRow>(
          `SELECT ${VIEW_COLUMNS} FROM organization_registry.organization
             WHERE tenant_id = $1 AND id = $2`,
          [tenantId, organizationId],
        );
        return rows.length > 0 ? toView(rows[0]!) : undefined;
      },
      this.pool,
    );
  }

  async list(tenantId: string, filter: OrganizationListFilter): Promise<OrganizationListResult> {
    const limit = clampOrganizationListLimit(filter.limit);
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const params: unknown[] = [tenantId];
        const where: string[] = ['tenant_id = $1'];
        if (filter.organizationType !== undefined) {
          params.push(filter.organizationType);
          where.push(`organization_type = $${params.length}`);
        }
        if (filter.status !== undefined) {
          params.push(filter.status);
          where.push(`status = $${params.length}`);
        }
        if (filter.parentOrganizationId !== undefined) {
          params.push(filter.parentOrganizationId);
          where.push(`parent_organization_id = $${params.length}`);
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

        const rows = await client.query<OrganizationRow>(
          `SELECT ${VIEW_COLUMNS} FROM organization_registry.organization
             WHERE ${where.join(' AND ')}
           ORDER BY created_at ASC, id ASC
           LIMIT $${limitParam}`,
          params,
        );

        const page = rows.slice(0, limit);
        const items = page.map(toView);
        const result: { items: OrganizationView[]; nextCursor?: { createdAt: string; id: string } } =
          { items };
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
