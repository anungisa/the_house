// Deterministic (5) -> (7) Base44 delta.
//
// Compares the historical export (SRC-009, curl-link-hub (5)) against the current
// declared export (SRC-001, curl-link-hub (7)) across routes, entities, server
// functions, pages, components, access-matrix posture, integrations, tests/CI,
// and candidate capability domains. Writes a NON-AUTHORITATIVE delta artifact.
// This is an EVIDENCE INPUT to the Volume 1 Package 2 corrective amendment; it is
// not a qualification decision.
//
// Usage: node docs/program/volume-1/controls/delta-base44.mjs
//        (or via analyzers with --source-id SRC-009 / SRC-001 registry entries)

import { join, basename } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import {
  createContext,
  REPO_ROOT,
  walk,
  buildDependencyInventory,
  detectTestsAndCi,
} from './base44-lib.mjs';
import { analyze as analyzeRoutes } from './analyze-base44-routes.mjs';
import { analyze as analyzeEntities } from './analyze-base44-entities.mjs';
import { analyze as analyzeFunctions } from './analyze-base44-functions.mjs';
import { analyze as analyzeAccess } from './analyze-base44-access.mjs';
import { analyze as analyzeCapabilities } from './analyze-base44-capabilities.mjs';

const HISTORICAL = createContext({ sourceId: 'SRC-009' });
const CURRENT = createContext({ sourceId: 'SRC-001' });
const GEN_DIR = join(REPO_ROOT, 'docs', 'program', 'volume-1', 'generated', 'base44');

function diffSets(fromArr, toArr) {
  const from = new Set(fromArr);
  const to = new Set(toArr);
  return {
    added: [...to].filter((x) => !from.has(x)).sort(),
    removed: [...from].filter((x) => !to.has(x)).sort(),
    unchanged_count: [...to].filter((x) => from.has(x)).length,
  };
}

function pages(ctx) {
  return walk(join(ctx.SOURCE_ROOT, 'src', 'pages'), (f) => f.endsWith('.jsx')).map((f) => basename(f, '.jsx'));
}
function components(ctx) {
  return walk(join(ctx.SOURCE_ROOT, 'src', 'components'), (f) => f.endsWith('.jsx')).map((f) => basename(f, '.jsx'));
}

