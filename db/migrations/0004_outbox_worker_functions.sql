-- =============================================================================
-- Migration: 0004_outbox_worker_functions
-- The House v2 — cross-tenant outbox worker access via SECURITY DEFINER functions
-- =============================================================================
--
-- WHY THIS EXISTS
--   governance.outbox_message is a TENANT-OWNED table under ENABLE + FORCE Row-Level
--   Security (see 0001). Normal application/kernel access is tenant-scoped: it sets
--   app.tenant_id inside the transaction and RLS confines reads/writes to that tenant.
--
--   The outbox PROCESSOR, however, runs CROSS-TENANT: it claims, leases, publishes, and
--   marks rows for ALL tenants. A non-superuser, non-BYPASSRLS worker role with no tenant
--   context cannot read tenant-owned rows directly (RLS fails closed). We deliberately do
--   NOT solve this by making the worker a superuser or a BYPASSRLS role.
--
--   Instead, this migration adds a NARROW, EXPLICIT operational surface: a small set of
--   SECURITY DEFINER functions scoped to governance.outbox_message ONLY. The worker role
--   is granted EXECUTE on these functions and NOTHING ELSE on governed tables. Direct
--   table access by the worker role remains blocked. Normal app-role RLS is untouched.
--
-- SECURITY POSTURE
--   * SECURITY DEFINER: functions run as their OWNER (the migration role). They therefore
--     operate across tenants WITHOUT granting the worker role broad table privileges.
--   * SET search_path = governance, pg_catalog on every function — prevents search_path
--     hijacking of unqualified names.
--   * No dynamic SQL. Every statement targets governance.outbox_message explicitly.
--   * EXECUTE is REVOKEd from PUBLIC and granted only to the worker-role pattern.
--   * These functions never read or write any table other than governance.outbox_message.
--
-- Requires PostgreSQL 15+ (consistent with 0001).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- claim_outbox_messages: atomically claim up to p_batch_size pending rows that are
-- due (next_attempt_at <= now), lease them to p_worker_id for p_lock_seconds, and
-- return the claimed rows. Mirrors FOR UPDATE SKIP LOCKED + locked_until/locked_by.
-- Deterministic ordering: next_attempt_at ASC, then created_at ASC.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION governance.claim_outbox_messages(
  p_batch_size  integer,
  p_worker_id   text,
  p_lock_seconds integer
)
RETURNS SETOF governance.outbox_message
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = governance, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id
      FROM governance.outbox_message
     WHERE status = 'pending'
       AND next_attempt_at <= now()
     ORDER BY next_attempt_at ASC, created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT p_batch_size
  )
  UPDATE governance.outbox_message o
     SET status        = 'processing',
         locked_by     = p_worker_id,
         locked_until  = now() + make_interval(secs => p_lock_seconds),
         last_attempt_at = now()
    FROM claimed
   WHERE o.id = claimed.id
  RETURNING o.*;
END;
$$;

