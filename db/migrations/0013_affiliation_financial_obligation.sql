-- =============================================================================
-- Migration: 0013_affiliation_financial_obligation
-- The House v2 — Affiliation Financial Obligation & Reconciliation vertical
--
-- Adds:
--   (A) the governed AffiliationFinancialObligation state machine (policy
--       'affiliation_finance' v1) — kernel-owned lifecycle for a financial obligation
--       attached to an affiliation application: assessment, provider acknowledgement,
--       accounting confirmation, reconciliation, mismatch handling, and authorized
--       clearance (waiver / exemption);
--   (B) the affiliation_finance domain schema (tenant-scoped, RLS FORCE) that holds the
--       FINANCIAL FACTS (amounts, currencies, external references, reconciliation
--       outcomes, clearance authorizations) written ATOMICALLY with the governed
--       transition by the Governance Kernel's domain-effect port;
--   (C) the AFFILIATION_FINANCIALLY_CLEARED guard bound to the affiliation `activate`
--       and `reinstate` transitions, so a financially-blocked affiliation cannot be
--       granted ACTIVE standing. Financial clearance is DERIVED from obligation state —
--       it is never set directly and never equals activation authorization.
--
-- Governed lifecycle state lives ONLY in governance.entity_state (kernel-owned). The
-- affiliation_finance tables hold facts, never lifecycle state, and are never mutated
-- outside the kernel's governed transaction (they are written by the domain effect).
--
-- REQUIRED PLATFORM POLICY/CONFIG + DDL — idempotent (safe to re-run) via
-- IF NOT EXISTS / ON CONFLICT DO NOTHING. No destructive or superuser statements.
--
-- NSO-GENERIC: 'AffiliationFinancialObligation' and every column name are sport-agnostic.
-- No sport-specific vocabulary appears here.
--
-- Requires PostgreSQL 15+. RLS keyed on governance.current_tenant_id() (0001), which
-- fails closed when app.tenant_id is unset.
-- =============================================================================

-- =============================================================================
-- PART A — Governed state machine (governance schema)
-- =============================================================================

-- A1. Policy version -------------------------------------------------------------
INSERT INTO governance.policy_version (tenant_id, name, version, status, description)
VALUES (NULL, 'affiliation_finance', 1, 'active',
        'AffiliationFinancialObligation v1 governance policy')
ON CONFLICT DO NOTHING;

-- A2. State machine --------------------------------------------------------------
INSERT INTO governance.state_machine
  (tenant_id, policy_version_id, entity_type, name, version, status)
SELECT NULL, pv.id, 'AffiliationFinancialObligation', 'affiliation_financial_obligation', 1, 'active'
FROM governance.policy_version pv
WHERE pv.tenant_id IS NULL AND pv.name = 'affiliation_finance' AND pv.version = 1
ON CONFLICT DO NOTHING;

-- A3. State nodes ----------------------------------------------------------------
--   unassessed (initial) -> assessed -> acknowledged -> confirmed -> reconciled|mismatch
--   assessed -> waived|exempt (authorized clearance without payment/reconciliation)
--   mismatch -> reconciled (governed resolution)
--   reconciled|waived|exempt -> closed (terminal)
INSERT INTO governance.state_node
  (state_machine_id, name, is_initial, is_terminal, sort_order)
SELECT sm.id, n.name, n.is_initial, n.is_terminal, n.sort_order
FROM governance.state_machine sm
JOIN (VALUES
  ('unassessed',   true,  false, 0),
  ('assessed',     false, false, 1),
  ('acknowledged', false, false, 2),
  ('confirmed',    false, false, 3),
  ('reconciled',   false, false, 4),
  ('mismatch',     false, false, 5),
  ('waived',       false, false, 6),
  ('exempt',       false, false, 7),
  ('closed',       false, true,  8)
) AS n(name, is_initial, is_terminal, sort_order) ON true
WHERE sm.tenant_id IS NULL AND sm.entity_type = 'AffiliationFinancialObligation' AND sm.version = 1
ON CONFLICT (state_machine_id, name) DO NOTHING;

-- A4. Guard definitions ----------------------------------------------------------
--   Authority (who may act) is enforced by the FinancialObligationPermissionChecker per
--   trigger; these guards enforce PERSISTED-FACT preconditions only (never caller payload).
INSERT INTO governance.guard_definition (code, description, handler_key)
VALUES
  ('FINANCIAL_ACCOUNTING_CONFIRMED',
   'An accounting confirmation has been recorded for the obligation.',
   'FINANCIAL_ACCOUNTING_CONFIRMED'),
  ('FINANCIAL_AMOUNTS_MATCH',
   'The confirmed amount equals the currently assessed amount.',
   'FINANCIAL_AMOUNTS_MATCH'),
  ('FINANCIAL_AMOUNTS_DIFFER',
   'The confirmed amount differs from the currently assessed amount.',
   'FINANCIAL_AMOUNTS_DIFFER')
