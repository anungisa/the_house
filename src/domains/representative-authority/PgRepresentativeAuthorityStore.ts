/**
 * PostgreSQL {@link RepresentativeAuthorityStore} (integration).
 *
 * Writes the authority head, the append-only authority event, the governance audit event, and the
 * transactional outbox message in ONE tenant-scoped transaction (they commit together or not at
 * all). Every table is under FORCE RLS keyed on `app.tenant_id`, set by {@link withTenantTransaction}
 * before any authority access; a non-superuser, non-BYPASSRLS runtime role is therefore tenant
 * isolated — a subject or authority owned by another tenant simply does not resolve.
 *
 * Idempotency is enforced three ways: a fast in-transaction replay lookup on
 * (tenant, idempotency_key), the `(tenant_id, idempotency_key)` unique constraint, and the partial
 * `WHERE status='active'` unique index that guarantees at most one LIVE grant per
 * subject+organization+type. Effective ('expired') status is NEVER stored — it is derived at read.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { selectForUpdate, withTenantTransaction, type QueryClient } from '../../db/pool.js';
import type { OutboxEnqueueInput } from '../../governance/outbox/OutboxStore.js';
import {
  AUTHORITY_GRANTED_MESSAGE_TYPE,
  AUTHORITY_REVOKED_MESSAGE_TYPE,
  authorityGrantedDedupeKey,
  authorityRevokedDedupeKey,
  type GrantAuthorityCommand,
  type GrantAuthorityOutcome,
  type RepresentativeAuthorityStore,
  type RevokeAuthorityCommand,
  type RevokeAuthorityOutcome,
} from './RepresentativeAuthorityStore.js';
import type {
  IdentitySubjectRecord,
  IdentitySubjectStatus,
  RepresentativeAuthorityRecord,
  RepresentativeAuthorityType,
  StoredAuthorityStatus,
} from './RepresentativeAuthorityTypes.js';

/** Retry ceiling for authority outbox messages (parity with the other registries). */
export const AUTHORITY_OUTBOX_MAX_RETRIES = 10;

type AuthorityRow = {
  id: string;
  tenant_id: string;
  identity_subject_id: string;
  organization_id: string;
  authority_type: string;
  status: string;
  valid_from: string;
  valid_until: string | null;
  issued_by: string;
  issued_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  revocation_reason_code: string | null;
  source_reference: string;
  idempotency_key: string;
  version: number;
  created_at: string;
  updated_at: string;
};

type IdentitySubjectRow = {
  id: string;
  tenant_id: string;
  issuer: string;
  external_subject: string;
  participant_id: string | null;
  status: string;
  source: string;
  linked_at: string;
  unlinked_at: string | null;
  created_at: string;
  updated_at: string;
};

const AUTHORITY_COLUMNS = `
  id, tenant_id, identity_subject_id, organization_id, authority_type, status,
  valid_from, valid_until, issued_by, issued_at, revoked_by, revoked_at, revocation_reason_code,
  source_reference, idempotency_key, version, created_at, updated_at`;

const IDENTITY_SUBJECT_COLUMNS = `
  id, tenant_id, issuer, external_subject, participant_id, status, source,
  linked_at, unlinked_at, created_at, updated_at`;

function toAuthorityRecord(row: AuthorityRow): RepresentativeAuthorityRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    identitySubjectId: row.identity_subject_id,
    organizationId: row.organization_id,
    authorityType: row.authority_type as RepresentativeAuthorityType,
    status: row.status as StoredAuthorityStatus,
    validFrom: row.valid_from,
    issuedBy: row.issued_by,
    issuedAt: row.issued_at,
    sourceReference: row.source_reference,
    idempotencyKey: row.idempotency_key,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.valid_until !== null ? { validUntil: row.valid_until } : {}),
    ...(row.revoked_by !== null ? { revokedBy: row.revoked_by } : {}),
    ...(row.revoked_at !== null ? { revokedAt: row.revoked_at } : {}),
    ...(row.revocation_reason_code !== null
      ? { revocationReasonCode: row.revocation_reason_code }
      : {}),
  };
}

function toIdentitySubjectRecord(row: IdentitySubjectRow): IdentitySubjectRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    issuer: row.issuer,
    externalSubject: row.external_subject,
    status: row.status as IdentitySubjectStatus,
    source: row.source,
    linkedAt: row.linked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.participant_id !== null ? { participantId: row.participant_id } : {}),
    ...(row.unlinked_at !== null ? { unlinkedAt: row.unlinked_at } : {}),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

