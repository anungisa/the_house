-- =============================================================================
-- Migration: 0009_organization_registry
-- The House v2 — Organization Registry domain baseline (PRODUCTION DDL)
--
-- Purpose: provide a generic, tenant-scoped registry of ORGANIZATIONS and their parent/child
-- hierarchy (national/regional/local/external/applicant). This is canonical REFERENCE-DATA
-- structure beneath future participant/facility/program/event/membership domains.
--
-- This is REFERENCE DATA, not lifecycle governance. A registry row NEVER:
--   - participates in the Governance Kernel state machine (governance.entity_state);
--   - approves/rejects/activates an affiliation application;
--   - substitutes for a kernel-approved transition.
-- Records derived from an approved affiliation application are written as a one-way PROJECTION
-- (source = 'affiliation_application', with the application id retained as the source reference).
--
-- Requires PostgreSQL 15+.
--
-- NSO-GENERIC: all schema/table/column names are sport-agnostic. Sport-specific club/league
-- terms MUST NOT appear here.
--
-- RLS: the table is TENANT-OWNED -> ENABLE + FORCE Row-Level Security keyed on
-- governance.current_tenant_id() (defined in 0001; fails closed when app.tenant_id is unset).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS organization_registry;

-- -----------------------------------------------------------------------------
-- organization
--   One row per organization in a tenant's hierarchy. `parent_organization_id` self-references
--   another organization in the SAME tenant (enforced in application logic + RLS; intentionally
--   not a database FK so tenant scoping remains the single isolation mechanism). Records are
--   never deleted; `suspended`/`archived` retain the row. Immutable-after-create columns:
--   organization_type, source, source_entity_type, source_entity_id, created_at.
-- -----------------------------------------------------------------------------
CREATE TABLE organization_registry.organization (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL,
  organization_type       text NOT NULL
                            CHECK (organization_type IN
                              ('national', 'regional', 'local', 'external', 'applicant')),
  display_name            text NOT NULL,
  legal_name              text,
  status                  text NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'active', 'suspended', 'archived')),
  -- Self-reference within the same tenant (validated in application logic; not a DB FK).
  parent_organization_id  uuid,
  source                  text NOT NULL DEFAULT 'manual'
                            CHECK (source IN
                              ('manual', 'affiliation_application', 'import', 'system')),
  -- Provenance of a projected record (e.g. 'AffiliationApplication') and its source id.
  source_entity_type      text,
  source_entity_id        text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organization_tenant_time_idx
  ON organization_registry.organization (tenant_id, created_at ASC, id ASC);
CREATE INDEX organization_tenant_type_idx
  ON organization_registry.organization (tenant_id, organization_type);
CREATE INDEX organization_tenant_status_idx
  ON organization_registry.organization (tenant_id, status);
CREATE INDEX organization_tenant_parent_idx
  ON organization_registry.organization (tenant_id, parent_organization_id);

-- =============================================================================
-- ROW LEVEL SECURITY (tenant-owned). The table is mutable (attributes + status may change)
-- -> SELECT/INSERT/UPDATE. Missing tenant context fails closed
-- (governance.current_tenant_id() raises). No DELETE policy anywhere.
-- =============================================================================
ALTER TABLE organization_registry.organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_registry.organization FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_select ON organization_registry.organization
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY organization_insert ON organization_registry.organization
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY organization_update ON organization_registry.organization
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- =============================================================================
-- APPLICATION ROLE GRANTS (least privilege)
-- Conditionally granted to the non-superuser runtime role `house_app` when it exists. The
-- registry service writes the organization row and enqueues the registry outbox message in the
-- SAME transaction (governance.outbox_message grants come from 0001). No DELETE, no
-- superuser/BYPASSRLS requirement — RLS provides tenant isolation.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'house_app') THEN
    GRANT USAGE ON SCHEMA organization_registry TO house_app;
    GRANT SELECT, INSERT, UPDATE ON organization_registry.organization TO house_app;
  END IF;
END$$;
