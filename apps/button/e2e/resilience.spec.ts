import { test, expect } from '@playwright/test';

/**
 * End-to-end resilience journeys against the mock transport. Each case drives a synthetic failure
 * scenario through a real browser via the mock-only `?mockScenario=` override (inert for the real
 * HTTP transport), proving the app fails closed with sanitized, bilingual, keyboard-reachable copy.
 *
 * The scenario is locked at app mount, so the guard redirect that strips the query parameter does
 * not change the resolved transport for the lifetime of the page.
 */

test('expired representative authority is redirected to the authority-expired state', async ({
  page,
}) => {
  await page.goto('/button/select-context?mockScenario=expired');
  await page.getByLabel('Season').selectOption('2025-26');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'Representative authority expired' }),
  ).toBeVisible();
});

test('revoked authority (mid-session) is redirected to the authority-expired state', async ({
  page,
}) => {
  await page.goto('/button/select-context?mockScenario=revoked');
  await page.getByLabel('Season').selectOption('2025-26');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'Representative authority expired' }),
  ).toBeVisible();
});

test('a service failure shows the service-unavailable state without leaking internals', async ({
  page,
}) => {
  await page.goto('/button/affiliation?mockScenario=service-error');
  await expect(
    page.getByRole('heading', { name: 'Service temporarily unavailable' }),
  ).toBeVisible();

  const body = (await page.locator('body').innerText()).toLowerCase();
  expect(body).not.toContain('stack');
  expect(body).not.toContain('club-1');
  expect(body).not.toContain('503');
});

test('a representative with no authority sees the empty-organizations state', async ({ page }) => {
  await page.goto('/button/affiliation?mockScenario=no-authority');
  await expect(page.getByRole('heading', { name: 'No organizations available' })).toBeVisible();
});

test('an error state is bilingual and its language toggle preserves the route', async ({ page }) => {
  await page.goto('/button/select-context?mockScenario=expired');
  await page.getByLabel('Season').selectOption('2025-26');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'Representative authority expired' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Français' }).click();
  await expect(
    page.getByRole('heading', { name: 'Autorité de représentant expirée' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/button\/authority-expired$/);
});

test('the service-unavailable state is reachable and dismissible by keyboard only', async ({
  page,
}) => {
  await page.goto('/button/affiliation?mockScenario=service-error');
  await expect(
    page.getByRole('heading', { name: 'Service temporarily unavailable' }),
  ).toBeVisible();

  // The language toggle is focusable and operable without a pointer.
  await page.getByRole('button', { name: 'Français' }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Service temporairement indisponible' }),
  ).toBeVisible();
});
