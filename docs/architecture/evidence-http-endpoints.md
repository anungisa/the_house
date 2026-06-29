# Evidence HTTP endpoints

This document describes the narrow **evidence payload HTTP endpoints** that expose the
existing evidence storage layer over HTTP. The scope is deliberately small: store payload
bytes and retrieve them again. Nothing here approves, reviews, classifies, scans, or governs
anything.

## Scope (and hard non-goals)

These endpoints are **transport only** over the evidence **payload** layer (see
[evidence-storage.md](evidence-storage.md)). They:

- accept raw document bytes and store them via `GovernanceEvidenceService` →
  `EvidenceStorage`;
- return the stored bytes again given a tenant-scoped storage reference.

They explicitly do **not** (and must not grow to) include:

- any frontend UI or document-management screens;
- virus / malware scanning, OCR, or AI classification;
- a document **review workflow** or any lifecycle approval;
- retention automation or WORM / immutable-blob policies;
- public/pre-signed blob URL generation;
- any call to `GovernanceKernel.transition()` or any write to a governed table.

Creating governance **evidence metadata** for a lifecycle action remains the sole
responsibility of the Governance Kernel during a governed transition. Uploading a payload
here is infrastructure; it is **not** a lifecycle event. The HTTP layer never sees governed
state, and these routes never weaken tenant RLS — evidence payloads live outside PostgreSQL.

## Routes

Both routes are `POST` and live under `/v1/evidence`:

| Method + path | Body | Success | Purpose |
| --- | --- | --- | --- |
| `POST /v1/evidence/objects` | raw payload bytes | `201` JSON metadata | Store an evidence payload |
| `POST /v1/evidence/objects/read` | JSON `{ evidenceObjectId, storageRef }` | `200` raw bytes | Retrieve a stored payload |

Download is a `POST` (not a `GET`) so the (potentially long) storage reference travels in the
request body rather than the URL/query string, and never lands in access logs.

The endpoints are served by the same native HTTP server as the affiliation adapter
(`createAffiliationHttpServer`). They are wired only when the server is built with `evidence`
dependencies (the production composition root always wires them; when absent the routes
`404`). Non-`POST` requests to an evidence route return `405` with `Allow: POST`.

## Identity and tenancy

Evidence request bodies are **binary** (upload) or a **storage reference** (download), so —
unlike the affiliation adapter, which reads identity from a JSON body in demo mode — evidence
identity is **always** carried in the shared `x-house-*` trusted-header contract
(`TRUSTED_HEADER_NAMES`):

- In `trusted_headers` mode a verifying edge (gateway / identity provider) sets these headers;
  the adapter reads them directly.
- In `demo` mode (LOCAL/DEMO only) the same headers are **trusted without verification** — the
  adapter synthesizes a demo identity from them so local development still works with a binary
  body.

Required identity header: `x-house-tenant-id` (a missing tenant fails closed with `401`). The
resolved tenant id partitions every storage key as
`tenants/{tenantId}/evidence/{evidenceObjectId}/{sha256}`.

On **download**, two checks bind the request to the caller's tenant before any storage read:

1. **Tenant ownership** — the `storageRef.key` must start with `tenants/{tenantId}/evidence/`,
   else `403 FORBIDDEN`.
2. **Integrity** — the key must equal `buildEvidenceStorageKey(tenantId, evidenceObjectId,
   sha256)`, else `400 INVALID_INPUT`. This prevents mixing a valid key with a mismatched
   `evidenceObjectId`.

## Upload request / response

Headers:

- `content-type` (required) — the payload's media type; stored and echoed on download.
- `x-house-source-filename` (optional) — original filename metadata.
- `x-house-retention-class` (optional) — free-form retention label. Retention classes are
  **not constrained or validated** in v1 (no retention automation exists yet).
- `x-house-evidence-object-id` (optional) — reuse an existing object id; otherwise one is
  generated.
- `x-house-correlation-id` (optional) — tracing correlation id.

Body: raw payload bytes. The size is capped by `EVIDENCE_UPLOAD_MAX_BYTES` (default 10 MiB),
enforced both while reading the socket and again in the adapter. Empty bodies are rejected.

Success — `201`:

```json
{
  "status": "stored",
  "evidenceObjectId": "…",
  "contentHash": "<sha256-hex>",
  "storageRef": "<serialized storage reference>",
  "storageProvider": "memory | azure_blob",
  "storageContainer": "…",
  "storageKey": "tenants/<tenantId>/evidence/<evidenceObjectId>/<sha256>",
  "contentType": "…",
  "sizeBytes": 1234,
  "requestId": "…"
}
```

`contentHash` is the governance `content_hash` and `storageRef` is the governance
`storage_ref`; a later governed transition binds these into evidence metadata via the kernel.
The response is **metadata only** — the payload bytes are never returned in the JSON.

## Download request / response

Body (JSON):

```json
{ "evidenceObjectId": "…", "storageRef": "<serialized storage reference>" }
```

Success — `200` with the raw payload bytes and the `Content-Type` taken from the stored
`storageRef.contentType` (`GetEvidenceObjectResult` deliberately omits content type, so the
reference is authoritative). When `EVIDENCE_STORAGE_REQUIRE_HASH` is enabled (default), the
storage layer re-verifies the SHA-256 digest on read.

## Error mapping

| Condition | Code | HTTP |
| --- | --- | --- |
| Missing/invalid input, oversize, empty body | `INVALID_INPUT` | `400` |
| Missing tenant identity | `UNAUTHENTICATED` | `401` |
| storageRef belongs to another tenant | `FORBIDDEN` | `403` |
| No stored object for the reference | `EVIDENCE_NOT_FOUND` | `404` |
| Stored digest mismatch | `EVIDENCE_HASH_MISMATCH` | `409` |
| Controlled storage failure | `EVIDENCE_STORAGE_ERROR` | `500` |

Any non-`AppError` (e.g. a raw SDK/storage failure) collapses to an opaque
`{"code":"INTERNAL","message":"Internal server error."}` `500` so internal details never leak.

## Local / demo usage

The default evidence provider is in-memory, so the endpoints work locally with no Azure
configuration:

```bash
# Upload (demo mode trusts x-house-* headers without verification)
curl -s -X POST http://127.0.0.1:3000/v1/evidence/objects \
  -H 'x-house-tenant-id: tenant-a' \
  -H 'x-house-actor-user-id: user-1' \
  -H 'content-type: text/plain' \
  --data-binary 'hello evidence'

# Download — pass back the evidenceObjectId + storageRef from the upload response
curl -s -X POST http://127.0.0.1:3000/v1/evidence/objects/read \
  -H 'x-house-tenant-id: tenant-a' \
  -H 'x-house-actor-user-id: user-1' \
  -H 'content-type: application/json' \
  -d '{"evidenceObjectId":"…","storageRef":"…"}'
```

In production, set `AUTH_MODE=trusted_headers` behind a verifying edge and
`EVIDENCE_STORAGE_PROVIDER=azure_blob` (config-gated; requires a connection string and
container).

## Configuration

- `EVIDENCE_STORAGE_PROVIDER` — `memory` (default) or `azure_blob`.
- `EVIDENCE_UPLOAD_MAX_BYTES` — positive integer max upload size (default `10485760` = 10 MiB).
- `EVIDENCE_STORAGE_REQUIRE_HASH` — verify the digest on read (default `true`).

See [evidence-storage.md](evidence-storage.md) for the payload storage layer and
[local-api-runtime.md](local-api-runtime.md) for running the server locally.
