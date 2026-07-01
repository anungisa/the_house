import { defineConfig } from 'vitest/config';

// GATED-DB HARNESS ISOLATION: the DB-gated integration suites (RUN_DB_TESTS=1) all run against a
// SINGLE shared PostgreSQL database. They share tables (governance.outbox_message, the workflow
// tables, etc.) and some assert exact outbox-row counts after clearing the outbox, so running the
// test FILES in parallel lets one suite's global clear/insert race another suite's count and fail
// intermittently. Vitest's default forked file-parallelism therefore makes the full gated run
// non-repeatable. When RUN_DB_TESTS=1 we disable file parallelism so gated suites execute one file
// at a time (deterministic, repeatable, no manual DB cleanup). Default hermetic `npm test`
// (RUN_DB_TESTS unset) keeps full parallelism — it touches no database.
const GATED_DB = process.env.RUN_DB_TESTS === '1';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Serialize files only for gated DB runs; hermetic runs stay parallel.
    fileParallelism: !GATED_DB,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      // Report on the production source tree only. Tests, CLI script wrappers, build
      // artifacts, and legacy code are not behavioral targets and would distort the signal.
      all: true,
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/index.ts', // barrel re-exports carry no behavior
        'src/**/*.d.ts',
      ],
      reporter: ['text-summary', 'json-summary', 'html'],
      // No global thresholds yet. Coverage is evaluated as guidance this pass, not enforced
      // as a gate (see docs/quality/test-coverage-evaluation.md).
    },
  },
});
