-- =============================================================================
-- Migration: 0008_evidence_quarantine_disposition
-- The House v2 — Evidence quarantine REVIEW / DISPOSITION metadata (PRODUCTION DDL)
--
-- Purpose: let an authorized SECURITY OPERATOR disposition an existing quarantine event
-- (mark it reviewed / released / discarded) and record who did so and why. This is purely
-- ADDITIVE operational-security metadata on the existing governance.evidence_quarantine_event
-- table (created in 0007). It does NOT:
--   - store raw payload bytes (there is still no payload column, by design);
--   - create governance.evidence_object rows;
--   - mutate governance.entity_state;
--   - approve/reject an application or execute a workflow;
--   - call GovernanceKernel.transition().
--
-- "Released" means a security operator dispositioned the event as released / false-positive /
-- acceptable METADATA. Because the infected bytes were never retained, releasing an event NEVER
-- restores or creates an evidence upload; a still-needed document must be re-uploaded through
-- the normal evidence path and re-scanned.
--
-- The quarantine_status CHECK already admits 'reviewed' / 'released' / 'discarded' (0007), so
-- no constraint change is required here — only new columns.
--
-- Requires PostgreSQL 15+.
--
-- NSO-GENERIC: all column names are sport-agnostic. Curling-specific terms (PTSO, MA, CC,
-- club, curler, bonspiel, ...) MUST NOT appear here.
--
-- RLS: the table already has ENABLE + FORCE Row-Level Security with SELECT/INSERT/UPDATE
-- policies keyed on governance.current_tenant_id() (0007). Disposition is an UPDATE, already
-- covered by the existing update policy + the existing house_app UPDATE grant — this migration
-- adds NO new policy and NO new grant, and does NOT weaken RLS.
-- =============================================================================

ALTER TABLE governance.evidence_quarantine_event
  -- The security operator who recorded the disposition (NOT the original uploader).
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id          text,
  -- When the disposition was recorded.
  ADD COLUMN IF NOT EXISTS reviewed_at                  timestamptz,
  -- Free-text operator justification for the disposition (sanitized; no payload bytes).
  ADD COLUMN IF NOT EXISTS disposition_reason           text,
  -- The outbox message id emitted for the most recent disposition (transactional outbox).
  ADD COLUMN IF NOT EXISTS disposition_outbox_message_id uuid;
