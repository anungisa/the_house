-- =============================================================================
-- Migration: 0021_representative_authority
-- The House v2 — Governed representative authority source
--
-- Replaces the role-derived representative authority (a trusted role key manufacturing
-- authority by itself) with a PERSISTED, tenant-isolated, time-aware authority source.
--
-- A trusted authentication subject (and any organization reference in an identity token)
-- may IDENTIFY the actor. It never, by itself, creates representative authority. Authority
-- to act for an organization exists ONLY when a governed grant record says so, is currently
-- within its validity window, and has not been revoked.
--
-- This schema holds AUTHORITY FACTS, not a kernel-owned lifecycle FSM: the effective status
-- (active / expired / revoked) is DERIVED at read time from the stored status + validity
-- interval + current time. A future-dated grant is not yet in effect; an authority past its
-- validUntil resolves as expired WITHOUT any background mutation; a revoked authority stops
-- granting capability immediately.
--
-- Security posture (fail closed): tenant_id on every table, FORCE ROW LEVEL SECURITY, no
-- runtime DELETE, append-only authority events, and a non-superuser / non-BYPASSRLS runtime
-- role. Cross-schema organization references are enforced through tenant-isolated service
-- validation + a PostgreSQL integration proof (NOT a casual cross-schema FK).
--
-- NSO-GENERIC: every identifier here is sport-agnostic. Requires PostgreSQL 15+. RLS keyed on
-- app.tenant_id (transaction-local), which fails closed when unset.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS authority;

-- -----------------------------------------------------------------------------
-- 1. identity_subject — tenant-scoped identity-provider account linkage
--
-- The stable external subject (issuer + subject) is the ONLY authority lookup key. Email and
-- display name are NEVER used as an authority key. `participant_id` optionally links the subject
-- to a participant record but is NOT itself an authority. This is deliberately a dedicated
-- mapping and NOT participant_registry.participant.external_refs (which migration 0010 documents
-- as explicitly NOT an identity-provider account link).
-- -----------------------------------------------------------------------------
CREATE TABLE authority.identity_subject (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  issuer           text NOT NULL CHECK (btrim(issuer) <> ''),
  external_subject text NOT NULL CHECK (btrim(external_subject) <> ''),
  participant_id   uuid,
  status           text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'unlinked')),
  source           text NOT NULL DEFAULT 'manual'
                     CHECK (btrim(source) <> ''),
  linked_at        timestamptz NOT NULL DEFAULT now(),
  unlinked_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_subject_unique UNIQUE (tenant_id, issuer, external_subject),
  -- Composite unique so tenant-consistent composite FKs (representative_authority) can reference it.
  CONSTRAINT identity_subject_id_tenant_unique UNIQUE (id, tenant_id),
  CONSTRAINT identity_subject_unlink_ck CHECK (
    (status = 'unlinked') = (unlinked_at IS NOT NULL)
  )
);

CREATE INDEX identity_subject_participant_idx
  ON authority.identity_subject (tenant_id, participant_id)
  WHERE participant_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. representative_authority — the governed authority head (aggregate)
--
-- `status` stores only the AUTHORITATIVE, mutation-driven state: 'active' when granted, 'revoked'
-- once revoked. 'expired' and 'pending/future' are NEVER stored — they are derived from the
-- validity interval + current time at read. `valid_until` NULL means open-ended.
--
-- An active-authority uniqueness rule guarantees at most one live grant per
-- (subject, organization, authority_type). Revoked/superseded rows remain for lineage.
-- -----------------------------------------------------------------------------
CREATE TABLE authority.representative_authority (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  identity_subject_id    uuid NOT NULL,
  organization_id        uuid NOT NULL,
  authority_type         text NOT NULL
                           CHECK (authority_type IN ('club_affiliation_representative')),
  status                 text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'revoked')),
  valid_from             timestamptz NOT NULL DEFAULT now(),
  valid_until            timestamptz,
  issued_by              text NOT NULL CHECK (btrim(issued_by) <> ''),
  issued_at              timestamptz NOT NULL DEFAULT now(),
  revoked_by             text,
  revoked_at             timestamptz,
  revocation_reason_code text,
  source_reference       text NOT NULL CHECK (btrim(source_reference) <> ''),
  idempotency_key        text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  version                integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT representative_authority_subject_fk
    FOREIGN KEY (identity_subject_id, tenant_id)
    REFERENCES authority.identity_subject (id, tenant_id),
  CONSTRAINT representative_authority_idempotency_unique
    UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT representative_authority_validity_ck CHECK (
    valid_until IS NULL OR valid_until > valid_from
  ),
  CONSTRAINT representative_authority_revocation_ck CHECK (
    (status = 'revoked') = (revoked_at IS NOT NULL)
  )
);

