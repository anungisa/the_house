-- =============================================================================
-- Migration: 0012_affiliation_unique_active_scope
-- Adds the AFFILIATION_UNIQUE_ACTIVE_FOR_SCOPE guard and binds it to the two
-- transitions that grant ACTIVE standing (`activate`, `reinstate`).
--
-- Purpose: enforce the "exactly-once activation" business invariant — at most one
-- AffiliationApplication may hold ACTIVE standing for a given (tenant, affiliation
-- subject, season). The subject is the generic COALESCE(scope_id,
-- local_organization_id, organization_id). The guard reads authoritative lifecycle
-- state from governance.entity_state (kernel-owned); it performs no mutation.
--
-- This is REQUIRED PLATFORM POLICY/CONFIG (not tenant data), so it lives in a
-- migration and is idempotent (safe to re-run) via ON CONFLICT DO NOTHING.
--
-- NSO-GENERIC: 'AffiliationApplication' and the subject columns are generic platform
-- concepts. No sport-specific terms appear here.
-- =============================================================================

-- 1. Guard definition ------------------------------------------------------------
INSERT INTO governance.guard_definition (code, description, handler_key)
VALUES
  ('AFFILIATION_UNIQUE_ACTIVE_FOR_SCOPE',
   'No other application holds active standing for the same organization scope and season.',
   'AFFILIATION_UNIQUE_ACTIVE_FOR_SCOPE')
ON CONFLICT (code) DO NOTHING;

-- 2. Transition guard bindings ---------------------------------------------------
--    activate (approved -> active): after SEASON_IS_CURRENT (sort 0), sort 1.
--    reinstate (suspended -> active): after the existing two guards (sort 0,1), sort 2.
INSERT INTO governance.transition_guard
  (transition_definition_id, guard_code, parameters, sort_order)
SELECT td.id, g.guard_code, '{}'::jsonb, g.sort_order
FROM governance.transition_definition td
JOIN governance.state_machine sm ON sm.id = td.state_machine_id
JOIN (VALUES
  -- trigger,    from_state,  guard_code,                            sort
  ('activate',  'approved',  'AFFILIATION_UNIQUE_ACTIVE_FOR_SCOPE', 1),
  ('reinstate', 'suspended', 'AFFILIATION_UNIQUE_ACTIVE_FOR_SCOPE', 2)
) AS g(trigger, from_state, guard_code, sort_order)
  ON g.trigger = td.trigger AND g.from_state = td.from_state
WHERE sm.tenant_id IS NULL AND sm.entity_type = 'AffiliationApplication' AND sm.version = 1
ON CONFLICT (transition_definition_id, guard_code) DO NOTHING;
