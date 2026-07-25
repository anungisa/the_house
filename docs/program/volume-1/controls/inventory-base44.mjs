// Deterministic Base44 corpus inventory orchestrator.
//
// Produces the source manifest (with SHA-256 archive fingerprint), dependency
// and localization inventories, runs every analyzer, derives automated
// observations, and writes a NON-AUTHORITATIVE markdown report. Generated
// output is evidence INPUT to qualification, never a qualification decision.
//
// Usage: npm run qualification:base44 [-- --source-id SRC-001|SRC-009 | --archive <zip> --extract-dir <dir> --gen-subdir <dir>]

import { join, basename } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import {
  createContext,
  REPO_ROOT,
  sha256File,
  fileSize,
  walk,
  listDirs,
  readText,
  parseJsonc,
  buildDependencyInventory,
  buildLocalizationInventory,
  detectTestsAndCi,
  pct,
} from './base44-lib.mjs';
import { analyze as analyzeRoutes } from './analyze-base44-routes.mjs';
import { analyze as analyzeEntities } from './analyze-base44-entities.mjs';
import { analyze as analyzeFunctions } from './analyze-base44-functions.mjs';
import { analyze as analyzeAccess } from './analyze-base44-access.mjs';
import { analyze as analyzeCapabilities } from './analyze-base44-capabilities.mjs';

function countFiles(ctx, subdir, ext) {
  return walk(join(ctx.SOURCE_ROOT, subdir), (f) => f.endsWith(ext)).length;
}

function buildSourceManifest(ctx) {
  const allFiles = walk(ctx.SOURCE_ROOT);
  const archiveExists = ctx.ARCHIVE_PATH && existsSync(ctx.ARCHIVE_PATH);
  let config = {};
  try {
    config = parseJsonc(readText(join(ctx.SOURCE_ROOT, 'base44', 'config.jsonc')));
  } catch {
    config = {};
  }
  return {
    source: {
      id: ctx.id,
      label: ctx.label,
      extract_dir: ctx.SOURCE_ROOT.replace(`${REPO_ROOT}/`, ''),
    },
    archive: {
      filename: ctx.filename,
      present: Boolean(archiveExists),
      sha256: archiveExists ? sha256File(ctx.ARCHIVE_PATH) : null,
      size_bytes: archiveExists ? fileSize(ctx.ARCHIVE_PATH) : null,
    },
    application: {
      name: config.name ?? 'TheHouse v2 (Base44)',
      framework: 'Base44 low-code (React 18 + Vite + Tailwind + Radix/shadcn; Deno serverless functions)',
      export_type: 'Base44 application export (frontend source + entity schemas + serverless functions)',
    },
    counts: {
      total_files_excl_node_modules: allFiles.length,
      entities: listDirs(join(ctx.SOURCE_ROOT, 'base44', 'entities')).length + countFiles(ctx, 'base44/entities', '.jsonc'),
      functions: listDirs(join(ctx.SOURCE_ROOT, 'base44', 'functions')).length,
      agents: countFiles(ctx, 'base44/agents', '.jsonc'),
      pages_jsx: countFiles(ctx, 'src/pages', '.jsx'),
      components_jsx: countFiles(ctx, 'src/components', '.jsx'),
      lib_files: walk(join(ctx.SOURCE_ROOT, 'src', 'lib')).length,
      governance_md_docs: walk(join(ctx.SOURCE_ROOT, 'src'), (f) => f.endsWith('.md')).length,
    },
    top_level: listDirs(ctx.SOURCE_ROOT)
      .map((d) => basename(d))
      .sort(),
  };
}

