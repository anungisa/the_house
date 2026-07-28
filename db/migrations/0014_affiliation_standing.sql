-- =============================================================================
-- Migration: 0014_affiliation_standing
-- The House v2 — Affiliation Standing (expiry & renewal) vertical
--
-- Adds:
--   (A) the governed AffiliationStanding state machine (policy 'affiliation_standing' v1) —
--       kernel-owned lifecycle for the TIME-BOUNDED standing of an affiliated subject:
--       establishment (open), coming into force (activate), lapse when the term ends
--       (expire), restoration by governed renewal (renew / renew_active), compliance
--       suspension + reinstatement, and termination;
--   (B) the affiliation_standing domain schema (tenant-scoped, RLS FORCE) that holds the
--       STANDING FACTS (the head's current effective period + pathway + version, the
--       append-only period history, and the append-only lifecycle event log) written
--       ATOMICALLY with the governed transition by the Governance Kernel's domain-effect port.
--
-- Governed lifecycle state lives ONLY in governance.entity_state (kernel-owned). The
-- affiliation_standing tables hold facts, never lifecycle state, and are never mutated
-- outside the kernel's governed transaction (they are written by the domain effect).
--
-- The FSM preserves the required, non-collapsible distinctions (V12-15):
--   activation authorized (activate) ≠ active standing established (open) ≠ maintained (renew)
--   term ended (expire → lapsed)     ≠ standing renewed (renew → active)
--
-- REQUIRED PLATFORM POLICY/CONFIG + DDL — idempotent (safe to re-run) via
-- IF NOT EXISTS / ON CONFLICT DO NOTHING. No destructive or superuser statements.
--
-- NSO-GENERIC: 'AffiliationStanding' and every column name are sport-agnostic. No
-- sport-specific vocabulary appears here.
--
-- Requires PostgreSQL 15+. RLS keyed on governance.current_tenant_id() (0001), which fails
-- closed when app.tenant_id is unset.
-- =============================================================================

-- =============================================================================
-- PART A — Governed state machine (governance schema)
-- =============================================================================

-- A1. Policy version -------------------------------------------------------------
INSERT INTO governance.policy_version (tenant_id, name, version, status, description)
VALUES (NULL, 'affiliation_standing', 1, 'active',
        'AffiliationStanding v1 governance policy')
ON CONFLICT DO NOTHING;

-- A2. State machine --------------------------------------------------------------
INSERT INTO governance.state_machine
  (tenant_id, policy_version_id, entity_type, name, version, status)
SELECT NULL, pv.id, 'AffiliationStanding', 'affiliation_standing', 1, 'active'
FROM governance.policy_version pv
WHERE pv.tenant_id IS NULL AND pv.name = 'affiliation_standing' AND pv.version = 1
ON CONFLICT DO NOTHING;

-- A3. State nodes ----------------------------------------------------------------
--   unopened (initial, bootstrap — the standing head does not exist yet)
--     -> pending (open: head + first effective period recorded)
--     -> active  (activate: standing in force within its effective period)
--   active -> lapsed (expire: term ended)  ; lapsed -> active (renew)
--   active -> active (renew_active: early renewal within the grace window)
--   active <-> suspended (suspend / reinstate)
--   active|suspended|lapsed -> terminated (terminal)
INSERT INTO governance.state_node
  (state_machine_id, name, is_initial, is_terminal, sort_order)
SELECT sm.id, n.name, n.is_initial, n.is_terminal, n.sort_order
FROM governance.state_machine sm
JOIN (VALUES
  ('unopened',   true,  false, 0),
  ('pending',    false, false, 1),
  ('active',     false, false, 2),
  ('suspended',  false, false, 3),
  ('lapsed',     false, false, 4),
  ('terminated', false, true,  5)
) AS n(name, is_initial, is_terminal, sort_order) ON true
WHERE sm.tenant_id IS NULL AND sm.entity_type = 'AffiliationStanding' AND sm.version = 1
ON CONFLICT (state_machine_id, name) DO NOTHING;

-- A4. Guard definitions ----------------------------------------------------------
--   Authority (who may act) is enforced by the StandingPermissionChecker per trigger; these
--   guards enforce PERSISTED-FACT + CLOCK preconditions only (never caller payload).
INSERT INTO governance.guard_definition (code, description, handler_key)
VALUES
  ('STANDING_WITHIN_EFFECTIVE_PERIOD',
   'The clock is within the standing''s current effective period [effective_from, effective_until).',
   'STANDING_WITHIN_EFFECTIVE_PERIOD'),
  ('STANDING_TERM_HAS_ENDED',
   'The standing''s current effective period has ended (now >= effective_until).',
   'STANDING_TERM_HAS_ENDED'),
  ('STANDING_RENEWAL_WINDOW_OPEN',
   'The renewal grace window is open (now >= effective_until - graceDays).',
   'STANDING_RENEWAL_WINDOW_OPEN')
