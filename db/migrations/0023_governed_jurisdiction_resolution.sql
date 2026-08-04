-- =============================================================================
-- Migration: 0023_governed_jurisdiction_resolution
-- The House v2 — Governed, tenant-isolated, hierarchy-aware jurisdiction source
--
-- Replaces the policy-derived jurisdiction STUB (OrganizationTypeJurisdictionResolver mapping an
-- organization *type* to a static jurisdiction label key) with a PERSISTED, tenant-isolated,
-- governed jurisdiction catalog plus an explicit organization -> jurisdiction ASSIGNMENT edge.
-- This migration EXTENDS the existing organization_registry schema ADDITIVELY — it never creates a
-- second competing organization hierarchy and never rewrites 0009/0019.
--
-- An organization TYPE is NOT a jurisdiction. A jurisdiction label is NOT authority to affiliate.
-- A visible jurisdiction is NOT necessarily assignable (draft/retired). An inherited jurisdiction
-- is NOT a stored fact on the descendant (it is DERIVED at read time by walking the governed
-- organization parent chain). A reassigned jurisdiction does NOT rewrite already-bound historical
-- application context — reassignment affects FUTURE resolution only.
--
-- Two governed tables:
--   * organization_registry.jurisdiction              — the tenant-owned jurisdiction CATALOG
--     (lifecycle draft / published / retired, bilingual labels, optional self-parent hierarchy).
--   * organization_registry.organization_jurisdiction — the governed ASSIGNMENT edge binding an
--     organization to a jurisdiction (assignment_type primary, inheritance_mode direct/inheritable,
--     status active/revoked, validity window). At most ONE active primary assignment per org.
-- ...with an append-only event log per table (governed audit lineage; no runtime UPDATE/DELETE).
--
-- Security posture (fail closed): tenant_id on every table, FORCE ROW LEVEL SECURITY keyed on
-- governance.current_tenant_id() (0001; raises when app.tenant_id is unset), NO runtime DELETE, and
-- a non-superuser / non-BYPASSRLS runtime role. Cross-tenant references are made impossible by
-- tenant-consistent COMPOSITE foreign keys — an FK check bypasses RLS, so a composite key on
-- (tenant_id, id) is the only structural guarantee that a referenced row lives in the SAME tenant.
--
-- Compatibility (§3): this migration DOES NOT infer, backfill, or seed any jurisdiction from an
-- organization's type or name. Organizations without a governed assignment resolve to `unresolved`
-- at read time (a safe, explicit posture) — never a silently invented jurisdiction.
--
-- NSO-GENERIC + country-generic: no Canadian province is hardcoded. `country_code` /
-- `subdivision_code` are optional ISO-style descriptors; synthetic codes (e.g. CA, CA-ON) are seed
-- data, never schema. Requires PostgreSQL 15+.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. organization_registry.jurisdiction — the governed jurisdiction CATALOG.
--    Lifecycle: draft -> published -> retired. Only a PUBLISHED jurisdiction may back an active
--    assignment (enforced at the assignment command boundary, mirroring season publish-completeness
--    — a retired/draft jurisdiction referenced by an assignment simply does not resolve).
-- -----------------------------------------------------------------------------
CREATE TABLE organization_registry.jurisdiction (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  -- Stable, tenant-unique jurisdiction key echoed by the browser + bound onto application context.
  code                   text NOT NULL,
  jurisdiction_level     text NOT NULL
                           CHECK (jurisdiction_level IN
                             ('national', 'subdivision', 'local', 'custom')),
  -- Optional, country-generic descriptors (never a hardcoded province list).
  country_code           text,
  subdivision_code       text,
  label_en               text NOT NULL,
  label_fr               text NOT NULL,
  -- Optional same-tenant self-parent (a governed jurisdiction hierarchy, distinct from the org
  -- hierarchy). Enforced as a tenant-consistent composite FK below.
  parent_jurisdiction_id uuid,
  status                 text NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'published', 'retired')),
  version                integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  source_reference       text,
  idempotency_key        text,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- One jurisdiction CODE per tenant.
  CONSTRAINT jurisdiction_code_tenant_unique UNIQUE (tenant_id, code),
  -- Composite target so parent + assignment + event FKs stay tenant-consistent.
  CONSTRAINT jurisdiction_id_tenant_unique UNIQUE (tenant_id, id),
  -- No trivial self-parent loop (deeper cycles are prevented by the resolver's bounded walk).
  CONSTRAINT jurisdiction_parent_not_self_ck
    CHECK (parent_jurisdiction_id IS NULL OR parent_jurisdiction_id <> id),
  -- Same-tenant self-reference: a non-null parent MUST resolve within the SAME tenant.
  CONSTRAINT jurisdiction_parent_same_tenant_fk
    FOREIGN KEY (tenant_id, parent_jurisdiction_id)
    REFERENCES organization_registry.jurisdiction (tenant_id, id)
);

