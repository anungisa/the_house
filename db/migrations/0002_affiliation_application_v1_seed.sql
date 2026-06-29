-- =============================================================================
-- Migration: 0002_affiliation_application_v1_seed
-- Seeds the global (tenant_id IS NULL) AffiliationApplication v1 state machine,
-- guard catalog, transitions, and guard bindings.
--
-- This is REQUIRED PLATFORM POLICY/CONFIG (not tenant data), so it lives in a
-- migration. It is idempotent (safe to re-run) via ON CONFLICT DO NOTHING.
--
-- NSO-GENERIC: 'AffiliationApplication' is a generic platform concept. No curling-
-- specific terms appear here.
-- =============================================================================

-- 1. Policy version --------------------------------------------------------------
INSERT INTO governance.policy_version (tenant_id, name, version, status, description)
VALUES (NULL, 'affiliation_core', 1, 'active',
        'AffiliationApplication v1 governance policy')
ON CONFLICT DO NOTHING;

-- 2. State machine (bound to the policy version) ---------------------------------
INSERT INTO governance.state_machine
  (tenant_id, policy_version_id, entity_type, name, version, status)
SELECT NULL, pv.id, 'AffiliationApplication', 'affiliation_application', 1, 'active'
FROM governance.policy_version pv
WHERE pv.tenant_id IS NULL AND pv.name = 'affiliation_core' AND pv.version = 1
ON CONFLICT DO NOTHING;

-- 3. State nodes -----------------------------------------------------------------
INSERT INTO governance.state_node
  (state_machine_id, name, is_initial, is_terminal, sort_order)
SELECT sm.id, n.name, n.is_initial, n.is_terminal, n.sort_order
FROM governance.state_machine sm
JOIN (VALUES
  ('draft',        true,  false, 0),
  ('submitted',    false, false, 1),
  ('under_review', false, false, 2),
  ('approved',     false, false, 3),
  ('rejected',     false, false, 4),
  ('active',       false, false, 5),
  ('suspended',    false, false, 6),
  ('revoked',      false, false, 7),
  ('closed',       false, false, 8),
  ('archived',     false, true,  9)
) AS n(name, is_initial, is_terminal, sort_order) ON true
WHERE sm.tenant_id IS NULL AND sm.entity_type = 'AffiliationApplication' AND sm.version = 1
ON CONFLICT (state_machine_id, name) DO NOTHING;

-- 4. Guard definitions -----------------------------------------------------------
INSERT INTO governance.guard_definition (code, description, handler_key)
VALUES
  ('AFFILIATION_REQUIRED_FIELDS_COMPLETE',
   'All required application fields are present.', 'AFFILIATION_REQUIRED_FIELDS_COMPLETE'),
  ('AFFILIATION_REQUIRED_DOCS_PRESENT',
   'All required supporting documents are attached.', 'AFFILIATION_REQUIRED_DOCS_PRESENT'),
  ('AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS',
   'No unresolved compliance obligations exist.', 'AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS'),
  ('AFFILIATION_FEES_PAID',
   'Applicable payment obligations are settled.', 'AFFILIATION_FEES_PAID'),
  ('SEASON_IS_CURRENT',
   'The application targets the current season.', 'SEASON_IS_CURRENT'),
  ('ACTOR_HAS_REVIEWER_SCOPE',
   'The actor holds reviewer scope for this entity.', 'ACTOR_HAS_REVIEWER_SCOPE')
ON CONFLICT (code) DO NOTHING;

-- 5. Transition definitions ------------------------------------------------------
INSERT INTO governance.transition_definition
  (tenant_id, state_machine_id, trigger, from_state, to_state,
   risk_level, evidence_required, approval_required)
SELECT NULL, sm.id, t.trigger, t.from_state, t.to_state,
       t.risk_level, t.evidence_required, t.approval_required
FROM governance.state_machine sm
JOIN (VALUES
  -- trigger,        from_state,     to_state,      risk,   evidence, approval
  ('submit',        'draft',        'submitted',   'low',  false, false),
  ('review_start',  'submitted',    'under_review','low',  false, false),
  ('approve',       'under_review', 'approved',    'high', true,  true),
  ('reject',        'under_review', 'rejected',    'high', true,  true),
  ('activate',      'approved',     'active',      'low',  false, false),
  ('suspend',       'active',       'suspended',   'high', true,  true),
  ('reinstate',     'suspended',    'active',      'high', true,  true),
  ('revoke',        'active',       'revoked',     'high', true,  true),
  ('revoke',        'suspended',    'revoked',     'high', true,  true),
  ('close',         'revoked',      'closed',      'high', true,  false),
  ('close',         'rejected',     'closed',      'high', true,  false),
  ('archive',       'closed',       'archived',    'high', true,  false)
) AS t(trigger, from_state, to_state, risk_level, evidence_required, approval_required) ON true
WHERE sm.tenant_id IS NULL AND sm.entity_type = 'AffiliationApplication' AND sm.version = 1
ON CONFLICT (state_machine_id, from_state, trigger) DO NOTHING;

-- 6. Transition guard bindings ---------------------------------------------------
INSERT INTO governance.transition_guard
  (transition_definition_id, guard_code, parameters, sort_order)
SELECT td.id, g.guard_code, '{}'::jsonb, g.sort_order
FROM governance.transition_definition td
JOIN governance.state_machine sm ON sm.id = td.state_machine_id
JOIN (VALUES
  -- trigger,       from_state,     guard_code,                              sort
  ('submit',       'draft',        'AFFILIATION_REQUIRED_FIELDS_COMPLETE',  0),
  ('submit',       'draft',        'AFFILIATION_REQUIRED_DOCS_PRESENT',     1),
  ('review_start', 'submitted',    'ACTOR_HAS_REVIEWER_SCOPE',              0),
  ('approve',      'under_review', 'AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS',  0),
  ('approve',      'under_review', 'AFFILIATION_FEES_PAID',                 1),
  ('approve',      'under_review', 'ACTOR_HAS_REVIEWER_SCOPE',              2),
  ('reject',       'under_review', 'ACTOR_HAS_REVIEWER_SCOPE',              0),
  ('activate',     'approved',     'SEASON_IS_CURRENT',                     0),
  ('suspend',      'active',       'ACTOR_HAS_REVIEWER_SCOPE',              0),
  ('reinstate',    'suspended',    'AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS',  0),
  ('reinstate',    'suspended',    'ACTOR_HAS_REVIEWER_SCOPE',              1),
  ('revoke',       'active',       'ACTOR_HAS_REVIEWER_SCOPE',              0),
  ('revoke',       'suspended',    'ACTOR_HAS_REVIEWER_SCOPE',              0),
  ('close',        'revoked',      'ACTOR_HAS_REVIEWER_SCOPE',              0),
  ('close',        'rejected',     'ACTOR_HAS_REVIEWER_SCOPE',              0),
  ('archive',      'closed',       'ACTOR_HAS_REVIEWER_SCOPE',              0)
) AS g(trigger, from_state, guard_code, sort_order)
  ON g.trigger = td.trigger AND g.from_state = td.from_state
WHERE sm.tenant_id IS NULL AND sm.entity_type = 'AffiliationApplication' AND sm.version = 1
ON CONFLICT (transition_definition_id, guard_code) DO NOTHING;
