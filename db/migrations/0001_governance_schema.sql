-- =============================================================================
-- Migration: 0001_governance_schema
-- The House v2 — Governance Kernel schema (PRODUCTION DDL)
-- Vertical slice: AffiliationApplication v1 lifecycle.
-- =============================================================================
--
-- Requires PostgreSQL 15+ (uses UNIQUE ... NULLS NOT DISTINCT).
--
-- NSO-GENERIC: all table/column names are sport-agnostic. Curling-specific terms
-- (PTSO, MA, club, curler, bonspiel, ...) MUST NOT appear here.
--
-- RLS design decision (documented per spec):
--   * TENANT-OWNED tables (entity_state, transition_request, state_transition,
--     transition_guard_result, audit_event, evidence_object, outbox_message) ENABLE
--     and FORCE Row-Level Security keyed on governance.current_tenant_id().
--   * DEFINITION tables (policy_version, state_machine, state_node,
--     transition_definition, guard_definition, transition_guard) are PLATFORM
--     CONFIGURATION. In v1 they hold ONLY global rows (tenant_id IS NULL) and are NOT
--     placed under RLS. This avoids accidentally hiding global definitions. The kernel
--     still filters definition reads with (tenant_id IS NULL OR tenant_id = $tenant).
--     TODO(future): when tenant-specific definition OVERRIDES are introduced, add RLS
--     that exposes `tenant_id IS NULL OR tenant_id = current_tenant_id()` without
--     hiding globals.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS governance;

-- -----------------------------------------------------------------------------
-- RLS helper: resolve the current tenant from a transaction-local GUC.
-- Fails CLOSED (raises) when app.tenant_id is missing/empty.
-- The kernel sets it via: SELECT set_config('app.tenant_id', $1, true)  -- txn-local
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION governance.current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw text;
BEGIN
  raw := current_setting('app.tenant_id', true);
  IF raw IS NULL OR raw = '' THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_MISSING: app.tenant_id is not set'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN raw::uuid;
END;
$$;

-- =============================================================================
-- DEFINITION TABLES (platform configuration; no RLS in v1 — see header note)
-- =============================================================================

-- 1. policy_version --------------------------------------------------------------
CREATE TABLE governance.policy_version (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,                       -- NULL = global/default policy
  name            text NOT NULL,
  version         integer NOT NULL,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('draft', 'active', 'retired')),
  description     text,
  effective_from  timestamptz NOT NULL DEFAULT now(),
  effective_to    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text,
  updated_by      text,
  CONSTRAINT policy_version_effective_ck
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT policy_version_unique
    UNIQUE NULLS NOT DISTINCT (tenant_id, name, version)
);

-- 2. state_machine ---------------------------------------------------------------
CREATE TABLE governance.state_machine (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid,                    -- NULL = global/default machine
  policy_version_id  uuid NOT NULL REFERENCES governance.policy_version(id),
  entity_type        text NOT NULL,
  name               text NOT NULL,
  version            integer NOT NULL,
  status             text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('draft', 'active', 'retired')),
  effective_from     timestamptz NOT NULL DEFAULT now(),
  effective_to       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         text,
  updated_by         text,
  CONSTRAINT state_machine_effective_ck
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT state_machine_unique
    UNIQUE NULLS NOT DISTINCT (tenant_id, entity_type, version)
);

CREATE INDEX state_machine_active_idx
  ON governance.state_machine (entity_type, status, effective_from);

-- 3. state_node ------------------------------------------------------------------
CREATE TABLE governance.state_node (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_machine_id  uuid NOT NULL REFERENCES governance.state_machine(id) ON DELETE CASCADE,
  name              text NOT NULL,
  is_initial        boolean NOT NULL DEFAULT false,
  is_terminal       boolean NOT NULL DEFAULT false,
  sort_order        integer NOT NULL DEFAULT 0,
  CONSTRAINT state_node_unique UNIQUE (state_machine_id, name)
);

-- 4. transition_definition -------------------------------------------------------
CREATE TABLE governance.transition_definition (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid,                    -- NULL = global/default
  state_machine_id   uuid NOT NULL REFERENCES governance.state_machine(id) ON DELETE CASCADE,
  trigger            text NOT NULL,
  from_state         text NOT NULL,
  to_state           text NOT NULL,
  risk_level         text NOT NULL DEFAULT 'low'
                       CHECK (risk_level IN ('low', 'high')),
  evidence_required  boolean NOT NULL DEFAULT false,
  approval_required  boolean NOT NULL DEFAULT false,
  effective_from     timestamptz NOT NULL DEFAULT now(),
  effective_to       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         text,
  updated_by         text,
  CONSTRAINT transition_definition_effective_ck
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  -- At most one target per (machine, from_state, trigger). Note: 'revoke' exists from
  -- both 'active' and 'suspended' as DISTINCT from_state rows, which is allowed.
  CONSTRAINT transition_definition_unique
    UNIQUE (state_machine_id, from_state, trigger)
);

CREATE INDEX transition_definition_resolve_idx
  ON governance.transition_definition (state_machine_id, from_state, trigger);

