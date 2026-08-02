-- =============================================================================
-- Migration: 0019_organization_parent_tenant_integrity
-- The House v2 — Organization Registry tenant-parent referential integrity (PRODUCTION DDL)
--
-- Purpose: enforce, at the DATABASE level, that an organization's self-referencing
-- `parent_organization_id` always points to an organization that EXISTS in the SAME tenant.
--
-- Context / defect being closed:
--   0009 declared `parent_organization_id` as a same-tenant self-reference "validated in
--   application logic; not a DB FK". The OrganizationRegistryService already asserts a valid,
--   same-tenant, acyclic parent on write (see assertValidParent), but nothing at the storage
--   layer prevented a dangling or CROSS-TENANT parent from being persisted by a code path that
--   bypassed the service, a future regression, or a concurrent race. This left the tenant
--   hierarchy able to drift into a cross-tenant / broken-chain state that RLS alone cannot catch
--   (an RLS row policy validates the ROW's tenant, never the tenant of the row it points at).
--
--   This migration adopts the SAME tenant-consistent composite-key pattern the Participant
--   Registry uses (0010: `UNIQUE (tenant_id, id)` + a composite FK on `(tenant_id, <ref>)`).
--   Referential-integrity checks ALWAYS bypass row security, so a composite FK keyed on
--   `(tenant_id, id)` guarantees the parent lives in the SAME tenant even though the FK check
--   itself runs without RLS. This is an INTRA-schema self-reference — unlike the deliberate
--   NON-FK cross-schema references (facility/participant -> organization) where a cross-schema FK
--   would bypass RLS and still could not assert tenant equality.
--
-- Additive + non-destructive: adds one UNIQUE constraint (a superset of the existing PRIMARY KEY
-- on `id`, so it can never be violated by existing rows), one composite self-FK, and one CHECK
-- forbidding a direct self-parent. No column is dropped, no data is deleted, no RLS is relaxed,
-- and no new grant is required (the runtime role already holds INSERT/UPDATE from 0009). On a
-- fresh database the table is empty; on any existing database the ADD CONSTRAINT statements
-- validate current rows and FAIL CLOSED (loudly) if pre-existing data already violates the
-- invariant, rather than silently tolerating corruption.
--
-- Requires PostgreSQL 15+.
--
-- NSO-GENERIC: all schema/table/column names are sport-agnostic.
-- =============================================================================

-- Tenant-scoped uniqueness on (tenant_id, id) — the exact composite target the self-FK requires.
-- `id` is already the PRIMARY KEY (globally unique), so (tenant_id, id) is a superset unique that
-- no existing row can violate; it exists solely to serve as the FK reference target.
ALTER TABLE organization_registry.organization
  ADD CONSTRAINT organization_tenant_id_key UNIQUE (tenant_id, id);

-- Same-tenant self-reference: a non-null parent MUST resolve to an organization in the SAME
-- tenant. With MATCH SIMPLE (the default), a NULL `parent_organization_id` (a top-level/root
-- organization) skips the check entirely, so root organizations remain valid. When the parent is
-- set, both FK columns are non-null and the parent must exist as (tenant_id, id) — enforced even
-- though FK checks bypass RLS.
ALTER TABLE organization_registry.organization
  ADD CONSTRAINT organization_parent_same_tenant_fk
    FOREIGN KEY (tenant_id, parent_organization_id)
    REFERENCES organization_registry.organization (tenant_id, id);

-- Forbid a direct self-parent (an organization cannot be its own parent). Deeper cycle prevention
-- remains an application-layer concern (assertValidParent walks the ancestor chain); this CHECK
-- closes only the trivial one-row loop at the storage layer.
ALTER TABLE organization_registry.organization
  ADD CONSTRAINT organization_parent_not_self_check
    CHECK (parent_organization_id IS NULL OR parent_organization_id <> id);
