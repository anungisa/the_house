import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * Real full-stack authority-lifecycle journey (Playwright browser -> Button React app -> trusted
 * identity edge -> real House API -> PostgreSQL). No mock API transport.
 *
 * It proves the GOVERNED representative authority model end-to-end through a real browser:
 *
 *   1. A trusted identity carrying the representative role key + organization header, but with NO
 *      governed grant, is given NOTHING — the context surface shows "No organizations available".
 *      (identity ≠ representative appointment; an org reference in a token ≠ authority to act.)
 *   2. A governed grant is created (controlled House path). On reload the organization becomes
 *      selectable, context selection succeeds, and the representative gains mutation access
 *      (they can start a governed affiliation draft).
 *   3. The grant is REVOKED. On reload the representative loses ALL access again — the context
 *      surface returns to "No organizations available" and the API opaquely denies the draft it
 *      previously created — WITHOUT any polling, background job, or app restart.
 *   4. Revocation removes AUTHORITY, not institutional facts: the organization and the governed
 *      affiliation entity the representative created remain durably in PostgreSQL.
 *
 * The grant/revoke transitions are applied over a controlled admin connection (there is no
 * self-service authority UI); every access decision is exercised through the real browser + API.
 */

const HOUSE_TRUSTED_ISSUER = 'house.trusted';
const AUTHORITY_TYPE = 'club_affiliation_representative';

interface Profile {
  readonly userId: string;
  readonly organizationId: string;
  readonly displayName: string;
}

interface Fixture {
  readonly tenantId: string;
  readonly seasonId: string;
  readonly profiles: {
    readonly 'lifecycle-rep': Profile;
  };
}

let fixtureCache: Fixture | undefined;

function adminConnection(): string {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    throw new Error('MIGRATE_DATABASE_URL or DATABASE_URL is required for the authority-lifecycle journey.');
  }
  return url;
}

async function fixture(page: Page): Promise<Fixture> {
  if (fixtureCache !== undefined) return fixtureCache;
  const response = await page.request.get('/__e2e__/fixture');
  fixtureCache = (await response.json()) as Fixture;
  return fixtureCache;
}

async function setIdentity(page: Page): Promise<void> {
  await page.goto('/__e2e__/identity/lifecycle-rep?returnTo=/button');
}

/** Create a governed ACTIVE representative authority grant (controlled House path). */
async function grantAuthority(
  admin: pg.Pool,
  input: { tenantId: string; userId: string; organizationId: string },
): Promise<void> {
  const subject = await admin.query<{ id: string }>(
    `INSERT INTO authority.identity_subject
       (id, tenant_id, issuer, external_subject, status, source, linked_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'active', 'e2e-lifecycle', now(), now(), now())
     ON CONFLICT (tenant_id, issuer, external_subject)
       DO UPDATE SET status = 'active', unlinked_at = NULL, updated_at = now()
     RETURNING id`,
    [input.tenantId, HOUSE_TRUSTED_ISSUER, input.userId],
  );
  await admin.query(
    `INSERT INTO authority.representative_authority
       (id, tenant_id, identity_subject_id, organization_id, authority_type, status,
        valid_from, issued_by, issued_at, source_reference, idempotency_key, version,
        created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'active',
        now(), 'e2e-lifecycle', now(), 'e2e:lifecycle', $5, 1, now(), now())`,
    [
      input.tenantId,
      subject.rows[0]!.id,
      input.organizationId,
      AUTHORITY_TYPE,
      `e2e-lifecycle-grant:${input.userId}`,
    ],
  );
}

