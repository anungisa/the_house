// Deterministic access-matrix comparison for the Base44 export.
//
// Compares the declared access matrix (src/lib/access/accessMatrix.js) against
// the actual routes in src/App.jsx, surfacing drift: routes with no matrix
// entry (which default to open under canAccessPath), matrix entries with no
// route, and routes whose App.jsx-hardcoded roles differ from the matrix.
// NON-AUTHORITATIVE evidence input.

import { join } from 'node:path';
import { SOURCE_ROOT, readText, writeJson } from './base44-lib.mjs';
import { analyze as analyzeRoutes } from './analyze-base44-routes.mjs';

const MATRIX_JS = join(SOURCE_ROOT, 'src', 'lib', 'access', 'accessMatrix.js');
const ROLE_GROUPS_JS = join(SOURCE_ROOT, 'src', 'lib', 'access', 'roleGroups.js');
const INDEX_JS = join(SOURCE_ROOT, 'src', 'lib', 'access', 'index.js');

function parseMatrix(text) {
  const entries = [];
  const entryRe = /path:\s*["']([^"']+)["']([\s\S]*?)(?:\}\s*,|\}\s*\])/g;
  let m;
  while ((m = entryRe.exec(text)) !== null) {
    const path = m[1];
    const body = m[2] ?? '';
    const rolesMatch = body.match(/roles:\s*\[([^\]]*)\]/);
    const roles = rolesMatch
      ? [...rolesMatch[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1])
      : [];
    entries.push({ path, roles });
  }
  return entries;
}

function countRoleKeys(text, arrayName) {
  const re = new RegExp(`${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\]`);
  const m = text.match(re);
  if (!m) return 0;
  return [...m[1].matchAll(/["']([^"']+)["']/g)].length;
}

export function analyze() {
  const matrixText = readText(MATRIX_JS);
  const roleGroupsText = readText(ROLE_GROUPS_JS);
  const indexText = readText(INDEX_JS);
  const matrix = parseMatrix(matrixText);
  const matrixPaths = new Set(matrix.map((e) => e.path));

  const routes = analyzeRoutes().routes;
  const routePaths = routes.filter((r) => !r.path.includes(':')); // ignore params for set compare

  const routesMissingFromMatrix = routePaths
    .filter((r) => !matrixPaths.has(r.path))
    .map((r) => ({ path: r.path, guard: r.guard, roles: r.roles }));

  const routePathSet = new Set(routes.map((r) => r.path));
  const matrixEntriesWithoutRoute = matrix
    .filter((e) => !routePathSet.has(e.path) && !e.path.includes(':'))
    .map((e) => e.path);

  // Routes whose App.jsx-hardcoded roles differ from the matrix declaration.
  const roleDrift = [];
  for (const r of routes) {
    if (!r.roles.length) continue;
    const entry = matrix.find((e) => e.path === r.path);
    if (!entry) continue;
    const a = [...r.roles].sort().join(',');
    const b = [...entry.roles].sort().join(',');
    if (a !== b) {
      roleDrift.push({ path: r.path, app_jsx_roles: r.roles, matrix_roles: entry.roles });
    }
  }

  const defaultsOpen = /Unknown paths default to open|default.*open/i.test(indexText) || /return true/.test(indexText);

  return {
    summary: {
      matrix_entries: matrix.length,
      declared_role_keys: countRoleKeys(roleGroupsText, 'ALL_ROLE_KEYS'),
      routes_missing_from_matrix: routesMissingFromMatrix.length,
      matrix_entries_without_route: matrixEntriesWithoutRoute.length,
      route_role_drift: roleDrift.length,
      unknown_path_defaults_open: defaultsOpen,
      dual_role_vocabulary: /TWO role vocabularies/i.test(roleGroupsText),
    },
    routes_missing_from_matrix: routesMissingFromMatrix,
    matrix_entries_without_route: matrixEntriesWithoutRoute,
    route_role_drift: roleDrift,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = analyze();
  writeJson('access-matrix-analysis.json', data);
  console.log(
    `access-matrix-analysis.json: ${data.summary.routes_missing_from_matrix} routes missing from matrix`
  );
}