-- -----------------------------------------------------------------------------
-- mark_outbox_processed: a row was successfully published. Record the broker
-- MessageId and clear the lease.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION governance.mark_outbox_processed(
  p_message_id           uuid,
  p_published_message_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = governance, pg_catalog
AS $$
  UPDATE governance.outbox_message
     SET status               = 'processed',
         processed_at         = now(),
         published_message_id = p_published_message_id,
         locked_until         = NULL,
         locked_by            = NULL,
         error                = NULL
   WHERE id = p_message_id;
$$;

-- -----------------------------------------------------------------------------
-- reschedule_outbox_message: TRANSIENT publish failure. Return the row to 'pending',
-- increment retry_count, push next_attempt_at out by p_next_attempt_seconds, and
-- clear the lease. The caller computes the delay via TRUE FULL JITTER.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION governance.reschedule_outbox_message(
  p_message_id           uuid,
  p_next_attempt_seconds integer,
  p_error                text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = governance, pg_catalog
AS $$
  UPDATE governance.outbox_message
     SET status          = 'pending',
         retry_count     = retry_count + 1,
         next_attempt_at = now() + make_interval(secs => p_next_attempt_seconds),
         error           = p_error,
         locked_until    = NULL,
         locked_by       = NULL
   WHERE id = p_message_id;
$$;

-- -----------------------------------------------------------------------------
-- mark_outbox_failed: PERMANENT failure (or retries exhausted). Mark 'failed' and
-- clear the lease. Rows are never auto-deleted — they remain for triage.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION governance.mark_outbox_failed(
  p_message_id uuid,
  p_error      text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = governance, pg_catalog
AS $$
  UPDATE governance.outbox_message
     SET status       = 'failed',
         error        = p_error,
         locked_until = NULL,
         locked_by    = NULL
   WHERE id = p_message_id;
$$;

-- -----------------------------------------------------------------------------
-- recover_expired_outbox_messages: return rows whose processing lease has expired
-- back to 'pending' so they can be re-claimed. Returns the number recovered.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION governance.recover_expired_outbox_messages()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = governance, pg_catalog
AS $$
  WITH recovered AS (
    UPDATE governance.outbox_message
       SET status       = 'pending',
           locked_until = NULL,
           locked_by    = NULL
     WHERE status = 'processing'
       AND locked_until IS NOT NULL
       AND locked_until <= now()
    RETURNING id
  )
  SELECT count(*)::int FROM recovered;
$$;

-- -----------------------------------------------------------------------------
-- get_outbox_message: fetch a single row by id for worker-side inspection. Scoped
-- to governance.outbox_message; returns 0 or 1 row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION governance.get_outbox_message(p_message_id uuid)
RETURNS SETOF governance.outbox_message
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = governance, pg_catalog
AS $$
  SELECT * FROM governance.outbox_message WHERE id = p_message_id;
$$;

-- =============================================================================
-- LOCK DOWN EXECUTE: these are cross-tenant operational functions, NOT for PUBLIC.
-- Newly created functions grant EXECUTE to PUBLIC by default; revoke that first.
-- =============================================================================
REVOKE ALL ON FUNCTION governance.claim_outbox_messages(integer, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION governance.mark_outbox_processed(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION governance.reschedule_outbox_message(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION governance.mark_outbox_failed(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION governance.recover_expired_outbox_messages() FROM PUBLIC;
REVOKE ALL ON FUNCTION governance.get_outbox_message(uuid) FROM PUBLIC;

-- =============================================================================
-- WORKER ROLE GRANTS (production guidance — conditional, fires only if the role
-- already exists so this migration is safe on databases without it).
--
-- The production outbox worker connects as a DEDICATED role that is:
--   * LOGIN, NOT superuser, NOT BYPASSRLS
--   * owner of NO governance tables
--   * granted ONLY USAGE on schema governance + EXECUTE on these 6 functions
--   * NOT granted direct SELECT/INSERT/UPDATE on any governed table
--
--   CREATE ROLE house_outbox_worker LOGIN PASSWORD '...'
--     NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
--
-- Integration tests provision an equivalent role named house_outbox_worker_test.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'house_outbox_worker') THEN
    GRANT USAGE ON SCHEMA governance TO house_outbox_worker;
    GRANT EXECUTE ON FUNCTION governance.claim_outbox_messages(integer, text, integer) TO house_outbox_worker;
    GRANT EXECUTE ON FUNCTION governance.mark_outbox_processed(uuid, text) TO house_outbox_worker;
    GRANT EXECUTE ON FUNCTION governance.reschedule_outbox_message(uuid, integer, text) TO house_outbox_worker;
    GRANT EXECUTE ON FUNCTION governance.mark_outbox_failed(uuid, text) TO house_outbox_worker;
    GRANT EXECUTE ON FUNCTION governance.recover_expired_outbox_messages() TO house_outbox_worker;
    GRANT EXECUTE ON FUNCTION governance.get_outbox_message(uuid) TO house_outbox_worker;
  END IF;
END;
$$;
