import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const FIXTURE_PATH =
  process.env.E2E_REAL_FIXTURE_PATH ?? join(tmpdir(), 'the-house-button-real-e2e-fixture.json');

function mustEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`${name} is required for button real-server e2e.`);
  }
  return value;
}

export default async function globalSetup() {
  const adminConnection = process.env.MIGRATE_DATABASE_URL ?? mustEnv('DATABASE_URL');

  const repAOrganizationId = randomUUID();
  const repBOrganizationId = randomUUID();
  // Dedicated organization for the A2 operational journey, isolated from the A1 representative
  // orgs so the two real-server specs never collide on the same governed affiliation state.
  const opRepOrganizationId = randomUUID();

  const fixture = {
    tenantId: randomUUID(),
    seasonId: '2025-26',
    profiles: {
      'rep-a': {
        userId: randomUUID(),
        organizationId: repAOrganizationId,
        displayName: 'Riverside Curling Club',
        roleKeys: ['club_affiliation_representative'],
      },
      'rep-b': {
        userId: randomUUID(),
        organizationId: repBOrganizationId,
        displayName: 'Hillcrest Curling Club',
        roleKeys: ['club_affiliation_representative'],
      },
      // Representative for the A2 operational journey (its own organization).
      'op-rep': {
        userId: randomUUID(),
        organizationId: opRepOrganizationId,
        displayName: 'Lakeside Curling Club',
        roleKeys: ['club_affiliation_representative'],
      },
      // Operational/staff identities. Their governed capabilities are derived PURELY from
      // roleKeys (no context selection), and their delegated review/finance scope is the
      // operational representative organization they are authorized over (op-rep's organization).
      // Each role is a DISTINCT identity — no single actor holds every authority — so the journey
      // proves real separation of duties across the governed lifecycle.
      reviewer: {
        userId: randomUUID(),
        organizationId: opRepOrganizationId,
        displayName: 'Regional Affiliation Reviewer',
        roleKeys: ['reviewer'],
      },
      // A reviewer whose delegated scope is a DIFFERENT organization. Used to prove scope
      // isolation: op-rep's submitted case must be invisible to, and opaque for, a reviewer
      // outside its scope even though the role key is identical.
      'reviewer-foreign': {
        userId: randomUUID(),
        organizationId: repAOrganizationId,
        displayName: 'Out-of-scope Affiliation Reviewer',
        roleKeys: ['reviewer'],
      },
      'regional-reviewer': {
        userId: randomUUID(),
        organizationId: opRepOrganizationId,
        displayName: 'Regional Sign-off Authority',
        roleKeys: ['regional_reviewer'],
      },
      'national-reviewer': {
        userId: randomUUID(),
        organizationId: opRepOrganizationId,
        displayName: 'National Sign-off Authority',
        roleKeys: ['national_reviewer'],
      },
      'finance-reconciler': {
        userId: randomUUID(),
        organizationId: opRepOrganizationId,
        displayName: 'Affiliation Finance Reconciler',
        roleKeys: ['financial_reconciler'],
      },
    },
  };

  const pool = new pg.Pool({ connectionString: adminConnection });
  try {
    await pool.query(
      `INSERT INTO organization_registry.organization
         (id, tenant_id, organization_type, display_name, status, source, created_at, updated_at)
       VALUES
         ($1, $2, 'local', $3, 'active', 'manual', now(), now()),
         ($4, $2, 'local', $5, 'active', 'manual', now(), now()),
         ($6, $2, 'local', $7, 'active', 'manual', now(), now())`,
      [
        fixture.profiles['rep-a'].organizationId,
        fixture.tenantId,
        fixture.profiles['rep-a'].displayName,
        fixture.profiles['rep-b'].organizationId,
        fixture.profiles['rep-b'].displayName,
        fixture.profiles['op-rep'].organizationId,
        fixture.profiles['op-rep'].displayName,
      ],
    );

    // Prerequisite with no user-facing setup surface: the current season is a House-governed
    // calendar fact that the activation guard (SEASON_IS_CURRENT) reads from persisted state.
    await pool.query(
      `INSERT INTO affiliation.season (tenant_id, season_id, is_current, label)
       VALUES ($1, $2, true, $3)
       ON CONFLICT (tenant_id, season_id) DO UPDATE SET is_current = true`,
      [fixture.tenantId, fixture.seasonId, `Season ${fixture.seasonId}`],
    );
  } finally {
    await pool.end();
  }

  writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  process.stdout.write(`button real-server fixture written: ${FIXTURE_PATH}\n`);
}