ON CONFLICT (code) DO NOTHING;

-- Affiliation-side derived clearance guard (bound to affiliation activate/reinstate below).
INSERT INTO governance.guard_definition (code, description, handler_key)
VALUES
  ('AFFILIATION_FINANCIALLY_CLEARED',
   'Every blocking financial obligation for the affiliation is in an authorized terminal clearance state (reconciled, waived, or exempt).',
   'AFFILIATION_FINANCIALLY_CLEARED')
ON CONFLICT (code) DO NOTHING;

-- A5. Transition definitions -----------------------------------------------------
--   risk_level 'high' => evidence_required (immutable evidence metadata). All financial
--   transitions execute directly under a distinct authority (no two-tier approval in v1);
--   approval_required is false throughout.
INSERT INTO governance.transition_definition
  (tenant_id, state_machine_id, trigger, from_state, to_state,
   risk_level, evidence_required, approval_required)
SELECT NULL, sm.id, t.trigger, t.from_state, t.to_state,
       t.risk_level, t.evidence_required, t.approval_required
FROM governance.state_machine sm
JOIN (VALUES
  -- trigger,             from_state,     to_state,       risk,   evidence, approval
  ('assess',             'unassessed',   'assessed',     'low',  false, false),
  ('revise_assessment',  'assessed',     'assessed',     'high', true,  false),
  ('acknowledge',        'assessed',     'acknowledged', 'low',  false, false),
  ('acknowledge',        'acknowledged', 'acknowledged', 'low',  false, false),
  ('confirm',            'acknowledged', 'confirmed',    'high', true,  false),
  ('confirm',            'confirmed',    'confirmed',    'high', true,  false),
  ('reconcile',          'confirmed',    'reconciled',   'high', true,  false),
  ('record_mismatch',    'confirmed',    'mismatch',     'high', true,  false),
  ('resolve_mismatch',   'mismatch',     'reconciled',   'high', true,  false),
  ('waive',              'assessed',     'waived',       'high', true,  false),
  ('exempt',             'assessed',     'exempt',       'high', true,  false),
  ('close',              'reconciled',   'closed',       'high', true,  false),
  ('close',              'waived',       'closed',       'high', true,  false),
  ('close',              'exempt',       'closed',       'high', true,  false)
) AS t(trigger, from_state, to_state, risk_level, evidence_required, approval_required) ON true
WHERE sm.tenant_id IS NULL AND sm.entity_type = 'AffiliationFinancialObligation' AND sm.version = 1
ON CONFLICT (state_machine_id, from_state, trigger) DO NOTHING;

-- A6. Transition guard bindings --------------------------------------------------
INSERT INTO governance.transition_guard
  (transition_definition_id, guard_code, parameters, sort_order)
SELECT td.id, g.guard_code, '{}'::jsonb, g.sort_order
FROM governance.transition_definition td
JOIN governance.state_machine sm ON sm.id = td.state_machine_id
JOIN (VALUES
  -- trigger,           from_state,     guard_code,                       sort
  ('reconcile',        'confirmed',    'FINANCIAL_ACCOUNTING_CONFIRMED', 0),
  ('reconcile',        'confirmed',    'FINANCIAL_AMOUNTS_MATCH',        1),
  ('record_mismatch',  'confirmed',    'FINANCIAL_ACCOUNTING_CONFIRMED', 0),
  ('record_mismatch',  'confirmed',    'FINANCIAL_AMOUNTS_DIFFER',       1)
) AS g(trigger, from_state, guard_code, sort_order)
  ON g.trigger = td.trigger AND g.from_state = td.from_state
WHERE sm.tenant_id IS NULL AND sm.entity_type = 'AffiliationFinancialObligation' AND sm.version = 1
ON CONFLICT (transition_definition_id, guard_code) DO NOTHING;

-- A7. Bind AFFILIATION_FINANCIALLY_CLEARED to the affiliation ACTIVATE + REINSTATE ------
--   activate (approved -> active): after SEASON_IS_CURRENT (0), UNIQUE_ACTIVE (1) => sort 2.
--   reinstate (suspended -> active): after NO_OPEN_COMPLIANCE (0), REVIEWER (1),
--                                    UNIQUE_ACTIVE (2) => sort 3.
INSERT INTO governance.transition_guard
  (transition_definition_id, guard_code, parameters, sort_order)
SELECT td.id, g.guard_code, '{}'::jsonb, g.sort_order
FROM governance.transition_definition td
JOIN governance.state_machine sm ON sm.id = td.state_machine_id
JOIN (VALUES
  ('activate',  'approved',  'AFFILIATION_FINANCIALLY_CLEARED', 2),
  ('reinstate', 'suspended', 'AFFILIATION_FINANCIALLY_CLEARED', 3)
) AS g(trigger, from_state, guard_code, sort_order)
  ON g.trigger = td.trigger AND g.from_state = td.from_state
