# Evidence quarantine workflow

This document describes the **asynchronous quarantine workflow** that records a sanitized
security event whenever the [malware scanning gate](./evidence-malware-scanning.md) **blocks**
an evidence upload.

## Purpose

When the ingestion gate rejects an upload (an `infected` result, or `error` / `skipped` when
scanning is configured as required), the rejected payload must be **kept out of normal evidence
storage** — but the security-relevant fact that a malicious or unscannable upload was attempted
should still be **recorded and observable**.

The quarantine workflow turns that blocked outcome into an **auditable security event**:

- it records sanitized quarantine **metadata** in `governance.evidence_quarantine_event`;
- it emits an `evidence.quarantine.recorded` **outbox event** (delivered after commit through
  the existing transactional outbox) so downstream consumers can react asynchronously;
- it does this **without storing the infected bytes** anywhere — only a SHA-256 content hash
  and sanitized scan metadata are retained.

It is deliberately **not** a governance lifecycle decision. The quarantine workflow:

- **may** record sanitized metadata about a blocked upload;
- **may** emit an outbox event describing the blocked upload;
- **may** surface a non-sensitive `quarantineEventId` correlation id in the rejection response.

It **must not**:

- store the infected/blocked payload bytes (there is no byte parameter anywhere in the module);
- approve or reject a governed lifecycle transition;
- mutate `governance.entity_state`, create transition requests, or execute a workflow;
- call `GovernanceKernel.transition()`;
- leak payload contents, threat names, or actor identity into the outbox payload or response;
- require a real antivirus engine, external process, network call, Azure, or Entra in unit
  tests.

Creating governance **evidence metadata** for a lifecycle action remains the sole
responsibility of the Governance Kernel during a governed transition. Quarantine is operational
security infrastructure; it is **not** a lifecycle event.

## Where quarantine sits in the upload flow

```
HTTP upload (POST /v1/evidence/objects)
  → requireTenant + content-type / size validation
  → evaluateEvidenceScan(scanner, required)          ← ingestion gate (non-throwing)
       ├─ accept (clean / non-required skip|error)   → EvidenceUploadService.store(...) → 201
       └─ reject (infected, or required error|skip)
            → rejectBlockedUpload(...)                ← quarantine seam (this document)
                 ├─ hash payload (SHA-256), gather sanitized scan metadata
                 ├─ EvidenceQuarantineService.recordBlockedUpload(...)
                 │     ├─ INSERT governance.evidence_quarantine_event   (metadata only)
                 │     └─ ENQUEUE governance.outbox_message             (same transaction)
                 └─ return original rejection (422 / 503) [+ quarantineEventId]
```

The infected bytes are **never** passed to `rejectBlockedUpload` or the quarantine service —
only `content.byteLength`, the SHA-256 digest, and sanitized scan metadata cross the seam.

The quarantine module lives at `src/governance/evidence/quarantine/` and never touches governed
tables (`entity_state`, `state_transition`, `transition_request`, …) or the kernel. The only
governance table it writes is its own `evidence_quarantine_event` plus the shared
`outbox_message` table — both in the **same database transaction** so recording and the emitted
event are atomic.

## Quarantine record (metadata only)

`governance.evidence_quarantine_event` stores, per blocked upload:

| Column | Notes |
| --- | --- |
| `id` | Quarantine event id (also the outbox dedupe seed). |
| `tenant_id` | Owning tenant; RLS-scoped. |
| `evidence_object_id` | Optional caller-supplied id; free-form, **not** a FK to governed evidence. |
| `source_filename`, `content_type`, `size_bytes` | Sanitized descriptors of the rejected upload. |
| `content_hash` | SHA-256 hex digest of the rejected payload. **No bytes are kept.** |
| `scan_status` | `infected` \| `error` \| `skipped`. |
| `scanner`, `signature_version`, `threat_name`, `reason` | Sanitized scan provenance. |
| `quarantine_status` | Lifecycle of the security event itself: `recorded` (default) → `notified` → `reviewed` → `released` \| `discarded`. **Not** a governed entity lifecycle. |
| `upload_actor_user_id`, `request_id`, `correlation_id` | Observability/correlation only. |

There is **no payload/bytes column by design.**

## Outbox event contract

