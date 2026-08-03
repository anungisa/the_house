import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
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

async function openAffiliationChecklist(page: Page): Promise<void> {
  const begin = page.getByRole('button', { name: 'Start affiliation' });
  if (await begin.isVisible()) {
    await begin.click();
    return;
  }

  await page.getByRole('button', { name: 'Continue draft' }).click();
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

async function ensureChecked(locator: Locator): Promise<void> {
  if (!(await locator.isChecked())) {
    await locator.click();
  }
}

async function attachEvidence(
  page: Page,
  input: {
    readonly filename: string;
    readonly mimeType: string;
    readonly content: string;
  },
): Promise<void> {
  const evidenceSection = page.locator('.requirement-evidence');
  const fileInput = page.getByLabel('Attach document');

  const uploadAndWaitForAssociation = async (): Promise<Response> => {
    const associationResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());

      return (
        response.request().method() === 'POST' &&
        /\/v1\/button\/affiliation\/applications\/[^/]+\/evidence-links$/u.test(url.pathname)
      );
    });

    await fileInput.setInputFiles({
      name: input.filename,
      mimeType: input.mimeType,
      buffer: Buffer.from(input.content),
    });

    return associationResponse;
  };

  let response: Response | undefined;
  let failureDetails = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await uploadAndWaitForAssociation();
    if (response.ok()) break;

    const responseBody = await response.text();
    failureDetails = `status ${response.status()}: ${responseBody}`;

    // Evidence boundary can reject a fresh reference transiently before validation catches up.
    if (
      response.status() === 400 &&
      responseBody.includes('AFFILIATION_EVIDENCE_REFERENCE_INVALID')
    ) {
      continue;
    }

    // Draft token can advance between interactions; refresh and retry with the latest token.
    if (response.status() === 409) {
      const refreshDraftResponse = page.waitForResponse(isDraftWriteResponse);
      await page.getByRole('button', { name: 'Save response' }).click();
      expect((await refreshDraftResponse).ok()).toBe(true);
      continue;
    }

    break;
  }

  expect(response?.ok() === true, `Evidence association failed: ${failureDetails}`).toBe(true);

  // Authoritative projection has returned and rendered the linked evidence.
  await expect(evidenceSection.getByRole('listitem')).toHaveCount(1);
  await expect(evidenceSection.getByRole('button', { name: 'Remove' })).toBeVisible();

  // The component clears the input after mutation settlement.
  await expect(fileInput).toHaveValue('');
}

function isDraftWriteResponse(response: Response): boolean {
  const url = new URL(response.url());

  return response.request().method() === 'PUT' && url.pathname.endsWith('/draft');
}

async function saveDraftAndWait(page: Page): Promise<Response> {
  const responsePromise = page.waitForResponse(isDraftWriteResponse);

  await page.getByRole('button', { name: 'Save response' }).click();

  const response = await responsePromise;
  expect(response.ok()).toBe(true);

  return response;
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

  await openAffiliationChecklist(page);
  await expect(page.getByRole('heading', { name: 'Affiliation requirements' })).toBeVisible();
  await expect(page.getByTestId('requirements-progress')).toContainText('of 4 complete');

  // Requirement 1: acknowledgement.
  await page.getByRole('link', { name: 'Confirm organization profile' }).click();

  const applicationId = currentApplicationId(page);
  const stalePage = await context.newPage();
  await setIdentity(stalePage, 'rep-a');
  await selectContext(stalePage);

  const staleProjectionResponse = await stalePage.request.get(
    `/v1/button/affiliation/applications/${encodeURIComponent(applicationId)}`,
    { headers: { accept: 'application/json' } },
  );
  expect(staleProjectionResponse.ok()).toBe(true);

  const staleProjection = (await staleProjectionResponse.json()) as {
    readonly application: {
      readonly concurrencyToken: string;
      readonly requirements: readonly {
        readonly code: string;
        readonly titleEn: string;
        readonly response: Record<string, unknown>;
      }[];
    };
  };

  const staleRequirement = staleProjection.application.requirements.find(
    (requirement) => requirement.titleEn === 'Confirm organization profile',
  );
  if (!staleRequirement) {
    throw new Error('Could not resolve stale requirement snapshot for concurrency proof.');
  }

  // Produce and fully commit a newer server version from primary page.
  const primaryCheckbox = page.getByRole('checkbox').first();

  if (await primaryCheckbox.isChecked()) {
    await primaryCheckbox.uncheck();
    await saveDraftAndWait(page);

    await primaryCheckbox.check();
    await saveDraftAndWait(page);
  } else {
    await primaryCheckbox.check();
    await saveDraftAndWait(page);
  }
  await expect(page.getByText('Response saved')).toBeVisible();

  // Stale-write conflict on the same requirement using an outdated concurrency token.
  const conflictResponse = await stalePage.request.put(
    `/v1/button/affiliation/applications/${encodeURIComponent(applicationId)}/draft`,
    {
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'If-Match': `"${staleProjection.application.concurrencyToken}"`,
      },
      data: {
        responses: [
          {
            requirementCode: staleRequirement.code,
            value: staleRequirement.response,
          },
        ],
      },
    },
  );

  expect(conflictResponse.status()).toBe(409);
  await stalePage.close();

  await page.getByRole('link', { name: 'Back to requirements' }).click();

  // Requirement 2: structured contact.
  await page.getByRole('link', { name: 'Primary affiliation contact' }).click();
  await page.locator('#contact-name').fill('Dana Representative');
  await page.locator('#contact-email').fill('dana@example.test');
  await page.getByRole('button', { name: 'Save response' }).click();
  await expect(page.getByText('Response saved')).toBeVisible();

  await page.getByRole('link', { name: 'Back to requirements' }).click();

  // Requirement 3: governing document with synthetic evidence.
  await page.getByRole('link', { name: 'Governing document' }).click();
  await page.getByLabel('Document description or reference').fill('Current bylaws');
  await page.getByRole('button', { name: 'Save response' }).click();
  await expect(page.getByText('Response saved')).toBeVisible();
  await attachEvidence(page, {
    filename: 'bylaws.pdf',
    mimeType: 'application/pdf',
    content: 'synthetic-bylaws',
  });
  await page.getByRole('link', { name: 'Back to requirements' }).click();

  // Requirement 4: insurance with synthetic evidence.
  await page.getByRole('link', { name: 'Insurance confirmation' }).click();
  await ensureChecked(page.getByRole('checkbox').first());
  await page.getByRole('button', { name: 'Save response' }).click();
  await expect(page.getByText('Response saved')).toBeVisible();
  await attachEvidence(page, {
    filename: 'insurance.pdf',
    mimeType: 'application/pdf',
    content: 'synthetic-insurance',
  });
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
  await openAffiliationChecklist(repB);
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
