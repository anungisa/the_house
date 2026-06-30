/**
 * Pure, deterministic validator for the database migration baseline.
 *
 * Like the deployment and container validators, this is a STATIC checker. It only
 * reads files under `db/migrations` and reasons about their names and content. It
 * NEVER:
 *  - connects to PostgreSQL or any database,
 *  - runs a migration,
 *  - requires credentials, Azure, or any network,
 *  - mutates anything.
 *
 * It lets CI and developers confirm migrations stay ordered, append-only, and free
 * of dangerous/destructive statements, leaked secrets, or sport-specific
 * terminology before they are ever applied.
 *
 * The thin CLI wrapper lives in scripts/validate-migrations.ts.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { FORBIDDEN_DOMAIN_TERMS, findSecretLikeValues } from './validateDeploymentBaseline.js';

/** A single named check outcome. */
export interface MigrationBaselineCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Aggregated validation result. */
export interface MigrationBaselineResult {
  readonly ok: boolean;
  readonly checks: readonly MigrationBaselineCheck[];
  /** Human-readable messages for every failing check (empty when ok). */
  readonly errors: readonly string[];
}

/** Repo-relative migration directory. */
export const MIGRATIONS_DIR_REL = 'db/migrations';

/** Required migration filename shape: `0001_snake_case_description.sql`. */
export const MIGRATION_FILENAME_PATTERN = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

interface DangerousRule {
  readonly rule: string;
  readonly pattern: RegExp;
}

/**
 * Destructive / superuser-only statements that must never appear in an
 * append-only, RLS-preserving migration. Matched against comment-stripped SQL so
 * the heavily-commented migrations (which legitimately mention BYPASSRLS /
 * superuser in prose) do not false-positive.
 */
const DANGEROUS_RULES: readonly DangerousRule[] = [
  { rule: 'DROP SCHEMA', pattern: /\bDROP\s+SCHEMA\b/i },
  { rule: 'DROP DATABASE', pattern: /\bDROP\s+DATABASE\b/i },
  { rule: 'ALTER SYSTEM', pattern: /\bALTER\s+SYSTEM\b/i },
  { rule: 'CREATE EXTENSION dblink', pattern: /\bCREATE\s+EXTENSION\b[^;]*\bdblink\b/i },
  { rule: 'COPY ... PROGRAM', pattern: /\bCOPY\b[^;]*\bPROGRAM\b/i },
  { rule: 'SUPERUSER role', pattern: /\b(?:CREATE|ALTER)\s+ROLE\b[^;]*\bSUPERUSER\b/i },
  { rule: 'BYPASSRLS grant', pattern: /\b(?:CREATE|ALTER)\s+ROLE\b[^;]*\bBYPASSRLS\b/i },
];

/** Remove `--` line comments and `/* *\/` block comments from SQL. */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function countOccurrences(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches === null ? 0 : matches.length;
}

interface MigrationFileEntry {
  readonly filename: string;
  readonly prefix: number;
  readonly text: string;
}

function listMigrationFiles(dir: string): MigrationFileEntry[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((filename) => {
      const match = MIGRATION_FILENAME_PATTERN.exec(filename);
      const prefix = match ? Number.parseInt(match[1] ?? '', 10) : Number.NaN;
      return { filename, prefix, text: readFileSync(join(dir, filename), 'utf8') };
    });
}

/**
 * Validate the migration baseline under `repoRoot`. Pure and deterministic: only
 * reads files; never touches a database, the network, Azure, or credentials.
 */
