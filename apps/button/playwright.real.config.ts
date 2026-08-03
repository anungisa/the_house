import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const fixturePath =
  process.env.E2E_REAL_FIXTURE_PATH ?? join(tmpdir(), 'the-house-button-real-e2e-fixture.json');

/**
 * Real browser/full-stack integration: Playwright browser -> Button React app -> trusted identity
 * edge -> real House API -> PostgreSQL. No mock API transport is allowed in this suite.
 */
export default defineConfig({
  testDir: './e2e-real',
  timeout: 90_000,
  fullyParallel: false,
  // Real full-stack journeys share one PostgreSQL instance. Force a single worker so the specs
  // run serially and never race on shared governed state.
  workers: 1,
  forbidOnly: !!process.env['CI'],
  // These journeys mutate durable governed state in one shared PostgreSQL instance that is NOT
  // reset between attempts. A retry would restart from a half-mutated database and fail (or pass)
  // for reasons unrelated to the code under test, masking the true first failure. Non-idempotent
  // full-stack journeys must run exactly once.
  retries: 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './e2e-real/support/global-setup.mjs',
  use: {
    baseURL: 'http://127.0.0.1:5273',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'cd ../.. && npm run dev:api',
      url: 'http://127.0.0.1:8080/healthz',
      reuseExistingServer: !process.env['CI'],
      timeout: 90_000,
      env: {
        AUTH_MODE: 'trusted_headers',
        API_HOST: '127.0.0.1',
        API_PORT: '8080',
      },
    },
    {
      command: 'node e2e-real/support/trusted-identity-edge.mjs',
      url: 'http://127.0.0.1:8090/__e2e__/fixture',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: {
        E2E_EDGE_PORT: '8090',
        E2E_API_TARGET: 'http://127.0.0.1:8080',
        E2E_REAL_FIXTURE_PATH: fixturePath,
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5273',
      url: 'http://127.0.0.1:5273/button',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: {
        BUTTON_API_TARGET: 'http://127.0.0.1:8090',
        E2E_REAL_FIXTURE_PATH: fixturePath,
      },
    },
  ],
});
