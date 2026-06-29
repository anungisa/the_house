# Evidence payload/document storage

This document describes the **evidence payload storage** layer added behind the existing
governance evidence model. It covers what the layer does, how it is configured, and — most
importantly — the boundary it must never cross.

## Two evidence layers

The House keeps two distinct evidence layers. Do not conflate them.

| Layer | Where it lives | Who creates it | Purpose |
| --- | --- | --- | --- |
| **Governance evidence metadata** | PostgreSQL `governance.evidence_object` (tenant-scoped, RLS, append-only, auditable) | **Only the Governance Kernel**, during a governed transition | The immutable record that evidence exists for a lifecycle action |
| **Evidence payload / document bytes** | Outside PostgreSQL — Azure Blob in production, in-memory for tests | The evidence storage layer (this module) | The actual document bytes, hash-addressed and digest-verified |

The Governance Kernel remains the **only** path that creates transition evidence metadata for
governed lifecycle actions. Storing a document payload is **infrastructure**; it is **not** a
lifecycle approval and **must not** bypass governance metadata. Raw documents are never stored
in PostgreSQL.

> Transition evidence can remain metadata-only when no document payload is supplied — the
> kernel's existing behavior is unchanged by this pass.

## Module layout

`src/governance/evidence/`

- `EvidenceStorage.ts` — the `EvidenceStorage` port plus metadata/ref/input types and
  `buildEvidenceStorageKey()`.
- `EvidenceHasher.ts` — SHA-256 hashing (`sha256Hex`, `sha256EvidenceHasher`).
- `EvidenceStorageErrors.ts` — controlled `AppError`s: `EvidenceNotFoundError`,
  `EvidenceHashMismatchError`, `EvidenceStorageError`.
- `InMemoryEvidenceStorage.ts` — in-process backend for local/demo/test.
- `AzureBlobEvidenceStorage.ts` — real Azure Blob backend, decoupled from the SDK via the
  tiny `ContainerClientLike` / `BlockBlobClientLike` interfaces.
- `azureBlobClient.ts` — the **only** file that imports `@azure/storage-blob`; adapts the real
  `ContainerClient` to `ContainerClientLike`.
- `EvidenceStorageFactory.ts` — `createEvidenceStorage(config, deps?)` selects the backend.
- `EvidenceStorageService.ts` — thin seam to store a payload and obtain its metadata/ref.
- `index.ts` — public surface.

## Storage providers

- **`memory`** (default): in-process `Map`. LOCAL/DEMO/TEST only; payloads are lost on restart.
  Requires no Azure configuration and never blocks local/test runtimes.
- **`azure_blob`**: real Azure Blob Storage. Requires a connection string and a container name.
  v1 authenticates with a connection string; the client is injected through a factory boundary
  so managed-identity auth can be added later without touching the storage class.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `EVIDENCE_STORAGE_PROVIDER` | `memory` | `memory` or `azure_blob`. Unknown values fail closed. |
| `EVIDENCE_BLOB_CONNECTION_STRING` | _(empty)_ | Required when provider is `azure_blob`. Secret — never commit. |
| `EVIDENCE_BLOB_CONTAINER_NAME` | _(empty)_ | Required when provider is `azure_blob`. |
| `EVIDENCE_STORAGE_REQUIRE_HASH` | `true` | Verify the SHA-256 digest on read. |

Validation fails closed only when `azure_blob` is selected: the default `memory` provider
needs no Azure config. An unknown provider always fails closed at config load.

## Hash verification

Payloads are hash-addressed and digest-verified with SHA-256:

- On **write**, the backend computes the SHA-256 of the bytes. If the caller supplies
  `expectedSha256` and it does not match, the write is rejected (`EvidenceHashMismatchError`)
  and **no bytes are persisted**.
- On **read**, when `requireHash` is enabled the backend recomputes the digest and compares it
  to the digest pinned in the `EvidenceObjectRef`, rejecting a mismatch. A payload is never
  trusted without a digest.

## Storage key convention

```
tenants/{tenantId}/evidence/{evidenceObjectId}/{sha256}
```

Tenant-first partitioning namespaces payloads per tenant; embedding the SHA-256 makes the key
content-addressed and tamper-evident. The convention is NSO-generic — no domain/sport-specific
segments.

## Relation to the Governance Kernel

- The Governance Kernel is the **only** writer of `governance.evidence_object` metadata for
  governed transitions.
- This storage layer does **not** call the kernel, run transitions, or weaken RLS. It touches
  no governed tables.
- The `governance.evidence_object` table already carries `content_hash` and `storage_ref`
  placeholder columns. **No migration was added in this pass.** A future pass can populate
  those columns from the `StoredEvidenceMetadata` (`sha256` → `content_hash`,
  `storageKey`/provider → `storage_ref`) when wiring kernel-created metadata to a stored
  payload. Until then, evidence metadata remains metadata-only and valid.

## Out of scope (separate passes)

- Upload/download HTTP endpoints.
- Two-tier document review workflow and review states.
- Virus scanning, OCR, and AI document classification.
- Retention automation and immutable-blob (WORM) policies.
- Managed-identity auth and production secrets management.
- Production deployment / IaC.
