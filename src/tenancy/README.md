# `tenancy` — Tenant context and isolation (module boundary placeholder)

Owns tenant-context propagation. Tenant isolation is enforced at the **database layer**
via PostgreSQL Row-Level Security (RLS), not in application code alone.

**Scaffold status:** boundary only. No DB connection or RLS wiring yet.

Rules (implemented in the Governance Kernel pass):
- The kernel sets `app.tenant_id` **inside** the transaction before any tenant-owned
  governance table is accessed.
- Missing tenant context **fails closed** (`TENANT_CONTEXT_MISSING`).
- The application database role must **not** be an RLS-bypassing role for normal access.
- Generic scope identifiers only (`tenantId`, `scopeType`, `scopeId`, national/regional/
  local organization ids). No sport-specific tenant fields in this layer.
