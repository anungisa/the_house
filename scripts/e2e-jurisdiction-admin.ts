/**
 * Governed jurisdiction admin CLI for the Button real-server e2e harness (and local operators).
 *
 * An organization's governing jurisdiction is a HOUSE-GOVERNED, tenant-isolated, persisted fact —
 * never derived from its type or name. There is no self-service jurisdiction UI in this slice, but
 * jurisdiction state must still be established the GOVERNED way. Every verb here routes through
 * {@link JurisdictionCatalogService} + {@link PgJurisdictionStore}, so each mutation passes boundary
 * validation, publish/assign completeness, the one-active-primary invariant, and the atomic head +
 * append-only event + audit + transactional outbox write, exactly like production. The e2e global
 * setup shells out to this script instead of issuing raw jurisdiction SQL.
 *
 * Every verb uses a STABLE per-(verb, tenant, subject) idempotency key, so re-running the script
 * (e.g. `reuseExistingServer`) REPLAYS rather than duplicating governed lineage.
 *
 * Connection: prefers MIGRATE_DATABASE_URL, then DATABASE_URL. Migrations must already be applied.
 *
 * Usage:
 *   tsx scripts/e2e-jurisdiction-admin.ts create-draft   --tenant <uuid> --code on --level subdivision [--label-en X --label-fr Y --parent <code>]
 *   tsx scripts/e2e-jurisdiction-admin.ts publish         --tenant <uuid> --code on
 *   tsx scripts/e2e-jurisdiction-admin.ts ensure-published --tenant <uuid> --code on --level subdivision [--label-en X --label-fr Y --parent <code>]
 *   tsx scripts/e2e-jurisdiction-admin.ts assign-primary  --tenant <uuid> --org <uuid> --code on [--mode inheritable|direct --source <ref>]
 *   tsx scripts/e2e-jurisdiction-admin.ts replace-primary --tenant <uuid> --org <uuid> --code qc [--mode direct --source <ref>]
 *   tsx scripts/e2e-jurisdiction-admin.ts revoke          --tenant <uuid> --org <uuid>
 *   tsx scripts/e2e-jurisdiction-admin.ts ensure-assigned --tenant <uuid> --org <uuid> --code on --level subdivision [--mode inheritable|direct --parent <code>]
 */

import pg from 'pg';
import { PgJurisdictionStore } from '../src/domains/jurisdiction/PgJurisdictionStore.js';
import { JurisdictionCatalogService } from '../src/domains/jurisdiction/JurisdictionCatalogService.js';
import type { JurisdictionInheritanceMode, JurisdictionLevel } from '../src/domains/jurisdiction/JurisdictionTypes.js';

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

/** Stable per-(verb, tenant, subject) idempotency key: replays instead of duplicating. */
function idem(verb: string, tenantId: string, subject: string): string {
  return `e2e:${verb}:${tenantId}:${subject}`;
}

function inheritanceMode(flags: Record<string, string>): JurisdictionInheritanceMode {
  const mode = flags['mode'] ?? 'inheritable';
  if (mode !== 'inheritable' && mode !== 'direct') {
    throw new Error(`--mode must be 'inheritable' or 'direct' (got '${mode}').`);
  }
  return mode;
}

function level(flags: Record<string, string>): JurisdictionLevel {
  const value = flags['level'] ?? 'subdivision';
  if (value !== 'national' && value !== 'subdivision' && value !== 'local' && value !== 'custom') {
    throw new Error(`--level must be national|subdivision|local|custom (got '${value}').`);
  }
  return value;
}

async function run(
  service: JurisdictionCatalogService,
  verb: string,
  flags: Record<string, string>,
): Promise<void> {
  const tenantId = require_(flags, 'tenant');
  const meta = { correlationId: `e2e:${verb}`, causationId: `e2e:${verb}` };

  switch (verb) {
    case 'create-draft': {
      const code = require_(flags, 'code');
      await service.createDraft({
        tenantId,
        code,
        level: level(flags),
        labelEn: flags['label-en'] ?? `${code.toUpperCase()} EN`,
        labelFr: flags['label-fr'] ?? `${code.toUpperCase()} FR`,
        ...(flags['parent'] !== undefined ? { parentJurisdictionCode: flags['parent'] } : {}),
        sourceReference: 'e2e-real-setup',
        idempotencyKey: idem('create', tenantId, code),
        meta,
      });
      return;
    }
    case 'publish': {
      const code = require_(flags, 'code');
      await service.publish({
        tenantId,
        code,
        idempotencyKey: idem('publish', tenantId, code),
        meta,
      });
      return;
    }
    case 'assign-primary': {
      const organizationId = require_(flags, 'org');
      const code = require_(flags, 'code');
      await service.assignPrimary({
        tenantId,
        organizationId,
        jurisdictionCode: code,
        inheritanceMode: inheritanceMode(flags),
        sourceReference: flags['source'] ?? 'e2e-real-setup',
        idempotencyKey: idem('assign', tenantId, organizationId),
        meta,
      });
      return;
    }
    case 'replace-primary': {
      const organizationId = require_(flags, 'org');
      const code = require_(flags, 'code');
      await service.replacePrimary({
        tenantId,
        organizationId,
        jurisdictionCode: code,
        inheritanceMode: inheritanceMode(flags),
        sourceReference: flags['source'] ?? 'e2e-real-setup',
        idempotencyKey: idem('replace', tenantId, `${organizationId}:${code}`),
        meta,
      });
      return;
    }
    case 'revoke': {
      const organizationId = require_(flags, 'org');
      await service.revoke({
        tenantId,
        organizationId,
        idempotencyKey: idem('revoke', tenantId, organizationId),
        meta,
      });
      return;
    }
    case 'ensure-published': {
      // Idempotent composite: drive a jurisdiction code to published. Replays if already done.
      const code = require_(flags, 'code');
      const head = await service.getJurisdiction(tenantId, code);
      if (head === undefined) {
        await run(service, 'create-draft', flags);
      }
      const afterCreate = await service.getJurisdiction(tenantId, code);
      if (afterCreate?.status === 'draft') {
        await run(service, 'publish', flags);
      }
      return;
    }
    case 'ensure-assigned': {
      // Idempotent composite: publish the code (and its parent if given) then assign it as the
      // organization's primary jurisdiction. Safe to re-run.
      const organizationId = require_(flags, 'org');
      if (flags['parent'] !== undefined) {
        await run(service, 'ensure-published', { ...flags, code: flags['parent'], level: 'national' });
      }
      await run(service, 'ensure-published', flags);
      const active = await service.activeAssignments(tenantId, organizationId);
      if (active.length === 0) {
        await run(service, 'assign-primary', flags);
      }
      return;
    }
    default:
      throw new Error(`Unknown jurisdiction admin verb: '${verb}'.`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = (process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '').trim();
  if (databaseUrl === '') {
    console.error('[e2e-jurisdiction-admin] MIGRATE_DATABASE_URL or DATABASE_URL must be set.');
    process.exitCode = 1;
    return;
  }
  const { verb, flags } = parseArgs(process.argv.slice(2));
  if (verb === '') {
    console.error('[e2e-jurisdiction-admin] a verb is required (e.g. ensure-assigned).');
    process.exitCode = 1;
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const service = new JurisdictionCatalogService(new PgJurisdictionStore(pool));
    await run(service, verb, flags);
    console.log(
      `[e2e-jurisdiction-admin] ${verb} ok (tenant=${flags['tenant']}, code=${flags['code'] ?? '-'}, org=${flags['org'] ?? '-'}).`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
