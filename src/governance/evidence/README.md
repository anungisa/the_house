# `governance/evidence` — Immutable evidence metadata (module boundary placeholder)

Owns creation of immutable `evidence_object` **metadata** for high-risk transitions
(`approve`, `reject`, `suspend`, `reinstate`, `revoke`, `close`, `archive`). Stores
references/hashes to externally-held evidence — never blob content.

**Scaffold status:** boundary only. The `EvidenceObjectMetadata` contract lives in
[`../types/TransitionTypes.ts`](../types/TransitionTypes.ts). The repository/writer is
implemented in the Governance Kernel pass.

Rules:
- Immutable once created.
- Created inside the transition transaction when `evidence_required` is set.
- Tenant-scoped (`tenant_id` + RLS).
