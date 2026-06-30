# Database Migrations — The House v2

This folder holds ordered SQL migrations for the PostgreSQL-backed Governance Kernel
and supporting platform-core schemas.

> **Status:** Migrations `0001`–`0008` implement the governance schema, the
> AffiliationApplication v1 state machine, the affiliation domain, workflow metadata,
> and evidence quarantine. They are governed as an explicit, ordered release step —
> see [migration orchestration baseline](../../docs/architecture/migration-orchestration-baseline.md).
> Migrations are validated statically in CI (`npm run migrations:check`) and are
> **never** applied automatically at application startup.

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

## Intended governance schema

`governance` schema with:

`policy_version`, `state_machine`, `state_node`, `transition_definition`,
`guard_definition`, `transition_guard`, `entity_state`, `transition_request`,
`state_transition`, `transition_guard_result`, `audit_event`, `evidence_object`,
`outbox_message`, plus an RLS tenant-context helper function, tenant RLS policies, and
the AffiliationApplication v1 state-machine seed.

## Migration runner

Migrations are run as a controlled release operation, never from the API or worker at
startup:

- `npm run migrations:check` — static validation only (ordering, naming, no secrets,
  no destructive/superuser statements, RLS forced). Requires no database; runs in CI.
- `npm run migrations:plan` — preview pending migrations (read-only).
- `npm run migrations:apply` — apply pending migrations in order.

The governed runner ([`scripts/migrate-db.ts`](../../scripts/migrate-db.ts) →
[`src/db/migrations/MigrationRunner.ts`](../../src/db/migrations/MigrationRunner.ts))
uses the privileged `MIGRATE_DATABASE_URL` connection (never the restricted
application `DATABASE_URL`), records applied files in a `public.schema_migrations`
ledger, and applies each migration in its own transaction. `npm run db:migrate`
remains a legacy local-development convenience. See the
[migration orchestration baseline](../../docs/architecture/migration-orchestration-baseline.md)
for the full release contract.
