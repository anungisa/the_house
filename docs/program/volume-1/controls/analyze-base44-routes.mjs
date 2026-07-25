// Deterministic route inventory for the Base44 export.
//
// Parses src/App.jsx <Route> declarations, extracting path, element component,
// and the guard wrapper (ProtectedRoute allowedRoles, RoleGate allowed,
// FeatureGate, or none). NON-AUTHORITATIVE evidence input.

import { join } from 'node:path';
import { SOURCE_ROOT, readText, writeJson } from './base44-lib.mjs';

const APP_JSX = join(SOURCE_ROOT, 'src', 'App.jsx');

function extractRoles(segment, attr) {
  // attr e.g. 'allowedRoles' or 'allowed'; matches ={[ ... ]}
  const re = new RegExp(`${attr}=\\{\\[([^\\]]*)\\]`);
  const m = segment.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
}

export function analyze() {
  const text = readText(APP_JSX);
  const routes = [];
  // Match each <Route ... path="..." ... /> or <Route ... path="..." ...>
  const routeRe = /<Route\b([^>]*?)path=["']([^"']+)["']([^>]*?)(?:\/>|>)/g;
  let m;
  while ((m = routeRe.exec(text)) !== null) {
    const before = m[1] ?? '';
    const path = m[2];
    const after = m[3] ?? '';
    const attrs = `${before} ${after}`;
    // Look ahead a bounded window for the element JSX to detect guards.
    const window = text.slice(m.index, m.index + 400);
    const elementMatch = window.match(/element=\{([\s\S]*?)\}\s*(?:\/>|>)/);
    const element = elementMatch ? elementMatch[1].trim() : '';
    let guard = 'none';
    let roles = [];
    if (/ProtectedRoute/.test(element)) {
      guard = 'ProtectedRoute';
      roles = extractRoles(element, 'allowedRoles');
    } else if (/RoleGate/.test(element)) {
      guard = 'RoleGate';
      roles = extractRoles(element, 'allowed');
    } else if (/FeatureGate/.test(element)) {
      guard = 'FeatureGate';
    }
    const compMatch = element.match(/<([A-Z][A-Za-z0-9]*)\s*\/?>/);
    routes.push({
      path,
      component: compMatch ? compMatch[1] : null,
      guard,
      roles,
      client_side_only: guard === 'RoleGate' || guard === 'ProtectedRoute',
      attrs: attrs.trim() || undefined,
    });
  }

  const byGuard = routes.reduce((acc, r) => {
    acc[r.guard] = (acc[r.guard] ?? 0) + 1;
    return acc;
  }, {});
  const roleVocabulary = [...new Set(routes.flatMap((r) => r.roles))].sort();
  const ungated = routes.filter((r) => r.guard === 'none' && !/^\/(login|register|forgot-password|reset-password)/.test(r.path));

  return {
    summary: {
      total_routes: routes.length,
      by_guard: byGuard,
      distinct_route_roles: roleVocabulary.length,
      role_vocabulary: roleVocabulary,
      ungated_authenticated_routes: ungated.length,
    },
    routes,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = analyze();
  writeJson('route-inventory.json', data);
  console.log(`route-inventory.json: ${data.summary.total_routes} routes`);
}