function build() {
  const hRoutes = analyzeRoutes(HISTORICAL);
  const cRoutes = analyzeRoutes(CURRENT);
  const hEntities = analyzeEntities(HISTORICAL);
  const cEntities = analyzeEntities(CURRENT);
  const hFunctions = analyzeFunctions(HISTORICAL);
  const cFunctions = analyzeFunctions(CURRENT);
  const hAccess = analyzeAccess(HISTORICAL);
  const cAccess = analyzeAccess(CURRENT);
  const hCaps = analyzeCapabilities(HISTORICAL);
  const cCaps = analyzeCapabilities(CURRENT);
  const hDeps = buildDependencyInventory(HISTORICAL.SOURCE_ROOT);
  const cDeps = buildDependencyInventory(CURRENT.SOURCE_ROOT);
  const hTest = detectTestsAndCi(HISTORICAL.SOURCE_ROOT);
  const cTest = detectTestsAndCi(CURRENT.SOURCE_ROOT);

  const capDomainMap = (caps) => Object.fromEntries(caps.summary.map((d) => [d.domain, d]));
  const hCapMap = capDomainMap(hCaps);
  const cCapMap = capDomainMap(cCaps);
  const allDomains = [...new Set([...Object.keys(hCapMap), ...Object.keys(cCapMap)])].sort();
  const capabilityDomainDeltas = allDomains.map((domain) => {
    const h = hCapMap[domain] ?? { routes: 0, entities: 0, functions: 0, pages: 0 };
    const c = cCapMap[domain] ?? { routes: 0, entities: 0, functions: 0, pages: 0 };
    return {
      domain,
      routes: [h.routes, c.routes],
      entities: [h.entities, c.entities],
      functions: [h.functions, c.functions],
      pages: [h.pages, c.pages],
    };
  });

  return {
    _meta: {
      generated_by: 'docs/program/volume-1/controls/delta-base44.mjs',
      authority:
        'NON-AUTHORITATIVE. Deterministic (5)->(7) delta; evidence input to the Package 2 corrective amendment, not a decision.',
      historical_source: {
        id: HISTORICAL.id,
        archive: HISTORICAL.filename,
        extract_dir: HISTORICAL.SOURCE_ROOT.replace(`${REPO_ROOT}/`, ''),
      },
      current_source: {
        id: CURRENT.id,
        archive: CURRENT.filename,
        extract_dir: CURRENT.SOURCE_ROOT.replace(`${REPO_ROOT}/`, ''),
      },
    },
    totals: {
      routes: [hRoutes.summary.total_routes, cRoutes.summary.total_routes],
      entities: [hEntities.summary.total_entities, cEntities.summary.total_entities],
      functions: [hFunctions.summary.total_functions, cFunctions.summary.total_functions],
      pages: [pages(HISTORICAL).length, pages(CURRENT).length],
      components: [components(HISTORICAL).length, components(CURRENT).length],
    },
    routes: {
      by_guard: { historical: hRoutes.summary.by_guard, current: cRoutes.summary.by_guard },
      ungated_authenticated: [hRoutes.summary.ungated_authenticated_routes, cRoutes.summary.ungated_authenticated_routes],
      diff: diffSets(hRoutes.routes.map((r) => r.path), cRoutes.routes.map((r) => r.path)),
    },
    entities: {
      with_rls_block: [hEntities.summary.entities_with_rls_block, cEntities.summary.entities_with_rls_block],
      with_status_enum: [hEntities.summary.entities_with_status_enum, cEntities.summary.entities_with_status_enum],
      declared_properties: [hEntities.summary.total_declared_properties, cEntities.summary.total_declared_properties],
      diff: diffSets(hEntities.entities.map((e) => e.name), cEntities.entities.map((e) => e.name)),
    },
    functions: {
      posture: {
        enforce_permission: [hFunctions.summary.enforce_permission, cFunctions.summary.enforce_permission],
        mutate_entities: [hFunctions.summary.mutate_entities, cFunctions.summary.mutate_entities],
        mutating_without_permission_check: [
          hFunctions.summary.mutating_without_permission_check,
          cFunctions.summary.mutating_without_permission_check,
        ],
        use_service_role: [hFunctions.summary.use_service_role, cFunctions.summary.use_service_role],
      },
      diff: diffSets(hFunctions.functions.map((f) => f.name), cFunctions.functions.map((f) => f.name)),
    },
    pages_diff: diffSets(pages(HISTORICAL), pages(CURRENT)),
    components_diff: diffSets(components(HISTORICAL), components(CURRENT)),
    access_matrix: {
      matrix_entries: [hAccess.summary.matrix_entries, cAccess.summary.matrix_entries],
      routes_missing_from_matrix: [hAccess.summary.routes_missing_from_matrix, cAccess.summary.routes_missing_from_matrix],
      matrix_entries_without_route: [hAccess.summary.matrix_entries_without_route, cAccess.summary.matrix_entries_without_route],
      route_role_drift: [hAccess.summary.route_role_drift, cAccess.summary.route_role_drift],
      unknown_path_defaults_open: [hAccess.summary.unknown_path_defaults_open, cAccess.summary.unknown_path_defaults_open],
    },
    integrations: {
      dependencies: [hDeps.summary.dependencies, cDeps.summary.dependencies],
      dependency_diff: diffSets(hDeps.dependencies, cDeps.dependencies),
      stripe_payments: [hDeps.integrations.payments_stripe, cDeps.integrations.payments_stripe],
      base44_sdk: [hDeps.integrations.base44_sdk, cDeps.integrations.base44_sdk],
    },
    tests_ci: {
      historical: { test_file_count: hTest.test_file_count, has_ci_config: hTest.has_ci_config, has_test_script: hTest.has_test_script },
      current: { test_file_count: cTest.test_file_count, has_ci_config: cTest.has_ci_config, has_test_script: cTest.has_test_script },
    },
    capability_domains: capabilityDomainDeltas,
  };
}

function pair([a, b], label = '') {
  const arrow = a === b ? '=' : '->';
  return `${a} ${arrow} ${b}${label ? ` ${label}` : ''}`;
}

