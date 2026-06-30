/**
 * Controlled, release-oriented migration runner.
 *
 * This runner is database-client-agnostic: it operates against an injected
 * {@link MigrationExecutor} and {@link MigrationSource}, so unit tests drive it
 * with in-memory fakes and NEVER connect to PostgreSQL. The fs/pg wiring lives in
 * scripts/migrate-db.ts.
 *
 * Design constraints (see docs/architecture/migration-orchestration-baseline.md):
 *  - Runs ONLY as an explicit release operation — never from the API or worker
 *    container at startup.
 *  - Uses a privileged migration connection (MIGRATE_DATABASE_URL), never the
 *    restricted application connection (DATABASE_URL).
 *  - Forward-only and ordered. Applied migrations are recorded in
 *    `public.schema_migrations`. Each migration is applied in its own transaction.
 *  - Fails closed when the applied ledger is inconsistent with the migrations on
 *    disk (out-of-order / missing files).
 */

export const SCHEMA_MIGRATIONS_TABLE = 'public.schema_migrations';

/** Minimal query surface the runner needs (satisfied by a pg PoolClient). */
export interface MigrationExecutor {
  query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ readonly rows: ReadonlyArray<Record<string, unknown>> }>;
}

/** Ordered source of migration files (satisfied by an fs-backed adapter). */
export interface MigrationSource {
  /** Migration filenames in deterministic apply order. */
  list(): Promise<readonly string[]>;
  /** Read the SQL body of a single migration file. */
  read(filename: string): Promise<string>;
}

/** A computed migration plan. */
export interface MigrationPlan {
  readonly applied: readonly string[];
  readonly pending: readonly string[];
  readonly latestApplied: string | null;
  readonly latestAvailable: string | null;
}

/** A redaction-safe, printable migration report. */
export interface MigrationReport {
  readonly migrationDirectory: string;
  readonly applied: readonly string[];
  readonly pending: readonly string[];
  readonly latestApplied: string | null;
  readonly latestAvailable: string | null;
  /** Always the literal redaction marker — never a real connection string. */
  readonly databaseUrl: string;
}

/** Redaction marker used in reports/logs (mirrors src/shared/security/redaction.ts). */
export const REDACTED = '[REDACTED]';

/** Result of resolving CLI arguments + environment for the migration runner. */
export type MigrationCommand =
  | { readonly kind: 'plan'; readonly databaseUrl: string }
  | { readonly kind: 'apply'; readonly databaseUrl: string }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Resolve the migration command from argv + env. Pure and side-effect free.
 *
 * Rules:
 *  - exactly one of `--plan` / `--apply` must be supplied;
 *  - `MIGRATE_DATABASE_URL` must be set and non-empty;
 *  - `DATABASE_URL` is intentionally ignored — migrations never use the
 *    restricted application connection.
 */
export function resolveMigrationCommand(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): MigrationCommand {
  const plan = argv.includes('--plan');
  const apply = argv.includes('--apply');

  if (plan && apply) {
    return { kind: 'error', message: 'Specify exactly one of --plan or --apply, not both.' };
  }
  if (!plan && !apply) {
    return { kind: 'error', message: 'Specify a mode: --plan (preview) or --apply (execute).' };
  }

  const migrateUrl = env['MIGRATE_DATABASE_URL'] ?? '';
  if (migrateUrl.trim() === '') {
    return {
      kind: 'error',
      message:
        'MIGRATE_DATABASE_URL is required to run migrations (the restricted DATABASE_URL is never used for schema changes).',
    };
  }

  return { kind: plan ? 'plan' : 'apply', databaseUrl: migrateUrl };
}

/** Build a redaction-safe report from a plan. The database URL is never embedded. */
export function buildMigrationReport(
  plan: MigrationPlan,
  migrationDirectory: string,
): MigrationReport {
  return {
    migrationDirectory,
    applied: plan.applied,
    pending: plan.pending,
    latestApplied: plan.latestApplied,
    latestAvailable: plan.latestAvailable,
    databaseUrl: REDACTED,
  };
}

/** Error thrown when the applied ledger is inconsistent with on-disk migrations. */
export class MigrationLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationLedgerError';
  }
}

export class MigrationRunner {
  constructor(
    private readonly source: MigrationSource,
    private readonly executor: MigrationExecutor,
  ) {}

  /** Create the applied-migrations ledger if it does not yet exist. */
  async ensureLedger(): Promise<void> {
    await this.executor.query(
      `CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
         filename   text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
  }

  /** Read the set of already-applied migration filenames. */
  private async appliedFilenames(): Promise<string[]> {
    const result = await this.executor.query(
      `SELECT filename FROM ${SCHEMA_MIGRATIONS_TABLE} ORDER BY filename ASC`,
    );
    return result.rows.map((row) => String(row['filename']));
  }

  /**
   * Compute the migration plan. Ensures the ledger exists first, then fails closed
   * if the applied set is not a contiguous leading prefix of the available
   * migrations (an out-of-order or missing-file ledger indicates a partial /
   * tampered state that must be resolved by an operator).
   */
  async plan(): Promise<MigrationPlan> {
    await this.ensureLedger();

    const available = [...(await this.source.list())];
    const appliedSet = new Set(await this.appliedFilenames());

    // Every applied migration must still exist on disk.
    for (const filename of appliedSet) {
      if (!available.includes(filename)) {
        throw new MigrationLedgerError(
          `Applied migration "${filename}" is recorded in ${SCHEMA_MIGRATIONS_TABLE} but missing from the migrations directory.`,
        );
      }
    }

    // Applied migrations must form a contiguous leading prefix (no gaps).
    let seenPending = false;
    for (const filename of available) {
      const isApplied = appliedSet.has(filename);
      if (isApplied && seenPending) {
        throw new MigrationLedgerError(
          `Migration ledger is out of order: "${filename}" is applied but an earlier migration is still pending.`,
        );
      }
      if (!isApplied) {
        seenPending = true;
      }
    }

    const applied = available.filter((f) => appliedSet.has(f));
    const pending = available.filter((f) => !appliedSet.has(f));

    return {
      applied,
      pending,
      latestApplied: applied.length > 0 ? (applied[applied.length - 1] ?? null) : null,
      latestAvailable: available.length > 0 ? (available[available.length - 1] ?? null) : null,
    };
  }

  /**
   * Apply all pending migrations in order. Each migration runs in its own
   * transaction; on failure the transaction is rolled back and the error is
   * rethrown (fail closed — no further migrations are attempted). Returns the list
   * of filenames applied in this run.
   */
  async apply(): Promise<readonly string[]> {
    const { pending } = await this.plan();
    const appliedNow: string[] = [];

    for (const filename of pending) {
      const sql = await this.source.read(filename);
      try {
        await this.executor.query('BEGIN');
        await this.executor.query(sql);
        await this.executor.query(
          `INSERT INTO ${SCHEMA_MIGRATIONS_TABLE}(filename) VALUES ($1)`,
          [filename],
        );
        await this.executor.query('COMMIT');
        appliedNow.push(filename);
      } catch (error) {
        await this.executor.query('ROLLBACK');
        throw error;
      }
    }

    return appliedNow;
  }
}
