import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  runStandingProjectionOnce,
  seedBlockingFinancialObligation,
} from './support/operational';

/**
 * Phase A2 — the complete governed OPERATIONAL affiliation journey, driven through the real Button
 * against the real API + real Governance Kernel + real Postgres. It continues past submission
 * (proven in A1) through the full institutional lifecycle: reviewer intake, a bounded correction,
 * representative resubmission, two-tier governed decision, governed execution, a financially
 * BLOCKED activation, governed finance reconciliation, successful activation, the governed standing
 * projection, and the representative's authoritative standing outcome.
 *
 * Every institutional action is performed through a real browser surface by a DISTINCT identity —
 * no single actor holds review, sign-off, finance, and representative authority — so the journey
 * proves genuine separation of duties. The only non-browser prerequisites are the two facts that
 * have NO Button operating surface (a current season, seeded in global-setup, and an upstream
 * accounting-confirmed financial obligation, seeded through the same kernel-backed service). The
 * governed determinations themselves — decision, reconciliation, activation, standing — all happen
 * through the Button. No mock mode, no second harness, no direct service substitution for a
 * surface that exists.
 */

interface Profile {
  readonly userId: string;
  readonly organizationId: string;
  readonly displayName: string;
  readonly roleKeys: readonly string[];
}

interface Fixture {
  readonly tenantId: string;
  readonly seasonId: string;
  readonly profiles: {
    readonly 'rep-a': Profile;
    readonly 'rep-b': Profile;
    readonly 'op-rep': Profile;
    readonly reviewer: Profile;
    readonly 'reviewer-foreign': Profile;
    readonly 'regional-reviewer': Profile;
    readonly 'national-reviewer': Profile;
    readonly 'finance-reconciler': Profile;
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

async function setIdentity(page: Page, profile: string, returnTo = '/button'): Promise<void> {
  await page.goto(`/__e2e__/identity/${profile}?returnTo=${encodeURIComponent(returnTo)}`);
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

async function ensureChecked(locator: Locator): Promise<void> {
  if (!(await locator.isChecked())) {
    await locator.click();
  }
}

async function attachEvidence(
  page: Page,
  input: { readonly filename: string; readonly mimeType: string; readonly content: string },
): Promise<void> {
  const evidenceSection = page.locator('.requirement-evidence');
  const evidenceList = evidenceSection.getByRole('listitem');
  const existingEvidenceCount = await evidenceList.count();
  const associationPromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === 'POST' &&
      /\/v1\/button\/affiliation\/applications\/[^/]+\/evidence-links$/u.test(url.pathname)
    );
  });

  await page.getByLabel('Attach document').setInputFiles({
    name: input.filename,
    mimeType: input.mimeType,
    buffer: Buffer.from(input.content),
  });

  const associationResponse = await associationPromise;
  expect(associationResponse.ok()).toBe(true);
  await expect(evidenceList).toHaveCount(existingEvidenceCount + 1);
  await expect(page.getByLabel('Attach document')).toHaveValue('');
}

function isDraftWriteResponse(response: Response): boolean {
  const url = new URL(response.url());
  return response.request().method() === 'PUT' && url.pathname.endsWith('/draft');
}

async function saveDraftAndWait(page: Page): Promise<void> {
  const responsePromise = page.waitForResponse(isDraftWriteResponse);
  await page.getByRole('button', { name: 'Save response' }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  await expect(page.getByText('Response saved')).toBeVisible();
}

function waitForPost(page: Page, pathPattern: RegExp): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && pathPattern.test(new URL(response.url()).pathname),
  );
}

/**
 * Fill and submit a fresh affiliation application as the currently-selected representative, reusing
 * the A1-proven browser requirement flow. Returns the governed application id.
 */
