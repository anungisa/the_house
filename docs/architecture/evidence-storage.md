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
> kernel's existing behavior is unchanged when `TransitionInput.evidence` is absent. When a
> binding **is** supplied, the kernel records it on the evidence metadata it creates (see
> [Binding payload storage to governance metadata](#binding-payload-storage-to-governance-metadata)).

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
- `EvidenceMetadataBinding.ts` — converts `StoredEvidenceMetadata` into the governance
  binding (`content_hash` + serialized `storage_ref`); `buildEvidenceStorageRef`,
  `serializeEvidenceStorageRef`, `parseEvidenceStorageRef`, `toEvidencePayloadBinding`.
- `GovernanceEvidenceService.ts` — stores payload bytes and returns the stored metadata
  **plus** the governance binding a governed transition can attach. Writes no governed tables.
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
  columns. **No migration was added in this pass** — both columns already exist and are
  nullable. This pass populates them when a transition supplies a payload binding.

## Binding payload storage to governance metadata

This pass makes a stored payload a first-class part of governance evidence metadata, **without**
letting the kernel touch blob storage or raw bytes.

The flow is:

1. A caller stores payload bytes through `GovernanceEvidenceService.storeEvidencePayload(...)`
   (or `EvidenceStorageService`), receiving `StoredEvidenceMetadata`.
2. `toEvidencePayloadBinding(metadata)` derives an `EvidencePayloadBinding`:
   - `contentHash` — the lowercase hex SHA-256 digest of the payload.
   - `storageRef` — a stable JSON string locating the payload
     (`{ provider, container, key, contentType, sizeBytes, sha256, sourceFilename?,
     retentionClass? }`).
3. The caller passes that binding as the optional `TransitionInput.evidence` field.
4. Inside the governed transaction, for an **evidence-required** transition, the kernel persists
   `contentHash` → `governance.evidence_object.content_hash` and `storageRef` → `storage_ref`.

Column semantics:

- `content_hash` holds the SHA-256 hex digest — the tamper-evident link to the payload.
- `storage_ref` holds the serialized `EvidenceStorageRef` JSON — the durable, provider-agnostic
  pointer to the bytes. **Raw payload bytes are never stored in PostgreSQL** — only the digest
  and a reference.

### Metadata-only evidence remains valid

When a transition does **not** supply `evidence`, the kernel creates evidence metadata exactly
as before with `content_hash` and `storage_ref` left `NULL`. Binding is purely additive; the
kernel never receives bytes, never contacts Azure, and transition execution never depends on
blob storage.

### Why upload/download endpoints are still a future pass

This pass only binds **already-stored** payload references to governance metadata. HTTP
upload/download endpoints (and their auth, streaming, and size limits) are a separate concern.
They now have a governed place to put their storage references — the kernel's evidence
metadata — instead of becoming a parallel, ungoverned document system.

## Out of scope (separate passes)

- Upload/download HTTP endpoints.
- Two-tier document review workflow and review states.
- Virus scanning, OCR, and AI document classification.
- Retention automation and immutable-blob (WORM) policies.
- Managed-identity auth and production secrets management.
- Production deployment / IaC.
