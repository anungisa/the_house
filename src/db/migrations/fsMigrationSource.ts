import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { MigrationSource } from './MigrationRunner.js';

/**
 * Filesystem-backed {@link MigrationSource}. Lists `*.sql` files from a directory
 * in deterministic (lexical) order and reads their contents. Pure I/O adapter — no
 * database access. Used by scripts/migrate-db.ts; unit tests use in-memory fakes
 * instead.
 */
export function createFsMigrationSource(dir: string): MigrationSource {
  return {
    async list(): Promise<readonly string[]> {
      const files = await readdir(dir);
      return files.filter((f) => f.endsWith('.sql')).sort((a, b) => a.localeCompare(b));
    },
    async read(filename: string): Promise<string> {
      return readFile(join(dir, filename), 'utf8');
    },
  };
}
