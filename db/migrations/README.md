# Database Migrations — The House v2

This folder holds ordered SQL migrations for the PostgreSQL-backed Governance Kernel
and supporting platform-core schemas.

> **Scaffold status:** Only a placeholder migration exists today
> ([`0001_governance_schema_placeholder.sql`](0001_governance_schema_placeholder.sql)).
> Production DDL is intentionally deferred to the Governance Kernel implementation pass.

## Conventions

- **One migration per coherent change.** Each migration is a single, reviewable unit of
  schema evolution. Do not bundle unrelated changes.
- **Migrations must be deterministic.** Running the same migration set against an empty
  database always produces the same schema. No environment-dependent branching, no clocks,
  no random data.
- **No real tenant data in migrations.** Migrations may seed *platform* policy/config that
  the kernel requires to operate (e.g. state-machine definitions, guard definitions), but
  never real organization, participant, or member data.
- **Seed data placement.** Operational/demo seed data belongs in [`../seed`](../seed).
  Only seed data that is *required platform policy/config* (the governed state machine and
  guard catalog) belongs inside a migration.
- **Governance migrations must preserve RLS and idempotency constraints.** Every
  tenant-owned governance table must carry `tenant_id`, enable Row-Level Security, and
  define tenant-scoped policies. Idempotency and outbox dedupe constraints (unique keys)
  must be created alongside the tables they protect.
- **Naming:** `NNNN_short_snake_case_description.sql` with a zero-padded, monotonically
  increasing prefix (e.g. `0002_governance_core_tables.sql`).
- **Forward-only by default.** Prefer additive, forward-only migrations. If a down/rollback
  step is provided, it must be explicitly marked and reversible.
- **Production DDL comes in the next implementation pass.** The current placeholder only
  documents intended tables, RLS, and seed scope via comments/TODOs.

## Intended governance schema (documented in the placeholder, not yet implemented)

`governance` schema with:

`policy_version`, `state_machine`, `state_node`, `transition_definition`,
`guard_definition`, `transition_guard`, `entity_state`, `transition_request`,
`state_transition`, `transition_guard_result`, `audit_event`, `evidence_object`,
`outbox_message`, plus an RLS tenant-context helper function, tenant RLS policies, and
the AffiliationApplication v1 state-machine seed.

## Migration runner

`npm run db:migrate` and `npm run db:seed` are **placeholder scripts** in this scaffold
(see [`../../scripts`](../../scripts)). A real runner (ordering, applied-migration ledger,
transactional application) is wired in the implementation pass.
