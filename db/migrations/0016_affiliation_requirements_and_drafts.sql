-- =============================================================================
-- Migration: 0016_affiliation_requirements_and_drafts
-- The House v2 — versioned affiliation requirement catalog + representative DRAFT persistence
-- =============================================================================
--
-- WHY THIS EXISTS
--   The Button club-affiliation representative experience (Slice C) lets an authorized
--   representative view the versioned requirements that apply to an affiliation application,
--   enter/revise responses, associate governed evidence, and SAVE WITHOUT SUBMITTING. None of
--   that is a governed lifecycle transition: while an application is in its pre-submission DRAFT
--   phase there is NO row in governance.entity_state yet (the kernel bootstraps the governed
--   state at the first transition — `submit`, delivered in Slice D). This migration owns ONLY the
--   durable, tenant-scoped, rebuildable DRAFT working set + the institutional requirement catalog.
--
-- BOUNDARY
--   * requirement_definition is INSTITUTIONAL REFERENCE DATA (versioned, bilingual, not
--     tenant-owned) — the same catalog for every tenant in v1. It is NOT governed lifecycle state.
--   * Every DRAFT table below is TENANT-OWNED with RLS keyed on governance.current_tenant_id():
--     missing tenant context fails CLOSED.
--   * application_requirement SNAPSHOTS the applicable requirement VERSIONS at initiation so a
--     later catalog change can NEVER silently rewrite the basis of an existing draft/submission.
--   * draft_evidence_link ASSOCIATES an already-stored evidence payload reference with a
--     requirement. Removing a link deletes ONLY the association row, NEVER a governed evidence
--     object and NEVER the stored payload. Association is NOT acceptance.
--   * draft_change_event is APPEND-ONLY (no UPDATE/DELETE policy) — an immutable working-set
--     history for safe resume + support triage.
--
-- Requires PostgreSQL 15+ and the affiliation schema (migration 0003).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- requirement_definition
--   Versioned, bilingual institutional requirement catalog. Immutable per (code, version): a
--   new institutional revision inserts a NEW version row; existing bound drafts keep their bound
--   version. `applicability` is a BOUNDED descriptor (org types / jurisdictions / pathways /
--   seasons) — NOT a dynamic expression rule engine; applicability is resolved by a named TS
--   resolver, never by evaluating arbitrary JSON in the database.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation.requirement_definition (
  id                  text PRIMARY KEY,               -- stable "{code}@{version}"
  code                text NOT NULL,
  version             integer NOT NULL CHECK (version >= 1),
  response_type       text NOT NULL
                        CHECK (response_type IN (
                          'acknowledgement', 'short_text', 'long_text',
                          'structured_contact', 'document_reference', 'confirmation'
                        )),
  evidence_required   boolean NOT NULL DEFAULT false,
  title_en            text NOT NULL,
  guidance_en         text NOT NULL,
  title_fr            text NOT NULL,
  guidance_fr         text NOT NULL,
  applicability       jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_season    text,                            -- NULL = all seasons
  institutional_source text NOT NULL,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);

CREATE INDEX IF NOT EXISTS requirement_definition_active_idx
  ON affiliation.requirement_definition (active, code, version);

-- -----------------------------------------------------------------------------
-- application_draft
--   One working-set head per application. `version` is the optimistic-concurrency token
--   returned to the browser as an ETag; every accepted draft save increments it. The draft head
--   never carries governed lifecycle state.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation.application_draft (
  application_id     uuid PRIMARY KEY
                       REFERENCES affiliation.affiliation_application (id) ON DELETE CASCADE,
  tenant_id          uuid NOT NULL,
  version            integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  last_saved_at      timestamptz NOT NULL DEFAULT now(),
  last_saving_actor  uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, application_id)
);

-- -----------------------------------------------------------------------------
-- application_requirement
--   Immutable snapshot of the requirement VERSIONS bound to an application at initiation. A later
--   catalog revision inserts a new requirement_definition version but does NOT touch these rows.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation.application_requirement (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  application_id      uuid NOT NULL
                        REFERENCES affiliation.affiliation_application (id) ON DELETE CASCADE,
  requirement_code    text NOT NULL,
  requirement_version integer NOT NULL CHECK (requirement_version >= 1),
  applies_because     text NOT NULL,
  bound_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, application_id, requirement_code)
);

CREATE INDEX IF NOT EXISTS application_requirement_app_idx
  ON affiliation.application_requirement (tenant_id, application_id);

