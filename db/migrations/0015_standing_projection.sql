-- =============================================================================
-- Migration: 0015_standing_projection
-- The House v2 — activation → standing projection (idempotent, reconcilable at-least-once)
-- =============================================================================
--
-- WHY THIS EXISTS
--   When an AffiliationApplication is ACTIVATED, the Governance Kernel enqueues a transactional
--   outbox event (`AffiliationApplication.activate`) INSIDE the same governed transaction. A
--   downstream PROJECTION establishes the corresponding governed AffiliationStanding by requesting
--   the standing `open` transition through the kernel. That projection is ASYNCHRONOUS and
--   AT-LEAST-ONCE: activation stays committed even if the standing projection is delayed, retried,
--   or briefly duplicated.
--
--   This table is the projection's own reconcilable bookkeeping — NOT a second source of truth for
--   governed state. It records, per activated application, the deterministic standing identity that
--   was (or will be) opened, the projection status, retry accounting, and the last error, so
--   support/reconciliation can see every activation that has not yet produced a standing and why.
--
-- IDEMPOTENCY / NO DUPLICATION
--   * One projection row per (tenant_id, affiliation_application_id) — UNIQUE. A replayed or
--     duplicated activation event upserts the SAME row; it never creates a second.
--   * `standing_id` is DETERMINISTIC (UUID v5 of tenant + subject + season, computed in the app),
--     so every replay resolves to the SAME standing identity. Combined with the kernel's own
--     idempotency (stable idempotency key) and the exactly-once activation serialization, a
--     duplicate delivery cannot create a second standing.
--   * This table NEVER mutates governed state. The standing itself is opened ONLY through the
--     Governance Kernel (governance.entity_state + journal + audit + evidence + outbox), in a
--     separate per-tenant governed transaction.
--
-- Requires PostgreSQL 15+ and the affiliation_standing schema (migration 0014).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- standing_projection
--   Reconcilable projection bookkeeping mapping an ACTIVATED application → its governed standing.
--   `status` = pending (not yet opened / retry scheduled) | projected (standing opened) |
--   failed (governed rejection or retries exhausted; visible to reconciliation, never auto-retried).
--   Immutable-after-create: affiliation_application_id, subject_id, season, standing_id.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliation_standing.standing_projection (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL,
  affiliation_application_id uuid NOT NULL,
  subject_id                 uuid NOT NULL,
  season                     text NOT NULL,
  standing_id                uuid NOT NULL,
  status                     text NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'projected', 'failed')),
  attempts                   integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at            timestamptz NOT NULL DEFAULT now(),
  last_error                 text,
  state_transition_id        uuid,
  correlation_id             text,
  causation_id               text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  projected_at               timestamptz,
  UNIQUE (tenant_id, id),
  -- One projection per activated application: the idempotency anchor for duplicate delivery.
  UNIQUE (tenant_id, affiliation_application_id)
);

-- Reconciliation / worker due-scan: unreconciled rows ordered by when they are next due.
CREATE INDEX IF NOT EXISTS standing_projection_status_due_idx
  ON affiliation_standing.standing_projection (tenant_id, status, next_attempt_at);

-- =============================================================================
-- ROW LEVEL SECURITY (tenant-owned). The projection worker RECORDS outcomes per-tenant (it knows
-- the tenant from cross-tenant discovery below), and reconciliation reads are tenant-scoped ->
-- SELECT/INSERT/UPDATE. Missing tenant context fails closed (governance.current_tenant_id()
-- raises). No DELETE policy — projection rows remain for reconciliation/triage.
-- =============================================================================
ALTER TABLE affiliation_standing.standing_projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation_standing.standing_projection FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS standing_projection_select ON affiliation_standing.standing_projection;
DROP POLICY IF EXISTS standing_projection_insert ON affiliation_standing.standing_projection;
DROP POLICY IF EXISTS standing_projection_update ON affiliation_standing.standing_projection;
CREATE POLICY standing_projection_select ON affiliation_standing.standing_projection
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY standing_projection_insert ON affiliation_standing.standing_projection
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY standing_projection_update ON affiliation_standing.standing_projection
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- -----------------------------------------------------------------------------
-- list_pending_standing_activations: CROSS-TENANT discovery of activation events that still need
-- a standing projection. Mirrors the outbox worker's cross-tenant pattern (see 0004): the
-- projection worker runs across ALL tenants with NO tenant context, so a non-BYPASSRLS app role
-- cannot read tenant-owned rows directly. This SECURITY DEFINER function is the NARROW, EXPLICIT,
-- READ-ONLY surface that returns only the fields the projection needs.
--
-- It joins the activation outbox event to its application to resolve the affiliation SUBJECT
-- (COALESCE(scope_id, local_organization_id, organization_id)) and season — the SAME subject
-- definition the affiliation guards/serialization use — and LEFT JOINs the projection so it
-- returns rows that have NO projection yet OR a 'pending' projection now due. It never writes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION affiliation_standing.list_pending_standing_activations(p_limit integer)
RETURNS TABLE (
  tenant_id                  uuid,
  affiliation_application_id uuid,
  subject_id                 uuid,
  season                     text,
  state_transition_id        uuid,
  correlation_id             text,
  causation_id               text,
  attempts                   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = affiliation_standing, affiliation, governance, pg_catalog
AS $$
  SELECT
    o.tenant_id,
    (o.payload->>'entityId')::uuid                                   AS affiliation_application_id,
    COALESCE(a.scope_id, a.local_organization_id, a.organization_id) AS subject_id,
    a.season_id                                                      AS season,
    NULLIF(o.payload->>'stateTransitionId', '')::uuid               AS state_transition_id,
    o.correlation_id,
    o.causation_id,
    COALESCE(p.attempts, 0)                                          AS attempts
  FROM governance.outbox_message o
  JOIN affiliation.affiliation_application a
    ON a.tenant_id = o.tenant_id
   AND a.id = (o.payload->>'entityId')::uuid
  LEFT JOIN affiliation_standing.standing_projection p
    ON p.tenant_id = o.tenant_id
   AND p.affiliation_application_id = a.id
  WHERE o.message_type = 'AffiliationApplication.activate'
    AND COALESCE(a.scope_id, a.local_organization_id, a.organization_id) IS NOT NULL
    AND (p.id IS NULL OR (p.status = 'pending' AND p.next_attempt_at <= now()))
  ORDER BY o.created_at ASC
  LIMIT p_limit;
$$;

-- =============================================================================
-- LOCK DOWN EXECUTE: this is a cross-tenant operational function, NOT for PUBLIC.
-- =============================================================================
REVOKE ALL ON FUNCTION affiliation_standing.list_pending_standing_activations(integer) FROM PUBLIC;

-- =============================================================================
-- APPLICATION ROLE GRANTS (least privilege). Conditionally granted to the non-superuser runtime
-- role `house_app` when it exists. The projection worker connects as the app role: it discovers
-- events cross-tenant via the SECURITY DEFINER function (which runs as owner), then records the
-- projection outcome and opens the standing per-tenant under RLS. No DELETE.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'house_app') THEN
    GRANT SELECT, INSERT, UPDATE ON affiliation_standing.standing_projection TO house_app;
    GRANT EXECUTE ON FUNCTION affiliation_standing.list_pending_standing_activations(integer)
      TO house_app;
  END IF;
END$$;