async function submitFreshApplication(page: Page): Promise<string> {
  const begin = page.getByRole('button', { name: 'Start affiliation' });
  if (await begin.isVisible()) {
    await begin.click();
  } else {
    await page.getByRole('button', { name: 'Continue draft' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Affiliation requirements' })).toBeVisible();

  // Requirement 1: organization profile acknowledgement.
  await page.getByRole('link', { name: 'Confirm organization profile' }).click();
  const applicationId = currentApplicationId(page);
  await ensureChecked(page.getByRole('checkbox').first());
  await saveDraftAndWait(page);
  await page.getByRole('link', { name: 'Back to requirements' }).click();

  // Requirement 2: structured primary contact.
  await page.getByRole('link', { name: 'Primary affiliation contact' }).click();
  await page.locator('#contact-name').fill('Dana Representative');
  await page.locator('#contact-email').fill('dana@example.test');
  await saveDraftAndWait(page);
  await page.getByRole('link', { name: 'Back to requirements' }).click();

  // Requirement 3: governing document with synthetic evidence.
  await page.getByRole('link', { name: 'Governing document' }).click();
  await page.getByLabel('Document description or reference').fill('Current bylaws');
  await saveDraftAndWait(page);
  await attachEvidence(page, {
    filename: 'bylaws.pdf',
    mimeType: 'application/pdf',
    content: 'synthetic-bylaws',
  });
  await page.getByRole('link', { name: 'Back to requirements' }).click();

  // Requirement 4: insurance confirmation with synthetic evidence.
  await page.getByRole('link', { name: 'Insurance confirmation' }).click();
  await ensureChecked(page.getByRole('checkbox').first());
  await saveDraftAndWait(page);
  await attachEvidence(page, {
    filename: 'insurance.pdf',
    mimeType: 'application/pdf',
    content: 'synthetic-insurance-proof',
  });
  await page.getByRole('link', { name: 'Back to requirements' }).click();

  await expect(page.getByTestId('requirements-progress')).toContainText('4 of 4 complete', {
    timeout: 15_000,
  });

  await page.getByRole('button', { name: 'Review and submit' }).click();
  await expect(page.getByText('Confirm submission')).toBeVisible();
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByRole('heading', { name: 'Submission receipt' })).toBeVisible({
    timeout: 15_000,
  });

  return applicationId;
}

function reviewCasePath(applicationId: string): string {
  return `/button/review/${applicationId}`;
}

test('real browser journey: submitted affiliation through governed review, correction, two-tier decision, blocked and cleared activation, standing projection, and authoritative outcome', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const state = await fixture(page);
  const opRep = state.profiles['op-rep'];
  const applicationPath = (id: string): string => `/v1/button/affiliation/applications/${id}`;

  let applicationId = '';

  await test.step('Representative submits a governed affiliation application', async () => {
    await setIdentity(page, 'op-rep');
    await selectContext(page);
    await expect(page.getByText(`Affiliation for ${opRep.displayName}`)).toBeVisible();
    applicationId = await submitFreshApplication(page);
  });

  await test.step('Upstream finance seeds an accounting-confirmed BLOCKING obligation (no Button surface exists for assessment)', async () => {
    await seedBlockingFinancialObligation({
      tenantId: state.tenantId,
      applicationId,
      obligationId: crypto.randomUUID(),
      subjectId: opRep.organizationId,
      season: state.seasonId,
    });
  });

  await test.step('Reviewer claims the submitted case (bilingual queue, a11y, governed intake)', async () => {
    await setIdentity(page, 'reviewer', '/button/review');
    await expect(page.getByRole('heading', { name: 'Affiliation review queue' })).toBeVisible();
    await assertNoSeriousOrCriticalA11y(page);

    // French operational surface: the review queue renders fully in French, including the governed
    // intake control, then returns to English for the remainder of the journey.
    await page.getByRole('button', { name: 'Fran\u00e7ais' }).click();
    await expect(
      page.getByRole('heading', { name: 'File d\u2019examen des affiliations' }),
    ).toBeVisible();
    const frenchItem = page.locator('li.requirement-card').filter({ hasText: applicationId });
    await expect(frenchItem.getByRole('button', { name: 'Commencer l\u2019examen' })).toBeVisible();
    await page
      .getByRole('group', { name: 'Langue' })
      .getByRole('button', { name: 'English', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Affiliation review queue' })).toBeVisible();

    const queueItem = page.locator('li.requirement-card').filter({ hasText: applicationId });
    await expect(queueItem).toBeVisible();
    const startResponse = waitForPost(
      page,
      /\/v1\/button\/affiliation\/applications\/[^/]+\/review-start$/u,
    );
    await queueItem.getByRole('button', { name: 'Start review' }).click();
    expect((await startResponse).ok()).toBe(true);

    await expect(queueItem.getByText('Assigned to you')).toBeVisible();
    await queueItem.getByRole('link', { name: 'Open case' }).click();
    await expect(page.getByRole('heading', { name: 'Review submitted affiliation' })).toBeVisible();
    await assertNoSeriousOrCriticalA11y(page);
  });

  await test.step('Scope isolation: an out-of-scope reviewer cannot see or open the case (opaque)', async () => {
    const foreign = await context.newPage();
    await setIdentity(foreign, 'reviewer-foreign', '/button/review');
    await expect(foreign.getByRole('heading', { name: 'Affiliation review queue' })).toBeVisible();
    await expect(
      foreign.getByText('No affiliation cases currently require your review.'),
    ).toBeVisible();
    await expect(
      foreign.locator('li.requirement-card').filter({ hasText: applicationId }),
    ).toHaveCount(0);

    // The case endpoint is opaque to an out-of-scope reviewer: a 404, never a 403 that would
    // confirm the case exists.
    const caseResponse = await foreign.request.get(
      `${applicationPath(applicationId)}/review-case`,
      { headers: { accept: 'application/json' } },
    );
    expect(caseResponse.status()).toBe(404);
    await foreign.close();
  });

  await test.step('Reviewer requests a bounded correction on one requirement', async () => {
    await setIdentity(page, 'reviewer', reviewCasePath(applicationId));
    await expect(page.getByRole('heading', { name: 'Review submitted affiliation' })).toBeVisible();
    await page
      .getByLabel('Requirement to correct')
      .selectOption({ label: 'Primary affiliation contact' });
    await page
      .getByLabel('Reason for correction')
      .fill('Please provide the current primary contact email.');
    const correctionResponse = waitForPost(
      page,
      /\/v1\/button\/affiliation\/applications\/[^/]+\/corrections$/u,
    );
    await page.getByRole('button', { name: 'Send correction request' }).click();
    expect((await correctionResponse).ok()).toBe(true);
    await expect(
      page.getByText(
        'Correction request sent. The selected requirement is now editable by the applicant.',
      ),
    ).toBeVisible();
  });

  await test.step('Representative performs the bounded correction and resubmits', async () => {
    await setIdentity(page, 'op-rep');
    await selectContext(page);
    await page.getByRole('button', { name: 'View affiliation status' }).click();
    await expect(page.getByRole('heading', { name: 'Correction requested' })).toBeVisible();

    // In-scope requirement is editable again.
    await page.getByRole('link', { name: 'Primary affiliation contact' }).click();
    await page.locator('#contact-email').fill('primary-contact@example.test');
    await saveDraftAndWait(page);
    await page.getByRole('link', { name: 'Back to requirements' }).click();

    // Out-of-scope requirement remains read-only — bounded correction is enforced, not cosmetic.
    await page.getByRole('link', { name: 'Confirm organization profile' }).click();
    await expect(
      page.getByText(
        'This submitted requirement is read-only because it is outside the requested correction scope.',
      ),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Back to requirements' }).click();

    const resubmitResponse = waitForPost(
      page,
      /\/v1\/button\/affiliation\/applications\/[^/]+\/corrections\/[^/]+\/resubmissions$/u,
    );
    await page.getByRole('button', { name: 'Resubmit corrections' }).click();
    expect((await resubmitResponse).ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Correction requested' })).toBeHidden({
      timeout: 15_000,
    });
  });

  await test.step('Reviewer proposes a governed outcome into two-tier review', async () => {
    await setIdentity(page, 'reviewer', reviewCasePath(applicationId));
    await expect(page.getByRole('heading', { name: 'Review submitted affiliation' })).toBeVisible();
    await page.getByLabel('Proposed outcome').selectOption({ label: 'Approve affiliation' });
    await page
      .getByLabel('Decision rationale')
      .fill('All governed requirements are complete and evidence is present.');
    const proposeResponse = waitForPost(
      page,
      /\/v1\/button\/affiliation\/applications\/[^/]+\/decision-proposals$/u,
    );
    await page.getByRole('button', { name: 'Create decision workflow' }).click();
    expect((await proposeResponse).ok()).toBe(true);
    await expect(page.getByText('Two-tier review is in progress.')).toBeVisible();
    await expect(page.getByText('Current review tier: regional_signoff')).toBeVisible();
  });

  await test.step('Regional sign-off supports the proposed outcome', async () => {
    await setIdentity(page, 'regional-reviewer', reviewCasePath(applicationId));
    await expect(page.getByText('Two-tier review is in progress.')).toBeVisible();
    const tierResponse = waitForPost(
      page,
      /\/v1\/button\/affiliation\/applications\/[^/]+\/tier-decisions$/u,
    );
    await page.getByRole('button', { name: 'Support proposed outcome' }).click();
    expect((await tierResponse).ok()).toBe(true);
    await expect(page.getByText('Current review tier: national_signoff')).toBeVisible();
  });

  await test.step('National sign-off supports the proposed outcome (both tiers approved)', async () => {
    await setIdentity(page, 'national-reviewer', reviewCasePath(applicationId));
    await expect(page.getByText('Two-tier review is in progress.')).toBeVisible();
    const tierResponse = waitForPost(
      page,
      /\/v1\/button\/affiliation\/applications\/[^/]+\/tier-decisions$/u,
    );
    await page.getByRole('button', { name: 'Support proposed outcome' }).click();
    expect((await tierResponse).ok()).toBe(true);
    await expect(page.getByText('Both review tiers approved the proposed outcome.')).toBeVisible();
  });

  await test.step('Reviewer executes the governed outcome', async () => {
    await setIdentity(page, 'reviewer', reviewCasePath(applicationId));
    await expect(page.getByText('Both review tiers approved the proposed outcome.')).toBeVisible();
    const executeResponse = waitForPost(
      page,
      /\/v1\/button\/affiliation\/applications\/[^/]+\/decision-executions$/u,
    );
    await page.getByRole('button', { name: 'Execute governed outcome' }).click();
    expect((await executeResponse).ok()).toBe(true);
    await expect(
      page.getByText('Governed outcome executed. Lifecycle state: approved.'),
    ).toBeVisible();
  });

  await test.step('Activation is BLOCKED while the obligation is unreconciled', async () => {
    const activationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/v1\/button\/affiliation\/applications\/[^/]+\/activations$/u.test(
          new URL(response.url()).pathname,
        ),
    );
    await page.getByRole('button', { name: 'Activate affiliation' }).click();
    const blocked = await activationResponse;
    expect(blocked.ok()).toBe(false);
    await expect(
      page.getByRole('alert').filter({
        hasText:
          'Activation could not be completed. Confirm the season and financial clearance, then try again.',
      }),
    ).toBeVisible();
  });

  await test.step('Finance reconciles the confirmed obligation through the governed workbench', async () => {
    await setIdentity(page, 'finance-reconciler', '/button/finance');
    await expect(
      page.getByRole('heading', { name: 'Affiliation finance workbench' }),
    ).toBeVisible();
    await assertNoSeriousOrCriticalA11y(page);

    const obligation = page.locator('li.affiliation-card').filter({ hasText: applicationId });
    await expect(obligation).toBeVisible();
    await expect(
      obligation.getByText('Accounting confirmed \u2014 reconciliation required'),
    ).toBeVisible();
    await expect(
      obligation.getByText('Blocks affiliation activation until financially cleared'),
    ).toBeVisible();

    await obligation
      .getByLabel('Reconciliation rationale')
      .fill('Payment verified against accounting-confirmed amount.');
    const reconcileResponse = waitForPost(
      page,
      /\/v1\/button\/affiliation\/financial-obligations\/[^/]+\/reconciliations$/u,
    );
    await obligation.getByRole('button', { name: 'Reconcile confirmed amount' }).click();
    expect((await reconcileResponse).ok()).toBe(true);

    const reconciled = page.locator('li.affiliation-card').filter({ hasText: applicationId });
    await expect(reconciled.getByText('Reconciled')).toBeVisible();
    await expect(
      reconciled.getByText('Financially cleared for affiliation activation'),
    ).toBeVisible();
  });

  await test.step('Reviewer activates the now-cleared affiliation exactly once', async () => {
    await setIdentity(page, 'reviewer', reviewCasePath(applicationId));
    await expect(page.getByRole('heading', { name: 'Activate affiliation' })).toBeVisible();
    const activationResponse = waitForPost(
      page,
      /\/v1\/button\/affiliation\/applications\/[^/]+\/activations$/u,
    );
    await page.getByRole('button', { name: 'Activate affiliation' }).click();
    expect((await activationResponse).ok()).toBe(true);
    await expect(
      page.getByText('Affiliation activated. Authoritative standing is being established.'),
    ).toBeVisible();
  });

  await test.step('The governed standing projection runs (production worker, one batch)', async () => {
    await runStandingProjectionOnce();
  });

  await test.step('Representative observes the authoritative governed standing', async () => {
    await setIdentity(page, 'op-rep');
    await selectContext(page);
    await page.getByRole('link', { name: 'Standing', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Affiliation standing' })).toBeVisible();

    const standingCard = page
      .locator('li.affiliation-card')
      .filter({ hasText: `Standing for season ${state.seasonId}` });
    await expect(standingCard).toBeVisible();
    await expect(standingCard.getByText('Pending establishment')).toBeVisible();
    await assertNoSeriousOrCriticalA11y(page);

    await standingCard.getByRole('link', { name: 'View standing detail' }).click();
    await expect(
      page.getByRole('heading', { name: 'Affiliation standing detail' }),
    ).toBeVisible();
    await expect(page.getByText('Effective from')).toBeVisible();
    await assertNoSeriousOrCriticalA11y(page);
  });

  await test.step('Separation of duties: cross-role and cross-actor access is denied', async () => {
    // A representative cannot reach reviewer commands.
    await setIdentity(page, 'op-rep', '/button/review');
    await expect(page.getByRole('heading', { name: 'Access not available' })).toBeVisible();

    // A reviewer cannot reach the finance workbench.
    await setIdentity(page, 'reviewer', '/button/finance');
    await expect(page.getByRole('heading', { name: 'Access not available' })).toBeVisible();

    // A finance reconciler cannot reach reviewer commands.
    await setIdentity(page, 'finance-reconciler', '/button/review');
    await expect(page.getByRole('heading', { name: 'Access not available' })).toBeVisible();

    // A different representative cannot observe this application (opaque 404, never a 403).
    const repB = await context.newPage();
    await setIdentity(repB, 'rep-b');
    const crossActor = await repB.request.get(applicationPath(applicationId), {
      headers: { accept: 'application/json' },
    });
    expect(crossActor.status()).toBe(404);
    await repB.close();
  });
});
