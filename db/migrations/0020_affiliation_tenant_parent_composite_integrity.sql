-- =============================================================================
-- Migration: 0020_affiliation_tenant_parent_composite_integrity
-- The House v2 — affiliation tenant-parent composite referential integrity hardening
-- =============================================================================
--
-- WHY THIS EXISTS
--   Several affiliation-owned child tables historically referenced their parent by ID only
--   (`... REFERENCES parent(id)`) while carrying `tenant_id` separately. RLS keeps tenant reads/
--   writes scoped, but RLS alone is not a physical tenant-parent equality guarantee if a bypassing
--   path/regression/race writes mismatched tenant/application pairs.
--
--   This migration adds composite same-tenant parent FKs where the relationship is a legitimate
--   physical boundary and parent composite unique keys already exist. It also adds internal
--   same-tenant parent FKs for finance and standing child history tables that previously had no
--   physical parent FK.
--
-- PRE-FLIGHT (FAIL CLOSED)
--   Before adding each composite FK, this migration checks for pre-existing mismatches and fails
--   closed with a clear exception. It never reassigns, repairs, or deletes data.
--
-- DELIBERATE NON-FK RELATIONSHIPS (kept by design)
--   1) affiliation_finance.financial_obligation.affiliation_application_id
--      -> affiliation.affiliation_application(id)
--   2) affiliation_standing.affiliation_standing.affiliation_application_id
--      -> affiliation.affiliation_application(id)
--   3) affiliation_standing.standing_projection.affiliation_application_id
--      -> affiliation.affiliation_application(id)
--
--   These are intentional CROSS-SCHEMA boundaries that currently rely on explicit domain checks +
--   tenant-scoped governed transitions rather than cross-schema physical FKs. They are not changed
--   here.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM affiliation.application_document c
      LEFT JOIN affiliation.affiliation_application p
        ON p.id = c.application_id
     WHERE p.id IS NULL OR p.tenant_id <> c.tenant_id
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: affiliation.application_document contains tenant/application mismatches or dangling parents.';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM affiliation.compliance_flag c
      LEFT JOIN affiliation.affiliation_application p
        ON p.id = c.application_id
     WHERE p.id IS NULL OR p.tenant_id <> c.tenant_id
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: affiliation.compliance_flag contains tenant/application mismatches or dangling parents.';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM affiliation.payment_obligation c
      LEFT JOIN affiliation.affiliation_application p
        ON p.id = c.application_id
     WHERE p.id IS NULL OR p.tenant_id <> c.tenant_id
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: affiliation.payment_obligation contains tenant/application mismatches or dangling parents.';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM affiliation.application_draft c
      LEFT JOIN affiliation.affiliation_application p
        ON p.id = c.application_id
     WHERE p.id IS NULL OR p.tenant_id <> c.tenant_id
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: affiliation.application_draft contains tenant/application mismatches or dangling parents.';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM affiliation.application_requirement c
      LEFT JOIN affiliation.affiliation_application p
        ON p.id = c.application_id
     WHERE p.id IS NULL OR p.tenant_id <> c.tenant_id
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: affiliation.application_requirement contains tenant/application mismatches or dangling parents.';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM affiliation.draft_response c
      LEFT JOIN affiliation.affiliation_application p
        ON p.id = c.application_id
     WHERE p.id IS NULL OR p.tenant_id <> c.tenant_id
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: affiliation.draft_response contains tenant/application mismatches or dangling parents.';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM affiliation.draft_evidence_link c
      LEFT JOIN affiliation.affiliation_application p
        ON p.id = c.application_id
     WHERE p.id IS NULL OR p.tenant_id <> c.tenant_id
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: affiliation.draft_evidence_link contains tenant/application mismatches or dangling parents.';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM affiliation.draft_change_event c
      LEFT JOIN affiliation.affiliation_application p
        ON p.id = c.application_id
     WHERE p.id IS NULL OR p.tenant_id <> c.tenant_id
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: affiliation.draft_change_event contains tenant/application mismatches or dangling parents.';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM affiliation_finance.obligation_assessment c
      LEFT JOIN affiliation_finance.financial_obligation p
        ON p.id = c.obligation_id
     WHERE p.id IS NULL OR p.tenant_id <> c.tenant_id
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: affiliation_finance.obligation_assessment contains tenant/obligation mismatches or dangling parents.';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM affiliation_finance.obligation_external_event c
      LEFT JOIN affiliation_finance.financial_obligation p
        ON p.id = c.obligation_id
     WHERE p.id IS NULL OR p.tenant_id <> c.tenant_id
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: affiliation_finance.obligation_external_event contains tenant/obligation mismatches or dangling parents.';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM affiliation_finance.obligation_reconciliation c
      LEFT JOIN affiliation_finance.financial_obligation p
        ON p.id = c.obligation_id
     WHERE p.id IS NULL OR p.tenant_id <> c.tenant_id
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: affiliation_finance.obligation_reconciliation contains tenant/obligation mismatches or dangling parents.';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM affiliation_finance.obligation_clearance c
      LEFT JOIN affiliation_finance.financial_obligation p
        ON p.id = c.obligation_id
     WHERE p.id IS NULL OR p.tenant_id <> c.tenant_id
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: affiliation_finance.obligation_clearance contains tenant/obligation mismatches or dangling parents.';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM affiliation_standing.standing_period c
      LEFT JOIN affiliation_standing.affiliation_standing p
        ON p.id = c.standing_id
     WHERE p.id IS NULL OR p.tenant_id <> c.tenant_id
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: affiliation_standing.standing_period contains tenant/standing mismatches or dangling parents.';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM affiliation_standing.standing_event c
      LEFT JOIN affiliation_standing.affiliation_standing p
        ON p.id = c.standing_id
     WHERE p.id IS NULL OR p.tenant_id <> c.tenant_id
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: affiliation_standing.standing_event contains tenant/standing mismatches or dangling parents.';
  END IF;