function report(delta) {
  const L = [];
  L.push('# Base44 (5) -> (7) Delta (NON-AUTHORITATIVE)');
  L.push('');
  L.push('> Generated deterministically by `docs/program/volume-1/controls/delta-base44.mjs`.');
  L.push('> Historical source SRC-009 = `curl-link-hub (5).zip`; current source SRC-001 = `curl-link-hub (7).zip`.');
  L.push('> Evidence input to the Volume 1 Package 2 corrective amendment. Not a qualification decision.');
  L.push('');
  L.push('## Corpus totals (5 -> 7)');
  L.push('');
  L.push('| Artifact | (5) | (7) | Delta |');
  L.push('| --- | --- | --- | --- |');
  for (const [k, v] of Object.entries(delta.totals)) L.push(`| ${k} | ${v[0]} | ${v[1]} | ${v[1] - v[0] >= 0 ? '+' : ''}${v[1] - v[0]} |`);
  L.push('');
  L.push('## Authorization posture (5 -> 7) — core Package 2 findings');
  L.push('');
  L.push('| Metric | (5) | (7) |');
  L.push('| --- | --- | --- |');
  const fp = delta.functions.posture;
  L.push(`| Functions referencing a permission check | ${fp.enforce_permission[0]} | ${fp.enforce_permission[1]} |`);
  L.push(`| Functions mutating entities | ${fp.mutate_entities[0]} | ${fp.mutate_entities[1]} |`);
  L.push(`| Mutating WITHOUT permission check | ${fp.mutating_without_permission_check[0]} | ${fp.mutating_without_permission_check[1]} |`);
  L.push(`| Functions using asServiceRole | ${fp.use_service_role[0]} | ${fp.use_service_role[1]} |`);
  const am = delta.access_matrix;
  L.push(`| Access-matrix entries | ${am.matrix_entries[0]} | ${am.matrix_entries[1]} |`);
  L.push(`| Routes missing from matrix | ${am.routes_missing_from_matrix[0]} | ${am.routes_missing_from_matrix[1]} |`);
  L.push(`| Route/matrix role drift | ${am.route_role_drift[0]} | ${am.route_role_drift[1]} |`);
  L.push(`| Unknown path defaults open | ${am.unknown_path_defaults_open[0]} | ${am.unknown_path_defaults_open[1]} |`);
  L.push('');
  L.push('## Added routes in (7)');
  L.push('');
  L.push(delta.routes.diff.added.length ? delta.routes.diff.added.map((p) => `- \`${p}\``).join('\n') : '- (none)');
  L.push('');
  L.push('## Removed routes (present in (5), absent in (7))');
  L.push('');
  L.push(delta.routes.diff.removed.length ? delta.routes.diff.removed.map((p) => `- \`${p}\``).join('\n') : '- (none)');
  L.push('');
  L.push('## Added entities in (7)');
  L.push('');
  L.push(delta.entities.diff.added.length ? delta.entities.diff.added.map((e) => `- \`${e}\``).join('\n') : '- (none)');
  L.push('');
  L.push('## Removed entities (present in (5), absent in (7))');
  L.push('');
  L.push(delta.entities.diff.removed.length ? delta.entities.diff.removed.map((e) => `- \`${e}\``).join('\n') : '- (none)');
  L.push('');
  L.push('## Added server functions in (7)');
  L.push('');
  L.push(delta.functions.diff.added.length ? delta.functions.diff.added.map((f) => `- \`${f}\``).join('\n') : '- (none)');
  L.push('');
  L.push('## Removed server functions (present in (5), absent in (7))');
  L.push('');
  L.push(delta.functions.diff.removed.length ? delta.functions.diff.removed.map((f) => `- \`${f}\``).join('\n') : '- (none)');
  L.push('');
  L.push('## Dependency / integration delta');
  L.push('');
  L.push(`- Dependencies: ${pair(delta.integrations.dependencies)}`);
  L.push(`- Added dependencies: ${delta.integrations.dependency_diff.added.length ? delta.integrations.dependency_diff.added.join(', ') : '(none)'}`);
  L.push(`- Removed dependencies: ${delta.integrations.dependency_diff.removed.length ? delta.integrations.dependency_diff.removed.join(', ') : '(none)'}`);
  L.push(`- Stripe payments: ${pair(delta.integrations.stripe_payments)}`);
  L.push('');
  L.push('## Tests & CI');
  L.push('');
  L.push(`- (5): test files ${delta.tests_ci.historical.test_file_count}, CI ${delta.tests_ci.historical.has_ci_config}, test script ${delta.tests_ci.historical.has_test_script}`);
  L.push(`- (7): test files ${delta.tests_ci.current.test_file_count}, CI ${delta.tests_ci.current.has_ci_config}, test script ${delta.tests_ci.current.has_test_script}`);
  L.push('');
  L.push('## Candidate capability domains (routes / entities / functions / pages)');
  L.push('');
  L.push('| Domain | (5) r/e/f/p | (7) r/e/f/p |');
  L.push('| --- | --- | --- |');
  for (const d of delta.capability_domains) {
    L.push(`| ${d.domain} | ${d.routes[0]}/${d.entities[0]}/${d.functions[0]}/${d.pages[0]} | ${d.routes[1]}/${d.entities[1]}/${d.functions[1]}/${d.pages[1]} |`);
  }
  L.push('');
  return `${L.join('\n')}\n`;
}

function main() {
  if (!existsSync(HISTORICAL.SOURCE_ROOT) || !existsSync(CURRENT.SOURCE_ROOT)) {
    throw new Error('delta-base44: both SRC-009 and SRC-001 extraction directories must exist');
  }
  const delta = build();
  writeFileSync(join(GEN_DIR, 'delta-5-to-7.json'), `${JSON.stringify(delta, null, 2)}\n`, 'utf8');
  writeFileSync(join(GEN_DIR, 'delta-5-to-7.md'), report(delta), 'utf8');
  console.log('Base44 (5)->(7) delta complete.');
  console.log(`  Routes ${delta.totals.routes[0]}->${delta.totals.routes[1]} | Entities ${delta.totals.entities[0]}->${delta.totals.entities[1]} | Functions ${delta.totals.functions[0]}->${delta.totals.functions[1]}`);
  console.log(`  Added routes ${delta.routes.diff.added.length} | Added entities ${delta.entities.diff.added.length} | Added functions ${delta.functions.diff.added.length}`);
  console.log(`  Enforcement (5->7): ${delta.functions.posture.enforce_permission[0]}->${delta.functions.posture.enforce_permission[1]}; service-role ${delta.functions.posture.use_service_role[0]}->${delta.functions.posture.use_service_role[1]}`);
}

main();
