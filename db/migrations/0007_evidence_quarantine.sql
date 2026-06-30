-- =============================================================================
-- Migration: 0007_evidence_quarantine
-- The House v2 — Asynchronous evidence QUARANTINE workflow (PRODUCTION DDL)
--
-- Purpose: turn a blocked malware-scan outcome into an auditable, tenant-scoped SECURITY
-- event WITHOUT storing the infected payload bytes and WITHOUT touching governed lifecycle
-- state. When an upload is rejected by the ingestion scan gate (infected, or error/skipped
-- when scanning is required), the platform records sanitized metadata here and enqueues an
-- outbox event (evidence.quarantine.recorded) for downstream security operations.
--
-- This is OPERATIONAL SECURITY METADATA, not lifecycle governance. Recording a quarantine
-- event NEVER:
--   - stores raw payload bytes (there is no payload column here, by design);
--   - creates governance.evidence_object rows;
--   - mutates governance.entity_state;
--   - approves/rejects an application or executes a workflow;
--   - calls GovernanceKernel.transition().
--
-- Requires PostgreSQL 15+.
--
-- NSO-GENERIC: all table/column names are sport-agnostic. Curling-specific terms
-- (PTSO, MA, CC, club, curler, bonspiel, ...) MUST NOT appear here.
--
-- RLS: this table is TENANT-OWNED -> ENABLE + FORCE Row-Level Security keyed on
-- governance.current_tenant_id() (defined in 0001; fails closed when app.tenant_id is unset).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- evidence_quarantine_event
--   One row per blocked/suspicious upload. Carries sanitized scan + identity metadata only.
--   No raw payload bytes, no threat signatures beyond a generic threat NAME, no tokens.
--   `scan_status` records WHY the upload was blocked; `quarantine_status` tracks the
--   operational lifecycle of the quarantine event itself (recorded -> reviewed -> ...).
-- -----------------------------------------------------------------------------
CREATE TABLE governance.evidence_quarantine_event (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  -- Optional reference to the governance evidence object id the caller intended to use.
  -- Stored as text (not a FK): a blocked upload never produces a governed evidence_object,
  -- and the caller-supplied id is free-form.
  evidence_object_id  text,
  source_filename     text,
  content_type        text NOT NULL,
  size_bytes          integer NOT NULL,
  -- SHA-256 hex digest of the rejected payload (lets security ops correlate without bytes).
  content_hash        text NOT NULL,
  scan_status         text NOT NULL
                        CHECK (scan_status IN ('infected', 'error', 'skipped')),
  scanner             text NOT NULL,
  signature_version   text,
  threat_name         text,
  reason              text,
  quarantine_status   text NOT NULL DEFAULT 'recorded'
                        CHECK (quarantine_status IN
                          ('recorded', 'notified', 'reviewed', 'released', 'discarded')),
  upload_actor_user_id text,
  request_id          text,
  correlation_id      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX evidence_quarantine_tenant_time_idx
  ON governance.evidence_quarantine_event (tenant_id, created_at DESC);
CREATE INDEX evidence_quarantine_tenant_status_idx
  ON governance.evidence_quarantine_event (tenant_id, quarantine_status);
CREATE INDEX evidence_quarantine_tenant_scan_status_idx
  ON governance.evidence_quarantine_event (tenant_id, scan_status);
CREATE INDEX evidence_quarantine_tenant_hash_idx
  ON governance.evidence_quarantine_event (tenant_id, content_hash);

-- =============================================================================
-- ROW LEVEL SECURITY (tenant-owned). The table is mutable (quarantine_status may advance
-- in a future release/discard pass) -> SELECT/INSERT/UPDATE. Missing tenant context fails
-- closed (governance.current_tenant_id() raises). No DELETE policy anywhere.
-- =============================================================================
ALTER TABLE governance.evidence_quarantine_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.evidence_quarantine_event FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_quarantine_event_select ON governance.evidence_quarantine_event
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY evidence_quarantine_event_insert ON governance.evidence_quarantine_event
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY evidence_quarantine_event_update ON governance.evidence_quarantine_event
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- =============================================================================
-- APPLICATION ROLE GRANTS (least privilege)
-- Conditionally granted to the non-superuser runtime role `house_app` when it exists. The
-- evidence HTTP path inserts a quarantine row and enqueues the outbox event in the SAME
-- transaction (both already covered: outbox_message grants come from 0001). No DELETE, no
-- superuser/BYPASSRLS requirement — RLS provides tenant isolation.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'house_app') THEN
    GRANT USAGE ON SCHEMA governance TO house_app;
    GRANT SELECT, INSERT, UPDATE ON governance.evidence_quarantine_event TO house_app;
  END IF;
END$$;
