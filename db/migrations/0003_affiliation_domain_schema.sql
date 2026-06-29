-- =============================================================================
-- Migration: 0003_affiliation_domain_schema
-- The House v2 — AffiliationApplication DOMAIN persistence (PRODUCTION DDL)
--
-- Purpose: give guards a PERSISTED source of truth for affiliation facts, replacing the
-- caller-supplied `payload.facts` bridge used during scaffolding. The domain owns
-- application facts ONLY — it does NOT own governed lifecycle state. Lifecycle state
-- remains exclusively in governance.entity_state, written only by the Governance Kernel.
--
-- Requires PostgreSQL 15+.
--
-- NSO-GENERIC: all table/column names are sport-agnostic. Curling-specific terms
-- (PTSO, MA, club, curler, bonspiel, ...) MUST NOT appear here. Generic fields only:
-- tenant_id, organization_id, organization_unit_id, national/regional/local_organization_id,
-- participant_id, facility_id, program_id, event_id, season_id, scope_type, scope_id.
--
-- RLS: every affiliation table is TENANT-OWNED -> ENABLE + FORCE Row-Level Security keyed
-- on governance.current_tenant_id() (defined in 0001; fails closed when app.tenant_id is
-- unset). The guard repository reads these tables inside a tenant-scoped transaction.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS affiliation;

