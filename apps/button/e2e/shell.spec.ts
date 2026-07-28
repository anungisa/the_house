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

  // Open a requirement and record a response before submitting the completed application.
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

test('representative completes, confirms, submits, and receives an immutable receipt', async ({
  page,
}) => {
  await page.goto('/button/select-context');
  await page.getByLabel('Season').selectOption('2025-26');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start affiliation' }).click();

  await page.getByRole('link', { name: 'Confirm organization profile' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save response' }).click();
  await expect(page.getByText('Response saved')).toBeVisible();
  await page.getByRole('link', { name: 'Back to requirements' }).click();

  await page.getByRole('link', { name: 'Primary affiliation contact' }).click();
  await page.getByLabel('Contact name').fill('Dana Representative');
  await page.getByLabel('Email').fill('dana@example.test');
  await page.getByRole('button', { name: 'Save response' }).click();
  await expect(page.getByText('Response saved')).toBeVisible();
  await page.getByRole('link', { name: 'Back to requirements' }).click();

  await page.getByRole('link', { name: 'Governing document' }).click();
  await page.getByLabel('Document description').fill('Current bylaws');
  await page.getByRole('button', { name: 'Save response' }).click();
  await expect(page.getByText('Response saved')).toBeVisible();
  await page.getByLabel('Attach document').setInputFiles({
    name: 'bylaws.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('synthetic bylaws'),
  });
  await expect(page.getByText('bylaws.pdf')).toBeVisible();
  await page.getByRole('link', { name: 'Back to requirements' }).click();

  await page.getByRole('link', { name: 'Insurance confirmation' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save response' }).click();
  await expect(page.getByText('Response saved')).toBeVisible();
  await page.getByLabel('Attach document').setInputFiles({
    name: 'insurance.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('synthetic insurance'),
  });
  await expect(page.getByText('insurance.pdf')).toBeVisible();
  await page.getByRole('link', { name: 'Back to requirements' }).click();

  await expect(page.getByTestId('requirements-progress')).toContainText('4 of 4 complete');
  await page.getByRole('button', { name: 'Review and submit' }).click();
  await expect(page.getByText('Confirm submission')).toBeVisible();
  await page.getByRole('button', { name: 'Submit application' }).click();

  await expect(page.getByRole('heading', { name: 'Submission receipt' })).toBeVisible();
  await expect(
    page.getByText('Your application was submitted. This receipt confirms submission, not approval.'),
  ).toBeVisible();
  await expect(page.getByText('receipt-app-0001-1')).toBeVisible();
});
