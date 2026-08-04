-- =============================================================================
-- Migration: 0024_standing_renewal_initiation
-- The House v2 — governed attribution linking a RENEWAL affiliation application back to the
-- standing it renews. This is the durable, tenant-owned record that lets a representative be
-- routed INTO the existing affiliation-application workflow to renew an active/lapsed standing —
-- WITHOUT letting a representative execute the governed standing-renewal transition (renew /
-- renew_active remain segregated to the standing_renewal_authority and the Governance Kernel).
--
-- This migration does NOT create a second application workflow. A renewal reuses the existing
-- affiliation.affiliation_application / application_draft / application_requirement machinery. The
-- ONLY new institutional fact is the immutable link between (renewal application) and (standing +
-- source version/season + target season).
--
-- Requires PostgreSQL 15+.
--
-- NSO-GENERIC: sport-agnostic column names only.
--
-- RLS: the link is TENANT-OWNED -> ENABLE + FORCE Row-Level Security keyed on
-- governance.current_tenant_id() (0001; fails closed when app.tenant_id is unset). The link is
-- APPEND-ONLY at runtime: SELECT + INSERT policies only (no UPDATE/DELETE => denied under FORCE
-- RLS). Attribution is written once, in the same transaction that creates the renewal application.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Parent composite unique so the link can PHYSICALLY enforce
--    "target season on the link == season on the renewal application".
--
--    The renewal link references the renewal application by (tenant_id, id, season_id); with this
--    composite key the FK guarantees the referenced application's season_id equals the link's
--    target_season_id. A mismatch is impossible at the storage layer (not merely checked in code).
-- -----------------------------------------------------------------------------
ALTER TABLE affiliation.affiliation_application
  ADD CONSTRAINT affiliation_application_id_season_tenant_unique
    UNIQUE (tenant_id, id, season_id);

-- -----------------------------------------------------------------------------
-- 2. Preflight: refuse to create the attribution table if un-attributable renewal applications
--    already exist.
--
--    Before this slice there was NO mechanism that created a renewal affiliation application, and
--    therefore no governed way to attribute one to a standing. If any application_type = 'renewal'
--    rows exist, they cannot be safely attributed here. We DO NOT fabricate the relationship from
--    organization name, organization type, or season-string proximity — a mismatch is an operator
--    signal. The operator must seed affiliation_standing.renewal_application_link rows explicitly
--    (standing_id + source version/season) before applying this migration.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  orphan_count integer;
  sample       text;
BEGIN
  SELECT count(*),
         string_agg(DISTINCT format('(tenant=%s, application=%s, season=%s)',
                                    a.tenant_id, a.id, a.season_id), ', ')
    INTO orphan_count, sample
  FROM affiliation.affiliation_application a
  WHERE a.application_type = 'renewal';

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Migration 0024 preflight failed: % existing renewal affiliation_application row(s) have no attributable standing linkage. affiliation_standing.renewal_application_link is the sole governed attribution and no prior mechanism created it. Seed a renewal_application_link row (standing_id + source_standing_version + source_season_id) for each BEFORE applying; do NOT infer attribution from organization name/type or season-string proximity. Samples: %',
      orphan_count, left(COALESCE(sample, ''), 500)
      USING ERRCODE = 'foreign_key_violation';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. renewal_application_link — immutable governed attribution.
