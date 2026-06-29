# `governance/audit` — Append-only audit (module boundary placeholder)

Owns the append-only `audit_event` write path. Audit events are written **inside the same
database transaction** as the governed transition by the Governance Kernel — never as an
ad hoc, out-of-band write.

**Scaffold status:** boundary only. The `AuditEventInput` contract lives in
[`../types/TransitionTypes.ts`](../types/TransitionTypes.ts). The repository/writer is
implemented in the Governance Kernel pass.

Rules:
- Append-only. Never update or delete audit rows.
- Tenant-scoped (`tenant_id` + RLS).
- Only the kernel writes audit events.
