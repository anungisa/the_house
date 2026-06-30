-- =============================================================================
-- Migration: 0006_workflow_execution_status
-- The House v2 — Approved-workflow transition EXECUTION audit columns (PRODUCTION DDL)
--
-- Purpose: support the governed execution path that runs a previously approval-required
-- transition exactly once, AFTER its review workflow has been approved. Execution is an
-- explicit, separate command — it is NEVER auto-invoked by the workflow decision endpoint.
--
-- The transition_request.status CHECK already permits 'executed' (see 0001), so NO status
-- domain change is required. This migration only adds APPEND-style audit columns recording
-- WHO executed the approved request, WHEN, and which immutable state_transition row the
-- execution produced. The review workflow_instance itself stays 'approved'; the consumed
-- marker is transition_request.status = 'executed'.
--
-- Additive + idempotent: all changes use IF NOT EXISTS so re-running is safe. No table
-- rebuilds, no data migration. transition_request already has UPDATE granted to the runtime
-- role (see 0001 grant guidance), so adding columns needs no new GRANT.
--
-- Requires PostgreSQL 15+ (consistent with prior migrations).
--
-- NSO-GENERIC: all column names are sport-agnostic. executed_by_user_id is `text` to match
-- the existing transition_request.actor_user_id column (NOT uuid).
-- =============================================================================

ALTER TABLE governance.transition_request
  ADD COLUMN IF NOT EXISTS executed_at timestamptz;

ALTER TABLE governance.transition_request
  ADD COLUMN IF NOT EXISTS executed_by_user_id text;

ALTER TABLE governance.transition_request
  ADD COLUMN IF NOT EXISTS execution_state_transition_id uuid
    REFERENCES governance.state_transition(id);
