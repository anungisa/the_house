# Migration Orchestration Baseline

Status: baseline (release contract). This document defines how database schema
migrations are governed as an explicit, ordered, release-checkable step for The
House v2. It does **not** introduce automatic migrations at application startup
and it does **not** deploy any live Azure or database resources.

The migration plan/apply steps below are invoked from the operator release
procedure in
[docs/operations/production-release-runbook.md](../operations/production-release-runbook.md).

## Purpose

Production deployment already exists as a packaging/CI contract (see
[production-cicd-baseline.md](production-cicd-baseline.md) and
[production-deployment-baseline.md](production-deployment-baseline.md)). Schema
migrations are the remaining release-time concern. This baseline makes
migrations:

- **release-checkable** — a static validator (`migrations:check`) runs in CI and
  locally with no database;
- **ordered and forward-only** — a governed runner applies pending migrations in
  deterministic filename order, recording each in a ledger;
- **operationally documented** — the plan/apply commands, release ordering,
  credentials, and failure modes are written down here.

## Ownership and components

| Concern | Component |
| --- | --- |
| Static validation (no DB) | [src/deployment/validateMigrationBaseline.ts](../../src/deployment/validateMigrationBaseline.ts) via [scripts/validate-migrations.ts](../../scripts/validate-migrations.ts) (`npm run migrations:check`) |
| Database-agnostic runner | [src/db/migrations/MigrationRunner.ts](../../src/db/migrations/MigrationRunner.ts) |
| Filesystem migration source | [src/db/migrations/fsMigrationSource.ts](../../src/db/migrations/fsMigrationSource.ts) |
| Release CLI (plan/apply) | [scripts/migrate-db.ts](../../scripts/migrate-db.ts) (`npm run migrations:plan` / `migrations:apply`) |
| Migration SQL | [db/migrations](../../db/migrations) (`NNNN_snake_case.sql`) |

The runner (`MigrationRunner`) is database-agnostic: it depends on a
`MigrationExecutor` (a thin `query()` abstraction) and a `MigrationSource`
(`list()` / `read()`). The CLI wires these to a `pg.Pool` and the filesystem.
Unit tests use in-memory fakes, so the default test suite needs no database.

## Credentials: two distinct roles

Schema changes and application traffic use **different** database principals:

- `MIGRATE_DATABASE_URL` — the privileged migration role used only by
  `migrations:plan` / `migrations:apply`. It owns DDL rights.
- `DATABASE_URL` — the restricted application role used by the API and worker at
  runtime. It is RLS-bound and must never perform schema changes.

`resolveMigrationCommand()` reads **only** `MIGRATE_DATABASE_URL` and fails
closed if it is missing. It deliberately ignores `DATABASE_URL` so an
application connection string can never be used to migrate. The connection
string is never logged: the printed plan/apply report shows the database URL as
`[REDACTED]`, and any thrown error is scrubbed with `redactUrlCredentials`.

## Why the application runtime does not auto-migrate

The API ([src/server/api.ts](../../src/server/api.ts)) and worker
([src/server/worker.ts](../../src/server/worker.ts)) entrypoints do **not**
import or invoke the migration runner. Migrations are a controlled release
operation, not a startup side effect, because:

- multiple app/worker replicas starting concurrently would race to migrate;
- the restricted app role has no DDL rights (and must not);
- failed migrations must fail the *release*, not crash-loop running pods;
- ordering and approval must be observable in the deployment pipeline.

## Commands

```bash
npm run migrations:check   # static validation, no DB (CI + local)
npm run migrations:plan    # preview pending migrations (read-only)
npm run migrations:apply   # apply pending migrations in order
```

`migrations:plan` and `migrations:apply` require `MIGRATE_DATABASE_URL` to be
set in the environment. `migrations:check` requires no database and no secrets.

### Relationship to `db:migrate`

`npm run db:migrate` ([scripts/db-migrate.ts](../../scripts/db-migrate.ts)) is a
legacy **local-development** convenience that applies the same `db/migrations`
files using `DATABASE_URL`. The governed **release** runner is `migrate-db.ts`
(`migrations:plan` / `migrations:apply`) using `MIGRATE_DATABASE_URL`. Both
write to the same `public.schema_migrations` ledger with the same filename
ordering, so they are interoperable; releases should use the governed runner.

## CI behavior

CI ([.github/workflows/ci.yml](../../.github/workflows/ci.yml)) runs
`migrations:check` only. It **never** applies migrations, requires no secrets,
and contacts no database. `migrations:check` is also chained into `ci:check`
for local parity.

## Production release order

The guarded production template
([.github/workflows/production-deploy-template.yml](../../.github/workflows/production-deploy-template.yml))
is `workflow_dispatch`-only and skipped unless the operator types `DEPLOY`. When
run, the migration steps are placed as:

1. checkout, set up Node, `npm ci`
2. Azure login (OIDC)
3. infrastructure what-if (preview only)
4. **`migrations:plan`** — preview pending migrations before any change
5. build and publish API + worker images
6. **`migrations:apply`** — apply schema changes after images are built but
   before the new revisions roll out
7. roll out the API container app
8. roll out the worker container app

Applying migrations before the container rollout ensures the schema is ready
when the new app/worker revisions start. The template carries only
`${{ secrets.* }}` / `${{ vars.* }}` references — never secret values.

## Migration ledger (`public.schema_migrations`)

The runner ensures a `public.schema_migrations` ledger table exists, then:

- reads applied filenames from the ledger;
- computes pending migrations as the source files not yet recorded;
- fails closed if the ledger and source disagree on order (a previously applied
  migration missing from the source, or applied out of order);
- applies each pending migration inside its own `BEGIN` / `INSERT` ledger row /
  `COMMIT`, rolling back and aborting on the first failure.

Migrations are forward-only and applied in lexical filename order
(`0001_…` → `0008_…`).

## Static validation checks

`migrations:check` enforces (no database required):

1. the migrations directory exists;
2. at least one migration is present;
3. filenames match `NNNN_snake_case.sql`;
4. no duplicate numeric prefixes;
5. prefixes are contiguous from `0001`;
6. no empty migration files;
7. no secret-like values;
8. no sport-specific terminology in active SQL (comments documenting the rule
   are allowed);
9. no destructive/superuser statements (`DROP DATABASE`, `DROP SCHEMA`,
   `ALTER SYSTEM`, `CREATE EXTENSION dblink`, `COPY … PROGRAM`, `SUPERUSER`
   role, `BYPASSRLS` grant) in active SQL;
10. RLS migrations FORCE row level security (any file that enables RLS must also
    force it at least as many times).

## RLS considerations

Migrations create tenant-owned tables with row level security and must `FORCE`
it so the owning/migration role is also subject to policy. The application role
is never granted `BYPASSRLS`. The static validator rejects any `BYPASSRLS` grant
or `SUPERUSER` role creation in migration SQL.

## Failure modes

- **Missing `MIGRATE_DATABASE_URL`** — `plan`/`apply` fail closed before any
  connection is attempted.
- **Ledger/source disorder** — `plan` raises `MigrationLedgerError`; nothing is
  applied.
- **Migration error mid-apply** — that migration's transaction is rolled back,
  the ledger row is not written, and the command exits non-zero. Already-applied
  earlier migrations remain committed (forward-only).
- **Static check failure** — `migrations:check` prints the failing checks and
  exits non-zero, blocking the release in CI.

## Out of scope (intentional)

- automated rollback / down-migrations;
- online/zero-downtime migration analysis and lock-time budgeting;
- blue/green or expand-contract schema choreography automation;
- a production runbook automation harness;
- any live Azure or database deployment from this baseline.
