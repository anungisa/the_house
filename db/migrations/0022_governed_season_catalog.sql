-- =============================================================================
-- Migration: 0022_governed_season_catalog
-- The House v2 — Governed season catalog (additive evolution of affiliation.season)
--
-- Replaces the clock-derived season catalog (a wall-clock function inventing seasons that do
-- not exist) with the PERSISTED, tenant-isolated affiliation.season as the sole source of truth.
-- This migration EVOLVES the existing table from migration 0003 ADDITIVELY — it never rewrites
-- 0003 and never creates a second competing season table.
--
-- A clock-derived season is NOT a governed season. A current season is NOT automatically open for
-- applications. A published season is NOT automatically current. A visible season is NOT
-- necessarily selectable. A closed application window is NOT a historical-season deletion. A
-- season selected in the browser is NOT a season authorized by the server.
--
-- The catalog holds SEASON FACTS with an explicit lifecycle (draft / published / retired), an
-- explicit current-season flag (at most one live current season per tenant), and an optional
-- application window. Phase (upcoming / current / past) and acceptingApplications are DERIVED at
-- read time from the persisted window + current instant; the clock evaluates persisted windows,
-- it never manufactures a season that does not exist.
--
-- Security posture (fail closed): tenant_id on every table, FORCE ROW LEVEL SECURITY, no runtime
-- DELETE, append-only season events, and a non-superuser / non-BYPASSRLS runtime role. The
-- application -> season relationship is enforced by a tenant-consistent composite FK, gated by a
-- preflight that fails LOUDLY (never silently mutating institutional data) when an application
-- references a season with no same-tenant catalog row.
--
-- NSO-GENERIC: every identifier here is sport-agnostic. Requires PostgreSQL 15+. RLS keyed on
-- governance.current_tenant_id() (0001), which fails closed when app.tenant_id is unset.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend affiliation.season with the governed model (all additive).
--    `label` (0003) is retained for back-compat; label_en / label_fr are the governed labels.
-- -----------------------------------------------------------------------------
ALTER TABLE affiliation.season
  ADD COLUMN IF NOT EXISTS label_en             text,
  ADD COLUMN IF NOT EXISTS label_fr             text,
  ADD COLUMN IF NOT EXISTS status               text,
  ADD COLUMN IF NOT EXISTS season_start_date    date,
  ADD COLUMN IF NOT EXISTS season_end_date      date,
  ADD COLUMN IF NOT EXISTS application_opens_at  timestamptz,
  ADD COLUMN IF NOT EXISTS application_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_reference     text,
  ADD COLUMN IF NOT EXISTS idempotency_key      text,
  ADD COLUMN IF NOT EXISTS version              integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by           text,
  ADD COLUMN IF NOT EXISTS updated_by           text,
  ADD COLUMN IF NOT EXISTS updated_at           timestamptz NOT NULL DEFAULT now();

-- -----------------------------------------------------------------------------
-- 2. Compatibility backfill for pre-existing rows (institutional data is preserved).
--
--    * Bilingual labels: populate from the existing (language-neutral) label when present,
--      otherwise from the stable season key. We DO NOT invent translated prose.
--    * Dates: derive ONLY when the season key is unambiguously a 'YYYY-YY' window
--      (Sept 1 of the start year -> Aug 31 of the following year). Otherwise leave NULL until
--      governed completion. New PUBLISH commands enforce completeness (see the service layer).
--    * Status: existing operational rows are classified 'published'.
-- -----------------------------------------------------------------------------
UPDATE affiliation.season
SET
  label_en = COALESCE(NULLIF(btrim(label), ''), season_id),
  label_fr = COALESCE(NULLIF(btrim(label), ''), season_id),
  status   = COALESCE(status, 'published'),
  season_start_date = CASE
    WHEN season_start_date IS NOT NULL THEN season_start_date
    WHEN season_id ~ '^\d{4}-\d{2}$'
      THEN make_date((substring(season_id from 1 for 4))::int, 9, 1)
    ELSE NULL
  END,
  season_end_date = CASE
    WHEN season_end_date IS NOT NULL THEN season_end_date
    WHEN season_id ~ '^\d{4}-\d{2}$'
      THEN make_date((substring(season_id from 1 for 4))::int + 1, 8, 31)
    ELSE NULL
  END,
  source_reference = COALESCE(source_reference, 'migration:0003-legacy'),
  version = COALESCE(version, 1),
  updated_at = now();

-- Status is now populated for every legacy row; enforce presence + default for new rows.
ALTER TABLE affiliation.season
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN status SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Governed structural invariants (must hold for ALL rows, legacy included).
--
--    NOTE: "published requires safe labels + valid dates" is enforced at the PUBLISH COMMAND
--    boundary (service layer), NOT as a table CHECK — legacy published rows may retain NULL
--    dates until governed completion, while NEW incomplete published records are prevented.
-- -----------------------------------------------------------------------------
ALTER TABLE affiliation.season
  ADD CONSTRAINT season_status_ck
    CHECK (status IN ('draft', 'published', 'retired')),
  ADD CONSTRAINT season_version_ck
    CHECK (version >= 1),
  ADD CONSTRAINT season_dates_ck
    CHECK (season_start_date IS NULL OR season_end_date IS NULL
           OR season_end_date > season_start_date),
  ADD CONSTRAINT season_window_ck
    CHECK (application_opens_at IS NULL OR application_closes_at IS NULL
           OR application_closes_at > application_opens_at),
  ADD CONSTRAINT season_retired_not_current_ck
    CHECK (NOT (status = 'retired' AND is_current)),
  ADD CONSTRAINT season_draft_not_current_ck
    CHECK (NOT (status = 'draft' AND is_current));

