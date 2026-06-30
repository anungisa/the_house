/**
 * Controlled migration runner CLI (`npm run migrations:plan` / `migrations:apply`).
 *
 * This is a RELEASE operation, never invoked from the API or worker runtime. It
 * connects with the privileged migration role via `MIGRATE_DATABASE_URL` (the
 * restricted application `DATABASE_URL` is never used for schema changes) and
 * drives the database-agnostic MigrationRunner in src/db/migrations.
 *
 *   npm run migrations:plan    # preview pending migrations, exit 0
 *   npm run migrations:apply   # apply pending migrations in order
 *
 * The connection string is never logged: errors are scrubbed with
 * redactUrlCredentials and the printed report shows the database URL as
 * [REDACTED].
 */

import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import pg from 'pg';

import { createFsMigrationSource } from '../src/db/migrations/fsMigrationSource.js';
import {
  MigrationRunner,
  buildMigrationReport,
  resolveMigrationCommand,
  type MigrationExecutor,
} from '../src/db/migrations/MigrationRunner.js';
import { redactUrlCredentials } from '../src/shared/security/redaction.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const migrationsDir = join(repoRoot, 'db', 'migrations');
const migrationsDirRel = relative(repoRoot, migrationsDir);

async function main(): Promise<void> {
  const command = resolveMigrationCommand(process.argv.slice(2), process.env);
  if (command.kind === 'error') {
    console.error(`[migrate] ${command.message}`);
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: command.databaseUrl });
  const client = await pool.connect();
  const executor: MigrationExecutor = {
    async query(sql, params) {
      const result = await client.query(sql, params === undefined ? undefined : [...params]);
      return { rows: result.rows as ReadonlyArray<Record<string, unknown>> };
    },
  };

  const runner = new MigrationRunner(createFsMigrationSource(migrationsDir), executor);

  try {
    if (command.kind === 'plan') {
      const plan = await runner.plan();
      const report = buildMigrationReport(plan, migrationsDirRel);
      console.log(JSON.stringify(report, null, 2));
      console.log(`\n[migrate] plan: ${plan.pending.length} pending migration(s).`);
    } else {
      const before = await runner.plan();
      console.log(`[migrate] applying ${before.pending.length} pending migration(s)...`);
      const applied = await runner.apply();
      for (const filename of applied) {
        console.log(`[migrate] apply  ${filename}`);
      }
      const after = await runner.plan();
      console.log(JSON.stringify(buildMigrationReport(after, migrationsDirRel), null, 2));
      console.log(`\n[migrate] done. ${applied.length} migration(s) applied.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Never leak the connection string: scrub any URL credentials from the message.
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[migrate] FAILED: ${redactUrlCredentials(message)}`);
  process.exitCode = 1;
});
