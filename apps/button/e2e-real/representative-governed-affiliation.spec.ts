import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

interface Profile {
  readonly userId: string;
  readonly organizationId: string;
  readonly displayName: string;
}

interface Fixture {
  readonly tenantId: string;
  readonly seasonId: string;
  readonly profiles: {
    readonly 'rep-a': Profile;
    readonly 'rep-b': Profile;
  };
}

let fixtureCache: Fixture | undefined;

async function fixture(page: Page): Promise<Fixture> {
  if (fixtureCache !== undefined) return fixtureCache;
  const response = await page.request.get('/__e2e__/fixture');
  const body = (await response.json()) as Fixture;
  fixtureCache = body;
  return body;
}

async function setIdentity(page: Page, profile: 'rep-a' | 'rep-b'): Promise<void> {
  await page.goto(`/__e2e__/identity/${profile}?returnTo=/button`);
}

async function selectContext(page: Page): Promise<void> {
  const state = await fixture(page);
  await page.goto('/button/select-context');
  await page.getByLabel('Season').selectOption(state.seasonId);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Affiliation overview' })).toBeVisible();
}

function currentApplicationId(page: Page): string {
  const match = page.url().match(/\/button\/affiliation\/([^/]+)/u);
  if (!match?.[1]) throw new Error('Could not resolve application id from URL.');
  return match[1];
}

async function assertNoSeriousOrCriticalA11y(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking).toEqual([]);
}

test('real browser journey: representative draft, persistence, optimistic concurrency, submit, immutable receipt, and opaque unauthorized denial', async ({
  page,
  context,
}) => {
  const state = await fixture(page);
  let observedRealContextRequest = false;
  page.on('request', (request) => {
    if (request.url().includes('/v1/button/context')) observedRealContextRequest = true;
  });

  await setIdentity(page, 'rep-a');
  await selectContext(page);

  await expect(
    page.getByText(`Affiliation for ${state.profiles['rep-a'].displayName}`),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Fran\u00e7ais' }).click();
    await expect(page.getByRole('heading', { name: /Aperçu/u })).toBeVisible();
    await page
      .getByRole('group', { name: 'Langue' })
      .getByRole('button', { name: 'English', exact: true })
      .click();
  await expect(page.getByRole('heading', { name: 'Affiliation overview' })).toBeVisible();

  await page.getByRole('button', { name: 'Start affiliation' }).click();
  await expect(page.getByRole('heading', { name: 'Affiliation requirements' })).toBeVisible();
  await expect(page.getByTestId('requirements-progress')).toContainText('0 of 4 complete');

  // Requirement 1: acknowledgement.
  await page.getByRole('link', { name: 'Confirm organization profile' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save response' }).click();
  await expect(page.getByText('Response saved')).toBeVisible();
  await page.getByRole('link', { name: 'Back to requirements' }).click();

  // Requirement 2: structured contact + optimistic concurrency stale-write conflict.
  await page.getByRole('link', { name: 'Primary affiliation contact' }).click();
  const requirementUrl = page.url();
  const stalePage = await context.newPage();
  await setIdentity(stalePage, 'rep-a');
  await stalePage.goto(requirementUrl);

  await page.getByLabel('Contact name').fill('Dana Representative');
  await page.getByLabel('Email').fill('dana@example.test');
  await page.getByRole('button', { name: 'Save response' }).click();
  await expect(page.getByText('Response saved')).toBeVisible();

  await stalePage.getByLabel('Contact name').fill('Stale Save Attempt');
  await stalePage.getByLabel('Email').fill('stale@example.test');
  await stalePage.getByRole('button', { name: 'Save response' }).click();
  await expect(
    stalePage.getByText(
      'This draft was changed elsewhere. We reloaded the latest version \u2014 please re-enter and save your changes.',
    ),
  ).toBeVisible();
  await stalePage.close();

  await page.getByRole('link', { name: 'Back to requirements' }).click();

  // Requirement 3: governing document with synthetic evidence.
  await page.getByRole('link', { name: 'Governing document' }).click();
  await page.getByLabel('Document description or reference').fill('Current bylaws');
  await page.getByRole('button', { name: 'Save response' }).click();
  await expect(page.getByText('Response saved')).toBeVisible();
  await page.getByLabel('Attach document').setInputFiles({
    name: 'bylaws.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('synthetic-bylaws'),
  });
  await expect(page.getByText('bylaws.pdf')).toBeVisible();
  await page.getByRole('link', { name: 'Back to requirements' }).click();

  // Requirement 4: insurance with synthetic evidence.
  await page.getByRole('link', { name: 'Insurance confirmation' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save response' }).click();
  await expect(page.getByText('Response saved')).toBeVisible();
  await page.getByLabel('Attach document').setInputFiles({
    name: 'insurance.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('synthetic-insurance'),
  });
  await expect(page.getByText('insurance.pdf')).toBeVisible();
  await page.getByRole('link', { name: 'Back to requirements' }).click();

  await expect(page.getByTestId('requirements-progress')).toContainText('4 of 4 complete');

  // Browser persistence: reload preserves completed server-backed draft state.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Affiliation requirements' })).toBeVisible();
  await expect(page.getByTestId('requirements-progress')).toContainText('4 of 4 complete');

  // Submit through browser controls and capture immutable receipt values.
  await page.getByRole('button', { name: 'Review and submit' }).click();
  await expect(page.getByText('Confirm submission')).toBeVisible();
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByRole('heading', { name: 'Submission receipt' })).toBeVisible();
  await expect(
    page.getByText('Your application was submitted. This receipt confirms submission, not approval.'),
  ).toBeVisible();

  const receiptValues = await page.locator('section[aria-labelledby="submission-receipt-heading"] dd').allTextContents();
  expect(receiptValues.length).toBeGreaterThanOrEqual(2);
  const [receiptId, sequence] = receiptValues;
  expect(receiptId).toBeTruthy();
  expect(sequence).toBe('1');

  // Receipt immutability through browser reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Submission receipt' })).toBeVisible();
  const receiptValuesAfterReload = await page
    .locator('section[aria-labelledby="submission-receipt-heading"] dd')
    .allTextContents();
  expect(receiptValuesAfterReload[0]).toBe(receiptId);
  expect(receiptValuesAfterReload[1]).toBe(sequence);

  // Submitted state is read-only outside correction scope.
  await page.getByRole('link', { name: 'Confirm organization profile' }).click();
  await expect(
    page.getByText(
      'This submitted requirement is read-only because it is outside the requested correction scope.',
    ),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to requirements' }).click();

  // Opaque unauthorized denial: rep-b creates a separate application; rep-a gets Not Found.
  const repB = await context.newPage();
  await setIdentity(repB, 'rep-b');
  await selectContext(repB);
  await repB.getByRole('button', { name: 'Start affiliation' }).click();
  await expect(repB.getByRole('heading', { name: 'Affiliation requirements' })).toBeVisible();
  const repBApplicationId = currentApplicationId(repB);
  await repB.close();

  await setIdentity(page, 'rep-a');
  await page.goto(`/button/affiliation/${repBApplicationId}`);
  await expect(page.getByRole('heading', { name: 'Application not found' })).toBeVisible();

  // Browser route accessibility gate on critical journey pages.
  await setIdentity(page, 'rep-a');
  await page.goto('/button/select-context');
  await assertNoSeriousOrCriticalA11y(page);
  await page.goto('/button/affiliation');
  await assertNoSeriousOrCriticalA11y(page);

  expect(observedRealContextRequest).toBe(true);
});