--
--    One row per renewal application. Captures WHICH standing is being renewed, the SOURCE version
--    and season observed at initiation (a point-in-time snapshot, never rewritten), and the TARGET
--    governed season the renewal application is for. Physical integrity, all tenant-consistent:
--      - renewal_application_id -> affiliation.affiliation_application (same tenant, same season);
--      - standing_id            -> affiliation_standing.affiliation_standing (same tenant);
--      - target_season_id       -> affiliation.season (same tenant, governed catalog).
--    Uniqueness:
--      - one link per renewal application            (tenant_id, renewal_application_id);
--      - one renewal per standing + target season    (tenant_id, standing_id, target_season_id);
--      - idempotent initiation per command lineage    (tenant_id, idempotency_key).
--    CHECKs: source_standing_version >= 1; source_season_id <> target_season_id (a renewal always
--    advances to a DIFFERENT governed season).
-- -----------------------------------------------------------------------------
CREATE TABLE affiliation_standing.renewal_application_link (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL,
  renewal_application_id  uuid NOT NULL,
  standing_id             uuid NOT NULL,
  source_standing_version integer NOT NULL CHECK (source_standing_version >= 1),
  source_season_id        text NOT NULL,
  target_season_id        text NOT NULL,
  initiated_by            uuid NOT NULL,
  initiated_at            timestamptz NOT NULL DEFAULT now(),
  idempotency_key         text NOT NULL,
  correlation_id          text,
  causation_id            text,
  CONSTRAINT renewal_link_distinct_season_ck
    CHECK (source_season_id <> target_season_id),
  -- target season on the link == season on the renewal application (physical, not code-only).
  CONSTRAINT renewal_link_application_fk
    FOREIGN KEY (tenant_id, renewal_application_id, target_season_id)
    REFERENCES affiliation.affiliation_application (tenant_id, id, season_id),
  CONSTRAINT renewal_link_standing_fk
    FOREIGN KEY (tenant_id, standing_id)
    REFERENCES affiliation_standing.affiliation_standing (tenant_id, id),
  CONSTRAINT renewal_link_target_season_fk
    FOREIGN KEY (tenant_id, target_season_id)
    REFERENCES affiliation.season (tenant_id, season_id),
  CONSTRAINT renewal_link_one_per_application
    UNIQUE (tenant_id, renewal_application_id),
  CONSTRAINT renewal_link_one_per_standing_target
    UNIQUE (tenant_id, standing_id, target_season_id),
  CONSTRAINT renewal_link_idempotency_unique
    UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX renewal_application_link_tenant_standing_idx
  ON affiliation_standing.renewal_application_link (tenant_id, standing_id);
CREATE INDEX renewal_application_link_tenant_application_idx
  ON affiliation_standing.renewal_application_link (tenant_id, renewal_application_id);

-- =============================================================================
-- ROW LEVEL SECURITY (tenant-owned, append-only). SELECT + INSERT only; no UPDATE/DELETE policy
-- => denied under FORCE RLS. Missing tenant context fails closed (current_tenant_id() raises).
-- =============================================================================
ALTER TABLE affiliation_standing.renewal_application_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation_standing.renewal_application_link FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS renewal_application_link_select
  ON affiliation_standing.renewal_application_link;
DROP POLICY IF EXISTS renewal_application_link_insert
  ON affiliation_standing.renewal_application_link;
CREATE POLICY renewal_application_link_select
  ON affiliation_standing.renewal_application_link
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY renewal_application_link_insert
  ON affiliation_standing.renewal_application_link
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

-- =============================================================================
-- APPLICATION ROLE GRANTS (least privilege; conditional on the runtime role existing). The link is
-- written in the SAME transaction that creates the renewal application. Append-only => SELECT +
-- INSERT. No DELETE, no superuser / BYPASSRLS; RLS provides tenant isolation.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'house_app') THEN
    GRANT SELECT, INSERT ON affiliation_standing.renewal_application_link TO house_app;
  END IF;
END$$;

-- =============================================================================
-- COMMENTS (governance intent, discoverable in the catalog).
-- =============================================================================
COMMENT ON TABLE affiliation_standing.renewal_application_link IS
  'Immutable governed attribution: links a renewal affiliation application to the standing it '
  'renews (standing_id + source_standing_version + source_season_id) and the governed target '
  'season. One link per renewal application; one renewal per standing+target season. Append-only '
  '(no runtime UPDATE/DELETE). Does NOT execute the standing renew/renew_active transition — that '
  'stays with the Governance Kernel and the segregated standing_renewal_authority.';
COMMENT ON COLUMN affiliation_standing.renewal_application_link.source_standing_version IS
  'Standing head version observed at initiation (point-in-time snapshot; never rewritten if the '
  'standing later advances).';
COMMENT ON COLUMN affiliation_standing.renewal_application_link.target_season_id IS
  'Governed target season; FK-guaranteed to equal the renewal application''s season_id.';
