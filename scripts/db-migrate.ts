/**
 * Minimal migration runner.
 *
 * Applies every `*.sql` file in db/migrations in lexical order, inside its own
 * transaction, and records applied files in `public.schema_migrations`. Re-running skips
 * already-applied files. Deterministic and forward-only.
 *
 * Usage: DATABASE_URL=postgres://... npm run db:migrate
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { loadConfig } from '../src/config/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', 'db', 'migrations');

async function ensureLedger(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedFiles(client: pg.PoolClient): Promise<Set<string>> {
  const { rows } = await client.query<{ filename: string }>(
    'SELECT filename FROM public.schema_migrations',
  );
  return new Set(rows.map((r) => r.filename));
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.databaseUrl === '') {
    console.error('[db:migrate] DATABASE_URL is not set. Nothing to do.');
    process.exitCode = 1;
    return;
  }

  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const client = await pool.connect();
  try {
    await ensureLedger(client);
    const applied = await appliedFiles(client);

    const all = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    let count = 0;
    for (const file of all) {
      if (applied.has(file)) {
        console.log(`[db:migrate] skip   ${file}`);
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO public.schema_migrations(filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        count += 1;
        console.log(`[db:migrate] apply  ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[db:migrate] FAILED ${file}`);
        throw error;
      }
    }
    console.log(`[db:migrate] done. ${count} migration(s) applied.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
