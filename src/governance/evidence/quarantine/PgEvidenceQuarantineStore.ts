/**
 * PostgreSQL {@link EvidenceQuarantineStore} (integration).
 *
 * Writes the quarantine event row AND its outbox message row in the SAME tenant-scoped
 * transaction (transactional outbox: the security event and the message that announces it
 * commit together, or not at all). Both tables are under FORCE RLS keyed on
 * governance.current_tenant_id(); the transaction sets `app.tenant_id` first so a
 * non-superuser, non-BYPASSRLS role is tenant-isolated. NEVER stores raw payload bytes.
 *
 * `pool` is injectable so a dedicated connection can be wired; the default uses the shared
 * pool (DATABASE_URL).
 */

import type pg from 'pg';
import { withTenantTransaction } from '../../../db/pool.js';
import type { OutboxEnqueueInput } from '../../outbox/OutboxStore.js';
import type { EvidenceQuarantineStore } from './EvidenceQuarantineStore.js';
import type {
  EvidenceQuarantineRecord,
  RecordedQuarantineEvent,
} from './EvidenceQuarantineTypes.js';

export class PgEvidenceQuarantineStore implements EvidenceQuarantineStore {
  constructor(private readonly pool?: pg.Pool) {}

  async record(
    record: EvidenceQuarantineRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<RecordedQuarantineEvent> {
    return withTenantTransaction(
      record.tenantId,
      async (client) => {
        const quarantineRows = await client.query<{ id: string }>(
          `INSERT INTO governance.evidence_quarantine_event
             (id, tenant_id, evidence_object_id, source_filename, content_type, size_bytes,
              content_hash, scan_status, scanner, signature_version, threat_name, reason,
              quarantine_status, upload_actor_user_id, request_id, correlation_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'recorded',$13,$14,$15)
           RETURNING id`,
          [
            record.quarantineEventId,
            record.tenantId,
            record.evidenceObjectId ?? null,
            record.sourceFilename ?? null,
            record.contentType,
            record.sizeBytes,
            record.contentHash,
            record.scanStatus,
            record.scanner,
            record.signatureVersion ?? null,
            record.threatName ?? null,
            record.reason ?? null,
            record.uploadActorUserId ?? null,
            record.requestId ?? null,
            record.correlationId ?? null,
          ],
        );
        const quarantineEventId = quarantineRows[0]!.id;

        const outboxRows = await client.query<{ id: string }>(
          `INSERT INTO governance.outbox_message
             (tenant_id, message_type, payload, status, max_retries, dedupe_key,
              correlation_id, causation_id)
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

        return { quarantineEventId, outboxMessageId: outboxRows[0]!.id };
      },
      this.pool,
    );
  }
}