CREATE INDEX jurisdiction_tenant_status_idx
  ON organization_registry.jurisdiction (tenant_id, status);
CREATE INDEX jurisdiction_tenant_parent_idx
  ON organization_registry.jurisdiction (tenant_id, parent_jurisdiction_id);

-- Command idempotency: one committed command lineage per (tenant, idempotency_key).
CREATE UNIQUE INDEX jurisdiction_idempotency_idx
  ON organization_registry.jurisdiction (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. organization_registry.organization_jurisdiction — the governed ASSIGNMENT edge.
--    Binds an organization to a jurisdiction. inheritance_mode 'inheritable' lets DESCENDANT
--    organizations inherit this jurisdiction when they have no direct assignment; 'direct' applies
--    to this organization only. At most ONE active primary assignment per organization.
-- -----------------------------------------------------------------------------
CREATE TABLE organization_registry.organization_jurisdiction (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  organization_id   uuid NOT NULL,
  jurisdiction_id   uuid NOT NULL,
  assignment_type   text NOT NULL DEFAULT 'primary'
                      CHECK (assignment_type IN ('primary')),
  inheritance_mode  text NOT NULL
                      CHECK (inheritance_mode IN ('direct', 'inheritable')),
  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'revoked')),
  valid_from        timestamptz NOT NULL DEFAULT now(),
  valid_until       timestamptz,
  version           integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  source_reference  text,
  idempotency_key   text,
  assigned_by       text,
  assigned_at       timestamptz NOT NULL DEFAULT now(),
  revoked_by        text,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- A bounded validity window; an expired assignment never resolves.
  CONSTRAINT organization_jurisdiction_window_ck
    CHECK (valid_until IS NULL OR valid_until > valid_from),
  -- Revoked/active consistency: a revoked assignment is never effective (it carries revocation
  -- metadata); an active assignment carries none.
  CONSTRAINT organization_jurisdiction_revoked_ck
    CHECK ((status = 'active'  AND revoked_at IS NULL)
        OR (status = 'revoked' AND revoked_at IS NOT NULL)),
  -- Composite target so the append-only event FK stays tenant-consistent.
  CONSTRAINT organization_jurisdiction_id_tenant_unique UNIQUE (tenant_id, id),
  -- Assignment -> organization: same-tenant (reuses 0019 organization_tenant_id_key).
  CONSTRAINT organization_jurisdiction_org_same_tenant_fk
    FOREIGN KEY (tenant_id, organization_id)
    REFERENCES organization_registry.organization (tenant_id, id),
  -- Assignment -> jurisdiction: same-tenant.
  CONSTRAINT organization_jurisdiction_jurisdiction_same_tenant_fk
    FOREIGN KEY (tenant_id, jurisdiction_id)
    REFERENCES organization_registry.jurisdiction (tenant_id, id)
);

-- At most ONE active primary assignment per organization (the direct-precedence invariant).
CREATE UNIQUE INDEX organization_jurisdiction_one_active_primary_idx
  ON organization_registry.organization_jurisdiction (tenant_id, organization_id)
  WHERE status = 'active' AND assignment_type = 'primary';

-- Resolver read path: active assignments for an organization / for a tenant's hierarchy walk.
CREATE INDEX organization_jurisdiction_tenant_org_idx
  ON organization_registry.organization_jurisdiction (tenant_id, organization_id, status);

