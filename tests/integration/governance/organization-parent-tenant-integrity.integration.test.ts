import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

/**
 * Gated PostgreSQL integration test for the Organization Registry TENANT-PARENT referential
 * integrity added in migration 0019. These assertions run against RAW SQL through an admin
 * connection (bypassing the OrganizationRegistryService) to prove the guarantees hold at the
 * STORAGE layer as defense-in-depth — independent of the application-layer assertValidParent
 * check — so a bypassing code path, regression, or race cannot persist a cross-tenant or dangling
 * organization parent.
 *
 * Proven:
 *   - a NULL parent (root organization) is accepted;
 *   - a SAME-tenant existing parent is accepted;
 *   - a CROSS-tenant parent is rejected by the composite `(tenant_id, parent_organization_id)`
 *     self-FK even though FK checks bypass RLS (the composite key keeps parent + child in the
 *     same tenant);
 *   - a DANGLING parent (no such organization) is rejected;
 *   - a DIRECT self-parent is rejected by the CHECK constraint.
 *
 * GATING: runs only when RUN_DB_TESTS=1 and an admin connection URL is provided
 * (MIGRATE_DATABASE_URL preferred, else DATABASE_URL). Otherwise skipped so the default
 * `npm test` stays hermetic. No external network is contacted.
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

// PostgreSQL SQLSTATE codes.
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

let admin: pg.Pool;

/** Insert one organization row directly (admin bypasses RLS; the FK/CHECK still apply). */
async function insertOrganization(input: {
  tenantId: string;
  organizationId: string;
  parentOrganizationId?: string | null;
}): Promise<void> {
  await admin.query(
    `INSERT INTO organization_registry.organization
       (id, tenant_id, organization_type, display_name, status, source,
        parent_organization_id, created_at, updated_at)
     VALUES ($1, $2, 'local', 'Test Org', 'active', 'manual', $3, now(), now())`,
    [input.organizationId, input.tenantId, input.parentOrganizationId ?? null],
  );
}

async function expectSqlState(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected the statement to fail with SQLSTATE ${code}, but it succeeded.`);
  } catch (err) {
    expect((err as { code?: string }).code).toBe(code);
  }
}

d('organization registry tenant-parent composite integrity (PostgreSQL integration)', () => {
  beforeAll(() => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
  });

  afterAll(async () => {
    await admin.end();
  });

  it('accepts a root organization with a NULL parent', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    await expect(
      insertOrganization({ tenantId, organizationId, parentOrganizationId: null }),
    ).resolves.toBeUndefined();
  });

  it('accepts a same-tenant existing parent', async () => {
    const tenantId = randomUUID();
    const parentId = randomUUID();
    const childId = randomUUID();
    await insertOrganization({ tenantId, organizationId: parentId });
    await expect(
      insertOrganization({ tenantId, organizationId: childId, parentOrganizationId: parentId }),
    ).resolves.toBeUndefined();
  });

  it('rejects a cross-tenant parent via the composite self-FK', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const parentInA = randomUUID();
    const childInB = randomUUID();
    await insertOrganization({ tenantId: tenantA, organizationId: parentInA });
    // The parent id exists, but only in tenant A. Referencing it from tenant B must fail because
    // (tenantB, parentInA) is not a valid (tenant_id, id) pair.
    await expectSqlState(
      insertOrganization({
        tenantId: tenantB,
        organizationId: childInB,
        parentOrganizationId: parentInA,
      }),
      FOREIGN_KEY_VIOLATION,
    );
  });

  it('rejects a dangling parent that does not exist', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    await expectSqlState(
      insertOrganization({ tenantId, organizationId, parentOrganizationId: randomUUID() }),
      FOREIGN_KEY_VIOLATION,
    );
  });

  it('rejects a direct self-parent via the CHECK constraint', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    await expectSqlState(
      insertOrganization({ tenantId, organizationId, parentOrganizationId: organizationId }),
      CHECK_VIOLATION,
    );
  });
});
