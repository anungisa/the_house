/**
 * PostgreSQL {@link FacilityRegistryStore} (integration).
 *
 * Writes the facility row AND its registry outbox message in the SAME tenant-scoped transaction
 * (transactional outbox: the row and the signal that announces it commit together or not at all).
 * The table is under FORCE RLS keyed on governance.current_tenant_id(); each transaction sets
 * `app.tenant_id` first, so a non-superuser, non-BYPASSRLS role is tenant isolated — an
 * organization id owned by another tenant simply does not resolve.
 *
 * Business rules (enum validation, organization existence) live in {@link FacilityRegistryService};
 * this store only persists and reports a deterministic outcome. `pool` is injectable; the default
 * uses the shared pool (DATABASE_URL).
 */

import type pg from 'pg';
import { withTenantTransaction, type QueryClient } from '../../db/pool.js';
import type { OutboxEnqueueInput } from '../../governance/outbox/OutboxStore.js';
import {
  type CreateFacilityOutcome,
  type FacilityRegistryStore,
  type UpdateFacilityOutcome,
} from './FacilityRegistryStore.js';
import {
  clampFacilityListLimit,
  type FacilityListFilter,
  type FacilityListResult,
  type FacilityRecord,
  type FacilityStatus,
  type FacilityType,
  type FacilityView,
  type FacilityVisibility,
} from './FacilityTypes.js';

type FacilityRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  name: string;
  facility_type: string;
  status: string;
  address_line1: string | null;
  address_line2: string | null;
  locality: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  visibility: string | null;
  capability_tags: string[] | null;
  created_at: string;
  updated_at: string;
};

const VIEW_COLUMNS = `
  id, tenant_id, organization_id, name, facility_type, status,
  address_line1, address_line2, locality, region, postal_code, country_code,
  latitude, longitude, contact_name, contact_email, contact_phone,
  visibility, capability_tags, created_at, updated_at`;

