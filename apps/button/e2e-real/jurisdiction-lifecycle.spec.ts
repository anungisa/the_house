import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

/**
 * Real full-stack GOVERNED JURISDICTION journey (Playwright browser -> Button React app -> trusted
 * identity edge -> real House API -> PostgreSQL). No mock API transport.
 *
 * It proves, through a real browser + real API, that an organization's governing jurisdiction is a
 * HOUSE-GOVERNED, tenant-isolated, PERSISTED, hierarchy-aware fact — never derived from its type or
 * name — and that affiliation INITIATION fails closed unless a single jurisdiction resolves:
 *
 *   1. With NO assignment (self or ancestor), the org has no jurisdiction and NEW affiliation is
 *      unavailable — initiation fails closed with JURISDICTION_UNAVAILABLE — while VIEWING (overview)
 *      still succeeds (jurisdiction gates initiation, not read).
 *   2. Assigning an INHERITABLE jurisdiction to the PARENT makes the child resolve it by INHERITANCE
 *      (bilingual label rendered live, en + fr) and initiation succeeds.
 *   3. A DIRECT assignment on the child OVERRIDES the inherited one.
 *   4. Revoking the child's direct assignment RESUMES the inherited jurisdiction.
 *   5. Revoking the ANCESTOR's assignment breaks the chain — the child is unresolved again and
 *      initiation is blocked once more.
 *
 * Every jurisdiction transition is applied the GOVERNED way via the jurisdiction catalog service
 * (the `scripts/e2e-jurisdiction-admin.ts` CLI) — never raw assignment SQL — so validation, the
 * one-active-primary invariant, the append-only event, audit, and the transactional outbox all run.
 * The journey uses its OWN organizations (`jur-rep` + its parent) and never touches the shared
 * representative orgs the other real-server journeys depend on.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface Profile {
  readonly userId: string;
  readonly organizationId: string;
  readonly parentOrganizationId?: string;
  readonly displayName: string;
}

interface Fixture {
  readonly tenantId: string;
  readonly seasonId: string;
  readonly profiles: { readonly 'jur-rep': Profile };
}

interface AccessibleOrganizationView {
  readonly organizationId: string;
  readonly jurisdiction?: { readonly code: string; readonly label: string; readonly level: string };
  readonly affiliationAvailable: boolean;
}

let fixtureCache: Fixture | undefined;

function adminConnection(): string {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    throw new Error('MIGRATE_DATABASE_URL or DATABASE_URL is required for the jurisdiction journey.');
  }
  return url;
}

/** Apply one governed jurisdiction transition through the catalog service (never raw SQL). */
function jurisdictionAdmin(verb: string, extra: readonly string[]): void {
  execFileSync('npx', ['tsx', join('scripts', 'e2e-jurisdiction-admin.ts'), verb, ...extra], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    env: { ...process.env, MIGRATE_DATABASE_URL: adminConnection() },
  });
}

async function fixture(page: Page): Promise<Fixture> {
  if (fixtureCache !== undefined) return fixtureCache;
  const response = await page.request.get('/__e2e__/fixture');
  fixtureCache = (await response.json()) as Fixture;
  return fixtureCache;
}

async function setIdentity(page: Page): Promise<void> {
  await page.goto('/__e2e__/identity/jur-rep?returnTo=/button');
}

/** The signed-in org's server-resolved accessible view (jurisdiction + affiliation availability). */
async function accessibleOrg(page: Page, organizationId: string): Promise<AccessibleOrganizationView> {
  const response = await page.request.get('/v1/button/context', {
    headers: { accept: 'application/json' },
  });
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    readonly context: { readonly accessibleOrganizations: readonly AccessibleOrganizationView[] };
  };
  const org = body.context.accessibleOrganizations.find((o) => o.organizationId === organizationId);
  if (org === undefined) throw new Error(`Organization ${organizationId} not in accessible context.`);
  return org;
}

async function overviewStatus(page: Page, organizationId: string, seasonId: string): Promise<number> {
  const response = await page.request.get(
    `/v1/button/affiliation?organizationId=${encodeURIComponent(organizationId)}&season=${encodeURIComponent(seasonId)}`,
    { headers: { accept: 'application/json' } },
  );
  return response.status();
}

async function initiate(
  page: Page,
  organizationId: string,
  seasonId: string,
): Promise<{ status: number; code?: string }> {
  const response = await page.request.post('/v1/button/affiliation/applications', {
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    data: { organizationId, seasonId, pathway: 'new_affiliation' },
  });
  const body = (await response.json()) as { readonly code?: string };
  return { status: response.status(), ...(body.code !== undefined ? { code: body.code } : {}) };
}

