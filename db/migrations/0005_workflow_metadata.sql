-- =============================================================================
-- Migration: 0005_workflow_metadata
-- The House v2 — Two-tier review WORKFLOW METADATA (PRODUCTION DDL)
--
-- Purpose: represent multi-step review routing (regional review -> national review)
-- as METADATA attached to an approval-required governance.transition_request — NOT as
-- new lifecycle states. The AffiliationApplication v1 FSM is unchanged: there is no
-- regional_review / national_review / more_info_needed state. Review tiers, reviewer
-- decisions, and required sign-offs live here, around the transition request.
--
-- These tables are created and linked by the Governance Kernel inside the SAME
-- transaction that creates the transition_request (atomic). Decisions are recorded later
-- by the workflow decision service. Recording a decision NEVER mutates governance
-- entity_state and NEVER executes the pending transition — execution remains the
-- exclusive job of GovernanceKernel.transition() in a future pass.
--
-- Requires PostgreSQL 15+.
--
-- NSO-GENERIC: all table/column names are sport-agnostic. Curling-specific terms
-- (PTSO, MA, CC, club, curler, bonspiel, ...) MUST NOT appear here. Review tiers use the
-- generic vocabulary regional_review / national_review only. Generic organizational scope
-- only: scope_type, scope_id, *_organization_id.
--
-- RLS: every workflow table is TENANT-OWNED -> ENABLE + FORCE Row-Level Security keyed on
-- governance.current_tenant_id() (defined in 0001; fails closed when app.tenant_id is unset).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. workflow_instance
--    One review workflow per approval-required transition_request. Status tracks the
--    aggregate review outcome; current_step_code points at the step awaiting a decision.
-- -----------------------------------------------------------------------------
CREATE TABLE governance.workflow_instance (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  transition_request_id uuid NOT NULL
                          REFERENCES governance.transition_request(id) ON DELETE CASCADE,
  entity_type           text NOT NULL,
  entity_id             uuid NOT NULL,
  workflow_type         text NOT NULL,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  current_step_code     text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- At most one workflow per transition request (idempotent kernel creation).
  CONSTRAINT workflow_instance_request_unique UNIQUE (tenant_id, transition_request_id)
);

CREATE INDEX workflow_instance_tenant_request_idx
  ON governance.workflow_instance (tenant_id, transition_request_id);
CREATE INDEX workflow_instance_tenant_entity_idx
  ON governance.workflow_instance (tenant_id, entity_type, entity_id);
CREATE INDEX workflow_instance_tenant_status_idx
  ON governance.workflow_instance (tenant_id, status);

-- -----------------------------------------------------------------------------
-- 2. workflow_step
--    Ordered review steps for an instance. Each step carries its generic review tier,
--    optional generic assignment (scope/role), and its decision outcome.
-- -----------------------------------------------------------------------------
CREATE TABLE governance.workflow_step (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  workflow_instance_id uuid NOT NULL
                         REFERENCES governance.workflow_instance(id) ON DELETE CASCADE,
  step_code            text NOT NULL,
  step_order           integer NOT NULL,
  review_tier          text NOT NULL
                         CHECK (review_tier IN ('regional_review', 'national_review')),
  required             boolean NOT NULL DEFAULT true,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected', 'skipped')),
  assigned_scope_type  text,
  assigned_scope_id    uuid,
  assigned_role_key    text,
  decided_by_user_id   uuid,
  decided_at           timestamptz,
  decision_reason      text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- Step codes are unique within a workflow instance (kernel plan has distinct codes).
  CONSTRAINT workflow_step_code_unique UNIQUE (tenant_id, workflow_instance_id, step_code)
);

CREATE INDEX workflow_step_tenant_instance_idx
  ON governance.workflow_step (tenant_id, workflow_instance_id);
CREATE INDEX workflow_step_tenant_status_idx
  ON governance.workflow_step (tenant_id, status);

-- -----------------------------------------------------------------------------
-- 3. workflow_decision  (append-only audit of each recorded step decision)
-- -----------------------------------------------------------------------------
CREATE TABLE governance.workflow_decision (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  workflow_step_id   uuid NOT NULL
                       REFERENCES governance.workflow_step(id) ON DELETE CASCADE,
  decision           text NOT NULL CHECK (decision IN ('approve', 'reject')),
  decided_by_user_id uuid NOT NULL,
  reason             text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workflow_decision_tenant_step_idx
  ON governance.workflow_decision (tenant_id, workflow_step_id);

-- =============================================================================
-- ROW LEVEL SECURITY (all workflow tables are tenant-owned)
-- workflow_instance + workflow_step are mutable (status/current step/decision update) ->
-- SELECT/INSERT/UPDATE. workflow_decision is append-only -> SELECT/INSERT only.
-- Missing tenant context fails closed (governance.current_tenant_id() raises). No DELETE.
-- =============================================================================

-- workflow_instance (mutable)
ALTER TABLE governance.workflow_instance ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.workflow_instance FORCE ROW LEVEL SECURITY;
CREATE POLICY workflow_instance_select ON governance.workflow_instance
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY workflow_instance_insert ON governance.workflow_instance
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY workflow_instance_update ON governance.workflow_instance
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- workflow_step (mutable)
ALTER TABLE governance.workflow_step ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.workflow_step FORCE ROW LEVEL SECURITY;
CREATE POLICY workflow_step_select ON governance.workflow_step
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY workflow_step_insert ON governance.workflow_step
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY workflow_step_update ON governance.workflow_step
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- workflow_decision (append-only)
ALTER TABLE governance.workflow_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.workflow_decision FORCE ROW LEVEL SECURITY;
CREATE POLICY workflow_decision_select ON governance.workflow_decision
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY workflow_decision_insert ON governance.workflow_decision
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

-- =============================================================================
-- APPLICATION ROLE GRANTS (least privilege)
-- Conditionally granted to the non-superuser runtime role `house_app` when it exists.
-- The Governance Kernel creates instance+steps (INSERT) atomically with the request; the
-- decision service updates instance/step and appends decisions (INSERT/UPDATE). No DELETE,
-- no superuser/BYPASSRLS requirement — RLS provides tenant isolation.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'house_app') THEN
    GRANT USAGE ON SCHEMA governance TO house_app;
    GRANT SELECT, INSERT, UPDATE ON governance.workflow_instance TO house_app;
    GRANT SELECT, INSERT, UPDATE ON governance.workflow_step     TO house_app;
    GRANT SELECT, INSERT         ON governance.workflow_decision TO house_app;
  END IF;
END$$;
