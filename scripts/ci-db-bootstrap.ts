/**
 * CI PostgreSQL bootstrap for the governed integration suite.
 *
 * This script provisions a clean, least-privilege database for `RUN_DB_TESTS=1` runs. It is used
 * ONLY by the ephemeral CI PostgreSQL service (and can be run locally against a throwaway
 * container). It NEVER contacts Azure, production, or any real secret store; all credentials are
 * synthetic and supplied via environment variables.
 *
 * Responsibilities (fail closed):
 *   1. Connect with the privileged migration/admin connection (MIGRATE_DATABASE_URL).
 *   2. Create the least-privilege runtime application role from DATABASE_URL's credentials,
 *      explicitly NOSUPERUSER / NOBYPASSRLS / NOCREATEDB / NOCREATEROLE.
 *   3. Apply every db/migrations/*.sql file, in lexical order, each in its own transaction,
 *      recording applied files in public.schema_migrations (re-run safe). The migrations grant
 *      least-privilege access to the runtime role conditionally when it already exists — hence the
 *      role is created BEFORE migrations run.
 *   4. Assert the runtime role is NOT a superuser and does NOT have BYPASSRLS, so forced RLS
 *      genuinely confines it. Abort non-zero if this invariant does not hold.
 *
 * Usage (CI):
 *   MIGRATE_DATABASE_URL=postgres://postgres:pw@localhost:5432/house_test \
 *   DATABASE_URL=postgres://house_app:pw@localhost:5432/house_test \
 *   npm run ci:db:bootstrap
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', 'db', 'migrations');

function requireUrl(name: string): string {
  const value = process.env[name] ?? '';
  if (value === '') {
    throw new Error(`[ci:db:bootstrap] ${name} is not set.`);
  }
  return value;
}

/** Quote a SQL identifier (role name) safely. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/gu, '""')}"`;
}

/** Quote a SQL string literal (password) safely. */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

async function createRuntimeRole(admin: pg.PoolClient, user: string, password: string): Promise<void> {
  const roleId = quoteIdent(user);
  const pwLiteral = quoteLiteral(password);
  // Create or reset the runtime role as strictly least-privilege. RLS-defeating attributes are
  // explicitly disabled so the forced Row-Level Security in the migrations actually confines it.
  await admin.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(user)}) THEN
        ALTER ROLE ${roleId} WITH LOGIN PASSWORD ${pwLiteral}
          NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      ELSE
        CREATE ROLE ${roleId} WITH LOGIN PASSWORD ${pwLiteral}
          NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      END IF;
    END $$;
  `);
  // The runtime role needs CONNECT on the target database and USAGE on the public schema so it can
  // read the schema_migrations ledger and reach the (RLS-forced) tenant-owned objects.
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${roleId}`);
}

async function applyMigrations(admin: pg.PoolClient): Promise<number> {
  await admin.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const { rows } = await admin.query<{ filename: string }>(
    'SELECT filename FROM public.schema_migrations',
  );
  const applied = new Set(rows.map((r) => r.filename));
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[ci:db:bootstrap] skip   ${file}`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await admin.query('BEGIN');
      await admin.query(sql);
      await admin.query('INSERT INTO public.schema_migrations(filename) VALUES ($1)', [file]);
      await admin.query('COMMIT');
      count += 1;
      console.log(`[ci:db:bootstrap] apply  ${file}`);
    } catch (error) {
      await admin.query('ROLLBACK');
      console.error(`[ci:db:bootstrap] FAILED ${file}`);
      throw error;
    }
  }
  return count;
}

/** Fail closed unless the runtime role is genuinely least-privilege (no superuser, no BYPASSRLS). */
async function assertLeastPrivilege(admin: pg.PoolClient, user: string): Promise<void> {
  const { rows } = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1',
    [user],
  );
  const role = rows[0];
  if (role === undefined) {
    throw new Error(`[ci:db:bootstrap] runtime role ${user} does not exist after provisioning.`);
  }
  if (role.rolsuper) {
    throw new Error(`[ci:db:bootstrap] runtime role ${user} is a SUPERUSER — RLS would be bypassed.`);
  }
  if (role.rolbypassrls) {
    throw new Error(`[ci:db:bootstrap] runtime role ${user} has BYPASSRLS — RLS would be bypassed.`);
  }
  console.log(`[ci:db:bootstrap] verified ${user} is NOSUPERUSER + NOBYPASSRLS.`);
}

async function main(): Promise<void> {
  const adminUrl = requireUrl('MIGRATE_DATABASE_URL');
  const runtimeUrl = requireUrl('DATABASE_URL');

  const parsed = new URL(runtimeUrl);
  const runtimeUser = decodeURIComponent(parsed.username);
  const runtimePassword = decodeURIComponent(parsed.password);
  if (runtimeUser === '' || runtimePassword === '') {
    throw new Error('[ci:db:bootstrap] DATABASE_URL must carry the runtime role user and password.');
  }

  const pool = new pg.Pool({ connectionString: adminUrl });
  const client = await pool.connect();
  try {
    await createRuntimeRole(client, runtimeUser, runtimePassword);
    const count = await applyMigrations(client);
    await assertLeastPrivilege(client, runtimeUser);
    console.log(`[ci:db:bootstrap] done. ${count} migration(s) applied; runtime role ${runtimeUser} ready.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