test('real browser journey: governed jurisdiction resolution, inheritance, override, and fail-closed initiation gating', async ({
  page,
}) => {
  const state = await fixture(page);
  const tenantId = state.tenantId;
  const childOrg = state.profiles['jur-rep'].organizationId;
  const parentOrg = state.profiles['jur-rep'].parentOrganizationId;
  if (parentOrg === undefined) throw new Error('jur-rep fixture is missing its parent organization.');

  // Journey-private jurisdiction codes so a `reuseExistingServer` local re-run never collides.
  const token = randomUUID().slice(0, 8);
  const provincialCode = `jprov-${token}`;
  const municipalCode = `jcity-${token}`;
  const provincialEn = 'Provincial curling body';
  const provincialFr = 'Organisme provincial de curling';
  const municipalEn = 'Municipal curling district';

  await setIdentity(page);

  // 1. No self/ancestor assignment: no jurisdiction, initiation fails closed, viewing still works.
  {
    const org = await accessibleOrg(page, childOrg);
    expect(org.jurisdiction).toBeUndefined();
    expect(org.affiliationAvailable).toBe(false);

    const blocked = await initiate(page, childOrg, state.seasonId);
    expect(blocked.status).toBe(409);
    expect(blocked.code).toBe('JURISDICTION_UNAVAILABLE');

    // Jurisdiction gates INITIATION, not READ: overview remains available.
    expect(await overviewStatus(page, childOrg, state.seasonId)).toBe(200);
  }

  // 2. Assign an INHERITABLE jurisdiction to the PARENT: the child resolves it by inheritance.
  jurisdictionAdmin('ensure-published', [
    '--tenant', tenantId, '--code', provincialCode, '--level', 'subdivision',
    '--label-en', provincialEn, '--label-fr', provincialFr,
  ]);
  jurisdictionAdmin('assign-primary', [
    '--tenant', tenantId, '--org', parentOrg, '--code', provincialCode, '--mode', 'inheritable',
  ]);
  {
    const org = await accessibleOrg(page, childOrg);
    expect(org.jurisdiction?.code).toBe(provincialCode);
    expect(org.jurisdiction?.label).toBe(provincialEn);
    expect(org.affiliationAvailable).toBe(true);

    const ok = await initiate(page, childOrg, state.seasonId);
    expect([200, 201]).toContain(ok.status);
  }

  // 2b. The inherited jurisdiction renders LIVE in the browser, bilingually (en + fr).
  await page.goto('/button/select-context');
  await page.getByLabel('Season').selectOption(state.seasonId);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Affiliation overview' })).toBeVisible();
  await expect(page.getByText(provincialEn)).toBeVisible();
  await page.getByRole('button', { name: 'Fran\u00e7ais' }).click();
  await expect(page.getByText(provincialFr)).toBeVisible();

  // 3. A DIRECT assignment on the child OVERRIDES the inherited jurisdiction.
  jurisdictionAdmin('ensure-published', [
    '--tenant', tenantId, '--code', municipalCode, '--level', 'local',
    '--label-en', municipalEn, '--label-fr', 'District municipal de curling',
  ]);
  jurisdictionAdmin('assign-primary', [
    '--tenant', tenantId, '--org', childOrg, '--code', municipalCode, '--mode', 'direct',
  ]);
  {
    const org = await accessibleOrg(page, childOrg);
    expect(org.jurisdiction?.code).toBe(municipalCode);
    expect(org.affiliationAvailable).toBe(true);
  }

  // 4. Revoking the child's DIRECT assignment RESUMES the inherited jurisdiction.
  jurisdictionAdmin('revoke', ['--tenant', tenantId, '--org', childOrg]);
  {
    const org = await accessibleOrg(page, childOrg);
    expect(org.jurisdiction?.code).toBe(provincialCode);
    expect(org.affiliationAvailable).toBe(true);
  }

  // 5. Revoking the ANCESTOR's assignment breaks the chain: unresolved + initiation blocked again.
  jurisdictionAdmin('revoke', ['--tenant', tenantId, '--org', parentOrg]);
  {
    const org = await accessibleOrg(page, childOrg);
    expect(org.jurisdiction).toBeUndefined();
    expect(org.affiliationAvailable).toBe(false);

    const blocked = await initiate(page, childOrg, state.seasonId);
    expect(blocked.status).toBe(409);
    expect(blocked.code).toBe('JURISDICTION_UNAVAILABLE');
  }
});
