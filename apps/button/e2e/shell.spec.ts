import { test, expect } from '@playwright/test';

/**
 * End-to-end shell journey against the mock transport (synthetic data). Proves that a
 * representative can load the shell, select context, reach the guarded affiliation landing, and
 * switch language — all through a real browser.
 */

test('representative loads the shell, selects context, and reaches affiliation', async ({ page }) => {
  await page.goto('/button');
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();

  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Select context' })).toBeVisible();

  await page.getByLabel('Season').selectOption('2026-27');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Affiliation overview' })).toBeVisible();
});

test('language switch preserves the current route', async ({ page }) => {
  await page.goto('/button/select-context');
  await expect(page.getByRole('heading', { name: 'Select context' })).toBeVisible();

  await page.getByRole('button', { name: 'Français' }).click();
  await expect(page.getByRole('heading', { name: 'Choisir le contexte' })).toBeVisible();
});

test('keyboard-only navigation reaches the affiliation landing', async ({ page }) => {
  await page.goto('/button/select-context');
  await expect(page.getByLabel('Organization')).toBeVisible();

  await page.getByLabel('Season').selectOption('2025-26');
  await page.getByRole('button', { name: 'Continue' }).press('Enter');

  await expect(page.getByRole('heading', { name: 'Affiliation overview' })).toBeVisible();
});

test('representative initiates a draft, saves a requirement response, and resumes it as complete', async ({
  page,
}) => {
  // Select context and land on the affiliation overview.
  await page.goto('/button/select-context');
  await page.getByLabel('Season').selectOption('2025-26');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Affiliation overview' })).toBeVisible();

  // Begin a new application -> versioned requirements checklist.
  await page.getByRole('button', { name: 'Start affiliation' }).click();
  await expect(page.getByRole('heading', { name: 'Affiliation requirements' })).toBeVisible();
  await expect(page.getByTestId('requirements-progress')).toContainText('0 of 4 complete');

  // Open a requirement and record a response (no submission action exists in Slice C).
  await page.getByRole('link', { name: 'Confirm organization profile' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm organization profile' })).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save response' }).click();
  await expect(page.getByText('Response saved')).toBeVisible();

  // Resume the checklist: the response persisted and the requirement is now complete.
  await page.getByRole('link', { name: 'Back to requirements' }).click();
  await expect(page.getByRole('heading', { name: 'Affiliation requirements' })).toBeVisible();
  await expect(page.getByTestId('status-ORG_PROFILE_CONFIRMATION')).toContainText('Complete');
  await expect(page.getByTestId('requirements-progress')).toContainText('1 of 4 complete');
});