-- -----------------------------------------------------------------------------
-- 1. affiliation_application
--    Application facts + generic organization/season scope. `id` equals the governed
--    entity_id used by governance.entity_state for entity_type 'AffiliationApplication'.
-- -----------------------------------------------------------------------------
CREATE TABLE affiliation.affiliation_application (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL,
  season_id                 text NOT NULL,
  organization_id           uuid,
  organization_unit_id      uuid,
  national_organization_id  uuid,
  regional_organization_id  uuid,
  local_organization_id     uuid,
  scope_type                text,
  scope_id                  uuid,
  application_type          text,
  applicant_user_id         uuid,
  required_fields_complete  boolean NOT NULL DEFAULT false,
  documents_verified        boolean NOT NULL DEFAULT false,
  -- Denormalized convenience only; payment_obligation is the authoritative source for
  -- the AFFILIATION_FEES_PAID guard.
  payment_status            text NOT NULL DEFAULT 'unpaid'
                              CHECK (payment_status IN ('unpaid', 'paid', 'waived',
                                                        'refunded', 'failed')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX affiliation_application_tenant_idx
  ON affiliation.affiliation_application (tenant_id);
CREATE INDEX affiliation_application_tenant_season_idx
  ON affiliation.affiliation_application (tenant_id, season_id);

-- -----------------------------------------------------------------------------
-- 2. application_document  (supports AFFILIATION_REQUIRED_DOCS_PRESENT)
-- -----------------------------------------------------------------------------
CREATE TABLE affiliation.application_document (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  application_id  uuid NOT NULL
                    REFERENCES affiliation.affiliation_application(id) ON DELETE CASCADE,
  document_type   text NOT NULL,
  required        boolean NOT NULL DEFAULT true,
  status          text NOT NULL DEFAULT 'missing'
                    CHECK (status IN ('approved', 'pending', 'rejected', 'missing')),
  verified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX application_document_tenant_app_idx
  ON affiliation.application_document (tenant_id, application_id);

-- -----------------------------------------------------------------------------
-- 3. compliance_flag  (supports AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS)
-- -----------------------------------------------------------------------------
CREATE TABLE affiliation.compliance_flag (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  application_id  uuid NOT NULL
                    REFERENCES affiliation.affiliation_application(id) ON DELETE CASCADE,
  flag_type       text NOT NULL,
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'resolved', 'dismissed')),
  opened_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX compliance_flag_tenant_app_idx
  ON affiliation.compliance_flag (tenant_id, application_id);

-- -----------------------------------------------------------------------------
-- 4. payment_obligation  (supports AFFILIATION_FEES_PAID)
--    Authoritative payment source. No real payment processor is integrated; this is a
--    persisted obligation/status record only.
-- -----------------------------------------------------------------------------
CREATE TABLE affiliation.payment_obligation (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  application_id      uuid NOT NULL
                        REFERENCES affiliation.affiliation_application(id) ON DELETE CASCADE,
  obligation_type     text NOT NULL,
  status              text NOT NULL DEFAULT 'unpaid'
                        CHECK (status IN ('unpaid', 'paid', 'waived', 'refunded', 'failed')),
  amount_cents        integer,
  currency            text NOT NULL DEFAULT 'CAD',
  processor_reference text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_obligation_tenant_app_idx
  ON affiliation.payment_obligation (tenant_id, application_id);

-- -----------------------------------------------------------------------------
-- 5. season  (explicit persisted source for SEASON_IS_CURRENT)
-- -----------------------------------------------------------------------------
CREATE TABLE affiliation.season (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  season_id   text NOT NULL,
  is_current  boolean NOT NULL DEFAULT false,
  label       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT season_unique UNIQUE (tenant_id, season_id)
);

CREATE INDEX season_tenant_current_idx
  ON affiliation.season (tenant_id, is_current);

-- =============================================================================
-- ROW LEVEL SECURITY (all affiliation tables are tenant-owned)
-- SELECT/INSERT/UPDATE policies keyed on governance.current_tenant_id().
-- Missing tenant context fails closed (the helper raises). No DELETE policy.
-- =============================================================================

-- affiliation_application
ALTER TABLE affiliation.affiliation_application ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.affiliation_application FORCE ROW LEVEL SECURITY;
CREATE POLICY affiliation_application_select ON affiliation.affiliation_application
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY affiliation_application_insert ON affiliation.affiliation_application
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY affiliation_application_update ON affiliation.affiliation_application
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- application_document
ALTER TABLE affiliation.application_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.application_document FORCE ROW LEVEL SECURITY;
CREATE POLICY application_document_select ON affiliation.application_document
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY application_document_insert ON affiliation.application_document
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY application_document_update ON affiliation.application_document
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- compliance_flag
ALTER TABLE affiliation.compliance_flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.compliance_flag FORCE ROW LEVEL SECURITY;
CREATE POLICY compliance_flag_select ON affiliation.compliance_flag
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY compliance_flag_insert ON affiliation.compliance_flag
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY compliance_flag_update ON affiliation.compliance_flag
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- payment_obligation
ALTER TABLE affiliation.payment_obligation ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.payment_obligation FORCE ROW LEVEL SECURITY;
CREATE POLICY payment_obligation_select ON affiliation.payment_obligation
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY payment_obligation_insert ON affiliation.payment_obligation
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY payment_obligation_update ON affiliation.payment_obligation
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- season
ALTER TABLE affiliation.season ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.season FORCE ROW LEVEL SECURITY;
CREATE POLICY season_select ON affiliation.season
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY season_insert ON affiliation.season
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY season_update ON affiliation.season
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- =============================================================================
-- APPLICATION ROLE GRANTS (least privilege)
-- Conditionally granted to the non-superuser runtime role `house_app` when it exists
-- (created out-of-band per 0001 guidance). The role is NOT a table owner and relies on
-- RLS for tenant isolation. Guards need SELECT; domain writes need INSERT/UPDATE. No
-- DELETE, no governed-lifecycle access here.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'house_app') THEN
    GRANT USAGE ON SCHEMA affiliation TO house_app;
    GRANT SELECT, INSERT, UPDATE ON affiliation.affiliation_application TO house_app;
    GRANT SELECT, INSERT, UPDATE ON affiliation.application_document   TO house_app;
    GRANT SELECT, INSERT, UPDATE ON affiliation.compliance_flag        TO house_app;
    GRANT SELECT, INSERT, UPDATE ON affiliation.payment_obligation     TO house_app;
    GRANT SELECT, INSERT, UPDATE ON affiliation.season                 TO house_app;
  END IF;
END$$;