Message type: `evidence.quarantine.recorded`. Dedupe key:
`evidence.quarantine.recorded:<quarantineEventId>` (idempotent enqueue — re-recording the same
event will not duplicate the message). Payload (sanitized — no bytes, no actor identity, no
upload headers):

```jsonc
{
  "quarantineEventId": "…",
  "tenantId": "…",
  "contentHash": "<sha256-hex>",
  "contentType": "application/pdf",
  "sizeBytes": 1234,
  "scanStatus": "infected",
  "scanner": "signature",
  "threatName": "…",        // optional
  "evidenceObjectId": "…",  // optional
  "requestId": "…",         // optional
  "correlationId": "…"      // optional
}
```

Publishing follows the normal outbox path (claim → publish → mark processed) with true full
jitter retries. A publisher failure **before** Service Bus accepts the message is a failed
Postgres outbox row, not a Service Bus DLQ event. Azure Service Bus sessions are **not** used.

## Tenancy and RLS

`evidence_quarantine_event` is tenant-owned: it carries `tenant_id`, has `ENABLE` + `FORCE ROW
LEVEL SECURITY`, and its policies require `tenant_id = governance.current_tenant_id()`. The
`PgEvidenceQuarantineStore` writes both the quarantine row and the outbox row inside
`withTenantTransaction(tenantId, …)`, which sets `app.tenant_id` transaction-locally first. The
application role (`house_app`, non-superuser, `NOBYPASSRLS`) is granted only `SELECT, INSERT,
UPDATE`. Missing tenant context fails closed (`TENANT_CONTEXT_MISSING`).

## Error behaviour (fail-safe)

Quarantine recording is wrapped so it can **never weaken** the rejection:

- if the quarantine store is unavailable or throws, the upload is **still rejected** with its
  original status code (`422` infected / `503` required error|skip) — a quarantine failure never
  turns a rejection into an acceptance;
- a quarantine failure never surfaces payload-derived internals; at most the rejection omits the
  `quarantineEventId`;
- when quarantine is disabled (`EVIDENCE_QUARANTINE_ENABLED=false`) the upload is still rejected,
  just not recorded.

## Why infected payloads are not stored

Persisting known-malicious bytes — even in a "quarantine bucket" — creates a durable liability:
accidental retrieval, replication, backup propagation, and scanner-evasion risk. This workflow
retains only a **content hash** (enough to correlate, deduplicate, and prove an attempt) plus
sanitized metadata. A future pass may add an explicit, access-controlled quarantine blob store;
that is intentionally **out of scope** here.

## Why quarantine does not approve or reject lifecycle

A blocked upload is an **ingestion/security** event, not a governed business decision. Approving
or rejecting an `AffiliationApplication` (or any governed entity) must go through the Governance
Kernel with its policy, guards, audit, and evidence semantics. Quarantine deliberately stops at
recording metadata + emitting an event; it does not mutate governed state.

## Configuration

| Env var | Default | Effect |
| --- | --- | --- |
| `EVIDENCE_QUARANTINE_ENABLED` | `true` | Record blocked uploads + emit the outbox event. `false` still rejects, just does not record. |
| `EVIDENCE_QUARANTINE_INCLUDE_EVENT_ID_IN_RESPONSE` | `true` | Include the non-sensitive `quarantineEventId` in the rejection response. |

Neither default requires any external system, so the local/demo runtime keeps working out of the
box (with quarantine recording through the Postgres store when a database is configured).

## Out of scope (intentional stubs / future passes)

- a real antivirus engine (Microsoft Defender, ClamAV, or any third-party AV SDK);
- a dedicated, access-controlled **quarantine blob store** for the infected bytes;
- a security-analyst **quarantine review UI**;
- the `released` / `discarded` **review workflow** (the `quarantine_status` column models the
  states, but no transition logic is implemented yet);
- automated incident response or SIEM / alerting integration.

## Related

- [Evidence malware scanning](./evidence-malware-scanning.md) — the ingestion gate that produces
  the blocked outcome.
- [Evidence HTTP endpoints](./evidence-http-endpoints.md) — the upload endpoint that hosts the
  quarantine seam.
- [Evidence storage](./evidence-storage.md) — where **clean** payloads (and only clean payloads)
  are persisted.
