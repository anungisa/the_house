// Analyzer: PostgreSQL schema, migration, RLS and tenancy inventory for The House.
//
// Reads db/migrations/*.sql deterministically and derives: ordered migrations with
// per-file digests; declared schemas; governed/registry tables; row-level-security
// enablement (ENABLE + FORCE); tenant_id presence; policies; SECURITY DEFINER
// functions; and the tenant-isolation posture. It never connects to a database — it
// is a static evidence pass over the committed migration files.

import { readText, sha256File, countLines, walk } from './house-lib.mjs';

const RX = {
  schema: /CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi,
  table: /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi,
  enableRls: /ALTER\s+TABLE\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi,
  forceRls: /ALTER\s+TABLE\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/gi,
  policy: /CREATE\s+POLICY\s+([a-z_][a-z0-9_]*)/gi,
  fn: /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi,
  securityDefiner: /SECURITY\s+DEFINER/gi,
  tenantCol: /tenant_id/gi,
  uniqueIdem: /idempotency_key/gi,
};

function allMatches(text, rx, mapper) {
  const out = [];
  const re = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : `${rx.flags}g`);
  let m;
  while ((m = re.exec(text)) !== null) out.push(mapper(m));
  return out;
}

export function analyze(ctx) {
  const dir = ctx.abs(ctx.roots.migrations);
  const files = walk(dir, (f) => f.endsWith('.sql')).sort();

  const schemas = new Set();
  const tables = new Map(); // "schema.table" -> { schema, table, migration, rls_enabled, rls_forced, has_tenant_id }
  const policies = [];
  const functions = [];
  const migrations = [];
  let securityDefinerCount = 0;

  for (const abs of files) {
    const text = readText(abs);
    const rel = ctx.rel(abs);
    const fileSchemas = [...new Set(allMatches(text, RX.schema, (m) => m[1]))];
    fileSchemas.forEach((s) => schemas.add(s));

    const fileTables = allMatches(text, RX.table, (m) => `${m[1]}.${m[2]}`);
    for (const qn of fileTables) {
      const [schema, table] = qn.split('.');
      if (!tables.has(qn)) {
        tables.set(qn, {
          schema,
          table,
          migration: rel,
          rls_enabled: false,
          rls_forced: false,
          has_tenant_id: false,
        });
      }
    }
    const enable = allMatches(text, RX.enableRls, (m) => `${m[1]}.${m[2]}`);
    const force = allMatches(text, RX.forceRls, (m) => `${m[1]}.${m[2]}`);
    enable.forEach((qn) => tables.get(qn) && (tables.get(qn).rls_enabled = true));
    force.forEach((qn) => tables.get(qn) && (tables.get(qn).rls_forced = true));

    const filePolicies = allMatches(text, RX.policy, (m) => m[1]);
    filePolicies.forEach((p) => policies.push({ policy: p, migration: rel }));

    const fileFns = allMatches(text, RX.fn, (m) => `${m[1]}.${m[2]}`);
    fileFns.forEach((fn) => functions.push({ function: fn, migration: rel }));
    const sd = (text.match(RX.securityDefiner) ?? []).length;
    securityDefinerCount += sd;

    // Attribute tenant_id presence to tables declared in the SAME migration file
    // whose CREATE TABLE body mentions tenant_id (heuristic, file-scoped).
    for (const qn of fileTables) {
      const t = tables.get(qn);
      const idx = text.indexOf(`.${t.table}`);
      const body = idx >= 0 ? text.slice(idx, idx + 4000) : '';
      if (/tenant_id/i.test(body)) t.has_tenant_id = true;
    }

    migrations.push({
      file: rel,
      sha256: sha256File(abs),
      lines: countLines(text),
      schemas: fileSchemas,
      tables_created: fileTables,
      rls_enabled: enable.length,
      rls_forced: force.length,
      policies_created: filePolicies.length,
      functions_created: fileFns.length,
      security_definer_blocks: sd,
      references_tenant_id: RX.tenantCol.test(text),
      references_idempotency_key: RX.uniqueIdem.test(text),
    });
  }

  const tableList = [...tables.values()].sort((a, b) =>
    `${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`),
  );
  const governanceTables = tableList.filter((t) => t.schema === 'governance');
  const tenantOwned = tableList.filter((t) => t.has_tenant_id);
  const rlsProtected = tableList.filter((t) => t.rls_enabled);
  const rlsForced = tableList.filter((t) => t.rls_forced);
  // Tenant-owned tables that are NOT both enabled and forced (isolation gap candidates).
  const tenantWithoutForcedRls = tenantOwned.filter((t) => !(t.rls_enabled && t.rls_forced));

  const database = {
    summary: {
      schemas: [...schemas].sort(),
      total_tables: tableList.length,
      governance_tables: governanceTables.length,
      tenant_owned_tables: tenantOwned.length,
      rls_enabled_tables: rlsProtected.length,
      rls_forced_tables: rlsForced.length,
      policies: policies.length,
      functions: functions.length,
      security_definer_blocks: securityDefinerCount,
      tenant_owned_without_forced_rls: tenantWithoutForcedRls.map((t) => `${t.schema}.${t.table}`),
    },
    tables: tableList,
    policies,
    functions,
  };

  const migrationInventory = {
    summary: {
      migration_count: migrations.length,
      first: migrations[0]?.file ?? null,
      last: migrations[migrations.length - 1]?.file ?? null,
      total_lines: migrations.reduce((n, m) => n + m.lines, 0),
      security_definer_migrations: migrations.filter((m) => m.security_definer_blocks > 0).map((m) => m.file),
    },
    migrations,
  };

  return { database, migrations: migrationInventory };
}