WHERE sm.tenant_id IS NULL AND sm.entity_type = 'AffiliationApplication' AND sm.version = 1
ON CONFLICT (transition_definition_id, guard_code) DO NOTHING;

-- =============================================================================
-- PART B — affiliation_finance domain schema (FINANCIAL FACTS; RLS FORCE)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS affiliation_finance;

-- -----------------------------------------------------------------------------
-- financial_obligation
--   The obligation HEAD: identity + the CURRENT assessed amount/currency/version. One row
--   per obligation. `affiliation_application_id` references an affiliation application in the
--   SAME tenant (enforced via tenant scoping + RLS; intentionally not a cross-schema DB FK so
--   tenant isolation stays the single mechanism). `subject_id` mirrors the affiliation subject
--   for scope queries. `blocking` marks whether the obligation blocks activation. Rows are
--   never deleted. Immutable-after-create: affiliation_application_id, subject_id, season,
--   obligation_type, assessed_by, created_at. The current amount/version are advanced ONLY by
--   a governed `revise_assessment` transition (append + head update in one governed txn).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation_finance.financial_obligation (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL,
  affiliation_application_id uuid NOT NULL,
  subject_id                uuid NOT NULL,
  season                    text NOT NULL,
  obligation_type           text NOT NULL
                              CHECK (obligation_type IN
                                ('affiliation_fee', 'assessment', 'levy', 'penalty', 'other')),
  assessment_basis          text NOT NULL,
  assessment_version        integer NOT NULL DEFAULT 1 CHECK (assessment_version >= 1),
  assessed_amount           numeric(14, 2) NOT NULL CHECK (assessed_amount > 0),
  currency                  char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  blocking                  boolean NOT NULL DEFAULT true,
  assessed_by               uuid NOT NULL,
  assessed_at               timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS financial_obligation_tenant_app_idx
  ON affiliation_finance.financial_obligation (tenant_id, affiliation_application_id);
CREATE INDEX IF NOT EXISTS financial_obligation_tenant_subject_season_idx
  ON affiliation_finance.financial_obligation (tenant_id, subject_id, season);

-- -----------------------------------------------------------------------------
-- obligation_assessment (APPEND-ONLY history of assessed amounts)
--   One row per assessment version (v1 = initial assessment; v2+ = revisions). Immutable:
--   a revision NEVER rewrites a prior row — it appends a new version and advances the head.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation_finance.obligation_assessment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  obligation_id uuid NOT NULL,
  version       integer NOT NULL CHECK (version >= 1),
  amount        numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency      char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  basis         text NOT NULL,
  reason        text,
  recorded_by   uuid NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, obligation_id, version)
);

CREATE INDEX IF NOT EXISTS obligation_assessment_tenant_obligation_idx
  ON affiliation_finance.obligation_assessment (tenant_id, obligation_id, version);