function grantPayload(record: RepresentativeAuthorityRecord): Record<string, unknown> {
  return {
    authorityId: record.id,
    tenantId: record.tenantId,
    organizationId: record.organizationId,
    authorityType: record.authorityType,
    status: record.status,
    validFrom: record.validFrom,
    ...(record.validUntil !== undefined ? { validUntil: record.validUntil } : {}),
  };
}

function revokePayload(record: RepresentativeAuthorityRecord): Record<string, unknown> {
  return {
    authorityId: record.id,
    tenantId: record.tenantId,
    organizationId: record.organizationId,
    authorityType: record.authorityType,
    status: record.status,
    ...(record.revokedAt !== undefined ? { revokedAt: record.revokedAt } : {}),
    ...(record.revocationReasonCode !== undefined
      ? { revocationReasonCode: record.revocationReasonCode }
      : {}),
  };
}

async function enqueueOutbox(client: QueryClient, outbox: OutboxEnqueueInput): Promise<void> {
  await client.query(
    `INSERT INTO governance.outbox_message
       (tenant_id, message_type, payload, status, max_retries, dedupe_key, correlation_id, causation_id)
     VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)
     ON CONFLICT (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL
     DO UPDATE SET tenant_id = governance.outbox_message.tenant_id`,
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
}

async function appendAuthorityEvent(
  client: QueryClient,
  input: {
    tenantId: string;
    authorityId: string;
    eventType: 'granted' | 'revoked' | 'renewed';
    fromStatus: string | null;
    toStatus: string;
    actorUserId?: string;
    reasonCode?: string;
    correlationId?: string;
    causationId?: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO authority.authority_event
       (id, tenant_id, authority_id, event_type, from_status, to_status,
        actor_user_id, reason_code, correlation_id, causation_id, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      randomUUID(),
      input.tenantId,
      input.authorityId,
      input.eventType,
      input.fromStatus,
      input.toStatus,
      input.actorUserId ?? null,
      input.reasonCode ?? null,
      input.correlationId ?? null,
      input.causationId ?? null,
      JSON.stringify(input.payload),
    ],
  );
}

async function appendAuditEvent(
  client: QueryClient,
  input: {
    tenantId: string;
    authorityId: string;
    action: 'granted' | 'revoked';
    trigger: string;
    fromState: string | null;
    toState: string;
    actorUserId?: string;
    correlationId?: string;
    causationId?: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO governance.audit_event
       (tenant_id, entity_type, entity_id, action, trigger, from_state, to_state,
        actor_user_id, correlation_id, causation_id, payload)
     VALUES ($1,'RepresentativeAuthority',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      input.tenantId,
      input.authorityId,
      input.action,
      input.trigger,
      input.fromState,
      input.toState,
      input.actorUserId ?? null,
      input.correlationId ?? null,
      input.causationId ?? null,
      JSON.stringify(input.payload),
    ],
  );
}

export class PgRepresentativeAuthorityStore implements RepresentativeAuthorityStore {
  constructor(private readonly pool?: pg.Pool) {}

  async grant(command: GrantAuthorityCommand): Promise<GrantAuthorityOutcome> {
    const meta = command.meta ?? {};
    return withTenantTransaction(
      command.tenantId,
      async (client) => {
        // 1. Fast idempotent replay: an identical grant key already committed.
        const replay = await client.query<AuthorityRow>(
          `SELECT ${AUTHORITY_COLUMNS} FROM authority.representative_authority
             WHERE tenant_id = $1 AND idempotency_key = $2`,
          [command.tenantId, command.idempotencyKey],
        );
        if (replay.length > 0) {
          return { outcome: 'replayed', record: toAuthorityRecord(replay[0]!) };
        }

        // 2. Upsert the identity subject linkage (issuer + subject is the sole key).
        const subjectRows = await client.query<{ id: string }>(
          `INSERT INTO authority.identity_subject
             (id, tenant_id, issuer, external_subject, participant_id, status, source)
           VALUES ($1,$2,$3,$4,$5,'active',$6)
           ON CONFLICT (tenant_id, issuer, external_subject)
           DO UPDATE SET status = 'active', unlinked_at = NULL, updated_at = now(),
             participant_id = COALESCE(EXCLUDED.participant_id, authority.identity_subject.participant_id)
           RETURNING id`,
          [
            randomUUID(),
            command.tenantId,
            command.issuer,
            command.externalSubject,
            command.participantId ?? null,
            'grant',
          ],
        );
        const identitySubjectId = subjectRows[0]!.id;

        // 3. Fail closed on an existing LIVE active grant for this subject+org+type.
        const activeExisting = await selectForUpdate<AuthorityRow>(
          client,
          `SELECT ${AUTHORITY_COLUMNS} FROM authority.representative_authority
             WHERE tenant_id = $1 AND identity_subject_id = $2 AND organization_id = $3
               AND authority_type = $4 AND status = 'active'`,
          [command.tenantId, identitySubjectId, command.organizationId, command.authorityType],
        );
        if (activeExisting.length > 0) {
          return { outcome: 'conflict', record: toAuthorityRecord(activeExisting[0]!) };
        }

        // 4. Insert the authority head (DB defaults valid_from to now() when omitted).
        const authorityId = randomUUID();
        let insertedRows: AuthorityRow[];
        try {
          insertedRows = await client.query<AuthorityRow>(
            `INSERT INTO authority.representative_authority
               (id, tenant_id, identity_subject_id, organization_id, authority_type, status,
                valid_from, valid_until, issued_by, source_reference, idempotency_key, version)
             VALUES ($1,$2,$3,$4,$5,'active',
                     COALESCE($6::timestamptz, now()), $7, $8, $9, $10, 1)
             RETURNING ${AUTHORITY_COLUMNS}`,
            [
              authorityId,
              command.tenantId,
              identitySubjectId,
              command.organizationId,
              command.authorityType,
              command.validFrom ?? null,
              command.validUntil ?? null,
              command.issuedBy,
              command.sourceReference,
              command.idempotencyKey,
            ],
          );
        } catch (error) {
          // Concurrency backstop: the active-unique index or idempotency-key unique fired.
          if (isUniqueViolation(error)) {
            const raced = await client.query<AuthorityRow>(
              `SELECT ${AUTHORITY_COLUMNS} FROM authority.representative_authority
                 WHERE tenant_id = $1 AND identity_subject_id = $2 AND organization_id = $3
                   AND authority_type = $4 AND status = 'active'`,
              [command.tenantId, identitySubjectId, command.organizationId, command.authorityType],
            );
            if (raced.length > 0) {
              return { outcome: 'conflict', record: toAuthorityRecord(raced[0]!) };
            }
            const racedKey = await client.query<AuthorityRow>(
              `SELECT ${AUTHORITY_COLUMNS} FROM authority.representative_authority
                 WHERE tenant_id = $1 AND idempotency_key = $2`,
              [command.tenantId, command.idempotencyKey],
            );
            if (racedKey.length > 0) {
              return { outcome: 'replayed', record: toAuthorityRecord(racedKey[0]!) };
            }
          }
          throw error;
        }
        const record = toAuthorityRecord(insertedRows[0]!);
        const payload = grantPayload(record);

        // 5. Append-only authority event + 6. governance audit + 7. transactional outbox.
        await appendAuthorityEvent(client, {
          tenantId: command.tenantId,
          authorityId: record.id,
          eventType: 'granted',
          fromStatus: null,
          toStatus: 'active',
          ...(meta.actorUserId !== undefined ? { actorUserId: meta.actorUserId } : {}),
          ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
          ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
          payload,
        });
        await appendAuditEvent(client, {
          tenantId: command.tenantId,
          authorityId: record.id,
          action: 'granted',
          trigger: 'grant',
          fromState: null,
          toState: 'active',
          ...(meta.actorUserId !== undefined ? { actorUserId: meta.actorUserId } : {}),
          ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
          ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
          payload,
        });
        await enqueueOutbox(client, {
          tenantId: command.tenantId,
          messageType: AUTHORITY_GRANTED_MESSAGE_TYPE,
          payload,
          dedupeKey: authorityGrantedDedupeKey(command.idempotencyKey),
          maxRetries: AUTHORITY_OUTBOX_MAX_RETRIES,
          ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
          ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
        });

        return { outcome: 'granted', record };
      },
      this.pool,
    );
  }

  async revoke(command: RevokeAuthorityCommand): Promise<RevokeAuthorityOutcome> {
    const meta = command.meta ?? {};
    return withTenantTransaction(
      command.tenantId,
      async (client) => {
        // 1. Lock the head (tenant-scoped). Cross-tenant / unknown -> not found.
        const locked = await selectForUpdate<AuthorityRow>(
          client,
          `SELECT ${AUTHORITY_COLUMNS} FROM authority.representative_authority
             WHERE tenant_id = $1 AND id = $2`,
          [command.tenantId, command.authorityId],
        );
        if (locked.length === 0) {
          return { outcome: 'not_found' };
        }
        const current = toAuthorityRecord(locked[0]!);

        // 2. Idempotent: already revoked -> replay (revoke once).
        if (current.status === 'revoked') {
          return { outcome: 'replayed', record: current };
        }

        // 3. Optimistic-concurrency guard.
        if (command.expectedVersion !== undefined && command.expectedVersion !== current.version) {
          return { outcome: 'version_conflict', record: current };
        }

        // 4. Terminate the live authority.
        const updatedRows = await client.query<AuthorityRow>(
          `UPDATE authority.representative_authority
             SET status = 'revoked', revoked_by = $3, revoked_at = now(),
                 revocation_reason_code = $4, version = version + 1, updated_at = now()
           WHERE tenant_id = $1 AND id = $2 AND version = $5
           RETURNING ${AUTHORITY_COLUMNS}`,
          [
            command.tenantId,
            command.authorityId,
            command.revokedBy,
            command.revocationReasonCode ?? null,
            current.version,
          ],
        );
        if (updatedRows.length === 0) {
          // Lost the version race after locking (defensive; lock should prevent this).
          return { outcome: 'version_conflict', record: current };
        }
        const record = toAuthorityRecord(updatedRows[0]!);
        const payload = revokePayload(record);

        // 5. Append-only event + 6. audit + 7. outbox.
        await appendAuthorityEvent(client, {
          tenantId: command.tenantId,
          authorityId: record.id,
          eventType: 'revoked',
          fromStatus: 'active',
          toStatus: 'revoked',
          ...(meta.actorUserId !== undefined ? { actorUserId: meta.actorUserId } : {}),
          ...(command.revocationReasonCode !== undefined
            ? { reasonCode: command.revocationReasonCode }
            : {}),
          ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
          ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
          payload,
        });
        await appendAuditEvent(client, {
          tenantId: command.tenantId,
          authorityId: record.id,
          action: 'revoked',
          trigger: 'revoke',
          fromState: 'active',
          toState: 'revoked',
          ...(meta.actorUserId !== undefined ? { actorUserId: meta.actorUserId } : {}),
          ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
          ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
          payload,
        });
        await enqueueOutbox(client, {
          tenantId: command.tenantId,
          messageType: AUTHORITY_REVOKED_MESSAGE_TYPE,
          payload,
          dedupeKey: authorityRevokedDedupeKey(command.idempotencyKey),
          maxRetries: AUTHORITY_OUTBOX_MAX_RETRIES,
          ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
          ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
        });

        return { outcome: 'revoked', record };
      },
      this.pool,
    );
  }

  async getAuthorityById(
    tenantId: string,
    authorityId: string,
  ): Promise<RepresentativeAuthorityRecord | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<AuthorityRow>(
          `SELECT ${AUTHORITY_COLUMNS} FROM authority.representative_authority
             WHERE tenant_id = $1 AND id = $2`,
          [tenantId, authorityId],
        );
        return rows.length > 0 ? toAuthorityRecord(rows[0]!) : undefined;
      },
      this.pool,
    );
  }

  async listAuthoritiesForSubject(
    tenantId: string,
    issuer: string,
    externalSubject: string,
    authorityType: RepresentativeAuthorityType,
  ): Promise<readonly RepresentativeAuthorityRecord[]> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<AuthorityRow>(
          `SELECT ${AUTHORITY_COLUMNS.split(',')
            .map((c) => `ra.${c.trim()}`)
            .join(', ')}
             FROM authority.representative_authority ra
             JOIN authority.identity_subject s
               ON s.id = ra.identity_subject_id AND s.tenant_id = ra.tenant_id
             WHERE ra.tenant_id = $1 AND s.issuer = $2 AND s.external_subject = $3
               AND s.status = 'active' AND ra.authority_type = $4
             ORDER BY ra.issued_at DESC`,
          [tenantId, issuer, externalSubject, authorityType],
        );
        return rows.map(toAuthorityRecord);
      },
      this.pool,
    );
  }

  async getIdentitySubject(
    tenantId: string,
    issuer: string,
    externalSubject: string,
  ): Promise<IdentitySubjectRecord | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<IdentitySubjectRow>(
          `SELECT ${IDENTITY_SUBJECT_COLUMNS} FROM authority.identity_subject
             WHERE tenant_id = $1 AND issuer = $2 AND external_subject = $3`,
          [tenantId, issuer, externalSubject],
        );
        return rows.length > 0 ? toIdentitySubjectRecord(rows[0]!) : undefined;
      },
      this.pool,
    );
  }
}