function deriveObservations(manifest, routes, entities, functions, access, deps, loc, testCi) {
  const obs = [];
  const add = (code, kind, statement, refs) => obs.push({ code, kind, statement, evidence: refs });

  add('OBS-COUNT-ROUTES', 'inventory', `App.jsx declares ${routes.summary.total_routes} routes across guard types ${JSON.stringify(routes.summary.by_guard)}.`, ['src/App.jsx']);
  add('OBS-COUNT-ENTITIES', 'inventory', `${entities.summary.total_entities} entity schemas; ${entities.summary.entities_with_rls_block} declare an app-layer rls block; ${entities.summary.entities_with_status_enum} declare a status enum.`, ['base44/entities/*.jsonc']);
  add('OBS-COUNT-FUNCTIONS', 'inventory', `${functions.summary.total_functions} server functions; ${functions.summary.http_handlers} are Deno.serve handlers.`, ['base44/functions/*/entry.ts']);

  add('OBS-BACKEND-ENFORCEMENT', 'production_risk', `Only ${functions.summary.enforce_permission} of ${functions.summary.total_functions} server functions reference any permission check, yet ${functions.summary.mutating_without_permission_check} functions mutate entities with no server-side permission check. Frontend guards are UX-only.`, ['base44/functions/enforcePermission/entry.ts']);
  add('OBS-SERVICE-ROLE', 'production_risk', `${functions.summary.use_service_role} functions use asServiceRole (privilege escalation), amplifying the impact of missing server-side authorization.`, ['base44/functions/*/entry.ts']);

  add('OBS-ACCESS-DRIFT', 'production_risk', `${access.summary.routes_missing_from_matrix} routes have no access-matrix entry; unknown_path_defaults_open=${access.summary.unknown_path_defaults_open}. Access can drift from the declared single-source-of-truth matrix.`, ['src/lib/access/accessMatrix.js', 'src/ACCESS_MATRIX.md']);
  add('OBS-DUAL-ROLE-VOCAB', 'production_risk', `Dual role vocabulary present (fine keys + coarse buckets); ${routes.summary.distinct_route_roles} distinct role tokens are hardcoded directly in App.jsx routes despite the doctrine that roles live only in accessMatrix.js.`, ['src/lib/access/roleGroups.js', 'src/App.jsx', 'src/ACCESS_MATRIX.md']);

  add('OBS-PAYMENTS', 'product_value', `Stripe integration present (${deps.integrations.payments_stripe}); a payments/fees capability was explored.`, ['package.json']);
  add('OBS-LOCALIZATION', 'unknown', `Localization is a homegrown i18n (${loc.summary.i18n_files} files) with an admin Translations page (${loc.summary.has_translations_admin_page}); completeness and bilingual coverage require evidence.`, loc.i18n_files.slice(0, 3));
  add('OBS-TEST-CI', 'production_risk', `Automated tests detected: ${testCi.has_test_dir || testCi.test_file_count > 0} (test files: ${testCi.test_file_count}, test dirs: ${JSON.stringify(testCi.test_dirs)}); CI config detected: ${testCi.has_ci_config} (${JSON.stringify(testCi.ci_configs)}); runnable test script: ${testCi.has_test_script}.`, ['(export root: test dirs / CI config / package.json scripts.test)']);
  add('OBS-DOC-VOLUME', 'unknown', `${manifest.counts.governance_md_docs} governance-style markdown documents are present in src/. Volume of documentation is not evidence of implemented or validated behaviour.`, ['src/*.md']);

  return { note: 'Deterministic observations are EVIDENCE INPUTS, not qualification decisions.', observations: obs };
}

