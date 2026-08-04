import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Repo root, resolved from apps/button/e2e-real/support -> up four levels. The governed season
// admin CLI (routed through SeasonCatalogService) lives at <root>/scripts/e2e-season-admin.ts.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/**
 * Establish the current season the GOVERNED way. The current season is a House-governed calendar
 * fact the activation guard (SEASON_IS_CURRENT) and the affiliation surface read from persisted
 * state; it must be created through the season catalog service (validation + single-current
 * invariant + append-only event + audit + transactional outbox), NEVER by writing
 * `affiliation.season` directly. We shell out to the governed CLI so the root TypeScript service is
 * never dragged into the Button package's typecheck.
 */
function seedGovernedSeason(adminConnection, tenantId, seasonId) {
  execFileSync(
    'npx',
    [
      'tsx',
      join('scripts', 'e2e-season-admin.ts'),
      'ensure-current-open',
      '--tenant',
      tenantId,
      '--season',
      seasonId,
    ],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: { ...process.env, MIGRATE_DATABASE_URL: adminConnection },
    },
  );
}

/**
 * Establish an organization's governing jurisdiction the GOVERNED way. Jurisdiction is a
 * House-governed, tenant-isolated, PERSISTED fact the affiliation surface and the production
 * {@link GovernedJurisdictionResolver} read from state — it is NEVER derived from organization
 * type. Affiliation initiation now fails closed (JURISDICTION_UNAVAILABLE) unless the acting
 * organization resolves to a published jurisdiction, so every org that initiates in the e2e
 * journeys must be assigned one through the governed catalog service (validation + one-active-
 * primary invariant + append-only event + audit + transactional outbox), NEVER by writing
 * assignment rows directly. `ensure-assigned` is idempotent so re-runs REPLAY.
 */
function seedGovernedJurisdiction(adminConnection, tenantId, organizationId, code) {
  execFileSync(
    'npx',
    [
      'tsx',
      join('scripts', 'e2e-jurisdiction-admin.ts'),
      'ensure-assigned',
      '--tenant',
      tenantId,
      '--org',
      organizationId,
      '--code',
      code,
      '--level',
      'subdivision',
      '--mode',
      'direct',
    ],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: { ...process.env, MIGRATE_DATABASE_URL: adminConnection },
    },
  );
}

const FIXTURE_PATH =
  process.env.E2E_REAL_FIXTURE_PATH ?? join(tmpdir(), 'the-house-button-real-e2e-fixture.json');