ON CONFLICT (code) DO NOTHING;

-- A5. Transition definitions -----------------------------------------------------
--   risk_level 'high' => evidence_required (immutable evidence metadata). Every standing
--   transition executes directly under a distinct segregated authority (no two-tier approval
--   in v1); approval_required is false throughout. Only `open` and `activate` are low-risk.
INSERT INTO governance.transition_definition
  (tenant_id, state_machine_id, trigger, from_state, to_state,
   risk_level, evidence_required, approval_required)
SELECT NULL, sm.id, t.trigger, t.from_state, t.to_state,
       t.risk_level, t.evidence_required, t.approval_required
FROM governance.state_machine sm
JOIN (VALUES
  -- trigger,        from_state,   to_state,     risk,   evidence, approval
  ('open',          'unopened',   'pending',    'low',  false, false),
  ('activate',      'pending',    'active',     'low',  false, false),
  ('expire',        'active',     'lapsed',     'high', true,  false),
  ('renew',         'lapsed',     'active',     'high', true,  false),
  ('renew_active',  'active',     'active',     'high', true,  false),
  ('suspend',       'active',     'suspended',  'high', true,  false),
  ('reinstate',     'suspended',  'active',     'high', true,  false),
  ('terminate',     'active',     'terminated', 'high', true,  false),
  ('terminate',     'suspended',  'terminated', 'high', true,  false),
  ('terminate',     'lapsed',     'terminated', 'high', true,  false)
) AS t(trigger, from_state, to_state, risk_level, evidence_required, approval_required) ON true
WHERE sm.tenant_id IS NULL AND sm.entity_type = 'AffiliationStanding' AND sm.version = 1
ON CONFLICT (state_machine_id, from_state, trigger) DO NOTHING;

-- A6. Transition guard bindings --------------------------------------------------
--   renew_active binds STANDING_RENEWAL_WINDOW_OPEN with a graceDays parameter (early renewal).
INSERT INTO governance.transition_guard
  (transition_definition_id, guard_code, parameters, sort_order)
SELECT td.id, g.guard_code, g.parameters, g.sort_order
FROM governance.transition_definition td
JOIN governance.state_machine sm ON sm.id = td.state_machine_id
JOIN (VALUES
  -- trigger,        from_state,   guard_code,                        parameters,               sort
  ('activate',      'pending',    'STANDING_WITHIN_EFFECTIVE_PERIOD', '{}'::jsonb,              0),
  ('expire',        'active',     'STANDING_TERM_HAS_ENDED',          '{}'::jsonb,              0),
  ('renew_active',  'active',     'STANDING_RENEWAL_WINDOW_OPEN',     '{"graceDays":30}'::jsonb, 0),
  ('reinstate',     'suspended',  'STANDING_WITHIN_EFFECTIVE_PERIOD', '{}'::jsonb,              0)
) AS g(trigger, from_state, guard_code, parameters, sort_order)
  ON g.trigger = td.trigger AND g.from_state = td.from_state
WHERE sm.tenant_id IS NULL AND sm.entity_type = 'AffiliationStanding' AND sm.version = 1
ON CONFLICT (transition_definition_id, guard_code) DO NOTHING;

-- =============================================================================
-- PART B — affiliation_standing domain schema (STANDING FACTS; RLS FORCE)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS affiliation_standing;

-- -----------------------------------------------------------------------------
-- affiliation_standing
--   The standing HEAD: identity + the CURRENT effective period, pathway, and version. One
--   row per standing. `affiliation_application_id` references an affiliation application in the
--   SAME tenant (enforced via tenant scoping + RLS; intentionally not a cross-schema DB FK so
--   tenant isolation stays the single mechanism). `subject_id` mirrors the affiliation subject
--   for scope queries. Rows are never deleted. Immutable-after-create: affiliation_application_id,
--   subject_id, season, established_by, created_at. The current effective period/pathway/version
--   are advanced ONLY by a governed `renew`/`renew_active` transition (append period + head
--   update in one governed txn). `effective_until` is exclusive and strictly after
--   `effective_from`.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation_standing.affiliation_standing (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL,
  affiliation_application_id uuid NOT NULL,
  subject_id                 uuid NOT NULL,
  season                     text NOT NULL,
  standing_version           integer NOT NULL DEFAULT 1 CHECK (standing_version >= 1),
  effective_from             timestamptz NOT NULL,
  effective_until            timestamptz NOT NULL,
  pathway                    text NOT NULL
                               CHECK (pathway IN
                                 ('continuity', 'renewal_with_remediation', 'new_affiliation')),
  established_by             uuid NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until > effective_from),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS affiliation_standing_tenant_app_idx
  ON affiliation_standing.affiliation_standing (tenant_id, affiliation_application_id);