END$$;

ALTER TABLE affiliation.application_document
  ADD CONSTRAINT application_document_application_tenant_fk
  FOREIGN KEY (application_id, tenant_id)
  REFERENCES affiliation.affiliation_application(id, tenant_id);

ALTER TABLE affiliation.compliance_flag
  ADD CONSTRAINT compliance_flag_application_tenant_fk
  FOREIGN KEY (application_id, tenant_id)
  REFERENCES affiliation.affiliation_application(id, tenant_id);

ALTER TABLE affiliation.payment_obligation
  ADD CONSTRAINT payment_obligation_application_tenant_fk
  FOREIGN KEY (application_id, tenant_id)
  REFERENCES affiliation.affiliation_application(id, tenant_id);

ALTER TABLE affiliation.application_draft
  ADD CONSTRAINT application_draft_application_tenant_fk
  FOREIGN KEY (application_id, tenant_id)
  REFERENCES affiliation.affiliation_application(id, tenant_id);

ALTER TABLE affiliation.application_requirement
  ADD CONSTRAINT application_requirement_application_tenant_fk
  FOREIGN KEY (application_id, tenant_id)
  REFERENCES affiliation.affiliation_application(id, tenant_id);

ALTER TABLE affiliation.draft_response
  ADD CONSTRAINT draft_response_application_tenant_fk
  FOREIGN KEY (application_id, tenant_id)
  REFERENCES affiliation.affiliation_application(id, tenant_id);

ALTER TABLE affiliation.draft_evidence_link
  ADD CONSTRAINT draft_evidence_link_application_tenant_fk
  FOREIGN KEY (application_id, tenant_id)
  REFERENCES affiliation.affiliation_application(id, tenant_id);

ALTER TABLE affiliation.draft_change_event
  ADD CONSTRAINT draft_change_event_application_tenant_fk
  FOREIGN KEY (application_id, tenant_id)
  REFERENCES affiliation.affiliation_application(id, tenant_id);

ALTER TABLE affiliation_finance.obligation_assessment
  ADD CONSTRAINT obligation_assessment_obligation_tenant_fk
  FOREIGN KEY (obligation_id, tenant_id)
  REFERENCES affiliation_finance.financial_obligation(id, tenant_id);

ALTER TABLE affiliation_finance.obligation_external_event
  ADD CONSTRAINT obligation_external_event_obligation_tenant_fk
  FOREIGN KEY (obligation_id, tenant_id)
  REFERENCES affiliation_finance.financial_obligation(id, tenant_id);

ALTER TABLE affiliation_finance.obligation_reconciliation
  ADD CONSTRAINT obligation_reconciliation_obligation_tenant_fk
  FOREIGN KEY (obligation_id, tenant_id)
  REFERENCES affiliation_finance.financial_obligation(id, tenant_id);

ALTER TABLE affiliation_finance.obligation_clearance
  ADD CONSTRAINT obligation_clearance_obligation_tenant_fk
  FOREIGN KEY (obligation_id, tenant_id)
  REFERENCES affiliation_finance.financial_obligation(id, tenant_id);

ALTER TABLE affiliation_standing.standing_period
  ADD CONSTRAINT standing_period_standing_tenant_fk
  FOREIGN KEY (standing_id, tenant_id)
  REFERENCES affiliation_standing.affiliation_standing(id, tenant_id);

ALTER TABLE affiliation_standing.standing_event
  ADD CONSTRAINT standing_event_standing_tenant_fk
  FOREIGN KEY (standing_id, tenant_id)
  REFERENCES affiliation_standing.affiliation_standing(id, tenant_id);