-- 5. guard_definition ------------------------------------------------------------
CREATE TABLE governance.guard_definition (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  description  text,
  handler_key  text NOT NULL,                 -- maps to a registered TS guard handler
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 6. transition_guard (binds a guard to a transition, with parameters) ------------
CREATE TABLE governance.transition_guard (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transition_definition_id uuid NOT NULL
                             REFERENCES governance.transition_definition(id) ON DELETE CASCADE,
  guard_code               text NOT NULL REFERENCES governance.guard_definition(code),
  parameters               jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order               integer NOT NULL DEFAULT 0,
  CONSTRAINT transition_guard_unique UNIQUE (transition_definition_id, guard_code)
);

CREATE INDEX transition_guard_by_transition_idx
  ON governance.transition_guard (transition_definition_id, sort_order);

-- =============================================================================
-- TENANT-OWNED TABLES (ENABLE + FORCE RLS)
-- =============================================================================

-- 7. entity_state (current governed state — ONLY the kernel writes this) ----------
CREATE TABLE governance.entity_state (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  entity_type       text NOT NULL,
  entity_id         uuid NOT NULL,
  current_state     text NOT NULL,
  state_machine_id  uuid NOT NULL REFERENCES governance.state_machine(id),
  scope_type        text,
  scope_id          uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        text,
  updated_by        text,
  CONSTRAINT entity_state_unique UNIQUE (tenant_id, entity_type, entity_id)
);

-- 8. transition_request (approval-pending / recorded request) ---------------------
CREATE TABLE governance.transition_request (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  entity_type        text NOT NULL,
  entity_id          uuid NOT NULL,
  trigger            text NOT NULL,
  from_state         text NOT NULL,
  requested_to_state text NOT NULL,
  idempotency_key    text NOT NULL,
  status             text NOT NULL DEFAULT 'pending_approval'
                       CHECK (status IN ('pending_approval', 'approved', 'rejected',
                                         'executed', 'cancelled')),
  actor_user_id      text,
  workflow_ref       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- workflow placeholder
  correlation_id     text,
  causation_id       text,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Database-level idempotency for approval requests.
  CONSTRAINT transition_request_idem_unique
    UNIQUE (tenant_id, entity_type, entity_id, idempotency_key)
);

CREATE INDEX transition_request_status_idx
  ON governance.transition_request (tenant_id, status, created_at DESC);

-- 9. state_transition (append-only immutable journal) -----------------------------
CREATE TABLE governance.state_transition (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  entity_type           text NOT NULL,
  entity_id             uuid NOT NULL,
  trigger               text NOT NULL,
  from_state            text NOT NULL,
  to_state              text NOT NULL,
  idempotency_key       text NOT NULL,
  state_machine_id      uuid REFERENCES governance.state_machine(id),
  policy_version_id     uuid REFERENCES governance.policy_version(id),
  transition_request_id uuid REFERENCES governance.transition_request(id),
  actor_user_id         text,
  correlation_id        text,
  causation_id          text,
  occurred_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  -- Database-level idempotency for executed transitions.
  CONSTRAINT state_transition_idem_unique
    UNIQUE (tenant_id, entity_type, entity_id, idempotency_key)
);

CREATE INDEX state_transition_history_idx
  ON governance.state_transition (tenant_id, entity_type, entity_id, occurred_at DESC);

-- 10. transition_guard_result (append-only) ---------------------------------------
CREATE TABLE governance.transition_guard_result (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  entity_type           text NOT NULL,
  entity_id             uuid NOT NULL,
  trigger               text NOT NULL,
  idempotency_key       text NOT NULL,
  guard_code            text NOT NULL,
  passed                boolean NOT NULL,
  failure_message       text,
  detail                jsonb NOT NULL DEFAULT '{}'::jsonb,
  state_transition_id   uuid REFERENCES governance.state_transition(id),
  transition_request_id uuid REFERENCES governance.transition_request(id),
  evaluated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transition_guard_result_entity_idx
  ON governance.transition_guard_result (tenant_id, entity_type, entity_id, evaluated_at DESC);

-- 11. audit_event (append-only) ---------------------------------------------------
CREATE TABLE governance.audit_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid NOT NULL,
  action          text NOT NULL,
  trigger         text,
  from_state      text,
  to_state        text,
  actor_user_id   text,
  correlation_id  text,
  causation_id    text,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_event_entity_idx
  ON governance.audit_event (tenant_id, entity_type, entity_id, occurred_at DESC);

-- 12. evidence_object (immutable metadata only) -----------------------------------
CREATE TABLE governance.evidence_object (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  entity_type         text NOT NULL,
  entity_id           uuid NOT NULL,
  trigger             text NOT NULL,
  state_transition_id uuid REFERENCES governance.state_transition(id),
  manifest            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- manifest-like metadata
  content_hash        text,
  storage_ref         text,                                -- future immutable Blob URI
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX evidence_object_entity_idx
  ON governance.evidence_object (tenant_id, entity_type, entity_id, created_at DESC);

-- 13. outbox_message (transactional outbox) ---------------------------------------
CREATE TABLE governance.outbox_message (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  message_type         text NOT NULL,
  payload              jsonb NOT NULL DEFAULT '{}'::jsonb,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  retry_count          integer NOT NULL DEFAULT 0,
  max_retries          integer NOT NULL DEFAULT 10,
  next_attempt_at      timestamptz NOT NULL DEFAULT now(),
  last_attempt_at      timestamptz,
  locked_until         timestamptz,
  locked_by            text,
  correlation_id       text,
  causation_id         text,
  dedupe_key           text,
  published_message_id text,
  error                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  processed_at         timestamptz
);

-- Pending claim: rows ready to publish.
CREATE INDEX outbox_pending_claim_idx
  ON governance.outbox_message (next_attempt_at)
  WHERE status = 'pending';

-- Failed review.
CREATE INDEX outbox_failed_idx
  ON governance.outbox_message (created_at DESC)
  WHERE status = 'failed';

-- Expired processing lease recovery.
CREATE INDEX outbox_expired_lease_idx
  ON governance.outbox_message (locked_until)
  WHERE status = 'processing';

-- Tenant/time browsing.
CREATE INDEX outbox_tenant_time_idx
  ON governance.outbox_message (tenant_id, created_at DESC);

-- Stable dedupe (idempotent enqueue): MessageId = dedupe_key when present.
CREATE UNIQUE INDEX outbox_dedupe_unique_idx
  ON governance.outbox_message (tenant_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- =============================================================================
-- ROW LEVEL SECURITY (tenant-owned tables only)
-- Append-only tables get SELECT + INSERT policies (no UPDATE/DELETE -> denied
-- under FORCE RLS). Mutable tables additionally get an UPDATE policy.
-- =============================================================================

-- entity_state (mutable)
ALTER TABLE governance.entity_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.entity_state FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_state_select ON governance.entity_state
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY entity_state_insert ON governance.entity_state
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY entity_state_update ON governance.entity_state
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- transition_request (mutable)
ALTER TABLE governance.transition_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.transition_request FORCE ROW LEVEL SECURITY;
CREATE POLICY transition_request_select ON governance.transition_request
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY transition_request_insert ON governance.transition_request
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY transition_request_update ON governance.transition_request
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- state_transition (append-only)
ALTER TABLE governance.state_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.state_transition FORCE ROW LEVEL SECURITY;
CREATE POLICY state_transition_select ON governance.state_transition
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY state_transition_insert ON governance.state_transition
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

-- transition_guard_result (append-only)
ALTER TABLE governance.transition_guard_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.transition_guard_result FORCE ROW LEVEL SECURITY;
CREATE POLICY transition_guard_result_select ON governance.transition_guard_result
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY transition_guard_result_insert ON governance.transition_guard_result
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

-- audit_event (append-only)
ALTER TABLE governance.audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.audit_event FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_event_select ON governance.audit_event
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY audit_event_insert ON governance.audit_event
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

-- evidence_object (append-only)
ALTER TABLE governance.evidence_object ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.evidence_object FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_object_select ON governance.evidence_object
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY evidence_object_insert ON governance.evidence_object
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());

-- outbox_message (mutable: status/lease transitions by the processor)
ALTER TABLE governance.outbox_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.outbox_message FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_message_select ON governance.outbox_message
  FOR SELECT USING (tenant_id = governance.current_tenant_id());
CREATE POLICY outbox_message_insert ON governance.outbox_message
  FOR INSERT WITH CHECK (tenant_id = governance.current_tenant_id());
CREATE POLICY outbox_message_update ON governance.outbox_message
  FOR UPDATE USING (tenant_id = governance.current_tenant_id())
            WITH CHECK (tenant_id = governance.current_tenant_id());

-- =============================================================================
-- APPLICATION ROLE (production guidance — intentionally commented)
-- =============================================================================
-- The application/kernel MUST connect as a NON-SUPERUSER role that does NOT have
-- BYPASSRLS, so FORCE ROW LEVEL SECURITY is enforced. Superusers and BYPASSRLS roles
-- bypass RLS entirely. Integration tests that assert RLS isolation must connect as a
-- non-superuser role with the grants below.
--
--   CREATE ROLE house_app LOGIN PASSWORD '...';   -- not superuser, no BYPASSRLS
--   GRANT USAGE ON SCHEMA governance TO house_app;
--   GRANT SELECT ON ALL TABLES IN SCHEMA governance TO house_app;
--   GRANT INSERT, UPDATE ON governance.entity_state, governance.transition_request,
--         governance.outbox_message TO house_app;
--   GRANT INSERT ON governance.state_transition, governance.transition_guard_result,
--         governance.audit_event, governance.evidence_object TO house_app;
--   GRANT EXECUTE ON FUNCTION governance.current_tenant_id() TO house_app;
--
-- The outbox PROCESSOR runs cross-tenant. In production it uses a dedicated background
-- worker connection that processes per-tenant (sets app.tenant_id per claimed tenant)
-- or a privileged maintenance role. It must NOT be used for normal request handling.
-- =============================================================================
