# `src/db` — Database access layer (module boundary placeholder)

Owns the PostgreSQL access layer used by the kernel and repositories: connection pool,
transaction helper, and the in-transaction tenant-context setter (`app.tenant_id`).

> Not to be confused with the repository-root [`/db`](../../db) folder, which holds SQL
> **migrations** and **seed** data.

**Scaffold status:** boundary only. No pool or queries are created yet (`pg` is a declared
dependency for the implementation pass).

Rules (implemented in the Governance Kernel pass):
- Provide a `withTransaction` helper that BEGINs, sets `app.tenant_id`, and COMMITs/ROLLBACKs.
- The application role must respect RLS (no RLS-bypass role for normal access).
- All governed writes happen through transactional repositories, never ad hoc.