// The trusted issuer the Button authority provider looks up representatives under, and the sole
// authority type this slice governs. Kept in sync with
// src/domains/representative-authority/RepresentativeAuthorityTypes.ts.
const HOUSE_TRUSTED_ISSUER = 'house.trusted';
const CLUB_AFFILIATION_REPRESENTATIVE_AUTHORITY_TYPE = 'club_affiliation_representative';

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
  // A dedicated organization for the authority-lifecycle journey, whose representative starts with
  // NO governed grant (grant/revoke is exercised live during that spec).
  const lifecycleOrganizationId = randomUUID();
  // Dedicated organizations for the governed JURISDICTION-lifecycle journey. `jurParent` is a
  // parent whose inheritable assignment the child should inherit; `jurRep` is the acting child
  // organization, deliberately created with NO jurisdiction assignment so the journey proves the
  // fail-closed → inherited → direct-override → inherited → blocked lifecycle live.
  const jurParentOrganizationId = randomUUID();
  const jurRepOrganizationId = randomUUID();

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
      // Representative for the authority-lifecycle journey. Deliberately UNGRANTED at setup: the
      // journey proves that a trusted identity with the representative role key gets NO access until
      // a governed grant is created, and loses access again the moment it is revoked.
      'lifecycle-rep': {
        userId: randomUUID(),
        organizationId: lifecycleOrganizationId,
        displayName: 'Summit Curling Club',
        roleKeys: ['club_affiliation_representative'],
      },
      // Representative for the governed JURISDICTION-lifecycle journey. Its organization is a child
      // of `jurParentOrganizationId` and starts with NO jurisdiction assignment, so the journey can
      // drive the full resolution lifecycle without disturbing the shared representative orgs.
      'jur-rep': {
        userId: randomUUID(),
        organizationId: jurRepOrganizationId,
        parentOrganizationId: jurParentOrganizationId,
        displayName: 'Cedar Valley Curling Club',
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
         ($6, $2, 'local', $7, 'active', 'manual', now(), now()),
         ($8, $2, 'local', $9, 'active', 'manual', now(), now())`,
      [
        fixture.profiles['rep-a'].organizationId,
        fixture.tenantId,
        fixture.profiles['rep-a'].displayName,
        fixture.profiles['rep-b'].organizationId,
        fixture.profiles['rep-b'].displayName,
        fixture.profiles['op-rep'].organizationId,
        fixture.profiles['op-rep'].displayName,
        fixture.profiles['lifecycle-rep'].organizationId,
        fixture.profiles['lifecycle-rep'].displayName,
      ],
    );

    // Governed jurisdiction-lifecycle orgs: a parent and its child (whose jurisdiction the child
    // may inherit). Inserted with the composite parent link so the resolver can walk the chain.
    await pool.query(
      `INSERT INTO organization_registry.organization
         (id, tenant_id, organization_type, display_name, status, source,
          parent_organization_id, created_at, updated_at)
       VALUES
         ($1, $2, 'regional', $3, 'active', 'manual', NULL, now(), now()),
         ($4, $2, 'local', $5, 'active', 'manual', $1, now(), now())`,
      [
        fixture.profiles['jur-rep'].parentOrganizationId,
        fixture.tenantId,
        'Cedar Valley Provincial Body',
        fixture.profiles['jur-rep'].organizationId,
        fixture.profiles['jur-rep'].displayName,
      ],
    );

    // Prerequisite with no user-facing setup surface: the current season is a House-governed
    // calendar fact. Seed it through the GOVERNED season catalog service (never raw season SQL).
    seedGovernedSeason(adminConnection, fixture.tenantId, fixture.seasonId);

    // Prerequisite with no user-facing setup surface: each organization's governing jurisdiction
    // is a House-governed, PERSISTED fact. Affiliation initiation fails closed unless the acting
    // organization resolves to a published jurisdiction, so assign one (directly) to every org that
    // initiates in the journeys, through the GOVERNED jurisdiction catalog service.
    for (const key of ['rep-a', 'rep-b', 'op-rep', 'lifecycle-rep']) {
      seedGovernedJurisdiction(
        adminConnection,
        fixture.tenantId,
        fixture.profiles[key].organizationId,
        'on',
      );
    }

    // Governed representative authority. Under the House authority model a trusted identity and an
    // organization header only IDENTIFY the actor — they never manufacture authority. A
    // representative can act for an organization ONLY when a persisted, in-window, un-revoked grant
    // in the `authority` schema says so. Seed one ACTIVE grant per representative profile; the
    // staff identities (reviewer/regional/national/finance) deliberately get NO grant — their
    // governed capabilities derive purely from role keys, not representative authority.
    for (const key of ['rep-a', 'rep-b', 'op-rep', 'jur-rep']) {
      const profile = fixture.profiles[key];      const subjectId = randomUUID();
      await pool.query(
        `INSERT INTO authority.identity_subject
           (id, tenant_id, issuer, external_subject, status, source, linked_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'active', 'e2e-real-setup', now(), now(), now())`,
        [subjectId, fixture.tenantId, HOUSE_TRUSTED_ISSUER, profile.userId],
      );
      await pool.query(
        `INSERT INTO authority.representative_authority
           (id, tenant_id, identity_subject_id, organization_id, authority_type, status,
            valid_from, issued_by, issued_at, source_reference, idempotency_key, version,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active',
            now(), 'e2e-real-setup', now(), $6, $7, 1, now(), now())`,
        [
          randomUUID(),
          fixture.tenantId,
          subjectId,
          profile.organizationId,
          CLUB_AFFILIATION_REPRESENTATIVE_AUTHORITY_TYPE,
          `e2e-real:${key}`,
          `e2e-real-grant:${key}:${profile.userId}`,
        ],
      );
    }
  } finally {
    await pool.end();
  }

  writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  process.stdout.write(`button real-server fixture written: ${FIXTURE_PATH}\n`);
}
