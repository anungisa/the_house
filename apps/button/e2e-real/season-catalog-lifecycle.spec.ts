import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

/**
 * Real full-stack GOVERNED SEASON CATALOG journey (Playwright browser -> Button React app ->
 * trusted identity edge -> real House API -> PostgreSQL). No mock API transport.
 *
 * It proves, through a real browser + real API, that the season a representative sees and may act
 * against is decided ENTIRELY by the governed, persisted season catalog — never by a clock or a
 * browser flag:
 *
 *   1. A DRAFT season is invisible in the Button season catalog.
 *   2. On PUBLISH it becomes visible/selectable (alongside the current season).
 *   3. A published-but-NOT-current season is viewable but CANNOT be initiated against — the API
 *      fails closed with SEASON_UNAVAILABLE, while overview (viewing) still succeeds.
 *   4. On RETIRE it disappears from the catalog again.
 *
 * Every season transition is applied the GOVERNED way via the season catalog service (the
 * `scripts/e2e-season-admin.ts` CLI) — never raw `affiliation.season` SQL — so validation, the
 * single-current invariant, the append-only event, audit, and the transactional outbox all run.
 * The journey uses its OWN season key and NEVER calls make-current, so it never disturbs the shared
 * current season the other real-server journeys depend on.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface Profile {
  readonly userId: string;
  readonly organizationId: string;
  readonly displayName: string;
}

interface Fixture {
  readonly tenantId: string;
  readonly seasonId: string;
  readonly profiles: { readonly 'rep-a': Profile };
}

let fixtureCache: Fixture | undefined;

function adminConnection(): string {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    throw new Error('MIGRATE_DATABASE_URL or DATABASE_URL is required for the season-catalog journey.');
  }
  return url;
}

/** Apply one governed season transition through the season catalog service (never raw SQL). */
function seasonAdmin(
  verb: string,
  input: { tenantId: string; seasonId: string; extra?: readonly string[] },
): void {
  execFileSync(
    'npx',
    [
      'tsx',
      join('scripts', 'e2e-season-admin.ts'),
      verb,
      '--tenant',
      input.tenantId,
      '--season',
      input.seasonId,
      ...(input.extra ?? []),
    ],
    {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      env: { ...process.env, MIGRATE_DATABASE_URL: adminConnection() },
    },
  );
}

async function fixture(page: Page): Promise<Fixture> {
  if (fixtureCache !== undefined) return fixtureCache;
  const response = await page.request.get('/__e2e__/fixture');
  fixtureCache = (await response.json()) as Fixture;
  return fixtureCache;
}

async function setIdentity(page: Page): Promise<void> {
  await page.goto('/__e2e__/identity/rep-a?returnTo=/button');
}

/** Count of `<option>` elements in the season dropdown whose value is `seasonId`. */
function seasonOption(page: Page, seasonId: string) {
  return page.locator(`#season-select option[value="${seasonId}"]`);
}

test('real browser journey: governed season catalog visibility and initiation gating', async ({
  page,
}) => {
  const state = await fixture(page);
  const tenantId = state.tenantId;
  const orgId = state.profiles['rep-a'].organizationId;
  // A journey-private season key so we never touch the shared current season.
  const lcSeason = `lc-${randomUUID().slice(0, 8)}`;

  await setIdentity(page);

  // 1. Baseline: the shared current season is selectable; the journey season does not yet exist.
  await page.goto('/button/select-context');
  await expect(seasonOption(page, state.seasonId)).toHaveCount(1);
  await expect(seasonOption(page, lcSeason)).toHaveCount(0);

  // 2. A DRAFT season stays invisible in the catalog.
  seasonAdmin('create-draft', { tenantId, seasonId: lcSeason });
  await page.goto('/button/select-context');
  await expect(seasonOption(page, state.seasonId)).toHaveCount(1);
  await expect(seasonOption(page, lcSeason)).toHaveCount(0);

  // 3. On PUBLISH the season becomes visible/selectable alongside the current season.
  seasonAdmin('publish', { tenantId, seasonId: lcSeason });
  await page.goto('/button/select-context');
  await expect(seasonOption(page, lcSeason)).toHaveCount(1);
  await expect(seasonOption(page, state.seasonId)).toHaveCount(1);

  // 4. Published-but-not-current: viewable (overview 200) yet NOT initiable (API fails closed).
  const overview = await page.request.get(
    `/v1/button/affiliation?organizationId=${encodeURIComponent(orgId)}&season=${encodeURIComponent(lcSeason)}`,
    { headers: { accept: 'application/json' } },
  );
  expect(overview.status()).toBe(200);

  const initiate = await page.request.post('/v1/button/affiliation/applications', {
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    data: { organizationId: orgId, seasonId: lcSeason, pathway: 'new_affiliation' },
  });
  expect(initiate.status()).toBe(409);
  const initiateBody = (await initiate.json()) as { readonly code?: string };
  expect(initiateBody.code).toBe('SEASON_UNAVAILABLE');

  // 5. On RETIRE the season disappears from the catalog again.
  seasonAdmin('retire', { tenantId, seasonId: lcSeason });
  await page.goto('/button/select-context');
  await expect(seasonOption(page, lcSeason)).toHaveCount(0);
  await expect(seasonOption(page, state.seasonId)).toHaveCount(1);
});
