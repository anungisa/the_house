import pg from 'pg';
import { loadConfig } from '../config/index.js';

/**
 * PostgreSQL access layer (vertical slice).
 *
 * Provides a pooled client, a transaction helper that sets the tenant context inside the
 * transaction (so RLS applies), a typed query helper, and a row-locking helper.
 *
 * RLS note: the application/kernel connects with a NON-superuser, non-BYPASSRLS role so
 * that FORCE ROW LEVEL SECURITY is enforced. `withTenantTransaction` sets
 * `app.tenant_id` transaction-locally before any governed table access.
 */

export type Sql = string;
export type QueryParams = readonly unknown[];

export interface QueryClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: Sql,
    params?: QueryParams,
  ): Promise<T[]>;
}

let sharedPool: pg.Pool | undefined;

/** Lazily create (or return) the shared connection pool from configuration. */
export function getPool(): pg.Pool {
  if (sharedPool === undefined) {
    const config = loadConfig();
    if (config.databaseUrl === '') {
      throw new Error('DATABASE_URL is not configured; cannot create a database pool.');
    }
    sharedPool = new pg.Pool({ connectionString: config.databaseUrl });
  }
  return sharedPool;
}

/** Close the shared pool (used by tests / graceful shutdown). */
export async function closePool(): Promise<void> {
  if (sharedPool !== undefined) {
    await sharedPool.end();
    sharedPool = undefined;
  }
}

/** Wrap a pg client/pool with the typed query helper. */
function wrap(executor: pg.Pool | pg.PoolClient): QueryClient {
  return {
    async query<T extends Record<string, unknown>>(sql: Sql, params?: QueryParams): Promise<T[]> {
      const result = await executor.query(sql, params === undefined ? undefined : [...params]);
      return result.rows as T[];
    },
  };
}

/** Run a read-only query outside any explicit transaction (no tenant context set). */
export async function queryRaw<T extends Record<string, unknown>>(
  sql: Sql,
  params?: QueryParams,
  pool: pg.Pool = getPool(),
): Promise<T[]> {
  return wrap(pool).query<T>(sql, params);
}

/**
 * Run `fn` inside a transaction with the tenant context set (RLS-enforced).
 * Commits on success, rolls back on any error.
 */
export async function withTenantTransaction<T>(
  tenantId: string,
  fn: (client: QueryClient) => Promise<T>,
  pool: pg.Pool = getPool(),
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Transaction-local tenant context for RLS. `true` => local to this transaction.
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const result = await fn(wrap(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Row-locking helper: SELECT ... FOR UPDATE. Returns the locked rows (possibly empty).
 * Must be called within a transaction client.
 */
export async function selectForUpdate<T extends Record<string, unknown>>(
  client: QueryClient,
  sql: Sql,
  params?: QueryParams,
): Promise<T[]> {
  const trimmed = sql.trimEnd().replace(/;$/, '');
  return client.query<T>(`${trimmed} FOR UPDATE`, params);
}