-- -----------------------------------------------------------------------------
-- obligation_external_event (provider acknowledgements + accounting confirmations)
--   Distinct KINDS with distinct authorities: 'provider_acknowledgement' (provider callback)
--   and 'accounting_confirmation' (accounting authority). `external_reference` is the
--   provider/accounting record id; UNIQUE per (obligation, kind, reference) so a duplicate
--   callback with the same reference cannot create a second row or silently overwrite an
--   existing one. `amount` is required for accounting confirmations (the confirmed amount).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation_finance.obligation_external_event (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  obligation_id       uuid NOT NULL,
  event_kind          text NOT NULL
                        CHECK (event_kind IN ('provider_acknowledgement', 'accounting_confirmation')),
  external_reference  text NOT NULL,
  amount              numeric(14, 2) CHECK (amount IS NULL OR amount > 0),
  currency            char(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  external_message_id text,
  recorded_by         uuid NOT NULL,
  occurred_at         timestamptz,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  -- Accounting confirmations MUST carry the confirmed amount (reconciliation input).
  CHECK (event_kind <> 'accounting_confirmation' OR amount IS NOT NULL),
  UNIQUE (tenant_id, obligation_id, event_kind, external_reference)
);

CREATE INDEX IF NOT EXISTS obligation_external_event_tenant_obligation_kind_idx
  ON affiliation_finance.obligation_external_event (tenant_id, obligation_id, event_kind, recorded_at);

-- -----------------------------------------------------------------------------
-- obligation_reconciliation (APPEND-ONLY reconciliation outcomes)
--   One row per reconciliation act. `outcome` = 'matched' (amounts equal),
--   'mismatch' (discrepancy detected), or 'resolved' (a prior mismatch resolved via the
--   governed resolution path). `discrepancy_amount` = confirmed - expected. Immutable.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation_finance.obligation_reconciliation (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  obligation_id      uuid NOT NULL,
  expected_amount    numeric(14, 2) NOT NULL,
  confirmed_amount   numeric(14, 2) NOT NULL,
  discrepancy_amount numeric(14, 2) NOT NULL,
  currency           char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  outcome            text NOT NULL CHECK (outcome IN ('matched', 'mismatch', 'resolved')),
  reason             text,
  recorded_by        uuid NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS obligation_reconciliation_tenant_obligation_idx
  ON affiliation_finance.obligation_reconciliation (tenant_id, obligation_id, recorded_at);

-- -----------------------------------------------------------------------------
-- obligation_clearance (authorized waiver / exemption grants)
--   A waiver or exemption is a DISTINCT authorized clearance — it is neither a payment nor a
--   reconciliation. One row per authorized clearance grant. Append-only.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation_finance.obligation_clearance (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  obligation_id  uuid NOT NULL,
  clearance_kind text NOT NULL CHECK (clearance_kind IN ('waiver', 'exemption')),
  reason         text,
  authorized_by  uuid NOT NULL,
  authorized_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS obligation_clearance_tenant_obligation_idx
  ON affiliation_finance.obligation_clearance (tenant_id, obligation_id);

-- =============================================================================
-- ROW LEVEL SECURITY (tenant-owned). The obligation head is mutable (amount/version/status
-- advance under governed transitions) -> SELECT/INSERT/UPDATE. History tables are append-only
-- -> SELECT/INSERT. Missing tenant context fails closed (governance.current_tenant_id()
-- raises). No DELETE policy anywhere.
-- =============================================================================
ALTER TABLE affiliation_finance.financial_obligation ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation_finance.financial_obligation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_obligation_select ON affiliation_finance.financial_obligation;
DROP POLICY IF EXISTS financial_obligation_insert ON affiliation_finance.financial_obligation;
DROP POLICY IF EXISTS financial_obligation_update ON affiliation_finance.financial_obligation;
CREATE POLICY financial_obligation_select ON affiliation_finance.financial_obligation
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY financial_obligation_insert ON affiliation_finance.financial_obligation
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY financial_obligation_update ON affiliation_finance.financial_obligation
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

ALTER TABLE affiliation_finance.obligation_assessment ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation_finance.obligation_assessment FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS obligation_assessment_select ON affiliation_finance.obligation_assessment;
DROP POLICY IF EXISTS obligation_assessment_insert ON affiliation_finance.obligation_assessment;
CREATE POLICY obligation_assessment_select ON affiliation_finance.obligation_assessment
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY obligation_assessment_insert ON affiliation_finance.obligation_assessment
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

ALTER TABLE affiliation_finance.obligation_external_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation_finance.obligation_external_event FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS obligation_external_event_select ON affiliation_finance.obligation_external_event;
DROP POLICY IF EXISTS obligation_external_event_insert ON affiliation_finance.obligation_external_event;
CREATE POLICY obligation_external_event_select ON affiliation_finance.obligation_external_event
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY obligation_external_event_insert ON affiliation_finance.obligation_external_event
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

ALTER TABLE affiliation_finance.obligation_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation_finance.obligation_reconciliation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS obligation_reconciliation_select ON affiliation_finance.obligation_reconciliation;
DROP POLICY IF EXISTS obligation_reconciliation_insert ON affiliation_finance.obligation_reconciliation;
CREATE POLICY obligation_reconciliation_select ON affiliation_finance.obligation_reconciliation
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY obligation_reconciliation_insert ON affiliation_finance.obligation_reconciliation
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

ALTER TABLE affiliation_finance.obligation_clearance ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation_finance.obligation_clearance FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS obligation_clearance_select ON affiliation_finance.obligation_clearance;
DROP POLICY IF EXISTS obligation_clearance_insert ON affiliation_finance.obligation_clearance;
CREATE POLICY obligation_clearance_select ON affiliation_finance.obligation_clearance
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY obligation_clearance_insert ON affiliation_finance.obligation_clearance
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
    GRANT USAGE ON SCHEMA affiliation_finance TO house_app;
    GRANT SELECT, INSERT, UPDATE ON affiliation_finance.financial_obligation TO house_app;
    GRANT SELECT, INSERT ON affiliation_finance.obligation_assessment TO house_app;
    GRANT SELECT, INSERT ON affiliation_finance.obligation_external_event TO house_app;
    GRANT SELECT, INSERT ON affiliation_finance.obligation_reconciliation TO house_app;
    GRANT SELECT, INSERT ON affiliation_finance.obligation_clearance TO house_app;
  END IF;
END$$;