function buildReport(manifest, routes, entities, functions, access, capabilities, deps, loc, testCi, observations) {
  const lines = [];
  lines.push('# Base44 Inventory Report (NON-AUTHORITATIVE)');
  lines.push('');
  lines.push('> Generated deterministically by `docs/program/volume-1/controls/inventory-base44.mjs`.');
  lines.push('> This report is an EVIDENCE INPUT to Volume 1 Package 2 qualification. It is not a');
  lines.push('> qualification decision and confers no production authority on any Base44 artifact.');
  lines.push('');
  lines.push('## Assessed source');
  lines.push('');
  lines.push(`- Source ID: \`${manifest.source.id}\``);
  lines.push(`- Source label: ${manifest.source.label}`);
  lines.push(`- Archive: \`${manifest.archive.filename}\``);
  lines.push(`- SHA-256: \`${manifest.archive.sha256}\``);
  lines.push(`- Size: ${manifest.archive.size_bytes} bytes`);
  lines.push(`- Extraction: \`${manifest.source.extract_dir}\``);
  lines.push(`- Application: ${manifest.application.name}`);
  lines.push(`- Framework: ${manifest.application.framework}`);
  lines.push('');
  lines.push('## Inventory totals');
  lines.push('');
  lines.push('| Artifact | Count |');
  lines.push('| --- | --- |');
  for (const [k, v] of Object.entries(manifest.counts)) lines.push(`| ${k} | ${v} |`);
  lines.push(`| routes (App.jsx) | ${routes.summary.total_routes} |`);
  lines.push('');
  lines.push('## Route guard distribution');
  lines.push('');
  lines.push('| Guard | Routes |');
  lines.push('| --- | --- |');
  for (const [k, v] of Object.entries(routes.summary.by_guard)) lines.push(`| ${k} | ${v} |`);
  lines.push('');
  lines.push('## Server-function enforcement posture');
  lines.push('');
  lines.push(`- Functions: ${functions.summary.total_functions} (HTTP handlers: ${functions.summary.http_handlers})`);
  lines.push(`- Reference a permission check: ${functions.summary.enforce_permission} (${pct(functions.summary.enforce_permission, functions.summary.total_functions)}%)`);
  lines.push(`- Mutate entities: ${functions.summary.mutate_entities}`);
  lines.push(`- Mutate entities WITHOUT a permission check: ${functions.summary.mutating_without_permission_check}`);
  lines.push(`- Use service-role escalation: ${functions.summary.use_service_role}`);
  lines.push('');
  lines.push('## Access-matrix drift');
  lines.push('');
  lines.push(`- Matrix entries: ${access.summary.matrix_entries}`);
  lines.push(`- Declared role keys: ${access.summary.declared_role_keys}`);
  lines.push(`- Routes missing from matrix: ${access.summary.routes_missing_from_matrix}`);
  lines.push(`- Matrix entries without a route: ${access.summary.matrix_entries_without_route}`);
  lines.push(`- Route/matrix role drift: ${access.summary.route_role_drift}`);
  lines.push(`- Unknown path defaults open: ${access.summary.unknown_path_defaults_open}`);
  lines.push('');
  lines.push('## Automated tests & CI');
  lines.push('');
  lines.push(`- Test directories: ${JSON.stringify(testCi.test_dirs)}`);
  lines.push(`- Test files (*.test/*.spec): ${testCi.test_file_count}`);
  lines.push(`- CI configuration: ${JSON.stringify(testCi.ci_configs)}`);
  lines.push(`- Runnable test script: ${testCi.has_test_script} (${testCi.test_script ?? 'none'})`);
  lines.push('');
  lines.push('## Candidate capability domains (search domains, not conclusions)');
  lines.push('');
  lines.push('| Domain | Routes | Entities | Functions | Pages |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const d of capabilities.summary) lines.push(`| ${d.domain} | ${d.routes} | ${d.entities} | ${d.functions} | ${d.pages} |`);
  lines.push('');
  lines.push('## Integrations & localization');
  lines.push('');
  lines.push(`- Dependencies: ${deps.summary.dependencies} (dev: ${deps.summary.dev_dependencies}); Radix UI packages: ${deps.summary.radix_ui_packages}`);
  lines.push(`- Stripe payments: ${deps.integrations.payments_stripe}; Base44 SDK: ${deps.integrations.base44_sdk}`);
  lines.push(`- Localization: ${loc.summary.i18n_files} i18n files; ${loc.summary.framework}`);
  lines.push('');
  lines.push('## Automated observations');
  lines.push('');
  for (const o of observations.observations) lines.push(`- **${o.code}** (${o.kind}): ${o.statement}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const ctx = createContext(process.argv.slice(2));
  const manifest = buildSourceManifest(ctx);
  const routes = analyzeRoutes(ctx);
  const entities = analyzeEntities(ctx);
  const functions = analyzeFunctions(ctx);
  const access = analyzeAccess(ctx);
  const capabilities = analyzeCapabilities(ctx);
  const deps = buildDependencyInventory(ctx.SOURCE_ROOT);
  const loc = buildLocalizationInventory(ctx.SOURCE_ROOT);
  const testCi = detectTestsAndCi(ctx.SOURCE_ROOT);
  const observations = deriveObservations(manifest, routes, entities, functions, access, deps, loc, testCi);

  ctx.writeJson('source-manifest.json', manifest);
  ctx.writeJson('route-inventory.json', routes);
  ctx.writeJson('entity-inventory.json', entities);
  ctx.writeJson('function-inventory.json', functions);
  ctx.writeJson('access-matrix-analysis.json', access);
  ctx.writeJson('capability-domain-analysis.json', capabilities);
  ctx.writeJson('dependency-inventory.json', deps);
  ctx.writeJson('localization-inventory.json', loc);
  ctx.writeJson('tests-ci-inventory.json', testCi);
  ctx.writeJson('automated-observations.json', observations);

  const report = buildReport(manifest, routes, entities, functions, access, capabilities, deps, loc, testCi, observations);
  writeFileSync(join(ctx.GEN_DIR, 'base44-inventory-report.md'), report, 'utf8');

  console.log('Base44 deterministic inventory complete.');
  console.log(`  Source: ${manifest.source.id} (${manifest.archive.filename}) sha256=${manifest.archive.sha256?.slice(0, 16)}...`);
  console.log(`  Routes ${routes.summary.total_routes} | Entities ${entities.summary.total_entities} | Functions ${functions.summary.total_functions}`);
  console.log(`  Enforcement: ${functions.summary.enforce_permission}/${functions.summary.total_functions} functions reference a permission check`);
  console.log(`  Output: ${ctx.GEN_DIR.replace(`${REPO_ROOT}/`, '')}`);
}

main();
