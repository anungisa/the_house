-- The House v2 — resource-scoped affiliation review assignment.
--
-- Assignment is operational review metadata. The governed application lifecycle remains solely
-- in governance.entity_state; this table records who accepted review responsibility and under
-- which organizational scope.

CREATE TABLE affiliation.review_assignment (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  application_id        uuid NOT NULL,
  reviewer_user_id      text NOT NULL CHECK (btrim(reviewer_user_id) <> ''),
  reviewer_scope_type   text NOT NULL CHECK (btrim(reviewer_scope_type) <> ''),
  reviewer_scope_id     uuid,
  state_transition_id   uuid NOT NULL REFERENCES governance.state_transition(id),
  assigned_at           timestamptz NOT NULL DEFAULT now(),
  released_at           timestamptz,
  CONSTRAINT review_assignment_application_fk
    FOREIGN KEY (application_id, tenant_id)
    REFERENCES affiliation.affiliation_application(id, tenant_id),
  CONSTRAINT review_assignment_application_unique UNIQUE (tenant_id, application_id),
  CONSTRAINT review_assignment_transition_unique UNIQUE (tenant_id, state_transition_id),
  CONSTRAINT review_assignment_release_ck CHECK (
    released_at IS NULL OR released_at >= assigned_at
  )
);

CREATE INDEX review_assignment_reviewer_queue_idx
  ON affiliation.review_assignment (tenant_id, reviewer_user_id, assigned_at DESC)
  WHERE released_at IS NULL;

ALTER TABLE affiliation.review_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliation.review_assignment FORCE ROW LEVEL SECURITY;

CREATE POLICY review_assignment_tenant_isolation
  ON affiliation.review_assignment
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON affiliation.review_assignment TO house_app;

COMMENT ON TABLE affiliation.review_assignment IS
  'Operational reviewer responsibility bound atomically to the governed review_start transition.';