export function validateMigrationBaseline(repoRoot: string): MigrationBaselineResult {
  const checks: MigrationBaselineCheck[] = [];
  const dir = join(repoRoot, MIGRATIONS_DIR_REL);

  // 1. Migration directory exists.
  const dirExists = existsSync(dir) && statSync(dir).isDirectory();
  checks.push({ name: 'migration directory exists', ok: dirExists, detail: MIGRATIONS_DIR_REL });
  if (!dirExists) {
    return finalize(checks);
  }

  const entries = listMigrationFiles(dir);

  // 2. At least one migration is present.
  checks.push({
    name: 'at least one migration present',
    ok: entries.length > 0,
    detail: `${entries.length} migration(s)`,
  });

  // 3. Filenames match the required pattern.
  const badNames = entries.filter((e) => !MIGRATION_FILENAME_PATTERN.test(e.filename));
  checks.push({
    name: 'migration filenames match NNNN_snake_case.sql',
    ok: badNames.length === 0,
    detail: badNames.length === 0 ? 'all valid' : `invalid: ${badNames.map((e) => e.filename).join(', ')}`,
  });

  // 4. No duplicate numeric prefixes.
  const prefixes = entries.filter((e) => Number.isInteger(e.prefix)).map((e) => e.prefix);
  const duplicatePrefixes = prefixes.filter((p, i) => prefixes.indexOf(p) !== i);
  checks.push({
    name: 'no duplicate migration prefixes',
    ok: duplicatePrefixes.length === 0,
    detail: duplicatePrefixes.length === 0 ? 'unique' : `duplicates: ${[...new Set(duplicatePrefixes)].join(', ')}`,
  });

  // 5. Numeric prefixes are contiguous starting at 1.
  const sortedPrefixes = [...prefixes].sort((a, b) => a - b);
  const contiguous =
    sortedPrefixes.length === entries.length &&
    sortedPrefixes.every((p, i) => p === i + 1);
  checks.push({
    name: 'migration prefixes are contiguous from 0001',
    ok: contiguous,
    detail: contiguous ? `0001..${String(sortedPrefixes.length).padStart(4, '0')}` : `sequence: ${sortedPrefixes.join(', ')}`,
  });

  // 6. No empty migration files.
  const emptyFiles = entries.filter((e) => e.text.trim().length === 0);
  checks.push({
    name: 'no empty migration files',
    ok: emptyFiles.length === 0,
    detail: emptyFiles.length === 0 ? 'all non-empty' : `empty: ${emptyFiles.map((e) => e.filename).join(', ')}`,
  });

  // 7. No secret-like values in any migration.
  const secretLeaks: string[] = [];
  for (const entry of entries) {
    for (const rule of findSecretLikeValues(entry.text)) {
      secretLeaks.push(`${entry.filename} (${rule})`);
    }
  }
  checks.push({
    name: 'no secret-like values in migrations',
    ok: secretLeaks.length === 0,
    detail: secretLeaks.length === 0 ? 'clean' : secretLeaks.join('; '),
  });

  // 8. No sport-specific terminology in any migration (active SQL; guidance
  //    comments that name forbidden terms as a rule are not leaks).
  const domainLeaks: string[] = [];
  for (const entry of entries) {
    const lowered = stripSqlComments(entry.text).toLowerCase();
    for (const term of FORBIDDEN_DOMAIN_TERMS) {
      if (lowered.includes(term)) {
        domainLeaks.push(`${entry.filename} contains "${term}"`);
      }
    }
  }
  checks.push({
    name: 'no sport-specific terminology in migrations',
    ok: domainLeaks.length === 0,
    detail: domainLeaks.length === 0 ? 'clean' : domainLeaks.join('; '),
  });

  // 9. No destructive / superuser-only statements (scanned on active SQL).
  const dangerous: string[] = [];
  for (const entry of entries) {
    const active = stripSqlComments(entry.text);
    for (const { rule, pattern } of DANGEROUS_RULES) {
      if (pattern.test(active)) {
        dangerous.push(`${entry.filename}: ${rule}`);
      }
    }
  }
  checks.push({
    name: 'no destructive/superuser statements in migrations',
    ok: dangerous.length === 0,
    detail: dangerous.length === 0 ? 'clean' : dangerous.join('; '),
  });

  // 10. Tenant RLS migrations FORCE row level security for every table they enable.
  const rlsGaps: string[] = [];
  for (const entry of entries) {
    const active = stripSqlComments(entry.text);
    const enableCount = countOccurrences(active, /ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi);
    const forceCount = countOccurrences(active, /FORCE\s+ROW\s+LEVEL\s+SECURITY/gi);
    if (enableCount > 0 && forceCount < enableCount) {
      rlsGaps.push(`${entry.filename}: ${enableCount} ENABLE vs ${forceCount} FORCE`);
    }
  }
  checks.push({
    name: 'RLS migrations FORCE row level security',
    ok: rlsGaps.length === 0,
    detail: rlsGaps.length === 0 ? 'all forced' : rlsGaps.join('; '),
  });

  return finalize(checks);
}

function finalize(checks: MigrationBaselineCheck[]): MigrationBaselineResult {
  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    errors: failed.map((c) => `${c.name}: ${c.detail}`),
  };
}