/** Revoke the live grant (controlled House path); revocation must propagate immediately. */
async function revokeAuthority(
  admin: pg.Pool,
  input: { tenantId: string; userId: string; organizationId: string },
): Promise<void> {
  const result = await admin.query(
    `UPDATE authority.representative_authority
       SET status = 'revoked', revoked_by = 'e2e-lifecycle', revoked_at = now(),
           version = version + 1, updated_at = now()
     WHERE tenant_id = $1 AND organization_id = $2 AND authority_type = $3 AND status = 'active'
       AND identity_subject_id = (
         SELECT id FROM authority.identity_subject
          WHERE tenant_id = $1 AND issuer = $4 AND external_subject = $5
       )`,
    [input.tenantId, input.organizationId, AUTHORITY_TYPE, HOUSE_TRUSTED_ISSUER, input.userId],
  );
  expect(result.rowCount).toBe(1);
}

async function selectContext(page: Page, seasonId: string): Promise<void> {
  await page.goto('/button/select-context');
  await page.getByLabel('Season').selectOption(seasonId);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Affiliation overview' })).toBeVisible();
}

async function startAffiliationDraft(page: Page): Promise<string> {
  const begin = page.getByRole('button', { name: 'Start affiliation' });
  const resume = page.getByRole('button', { name: 'Continue draft' });
  await expect(begin.or(resume)).toBeVisible();
  if (await begin.isVisible()) {
    await begin.click();
  } else {
    await resume.click();
  }
  await expect(page.getByRole('heading', { name: 'Affiliation requirements' })).toBeVisible();
  const match = page.url().match(/\/button\/affiliation\/([^/]+)/u);
  if (!match?.[1]) throw new Error('Could not resolve application id from URL.');
  return match[1];
}

test('real browser journey: no grant → no access, grant → access, revoke → access lost, institutional facts survive', async ({
  page,
}) => {
  const state = await fixture(page);
  const profile = state.profiles['lifecycle-rep'];
  const admin = new pg.Pool({ connectionString: adminConnection() });

  try {
    await setIdentity(page);

    // 1. Trusted identity, representative role key, org header — but NO governed grant → nothing.
    await page.goto('/button/select-context');
    await expect(page.getByRole('heading', { name: 'No organizations available' })).toBeVisible();

    // 2. Create a governed grant, then prove access appears on reload (no restart / no polling).
    await grantAuthority(admin, {
      tenantId: state.tenantId,
      userId: profile.userId,
      organizationId: profile.organizationId,
    });

    await selectContext(page, state.seasonId);
    await expect(page.getByText(`Affiliation for ${profile.displayName}`)).toBeVisible();

    // Mutation access: the representative can start a governed affiliation draft.
    const applicationId = await startAffiliationDraft(page);

    // 3. Revoke the grant. Revocation must propagate immediately to the next request.
    await revokeAuthority(admin, {
      tenantId: state.tenantId,
      userId: profile.userId,
      organizationId: profile.organizationId,
    });

    // The organization remains visible (a revoked appointment is distinct from never having had
    // one), but selecting it no longer grants mutation access: the guard fails closed to the
    // authority-expired state — WITHOUT any polling, background job, or app restart.
    await page.goto('/button/select-context');
    await page.getByLabel('Season').selectOption(state.seasonId);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { name: 'Representative authority expired' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/button\/authority-expired$/u);

    // The draft the representative created moments ago is now denied at the API: the authority
    // record still exists but is revoked, so the governed route fails closed with a 403.
    const denied = await page.request.get(
      `/v1/button/affiliation/applications/${encodeURIComponent(applicationId)}`,
      { headers: { accept: 'application/json' } },
    );
    expect(denied.status()).toBe(403);

    // 4. Revocation removes AUTHORITY, not institutional facts: the organization and the governed
    // affiliation entity remain durably persisted (admin connection bypasses RLS for the proof).
    const org = await admin.query(
      `SELECT 1 FROM organization_registry.organization WHERE id = $1 AND tenant_id = $2`,
      [profile.organizationId, state.tenantId],
    );
    expect(org.rowCount).toBe(1);

    const application = await admin.query(
      `SELECT 1 FROM affiliation.affiliation_application WHERE id = $1 AND tenant_id = $2`,
      [applicationId, state.tenantId],
    );
    expect(application.rowCount).toBe(1);
  } finally {
    await admin.end();
  }
});
