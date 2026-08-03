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

  const fixture = {
    tenantId: randomUUID(),
    seasonId: '2025-26',
    profiles: {
      'rep-a': {
        userId: randomUUID(),
        organizationId: randomUUID(),
        displayName: 'Riverside Curling Club',
        roleKeys: ['club_affiliation_representative'],
      },
      'rep-b': {
        userId: randomUUID(),
        organizationId: randomUUID(),
        displayName: 'Hillcrest Curling Club',
        roleKeys: ['club_affiliation_representative'],
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
         ($4, $2, 'local', $5, 'active', 'manual', now(), now())`,
      [
        fixture.profiles['rep-a'].organizationId,
        fixture.tenantId,
        fixture.profiles['rep-a'].displayName,
        fixture.profiles['rep-b'].organizationId,
        fixture.profiles['rep-b'].displayName,
      ],
    );
  } finally {
    await pool.end();
  }

  writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  process.stdout.write(`button real-server fixture written: ${FIXTURE_PATH}\n`);
}