function toNumber(value: string | number | null): number | undefined {
  if (value === null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toView(row: FacilityRow): FacilityView {
  const latitude = toNumber(row.latitude);
  const longitude = toNumber(row.longitude);
  return {
    facilityId: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    name: row.name,
    facilityType: row.facility_type as FacilityType,
    status: row.status as FacilityStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.address_line1 !== null ? { addressLine1: row.address_line1 } : {}),
    ...(row.address_line2 !== null ? { addressLine2: row.address_line2 } : {}),
    ...(row.locality !== null ? { locality: row.locality } : {}),
    ...(row.region !== null ? { region: row.region } : {}),
    ...(row.postal_code !== null ? { postalCode: row.postal_code } : {}),
    ...(row.country_code !== null ? { countryCode: row.country_code } : {}),
    ...(latitude !== undefined ? { latitude } : {}),
    ...(longitude !== undefined ? { longitude } : {}),
    ...(row.contact_name !== null ? { contactName: row.contact_name } : {}),
    ...(row.contact_email !== null ? { contactEmail: row.contact_email } : {}),
    ...(row.contact_phone !== null ? { contactPhone: row.contact_phone } : {}),
    ...(row.visibility !== null ? { visibility: row.visibility as FacilityVisibility } : {}),
    ...(row.capability_tags !== null ? { capabilityTags: row.capability_tags } : {}),
  };
}

function tagsParam(tags: readonly string[] | undefined): string[] | null {
  return tags !== undefined ? [...tags] : null;
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

export class PgFacilityRegistryStore implements FacilityRegistryStore {
  constructor(private readonly pool?: pg.Pool) {}

  async create(
    record: FacilityRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<CreateFacilityOutcome> {
    return withTenantTransaction(
      record.tenantId,
      async (client) => {
        const existing = await client.query<FacilityRow>(
          `SELECT ${VIEW_COLUMNS} FROM facility_registry.facility
             WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [record.tenantId, record.facilityId],
        );
        if (existing.length > 0) {
          return { outcome: 'conflict', view: toView(existing[0]!) } as const;
        }

        await client.query(
          `INSERT INTO facility_registry.facility
             (id, tenant_id, organization_id, name, facility_type, status,
              address_line1, address_line2, locality, region, postal_code, country_code,
              latitude, longitude, contact_name, contact_email, contact_phone,
              visibility, capability_tags, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [
            record.facilityId,
            record.tenantId,
            record.organizationId,
            record.name,
            record.facilityType,
            record.status,
            record.addressLine1 ?? null,
            record.addressLine2 ?? null,
            record.locality ?? null,
            record.region ?? null,
            record.postalCode ?? null,
            record.countryCode ?? null,
            record.latitude ?? null,
            record.longitude ?? null,
            record.contactName ?? null,
            record.contactEmail ?? null,
            record.contactPhone ?? null,
            record.visibility ?? null,
            tagsParam(record.capabilityTags),
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
    record: FacilityRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<UpdateFacilityOutcome> {
    return withTenantTransaction(
      record.tenantId,
      async (client) => {
        const locked = await client.query<{ id: string }>(
          `SELECT id FROM facility_registry.facility
             WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [record.tenantId, record.facilityId],
        );
        if (locked.length === 0) {
          return { outcome: 'not_found' } as const;
        }

        const updated = await client.query<FacilityRow>(
          `UPDATE facility_registry.facility
             SET name = $3,
                 status = $4,
                 address_line1 = $5,
                 address_line2 = $6,
                 locality = $7,
                 region = $8,
                 postal_code = $9,
                 country_code = $10,
                 latitude = $11,
                 longitude = $12,
                 contact_name = $13,
                 contact_email = $14,
                 contact_phone = $15,
                 visibility = $16,
                 capability_tags = $17,
                 updated_at = $18
           WHERE tenant_id = $1 AND id = $2
           RETURNING ${VIEW_COLUMNS}`,
          [
            record.tenantId,
            record.facilityId,
            record.name,
            record.status,
            record.addressLine1 ?? null,
            record.addressLine2 ?? null,
            record.locality ?? null,
            record.region ?? null,
            record.postalCode ?? null,
            record.countryCode ?? null,
            record.latitude ?? null,
            record.longitude ?? null,
            record.contactName ?? null,
            record.contactEmail ?? null,
            record.contactPhone ?? null,
            record.visibility ?? null,
            tagsParam(record.capabilityTags),
            record.updatedAt,
          ],
        );
        const outboxMessageId = await enqueueOutbox(client, outbox);
        return { outcome: 'updated', view: toView(updated[0]!), outboxMessageId } as const;
      },
      this.pool,
    );
  }

  async getById(tenantId: string, facilityId: string): Promise<FacilityView | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<FacilityRow>(
          `SELECT ${VIEW_COLUMNS} FROM facility_registry.facility
             WHERE tenant_id = $1 AND id = $2`,
          [tenantId, facilityId],
        );
        return rows.length > 0 ? toView(rows[0]!) : undefined;
      },
      this.pool,
    );
  }

  async list(tenantId: string, filter: FacilityListFilter): Promise<FacilityListResult> {
    const limit = clampFacilityListLimit(filter.limit);
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const params: unknown[] = [tenantId];
        const where: string[] = ['tenant_id = $1'];
        if (filter.organizationId !== undefined) {
          params.push(filter.organizationId);
          where.push(`organization_id = $${params.length}`);
        }
        if (filter.facilityType !== undefined) {
          params.push(filter.facilityType);
          where.push(`facility_type = $${params.length}`);
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

        const rows = await client.query<FacilityRow>(
          `SELECT ${VIEW_COLUMNS} FROM facility_registry.facility
             WHERE ${where.join(' AND ')}
           ORDER BY created_at ASC, id ASC
           LIMIT $${limitParam}`,
          params,
        );

        const page = rows.slice(0, limit);
        const items = page.map(toView);
        const result: { items: FacilityView[]; nextCursor?: { createdAt: string; id: string } } = {
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
}
