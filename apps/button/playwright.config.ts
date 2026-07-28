import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end browser tests run the app fully offline against the injected mock transport
 * (`VITE_BUTTON_MOCK=1`) so no House backend or database is required. Deterministic synthetic
 * identities/organizations only — never production data.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5273',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5273',
    url: 'http://127.0.0.1:5273/button',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
    env: {
      VITE_BUTTON_MOCK: '1',
      VITE_BUTTON_MOCK_SCENARIO: 'representative',
    },
  },
});
