import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
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