-- -----------------------------------------------------------------------------
-- draft_response
--   Representative-entered response per bound requirement. `response_value` is opaque structured
--   JSON interpreted by the response_type; the House never treats a saved response as satisfied.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation.draft_response (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  application_id    uuid NOT NULL
                      REFERENCES affiliation.affiliation_application (id) ON DELETE CASCADE,
  requirement_code  text NOT NULL,
  response_value    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, application_id, requirement_code)
);

CREATE INDEX IF NOT EXISTS draft_response_app_idx
  ON affiliation.draft_response (tenant_id, application_id);

-- -----------------------------------------------------------------------------
-- draft_evidence_link
--   Association of an already-stored evidence payload reference with a bound requirement. Stores
--   ONLY a representative-safe reference (payload id + content hash + content type + safe display
--   name) — never bytes, never an authoritative object-storage path. Removing a link deletes ONLY
--   this row; it never deletes a governed evidence object or the stored payload.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation.draft_evidence_link (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  application_id     uuid NOT NULL
                       REFERENCES affiliation.affiliation_application (id) ON DELETE CASCADE,
  requirement_code   text NOT NULL,
  evidence_object_id text NOT NULL,
  content_hash       text NOT NULL,
  content_type       text NOT NULL,
  display_name       text,
  associated_at      timestamptz NOT NULL DEFAULT now(),
  associated_by      uuid,
  UNIQUE (tenant_id, application_id, requirement_code, evidence_object_id)
);

CREATE INDEX IF NOT EXISTS draft_evidence_link_app_idx
  ON affiliation.draft_evidence_link (tenant_id, application_id);