-- A composite unique on (id, tenant_id) so downstream tables can enforce tenant-consistent FKs.
ALTER TABLE authority.representative_authority
  ADD CONSTRAINT representative_authority_id_tenant_unique UNIQUE (id, tenant_id);

-- At most one LIVE (stored active) grant per subject + organization + authority type.
CREATE UNIQUE INDEX representative_authority_active_unique
  ON authority.representative_authority (tenant_id, identity_subject_id, organization_id, authority_type)
  WHERE status = 'active';

-- Provider lookup: a subject's authorities, newest first.
CREATE INDEX representative_authority_subject_idx
  ON authority.representative_authority (tenant_id, identity_subject_id, authority_type, issued_at DESC);

-- -----------------------------------------------------------------------------
-- 3. authority_event — append-only authority history / audit lineage
-- -----------------------------------------------------------------------------
CREATE TABLE authority.authority_event (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  authority_id   uuid NOT NULL,
  event_type     text NOT NULL
                   CHECK (event_type IN ('granted', 'revoked', 'renewed')),
  from_status    text,
  to_status      text NOT NULL,
  actor_user_id  text,
  reason_code    text,
  correlation_id text,
  causation_id   text,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT authority_event_authority_fk
    FOREIGN KEY (authority_id, tenant_id)
    REFERENCES authority.representative_authority (id, tenant_id)
);

CREATE INDEX authority_event_authority_idx
  ON authority.authority_event (tenant_id, authority_id, occurred_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (tenant-owned tables; fail closed on unset app.tenant_id)
--   identity_subject + representative_authority are mutable (SELECT/INSERT/UPDATE).
--   authority_event is append-only (SELECT/INSERT only; no UPDATE/DELETE policy => denied
--   under FORCE RLS). No table has a DELETE policy => runtime DELETE is denied everywhere.
-- =============================================================================
ALTER TABLE authority.identity_subject ENABLE ROW LEVEL SECURITY;
ALTER TABLE authority.identity_subject FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_subject_select ON authority.identity_subject
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY identity_subject_insert ON authority.identity_subject
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY identity_subject_update ON authority.identity_subject
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE authority.representative_authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE authority.representative_authority FORCE ROW LEVEL SECURITY;
CREATE POLICY representative_authority_select ON authority.representative_authority
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY representative_authority_insert ON authority.representative_authority
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY representative_authority_update ON authority.representative_authority
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE authority.authority_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE authority.authority_event FORCE ROW LEVEL SECURITY;
CREATE POLICY authority_event_select ON authority.authority_event
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY authority_event_insert ON authority.authority_event
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =============================================================================
-- Least-privilege runtime grants (conditional; the runtime role is created before migrations
-- run). No DELETE is ever granted. Applied only when the runtime role exists.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'house_app') THEN
    GRANT USAGE ON SCHEMA authority TO house_app;
    GRANT SELECT, INSERT, UPDATE ON authority.identity_subject TO house_app;
    GRANT SELECT, INSERT, UPDATE ON authority.representative_authority TO house_app;
    GRANT SELECT, INSERT ON authority.authority_event TO house_app;
  END IF;
END $$;

COMMENT ON SCHEMA authority IS
  'Governed, tenant-isolated representative authority source. Trusted identity does not create authority.';
COMMENT ON TABLE authority.identity_subject IS
  'Tenant-scoped identity-provider account linkage. (issuer, external_subject) is the sole authority lookup key.';
COMMENT ON TABLE authority.representative_authority IS
  'Governed representative authority head. Effective status (active/expired/revoked) is derived from stored status + validity + now.';
COMMENT ON TABLE authority.authority_event IS
  'Append-only representative authority history / audit lineage.';
