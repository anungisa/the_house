-- =============================================================================
-- Migration: 0010_participant_registry
-- The House v2 — Participant Registry domain baseline (PRODUCTION DDL)
--
-- Purpose: provide a generic, tenant-scoped registry of PARTICIPANTS (people/members) and their
-- relationships to organizations in the Organization Registry. This is canonical REFERENCE-DATA
-- structure beneath future domains.
--
-- This is REFERENCE DATA, not lifecycle governance. A registry row NEVER:
--   - participates in the Governance Kernel state machine (governance.entity_state);
--   - approves/rejects/activates anything;
--   - substitutes for a kernel-approved transition;
--   - mutates the Organization Registry (organizations are referenced READ-ONLY).
--
-- This baseline intentionally models NO registration, payments, program enrollment, event
-- participation, eligibility, or sensitive attributes (no demographic/medical/financial fields).
-- Only minimal identifying fields and generic organizational relationships are stored.
--
-- Requires PostgreSQL 15+.
--
-- NSO-GENERIC: all schema/table/column names are sport-agnostic. Sport-specific terms MUST NOT
-- appear here.
--
-- RLS: both tables are TENANT-OWNED -> ENABLE + FORCE Row-Level Security keyed on
-- governance.current_tenant_id() (defined in 0001; fails closed when app.tenant_id is unset).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS participant_registry;

-- -----------------------------------------------------------------------------
-- participant
--   One row per participant in a tenant. Records are never deleted; `suspended`/`archived`
--   retain the row. Immutable-after-create columns: created_at. `email` is a normalized
--   (trimmed + lowercased) optional contact address and is NEVER projected into outbox signals.
--   `external_refs` is an optional JSONB array of generic `{provider, externalId}` correlation
--   handles (NOT an identity-provider account link or any sensitive attribute).
--   A tenant-scoped UNIQUE (tenant_id, id) lets a same-tenant relationship FK enforce tenant
--   consistency at the database level (FK checks bypass RLS, so the composite key keeps a link's
--   participant in the SAME tenant as the link row).
-- -----------------------------------------------------------------------------
CREATE TABLE participant_registry.participant (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  display_name  text NOT NULL,
  given_name    text,
  family_name   text,
  email         text,
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'active', 'suspended', 'archived')),
  external_refs jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id)
);

CREATE INDEX participant_tenant_time_idx
  ON participant_registry.participant (tenant_id, created_at ASC, id ASC);
CREATE INDEX participant_tenant_status_idx
  ON participant_registry.participant (tenant_id, status);
CREATE INDEX participant_tenant_email_idx
  ON participant_registry.participant (tenant_id, email);

-- -----------------------------------------------------------------------------
-- organization_participant
--   One row per relationship between an organization and a participant. `organization_id`
--   references an organization in the SAME tenant; that existence + tenant check is enforced in
--   application logic + RLS (intentionally NOT a cross-schema DB FK, mirroring the Organization
--   Registry's deliberate choice to keep tenant scoping the single isolation mechanism — a
--   cross-schema FK would bypass RLS and cannot enforce tenant equality against organization).
--   `participant_id` IS a tenant-consistent composite FK into participant(tenant_id, id), so a
--   relationship can only reference a participant in the same tenant even though FK checks bypass
--   RLS. Relationships are never deleted; `ended` retires one while retaining the row.
--   Immutable-after-create columns: organization_id, participant_id, relationship_type,
--   created_at.
-- -----------------------------------------------------------------------------
CREATE TABLE participant_registry.organization_participant (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  organization_id   uuid NOT NULL,
  participant_id    uuid NOT NULL,
  relationship_type text NOT NULL
                      CHECK (relationship_type IN
                        ('member', 'staff', 'volunteer', 'official', 'contact', 'other')),
  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'suspended', 'ended')),
  start_date        date,
  end_date          date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_participant_participant_fk
    FOREIGN KEY (tenant_id, participant_id)
    REFERENCES participant_registry.participant (tenant_id, id)
);

CREATE INDEX organization_participant_tenant_time_idx
  ON participant_registry.organization_participant (tenant_id, created_at ASC, id ASC);
CREATE INDEX organization_participant_tenant_org_idx
  ON participant_registry.organization_participant (tenant_id, organization_id);
CREATE INDEX organization_participant_tenant_participant_idx
  ON participant_registry.organization_participant (tenant_id, participant_id);
CREATE INDEX organization_participant_tenant_type_status_idx
  ON participant_registry.organization_participant (tenant_id, relationship_type, status);

-- At most one NON-ended relationship of a given type between an organization and a participant
-- (keeps linking idempotent; a new relationship of the same type is allowed once ended).
CREATE UNIQUE INDEX organization_participant_active_unique_idx
  ON participant_registry.organization_participant
     (tenant_id, organization_id, participant_id, relationship_type)
  WHERE status <> 'ended';

-- =============================================================================
-- ROW LEVEL SECURITY (tenant-owned). Both tables are mutable (attributes + status may change)
-- -> SELECT/INSERT/UPDATE. Missing tenant context fails closed
-- (governance.current_tenant_id() raises). No DELETE policy anywhere.
-- =============================================================================
ALTER TABLE participant_registry.participant ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_registry.participant FORCE ROW LEVEL SECURITY;
CREATE POLICY participant_select ON participant_registry.participant
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY participant_insert ON participant_registry.participant
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY participant_update ON participant_registry.participant
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

ALTER TABLE participant_registry.organization_participant ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_registry.organization_participant FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_participant_select ON participant_registry.organization_participant
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY organization_participant_insert ON participant_registry.organization_participant
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY organization_participant_update ON participant_registry.organization_participant
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- =============================================================================
-- APPLICATION ROLE GRANTS (least privilege)
-- Conditionally granted to the non-superuser runtime role `house_app` when it exists. The
-- registry service writes the participant / relationship row and enqueues the registry outbox
-- message in the SAME transaction (governance.outbox_message grants come from 0001). No DELETE,
-- no superuser/BYPASSRLS requirement — RLS provides tenant isolation.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'house_app') THEN
    GRANT USAGE ON SCHEMA participant_registry TO house_app;
    GRANT SELECT, INSERT, UPDATE ON participant_registry.participant TO house_app;
    GRANT SELECT, INSERT, UPDATE ON participant_registry.organization_participant TO house_app;
  END IF;
END$$;
