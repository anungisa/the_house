/**
 * Governed season admin CLI for the Button real-server e2e harness (and local operators).
 *
 * There is NO self-service season UI in this slice, but season state must still be established the
 * GOVERNED way — never by writing `affiliation.season` directly. Every verb here routes through
 * {@link SeasonCatalogService} + {@link PgSeasonCatalogStore}, so each mutation goes through boundary
 * validation, the single-current invariant, and the atomic head + append-only event + audit +
 * transactional outbox write, exactly like production. The e2e global setup and the season-catalog
 * lifecycle spec shell out to this script instead of issuing raw season SQL.
 *
 * Every verb uses a STABLE per-(verb, tenant, season) idempotency key, so re-running the script
 * (e.g. `reuseExistingServer`) REPLAYS rather than duplicating governed lineage.
 *
 * Connection: prefers MIGRATE_DATABASE_URL, then DATABASE_URL. Migrations must already be applied.
 *
 * Usage:
 *   tsx scripts/e2e-season-admin.ts ensure-current-open --tenant <uuid> --season 2025-26
 *   tsx scripts/e2e-season-admin.ts create-draft --tenant <uuid> --season <key> [--label-en X --label-fr Y --start 2025-09-01 --end 2026-08-31]
 *   tsx scripts/e2e-season-admin.ts publish       --tenant <uuid> --season <key>
 *   tsx scripts/e2e-season-admin.ts make-current  --tenant <uuid> --season <key>
 *   tsx scripts/e2e-season-admin.ts open-window   --tenant <uuid> --season <key> [--opens <iso> --closes <iso>]
 *   tsx scripts/e2e-season-admin.ts close-window  --tenant <uuid> --season <key> [--closes <iso>]
 *   tsx scripts/e2e-season-admin.ts retire        --tenant <uuid> --season <key>
 */

import pg from 'pg';
import { PgSeasonCatalogStore } from '../src/domains/season-catalog/PgSeasonCatalogStore.js';
import { SeasonCatalogService } from '../src/domains/season-catalog/SeasonCatalogService.js';

const FAR_PAST_ISO = '2000-01-01T00:00:00.000Z';
const FAR_FUTURE_ISO = '2999-01-01T00:00:00.000Z';

function parseArgs(argv: readonly string[]): { verb: string; flags: Record<string, string> } {
  const verb = argv[0] ?? '';
  const flags: Record<string, string> = {};
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token !== undefined && token.startsWith('--')) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        flags[key] = 'true';
      } else {
        flags[key] = value;
        i += 1;
      }
    }
  }
  return { verb, flags };
}

function require_(flags: Record<string, string>, name: string): string {
  const value = flags[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`--${name} is required for this command.`);
  }
  return value;
}

/** Stable per-(verb, tenant, season) idempotency key: replays instead of duplicating. */
function idem(verb: string, tenantId: string, seasonId: string): string {
  return `e2e:${verb}:${tenantId}:${seasonId}`;
}

async function run(service: SeasonCatalogService, verb: string, flags: Record<string, string>): Promise<void> {
  const tenantId = require_(flags, 'tenant');
  const seasonId = require_(flags, 'season');
  const meta = { correlationId: `e2e:${verb}:${seasonId}`, causationId: `e2e:${verb}:${seasonId}` };

  switch (verb) {
    case 'create-draft': {
      await service.createDraft({
        tenantId,
        seasonId,
        labelEn: flags['label-en'] ?? `${seasonId} EN`,
        labelFr: flags['label-fr'] ?? `${seasonId} FR`,
        seasonStartDate: flags['start'] ?? '2025-09-01',
        seasonEndDate: flags['end'] ?? '2026-08-31',
        sourceReference: 'e2e-real-setup',
        idempotencyKey: idem('create', tenantId, seasonId),
        meta,
      });
      return;
    }
    case 'publish': {
      await service.publish({
        tenantId,
        seasonId,
        idempotencyKey: idem('publish', tenantId, seasonId),
        meta,
      });
      return;
    }
    case 'make-current': {
      await service.makeCurrent({
        tenantId,
        seasonId,
        idempotencyKey: idem('current', tenantId, seasonId),
        meta,
      });
      return;
    }
    case 'open-window': {
      await service.openWindow({
        tenantId,
        seasonId,
        applicationOpensAt: flags['opens'] ?? FAR_PAST_ISO,
        applicationClosesAt: flags['closes'] ?? FAR_FUTURE_ISO,
        idempotencyKey: idem('open', tenantId, seasonId),
        meta,
      });
      return;
    }
    case 'close-window': {
      await service.closeWindow({
        tenantId,
        seasonId,
        applicationClosesAt: flags['closes'] ?? FAR_PAST_ISO,
        idempotencyKey: idem('close', tenantId, seasonId),
        meta,
      });
      return;
    }
    case 'retire': {
      await service.retire({
        tenantId,
        seasonId,
        idempotencyKey: idem('retire', tenantId, seasonId),
        meta,
      });
      return;
    }
    case 'ensure-current-open': {
      // Idempotent composite: drive to published + current + open window. Each step replays if
      // already performed (stable idempotency keys), so re-running is safe.
      const head = await service.getSeason(tenantId, seasonId);
      if (head === undefined) {
        await run(service, 'create-draft', flags);
      }
      const afterCreate = await service.getSeason(tenantId, seasonId);
      if (afterCreate?.status === 'draft') {
        await run(service, 'publish', flags);
      }
      const afterPublish = await service.getSeason(tenantId, seasonId);
      if (afterPublish !== undefined && !afterPublish.isCurrent && afterPublish.status === 'published') {
        await run(service, 'make-current', flags);
      }
      await run(service, 'open-window', flags);
      return;
    }
    default:
      throw new Error(`Unknown season admin verb: '${verb}'.`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = (process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '').trim();
  if (databaseUrl === '') {
    console.error('[e2e-season-admin] MIGRATE_DATABASE_URL or DATABASE_URL must be set.');
    process.exitCode = 1;
    return;
  }
  const { verb, flags } = parseArgs(process.argv.slice(2));
  if (verb === '') {
    console.error('[e2e-season-admin] a verb is required (e.g. ensure-current-open).');
    process.exitCode = 1;
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const service = new SeasonCatalogService(new PgSeasonCatalogStore(pool));
    await run(service, verb, flags);
    console.log(`[e2e-season-admin] ${verb} ok (tenant=${flags['tenant']}, season=${flags['season']}).`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