CREATE INDEX IF NOT EXISTS affiliation_standing_tenant_subject_season_idx
  ON affiliation_standing.affiliation_standing (tenant_id, subject_id, season);

-- -----------------------------------------------------------------------------
-- standing_period (APPEND-ONLY history of effective periods)
--   One row per effective period (v1 = initial period recorded at open; v2+ = renewals).
--   Immutable: a renewal NEVER rewrites a prior row — it appends a new version and advances the
--   head. UNIQUE per (standing, version) so a duplicated renewal cannot create a second row for
--   the same version.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation_standing.standing_period (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  standing_id     uuid NOT NULL,
  version         integer NOT NULL CHECK (version >= 1),
  effective_from  timestamptz NOT NULL,
  effective_until timestamptz NOT NULL,
  pathway         text NOT NULL
                    CHECK (pathway IN
                      ('continuity', 'renewal_with_remediation', 'new_affiliation')),
  reason          text,
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until > effective_from),
  UNIQUE (tenant_id, standing_id, version)
);

CREATE INDEX IF NOT EXISTS standing_period_tenant_standing_idx
  ON affiliation_standing.standing_period (tenant_id, standing_id, version);

-- -----------------------------------------------------------------------------
-- standing_event (APPEND-ONLY lifecycle event log)
--   One row per lifecycle determination that is not itself a new period: renewal (a companion
--   marker for the appended period), expiry, suspension, reinstatement, termination. Immutable.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation_standing.standing_event (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  standing_id  uuid NOT NULL,
  event_kind   text NOT NULL
                 CHECK (event_kind IN
                   ('renewal', 'expiry', 'suspension', 'reinstatement', 'termination')),
  reason       text,
  recorded_by  uuid NOT NULL,
  occurred_at  timestamptz,
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS standing_event_tenant_standing_kind_idx
  ON affiliation_standing.standing_event (tenant_id, standing_id, event_kind, recorded_at);

-- =============================================================================
-- ROW LEVEL SECURITY (tenant-owned). The standing head is mutable (effective period/version
-- advance under governed renewals) -> SELECT/INSERT/UPDATE. History tables are append-only ->
-- SELECT/INSERT. Missing tenant context fails closed (governance.current_tenant_id() raises).
-- No DELETE policy anywhere.
-- =============================================================================
ALTER TABLE affiliation_standing.affiliation_standing ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation_standing.affiliation_standing FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affiliation_standing_select ON affiliation_standing.affiliation_standing;
DROP POLICY IF EXISTS affiliation_standing_insert ON affiliation_standing.affiliation_standing;
DROP POLICY IF EXISTS affiliation_standing_update ON affiliation_standing.affiliation_standing;
CREATE POLICY affiliation_standing_select ON affiliation_standing.affiliation_standing
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY affiliation_standing_insert ON affiliation_standing.affiliation_standing
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY affiliation_standing_update ON affiliation_standing.affiliation_standing
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

ALTER TABLE affiliation_standing.standing_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation_standing.standing_period FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS standing_period_select ON affiliation_standing.standing_period;
DROP POLICY IF EXISTS standing_period_insert ON affiliation_standing.standing_period;
CREATE POLICY standing_period_select ON affiliation_standing.standing_period
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY standing_period_insert ON affiliation_standing.standing_period
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

ALTER TABLE affiliation_standing.standing_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation_standing.standing_event FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS standing_event_select ON affiliation_standing.standing_event;
DROP POLICY IF EXISTS standing_event_insert ON affiliation_standing.standing_event;
CREATE POLICY standing_event_select ON affiliation_standing.standing_event
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY standing_event_insert ON affiliation_standing.standing_event
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

-- =============================================================================
-- APPLICATION ROLE GRANTS (least privilege). Conditionally granted to the non-superuser
-- runtime role `house_app` when it exists. The kernel's domain effect writes these rows in the
-- SAME governed transaction as the state mutation + outbox enqueue. No DELETE; RLS provides
-- tenant isolation.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'house_app') THEN
    GRANT USAGE ON SCHEMA affiliation_standing TO house_app;
    GRANT SELECT, INSERT, UPDATE ON affiliation_standing.affiliation_standing TO house_app;
    GRANT SELECT, INSERT ON affiliation_standing.standing_period TO house_app;
    GRANT SELECT, INSERT ON affiliation_standing.standing_event TO house_app;
  END IF;
END$$;
