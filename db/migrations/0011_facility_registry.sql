-- =============================================================================
-- Migration: 0011_facility_registry
-- The House v2 — Facility Registry domain baseline (PRODUCTION DDL)
--
-- Purpose: provide a generic, tenant-scoped registry of FACILITIES (places/sites) that belong to
-- an organization in the Organization Registry. This is canonical REFERENCE-DATA structure — a
-- catalogue of physical or partner locations, their address/contact reference fields, and a simple
-- reference status. It is NOT a booking, scheduling, maintenance, inventory, inspection,
-- accreditation, contract, registration, payment, program, or competition system.
--
-- This is REFERENCE DATA, not lifecycle governance. A registry row NEVER:
--   - participates in the Governance Kernel state machine (governance.entity_state);
--   - approves/rejects/activates anything;
--   - substitutes for a kernel-approved transition.
--
-- Requires PostgreSQL 15+.
--
-- NSO-GENERIC: all schema/table/column names are sport-agnostic. Sport-specific place vocabulary
-- MUST NOT appear here.
--
-- RLS: the table is TENANT-OWNED -> ENABLE + FORCE Row-Level Security keyed on
-- governance.current_tenant_id() (defined in 0001; fails closed when app.tenant_id is unset).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS facility_registry;

-- -----------------------------------------------------------------------------
-- facility
--   One row per facility in a tenant. `organization_id` references an organization in the SAME
--   tenant (enforced in application logic + RLS; intentionally NOT a database FK so tenant scoping
--   remains the single isolation mechanism). Records are never deleted; `inactive`/`archived`
--   retain the row. Immutable-after-create columns: organization_id, facility_type, created_at.
-- -----------------------------------------------------------------------------
CREATE TABLE facility_registry.facility (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  -- Same-tenant organization reference (validated in application logic; not a DB FK).
  organization_id   uuid NOT NULL,
  name              text NOT NULL,
  facility_type     text NOT NULL
                      CHECK (facility_type IN
                        ('venue', 'training_site', 'office', 'storage_site', 'partner_site', 'other')),
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  address_line1     text,
  address_line2     text,
  locality          text,
  region            text,
  postal_code       text,
  country_code      text
                      CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  latitude          numeric(9, 6)
                      CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude         numeric(9, 6)
                      CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  contact_name      text,
  contact_email     text,
  contact_phone     text,
  visibility        text
                      CHECK (visibility IS NULL OR visibility IN ('internal', 'public')),
  capability_tags   text[],
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX facility_tenant_time_idx
  ON facility_registry.facility (tenant_id, created_at ASC, id ASC);
CREATE INDEX facility_tenant_org_idx
  ON facility_registry.facility (tenant_id, organization_id);
CREATE INDEX facility_tenant_status_idx
  ON facility_registry.facility (tenant_id, status);
CREATE INDEX facility_tenant_type_idx
  ON facility_registry.facility (tenant_id, facility_type);
CREATE INDEX facility_tenant_name_idx
  ON facility_registry.facility (tenant_id, lower(name));

-- =============================================================================
-- ROW LEVEL SECURITY (tenant-owned). The table is mutable (attributes + status may change)
-- -> SELECT/INSERT/UPDATE. Missing tenant context fails closed
-- (governance.current_tenant_id() raises). No DELETE policy anywhere.
-- =============================================================================
ALTER TABLE facility_registry.facility ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_registry.facility FORCE ROW LEVEL SECURITY;
CREATE POLICY facility_select ON facility_registry.facility
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY facility_insert ON facility_registry.facility
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY facility_update ON facility_registry.facility
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- =============================================================================
-- APPLICATION ROLE GRANTS (least privilege)
-- Conditionally granted to the non-superuser runtime role `house_app` when it exists. The
-- registry service writes the facility row and enqueues the registry outbox message in the SAME
-- transaction (governance.outbox_message grants come from 0001). No DELETE, no
-- superuser/BYPASSRLS requirement — RLS provides tenant isolation.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'house_app') THEN
    GRANT USAGE ON SCHEMA facility_registry TO house_app;
    GRANT SELECT, INSERT, UPDATE ON facility_registry.facility TO house_app;
  END IF;
END$$;