-- -----------------------------------------------------------------------------
-- draft_change_event
--   Append-only working-set history for safe resume + support triage. No restricted response
--   content is stored here — only bounded event metadata.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation.draft_change_event (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  application_id uuid NOT NULL
                   REFERENCES affiliation.affiliation_application (id) ON DELETE CASCADE,
  actor          uuid,
  event_type     text NOT NULL,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS draft_change_event_app_idx
  ON affiliation.draft_change_event (tenant_id, application_id, occurred_at);

-- =============================================================================
-- ROW LEVEL SECURITY (tenant-owned draft tables). requirement_definition is institutional
-- reference data and is intentionally NOT under RLS. Missing tenant context fails closed via
-- governance.current_tenant_id().
-- =============================================================================
ALTER TABLE affiliation.application_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.application_draft FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS application_draft_select ON affiliation.application_draft;
DROP POLICY IF EXISTS application_draft_insert ON affiliation.application_draft;
DROP POLICY IF EXISTS application_draft_update ON affiliation.application_draft;
CREATE POLICY application_draft_select ON affiliation.application_draft
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY application_draft_insert ON affiliation.application_draft
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY application_draft_update ON affiliation.application_draft
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

ALTER TABLE affiliation.application_requirement ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.application_requirement FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS application_requirement_select ON affiliation.application_requirement;
DROP POLICY IF EXISTS application_requirement_insert ON affiliation.application_requirement;
CREATE POLICY application_requirement_select ON affiliation.application_requirement
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY application_requirement_insert ON affiliation.application_requirement
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

ALTER TABLE affiliation.draft_response ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.draft_response FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS draft_response_select ON affiliation.draft_response;
DROP POLICY IF EXISTS draft_response_insert ON affiliation.draft_response;
DROP POLICY IF EXISTS draft_response_update ON affiliation.draft_response;
CREATE POLICY draft_response_select ON affiliation.draft_response
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY draft_response_insert ON affiliation.draft_response
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY draft_response_update ON affiliation.draft_response
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

ALTER TABLE affiliation.draft_evidence_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.draft_evidence_link FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS draft_evidence_link_select ON affiliation.draft_evidence_link;
DROP POLICY IF EXISTS draft_evidence_link_insert ON affiliation.draft_evidence_link;
DROP POLICY IF EXISTS draft_evidence_link_delete ON affiliation.draft_evidence_link;
CREATE POLICY draft_evidence_link_select ON affiliation.draft_evidence_link
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY draft_evidence_link_insert ON affiliation.draft_evidence_link
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
-- DELETE is permitted: removing a draft association deletes ONLY this link row (never a
-- governed evidence object / stored payload).
CREATE POLICY draft_evidence_link_delete ON affiliation.draft_evidence_link
  FOR DELETE USING (tenant_id = governance.current_tenant_id());

ALTER TABLE affiliation.draft_change_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.draft_change_event FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS draft_change_event_select ON affiliation.draft_change_event;
DROP POLICY IF EXISTS draft_change_event_insert ON affiliation.draft_change_event;
-- Append-only: SELECT + INSERT only (no UPDATE/DELETE policy => immutable history).
CREATE POLICY draft_change_event_select ON affiliation.draft_change_event
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY draft_change_event_insert ON affiliation.draft_change_event
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

-- =============================================================================
-- SEED: bounded institutional requirement catalog (v1). Idempotent (ON CONFLICT DO NOTHING).
-- NSO-generic naming only (no sport-specific terms). Applicability dimensions are bounded arrays;
-- an omitted/empty dimension means "applies to all values in that dimension".
-- =============================================================================
INSERT INTO affiliation.requirement_definition
  (id, code, version, response_type, evidence_required,
   title_en, guidance_en, title_fr, guidance_fr,
   applicability, effective_season, institutional_source, active)
VALUES
  ('ORG_PROFILE_CONFIRMATION@1', 'ORG_PROFILE_CONFIRMATION', 1, 'acknowledgement', false,
   'Confirm organization profile',
   'Confirm that the organization''s registered name, jurisdiction, and primary address on file are current and accurate.',
   'Confirmer le profil de l''organisation',
   'Confirmez que le nom enregistré, la juridiction et l''adresse principale de l''organisation au dossier sont à jour et exacts.',
   '{"orgTypes":["national","regional","local"],"pathways":["new_affiliation","renewal"]}'::jsonb,
   NULL, 'National Affiliation Policy', true),

  ('PRIMARY_CONTACT_DETAILS@1', 'PRIMARY_CONTACT_DETAILS', 1, 'structured_contact', false,
   'Primary affiliation contact',
   'Provide the name, role, email, and phone number of the primary contact responsible for this affiliation.',
   'Personne-ressource principale de l''affiliation',
   'Indiquez le nom, le rôle, le courriel et le numéro de téléphone de la personne-ressource principale responsable de cette affiliation.',
   '{"orgTypes":["national","regional","local"],"pathways":["new_affiliation","renewal"]}'::jsonb,
   NULL, 'National Affiliation Policy', true),

  ('GOVERNING_DOCUMENT@1', 'GOVERNING_DOCUMENT', 1, 'document_reference', true,
   'Governing document',
   'Attach the organization''s current governing document (constitution or bylaws). A supporting document is required.',
   'Document constitutif',
   'Joignez le document constitutif actuel de l''organisation (constitution ou règlements). Un document justificatif est requis.',
   '{"orgTypes":["regional","local"],"pathways":["new_affiliation","renewal"]}'::jsonb,
   NULL, 'National Affiliation Policy', true),

  ('INSURANCE_CONFIRMATION@1', 'INSURANCE_CONFIRMATION', 1, 'confirmation', true,
   'Insurance confirmation',
   'Confirm valid liability insurance for the affiliation season and attach the certificate of insurance.',
   'Confirmation d''assurance',
   'Confirmez une assurance responsabilité valide pour la saison d''affiliation et joignez le certificat d''assurance.',
   '{"orgTypes":["local"],"pathways":["new_affiliation","renewal"]}'::jsonb,
   NULL, 'National Affiliation Policy', true)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- APPLICATION ROLE GRANTS (least privilege). Conditionally granted to the non-superuser runtime
-- role `house_app` when it exists. The draft working set is representative-editable
-- (SELECT/INSERT/UPDATE); draft_evidence_link additionally allows DELETE (removing an association)
-- and requires UPDATE for idempotent re-association (INSERT ... ON CONFLICT DO UPDATE).
-- draft_change_event is append-only (SELECT/INSERT). requirement_definition is read-only
-- reference data (SELECT).
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'house_app') THEN
    GRANT SELECT ON affiliation.requirement_definition TO house_app;
    GRANT SELECT, INSERT, UPDATE ON affiliation.application_draft TO house_app;
    GRANT SELECT, INSERT ON affiliation.application_requirement TO house_app;
    GRANT SELECT, INSERT, UPDATE ON affiliation.draft_response TO house_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON affiliation.draft_evidence_link TO house_app;
    GRANT SELECT, INSERT ON affiliation.draft_change_event TO house_app;
  END IF;
END$$;
