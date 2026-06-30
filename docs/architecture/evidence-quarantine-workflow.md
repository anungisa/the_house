# Evidence quarantine workflow

This document describes the **asynchronous quarantine workflow** that records a sanitized
security event whenever the [malware scanning gate](./evidence-malware-scanning.md) **blocks**
an evidence upload, plus the **operator review / disposition workflow** that lets an authorized
security operator triage those events (list, read, and mark them `reviewed`, `released`, or
`discarded`).

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
| `reviewed_by_user_id`, `reviewed_at`, `disposition_reason` | Set by the operator **disposition** workflow (the acting operator, the time, and an optional note). Never the uploader. |
| `disposition_outbox_message_id` | The outbox message enqueued by the latest disposition (transactional correlation). |

There is **no payload/bytes column by design.** The disposition columns are added by migration
`0008` (additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`); the existing `quarantine_status`
`CHECK` already admits `reviewed`/`released`/`discarded`.

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

## Review and disposition workflow

Recording a quarantine event is asynchronous and operatorless. A separate, **synchronous**
review surface lets an authorized **security operator** triage the queue: list events, inspect
one, and record a **disposition**. This is the only part of the module that mutates an existing
quarantine row, and it still touches **no** governed lifecycle table and **never** calls the
kernel.

### HTTP routes

All three routes are served only when `EVIDENCE_QUARANTINE_ENABLED=true` (otherwise they 404).
Identity (tenant + acting operator) is always taken from the shared `x-house-*` trusted-header
contract — never from the query, path, or body.

| Method & path | Purpose |
| --- | --- |
| `GET /v1/evidence/quarantine` | List quarantine events for the caller's tenant. Optional query: `status`, `scanStatus`, `limit` (≤ 100), `cursor` (opaque keyset cursor). |
| `GET /v1/evidence/quarantine/:id` | Read one quarantine event for the caller's tenant. |
| `POST /v1/evidence/quarantine/:id/disposition` | Record a disposition. Body: `{ "disposition": "reviewed" \| "released" \| "discarded", "reason"?: string }`. |

The read responses return a **sanitized operator view** (`QuarantineEventView`) — it includes
investigation metadata a security operator legitimately needs (including `uploadActorUserId` and
`sourceFilename`) but **never** raw bytes (none are stored), tokens, headers, or the matched
signature contents. The disposition response is `{ status, quarantineEventId, previousStatus,
newStatus, disposition, requestId }`.

### Status transition rules (fail closed)

A disposition advances only the quarantine event's **own** `quarantine_status`, validated atomically
under a `SELECT … FOR UPDATE` row lock by a shared pure function (`isAllowedQuarantineTransition`):

```
recorded ─┐
notified ─┼─→ reviewed ─→ released (terminal)
          │            └─→ discarded (terminal)
          ├──────────────→ released (terminal)
          └──────────────→ discarded (terminal)
```

- `released` and `discarded` are **terminal** — there is no reopening in v1.
- An unknown disposition value is rejected **before** any store access (`400`
  `EVIDENCE_QUARANTINE_INVALID_DISPOSITION`).
- A disposition against an unknown / cross-tenant event is `404`
  `EVIDENCE_QUARANTINE_NOT_FOUND` (RLS makes another tenant's row invisible, so it reads as
  not-found).
- An illegal transition (including any disposition of a terminal event) is `409`
  `EVIDENCE_QUARANTINE_DISPOSITION_CONFLICT`; the stored status is unchanged.

### Authorization model (v1 local gate)

Authorization is a **local, fail-closed gate** at the adapter (centralized authorization policy
is future work):

- **read** (`list` / detail) requires the `evidence.quarantine.read` permission **or** a
  security role (`security_reviewer` / `security_admin`);
- **disposition** requires the `evidence.quarantine.disposition` permission **or** a security
  role.

A missing tenant identity is `401`; a present identity without the required permission/role is
`403`. The acting operator id recorded on the row and emitted in the outbox event is the
**dispositioning operator** — never the uploader.

### Disposition outbox events

Each disposition emits its own sanitized outbox event in the **same transaction** as the row
update (transactional outbox):

| Disposition | Message type |
| --- | --- |
| `reviewed` | `evidence.quarantine.reviewed` |
| `released` | `evidence.quarantine.released` |
| `discarded` | `evidence.quarantine.discarded` |

Dedupe key: `<messageType>:<quarantineEventId>`. Payload (sanitized — **no** raw bytes, **no**
uploader identity, **no** source filename, **no** headers):

```jsonc
{
  "quarantineEventId": "…",
  "tenantId": "…",
  "contentHash": "<sha256-hex>",
  "scanStatus": "infected",
  "scanner": "signature",
  "previousStatus": "recorded",
  "newStatus": "reviewed",
  "actorUserId": "<dispositioning operator>",  // never the uploader
  "threatName": "…",       // optional
  "requestId": "…",        // optional
  "correlationId": "…"     // optional
}
```

### Why "released" does not restore or create evidence

`released` is a **security disposition** (for example a confirmed false positive, or metadata
worth keeping for the record). Because the infected bytes were **never retained** (only a hash
plus sanitized metadata), there is nothing to restore: release does **not** un-quarantine bytes,
does **not** create a `governance.evidence_object`, and does **not** mark any governed evidence
requirement satisfied. If the underlying document is still genuinely needed, it must be
**re-uploaded** through the normal evidence path and **re-scanned**. Creating governed evidence
remains the sole responsibility of the Governance Kernel during a governed transition.

### Why infected bytes are still not stored

Disposition does not change the no-bytes posture. Even a `released` event keeps only the content
hash and sanitized metadata — there is still no `bytea`/`payload` column. A disposition is a
metadata state change plus an outbox event; it never reintroduces the original bytes.

## Tenancy and RLS

`evidence_quarantine_event` is tenant-owned: it carries `tenant_id`, has `ENABLE` + `FORCE ROW
LEVEL SECURITY`, and its policies require `tenant_id = governance.current_tenant_id()`. The
`PgEvidenceQuarantineStore` writes both the quarantine row and the outbox row inside
`withTenantTransaction(tenantId, …)`, which sets `app.tenant_id` transaction-locally first. The
application role (`house_app`, non-superuser, `NOBYPASSRLS`) is granted only `SELECT, INSERT,
UPDATE`. Missing tenant context fails closed (`TENANT_CONTEXT_MISSING`).

## Database / RLS validation

The quarantine database path is exercised by a gated PostgreSQL integration suite
(`tests/integration/governance/evidence-quarantine.integration.test.ts`) that runs only when
`RUN_DB_TESTS=1` and an admin connection URL is supplied; the default `npm test` run stays
hermetic and skips it. The suite provisions a dedicated **non-superuser, `NOBYPASSRLS`**
application role granted only `SELECT, INSERT, UPDATE` on `evidence_quarantine_event` and
`outbox_message` (no `DELETE`/`TRUNCATE`), and connects as that role to prove the production-grade
posture against real PostgreSQL. It validates:

- migration `0007` applies and `governance.evidence_quarantine_event` exists with
  `relrowsecurity` **and** `relforcerowsecurity` set (FORCE RLS);
- the application role is `rolsuper = false` and `rolbypassrls = false`;
- recording a blocked upload writes the quarantine row **and** the outbox row atomically in one
  transaction (a transient `REVOKE INSERT` on `outbox_message` rolls back the quarantine row too);
- the quarantine row stores only sanitized metadata (`content_hash`, `content_type`, `size_bytes`,
  scanner/scan fields) — there is **no** `bytea`/`payload`/raw-content column;
- the outbox payload carries correlation fields (`quarantineEventId`, `contentHash`, `scanStatus`)
  but never the raw bytes, uploader actor id, or source filename;
- tenant isolation holds: a tenant reads only its own rows, cannot see another tenant's rows, and
  an insert with no tenant context fails closed (`P0001` / `TENANT_CONTEXT_MISSING`);
- quarantine does **not** mutate governed lifecycle tables — `entity_state`, `state_transition`,
  `audit_event`, and `evidence_object` counts are unchanged;
- the HTTP upload seam (`handleEvidenceUpload`) rejects an EICAR payload with
  `422 EVIDENCE_MALWARE_DETECTED`, never calls clean-evidence storage, and records the
  quarantine + outbox rows with a hash of the rejected bytes;
- migration `0008` applies and adds the disposition columns (`reviewed_by_user_id`,
  `reviewed_at`, `disposition_reason`, `disposition_outbox_message_id`);
- the restricted role can record a disposition (status advances; reviewer + timestamp + note +
  disposition outbox id persisted), emitting a sanitized disposition outbox event atomically
  with **no** uploader identity, filename, or raw bytes;
- disposition is tenant-isolated (another tenant's event reads as not-found), terminal events
  cannot be re-dispositioned, disposition mutates **no** governed lifecycle table, and a
  disposition `UPDATE` with no tenant context fails closed (`P0001`).

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
- a security-analyst **quarantine review UI** / client surface;
- **reopening** a `released` / `discarded` event (terminal in v1);
- centralized authorization policy (the read/disposition gate is a local permission/role check);
- automated incident response or SIEM / alerting integration.

## Related

- [Evidence malware scanning](./evidence-malware-scanning.md) — the ingestion gate that produces
  the blocked outcome.
- [Evidence HTTP endpoints](./evidence-http-endpoints.md) — the upload endpoint that hosts the
  quarantine seam.
- [Evidence storage](./evidence-storage.md) — where **clean** payloads (and only clean payloads)
  are persisted.
