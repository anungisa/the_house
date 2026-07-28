-- The House v2 — immutable affiliation submissions and controlled correction metadata.
--
-- A correction request is NOT a governed AffiliationApplication lifecycle state. The governed
-- application remains submitted/under review. An open request authorizes only the recorded
-- requirement scope; corrected resubmission appends a new immutable snapshot and resolves the
-- request exactly once.

ALTER TABLE affiliation.affiliation_application
  ADD CONSTRAINT affiliation_application_id_tenant_unique UNIQUE (id, tenant_id);

UPDATE governance.transition_definition td
   SET evidence_required = true
  FROM governance.state_machine sm
 WHERE td.state_machine_id = sm.id
   AND sm.tenant_id IS NULL
   AND sm.entity_type = 'AffiliationApplication'
   AND sm.version = 1
   AND td.trigger = 'submit'
   AND td.from_state = 'draft';

CREATE TABLE affiliation.submission_snapshot (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  application_id        uuid NOT NULL,
  sequence              integer NOT NULL CHECK (sequence > 0),
  source_draft_version  integer NOT NULL CHECK (source_draft_version > 0),
  idempotency_key       text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  state_transition_id   uuid,
  snapshot              jsonb NOT NULL,
  submitted_by          text NOT NULL CHECK (btrim(submitted_by) <> ''),
  submitted_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submission_snapshot_application_fk
    FOREIGN KEY (application_id, tenant_id)
    REFERENCES affiliation.affiliation_application(id, tenant_id),
  CONSTRAINT submission_snapshot_transition_fk
    FOREIGN KEY (state_transition_id)
    REFERENCES governance.state_transition(id),
  CONSTRAINT submission_snapshot_sequence_unique
    UNIQUE (tenant_id, application_id, sequence),
  CONSTRAINT submission_snapshot_idempotency_unique
    UNIQUE (tenant_id, application_id, idempotency_key)
);

CREATE INDEX submission_snapshot_application_idx
  ON affiliation.submission_snapshot (tenant_id, application_id, sequence DESC);

ALTER TABLE affiliation.submission_snapshot
  ADD CONSTRAINT submission_snapshot_id_tenant_unique UNIQUE (id, tenant_id);

CREATE TABLE affiliation.correction_request (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  application_id        uuid NOT NULL,
  status                text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'resolved', 'withdrawn')),
  requirement_codes     text[] NOT NULL CHECK (cardinality(requirement_codes) > 0),
  reasons               jsonb NOT NULL,
  opened_by             text NOT NULL CHECK (btrim(opened_by) <> ''),
  opened_at             timestamptz NOT NULL DEFAULT now(),
  resolved_by           text,
  resolved_at           timestamptz,
  resolution_snapshot_id uuid,
  CONSTRAINT correction_request_application_fk
    FOREIGN KEY (application_id, tenant_id)
    REFERENCES affiliation.affiliation_application(id, tenant_id),
  CONSTRAINT correction_request_resolution_fk
    FOREIGN KEY (resolution_snapshot_id, tenant_id)
    REFERENCES affiliation.submission_snapshot(id, tenant_id),
  CONSTRAINT correction_request_resolution_shape_ck CHECK (
    (status = 'open' AND resolved_by IS NULL AND resolved_at IS NULL
      AND resolution_snapshot_id IS NULL)
    OR
    (status IN ('resolved', 'withdrawn') AND resolved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX correction_request_one_open_per_application_idx
  ON affiliation.correction_request (tenant_id, application_id)
  WHERE status = 'open';

ALTER TABLE affiliation.correction_request
  ADD CONSTRAINT correction_request_id_tenant_unique UNIQUE (id, tenant_id);

CREATE TABLE affiliation.correction_event (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  correction_request_id uuid NOT NULL,
  event_type            text NOT NULL CHECK (event_type IN ('opened', 'resolved', 'withdrawn')),
  actor                 text NOT NULL CHECK (btrim(actor) <> ''),
  detail                jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT correction_event_request_fk
    FOREIGN KEY (correction_request_id, tenant_id)
    REFERENCES affiliation.correction_request(id, tenant_id)
);

ALTER TABLE affiliation.submission_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.submission_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE affiliation.correction_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.correction_request FORCE ROW LEVEL SECURITY;
ALTER TABLE affiliation.correction_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.correction_event FORCE ROW LEVEL SECURITY;

CREATE POLICY submission_snapshot_tenant_isolation
  ON affiliation.submission_snapshot
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY correction_request_tenant_isolation
  ON affiliation.correction_request
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY correction_event_tenant_isolation
  ON affiliation.correction_event
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT ON affiliation.submission_snapshot TO house_app;
GRANT SELECT, INSERT, UPDATE ON affiliation.correction_request TO house_app;
GRANT SELECT, INSERT ON affiliation.correction_event TO house_app;

COMMENT ON TABLE affiliation.submission_snapshot IS
  'Immutable representative submission receipts; corrections append a new sequence.';
COMMENT ON TABLE affiliation.correction_request IS
  'Controlled review metadata; never an AffiliationApplication lifecycle state.';