-- Command idempotency: one committed command lineage per (tenant, idempotency_key).
CREATE UNIQUE INDEX organization_jurisdiction_idempotency_idx
  ON organization_registry.organization_jurisdiction (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. organization_registry.jurisdiction_event — append-only catalog history / audit lineage.
-- -----------------------------------------------------------------------------
CREATE TABLE organization_registry.jurisdiction_event (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  jurisdiction_row_id uuid NOT NULL,
  event_type          text NOT NULL
                        CHECK (event_type IN ('created', 'revised', 'published', 'retired')),
  actor_user_id       text,
  from_state          text,
  to_state            text,
  correlation_id      text,
  causation_id        text,
  reason_code         text,
  -- Per-COMMAND idempotency lives on the event (one jurisdiction row lives through many commands).
  idempotency_key     text,
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jurisdiction_event_jurisdiction_fk
    FOREIGN KEY (tenant_id, jurisdiction_row_id)
    REFERENCES organization_registry.jurisdiction (tenant_id, id)
);

CREATE INDEX jurisdiction_event_tenant_row_idx
  ON organization_registry.jurisdiction_event (tenant_id, jurisdiction_row_id, occurred_at DESC);
CREATE UNIQUE INDEX jurisdiction_event_idempotency_idx
  ON organization_registry.jurisdiction_event (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. organization_registry.organization_jurisdiction_event — append-only assignment history.
-- -----------------------------------------------------------------------------
CREATE TABLE organization_registry.organization_jurisdiction_event (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  assignment_row_id  uuid NOT NULL,
  event_type         text NOT NULL
                       CHECK (event_type IN ('assigned', 'replaced', 'revoked')),
  actor_user_id      text,
  from_status        text,
  to_status          text,
  correlation_id     text,
  causation_id       text,
  reason_code        text,
  idempotency_key    text,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_jurisdiction_event_assignment_fk
    FOREIGN KEY (tenant_id, assignment_row_id)
    REFERENCES organization_registry.organization_jurisdiction (tenant_id, id)
);

CREATE INDEX organization_jurisdiction_event_tenant_row_idx
  ON organization_registry.organization_jurisdiction_event
     (tenant_id, assignment_row_id, occurred_at DESC);
CREATE UNIQUE INDEX organization_jurisdiction_event_idempotency_idx
  ON organization_registry.organization_jurisdiction_event (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- =============================================================================
-- ROW LEVEL SECURITY (all four tables are tenant-owned; fail closed on unset tenant).
-- Head tables are mutable (lifecycle + status) -> SELECT/INSERT/UPDATE. Event tables are
-- append-only -> SELECT/INSERT only (no UPDATE/DELETE policy => denied under FORCE RLS).
-- No DELETE policy anywhere.
-- =============================================================================
ALTER TABLE organization_registry.jurisdiction ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_registry.jurisdiction FORCE ROW LEVEL SECURITY;
CREATE POLICY jurisdiction_select ON organization_registry.jurisdiction
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY jurisdiction_insert ON organization_registry.jurisdiction
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY jurisdiction_update ON organization_registry.jurisdiction
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

ALTER TABLE organization_registry.organization_jurisdiction ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_registry.organization_jurisdiction FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_jurisdiction_select ON organization_registry.organization_jurisdiction
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY organization_jurisdiction_insert ON organization_registry.organization_jurisdiction
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY organization_jurisdiction_update ON organization_registry.organization_jurisdiction
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

ALTER TABLE organization_registry.jurisdiction_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_registry.jurisdiction_event FORCE ROW LEVEL SECURITY;
CREATE POLICY jurisdiction_event_select ON organization_registry.jurisdiction_event
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY jurisdiction_event_insert ON organization_registry.jurisdiction_event
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

ALTER TABLE organization_registry.organization_jurisdiction_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_registry.organization_jurisdiction_event FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_jurisdiction_event_select
  ON organization_registry.organization_jurisdiction_event
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY organization_jurisdiction_event_insert
  ON organization_registry.organization_jurisdiction_event
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

-- =============================================================================
-- APPLICATION ROLE GRANTS (least privilege; conditional on the runtime role existing).
-- USAGE ON SCHEMA organization_registry was granted in 0009. Head tables get SELECT/INSERT/UPDATE;
-- the append-only event logs get SELECT/INSERT. No DELETE, no superuser / BYPASSRLS requirement —
-- RLS provides tenant isolation.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'house_app') THEN
    GRANT SELECT, INSERT, UPDATE ON organization_registry.jurisdiction TO house_app;
    GRANT SELECT, INSERT, UPDATE ON organization_registry.organization_jurisdiction TO house_app;
    GRANT SELECT, INSERT ON organization_registry.jurisdiction_event TO house_app;
    GRANT SELECT, INSERT ON organization_registry.organization_jurisdiction_event TO house_app;
  END IF;
END$$;

-- =============================================================================
-- COMMENTS (governance intent, discoverable in the catalog).
-- =============================================================================
COMMENT ON TABLE organization_registry.jurisdiction IS
  'Governed, tenant-isolated jurisdiction catalog (draft/published/retired). Replaces the '
  'organization-type-derived jurisdiction stub. Only a published jurisdiction backs an active '
  'assignment (service-enforced). No province list is hardcoded.';
COMMENT ON TABLE organization_registry.organization_jurisdiction IS
  'Governed organization -> jurisdiction assignment edge. assignment_type primary; inheritance_mode '
  'direct/inheritable; status active/revoked; bounded validity window. At most one active primary '
  'assignment per organization. Inherited jurisdiction is DERIVED at read time, never stored here.';
COMMENT ON TABLE organization_registry.jurisdiction_event IS
  'Append-only governed audit lineage for jurisdiction catalog commands. No runtime UPDATE/DELETE.';
COMMENT ON TABLE organization_registry.organization_jurisdiction_event IS
  'Append-only governed audit lineage for organization -> jurisdiction assignment commands. '
  'No runtime UPDATE/DELETE.';