-- Composite unique so the append-only season_event can enforce a tenant-consistent FK.
ALTER TABLE affiliation.season
  ADD CONSTRAINT season_id_tenant_unique UNIQUE (id, tenant_id);

-- At most one LIVE current season per tenant (retired/draft cannot be current per CHECKs above).
CREATE UNIQUE INDEX season_one_current_idx
  ON affiliation.season (tenant_id)
  WHERE is_current;

-- Command idempotency: one committed command lineage per (tenant, idempotency_key).
CREATE UNIQUE INDEX season_idempotency_idx
  ON affiliation.season (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Published-season lookup for the representative catalog (newest window first).
CREATE INDEX season_tenant_status_idx
  ON affiliation.season (tenant_id, status, season_start_date DESC);

-- -----------------------------------------------------------------------------
-- 4. Application -> season physical integrity (close the 0003 unconstrained-text gap).
--
--    Preflight: detect applications whose (tenant_id, season_id) has no same-tenant catalog
--    row and FAIL the migration with a clear diagnostic. We DO NOT create, rewrite, delete, or
--    reassign institutional data to satisfy the constraint — a mismatch is an operator signal.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  orphan_count integer;
  sample       text;
BEGIN
  SELECT count(*),
         string_agg(DISTINCT format('(tenant=%s, season=%s)', a.tenant_id, a.season_id), ', ')
                    FILTER (WHERE TRUE)
    INTO orphan_count, sample
  FROM affiliation.affiliation_application a
  LEFT JOIN affiliation.season s
    ON s.tenant_id = a.tenant_id AND s.season_id = a.season_id
  WHERE s.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Migration 0022 preflight failed: % affiliation_application row(s) reference a season with no same-tenant affiliation.season catalog row. Seed the missing governed season rows before applying. Samples: %',
      orphan_count, left(COALESCE(sample, ''), 500)
      USING ERRCODE = 'foreign_key_violation';
  END IF;
END $$;

-- Add the tenant-consistent composite FK (references the 0003 season_unique key).
ALTER TABLE affiliation.affiliation_application
  ADD CONSTRAINT affiliation_application_season_fk
    FOREIGN KEY (tenant_id, season_id)
    REFERENCES affiliation.season (tenant_id, season_id);

-- -----------------------------------------------------------------------------
-- 5. affiliation.season_event — append-only season history / audit lineage.
-- -----------------------------------------------------------------------------
CREATE TABLE affiliation.season_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  season_row_id   uuid NOT NULL,
  event_type      text NOT NULL
                    CHECK (event_type IN ('created', 'revised', 'published', 'made_current',
                                          'applications_opened', 'applications_closed', 'retired')),
  actor_user_id   text,
  from_state      text,
  to_state        text,
  correlation_id  text,
  causation_id    text,
  reason_code     text,
  -- Per-COMMAND idempotency: one season row lives through many governed commands, so the
  -- idempotency key belongs on the event (not the head). A replayed command matches here and
  -- returns the current head WITHOUT re-mutating.
  idempotency_key text,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT season_event_season_fk
    FOREIGN KEY (season_row_id, tenant_id)
    REFERENCES affiliation.season (id, tenant_id)
);

CREATE INDEX season_event_season_idx
  ON affiliation.season_event (tenant_id, season_row_id, occurred_at DESC);

-- Command idempotency backstop: one committed command per (tenant, idempotency_key).
CREATE UNIQUE INDEX season_event_idempotency_idx
  ON affiliation.season_event (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- =============================================================================
-- ROW LEVEL SECURITY (season_event is tenant-owned + append-only; fail closed on unset tenant).
-- affiliation.season RLS was established in 0003 (SELECT/INSERT/UPDATE). season_event is
-- SELECT/INSERT only (no UPDATE/DELETE policy => denied under FORCE RLS). No DELETE anywhere.
-- =============================================================================
ALTER TABLE affiliation.season_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.season_event FORCE ROW LEVEL SECURITY;
CREATE POLICY season_event_select ON affiliation.season_event
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY season_event_insert ON affiliation.season_event
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

-- =============================================================================
-- Least-privilege runtime grants (conditional; the runtime role exists before migrations run).
-- The season head already has SELECT/INSERT/UPDATE (0003). The event log is append-only. No
-- DELETE is ever granted.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'house_app') THEN
    GRANT SELECT, INSERT ON affiliation.season_event TO house_app;
  END IF;
END $$;

COMMENT ON COLUMN affiliation.season.status IS
  'Governed lifecycle: draft (invisible/unselectable) | published (may be visible/current) | retired (unavailable for new selection).';
COMMENT ON COLUMN affiliation.season.is_current IS
  'At most one live current season per tenant (partial unique index). Current != open for applications.';
COMMENT ON TABLE affiliation.season_event IS
  'Append-only governed season history / audit lineage.';
