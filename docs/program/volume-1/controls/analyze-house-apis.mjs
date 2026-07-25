// Analyzer: HTTP API surface and composition-root inventory for The House.
//
// Derives the declared v1 route surface from src/http/server.ts (route regex tables
// and path templates), the set of HTTP adapters under src/http/*, and the production
// composition graph from src/http/composition.ts (exported factory functions and the
// dependencies wired by createPgAffiliationHttpServer). Static parse only.

import { basename } from 'node:path';
import { existsSync } from 'node:fs';
import { readText, countLines, walk, listDirs } from './house-lib.mjs';

const RX = {
  routeConst: /const\s+([A-Z0-9_]+_ROUTE)\s*=/g,
  routePath: /(\/v1\/[A-Za-z0-9/_:.\-{}]*)/g,
  method: /\b(GET|POST|PUT|PATCH|DELETE)\b\s+(\/v1\/[A-Za-z0-9/_:.\-{}]*)/g,
  exportFn: /export\s+function\s+([A-Za-z0-9_]+)\s*\(/g,
  wiredDep: /^\s*([a-zA-Z0-9_]+):\s*create[A-Za-z0-9_]+\(/gm,
};

function uniqueMatches(text, rx, mapper) {
  const set = new Set();
  const re = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : `${rx.flags}g`);
  let m;
  while ((m = re.exec(text)) !== null) set.add(mapper(m));
  return [...set].sort();
}

export function analyze(ctx) {
  const serverAbs = ctx.abs('src/http/server.ts');
  const serverText = existsSync(serverAbs) ? readText(serverAbs) : '';

  const routeConsts = uniqueMatches(serverText, RX.routeConst, (m) => m[1]);
  const routePaths = uniqueMatches(serverText, RX.routePath, (m) =>
    m[1].replace(/\/$/, '').replace(/\(\[\^\/\]\+\)/g, ':id'),
  );
  const methodRoutes = uniqueMatches(serverText, RX.method, (m) => `${m[1]} ${m[2]}`);

  // HTTP adapter modules (transport surfaces).
  const httpRoot = ctx.abs('src/http');
  const adapters = [];
  for (const entry of [...listDirs(httpRoot)]) {
    const files = walk(entry, (f) => f.endsWith('.ts') && !/\.test\.ts$/.test(f));
    if (files.length === 0) continue;
    adapters.push({
      name: basename(entry),
      path: ctx.rel(entry),
      files: files.length,
      lines: files.reduce((n, f) => n + countLines(readText(f)), 0),
    });
  }
  const topLevelHttp = walk(httpRoot, (f) => /\/src\/http\/[^/]+\.ts$/.test(f) && !/\.test\.ts$/.test(f));

  // Group routes by resource segment for a readable summary.
  const byResource = {};
  for (const p of routePaths) {
    const seg = p.split('/')[2] ?? 'root';
    byResource[seg] = (byResource[seg] ?? 0) + 1;
  }

  const api = {
    summary: {
      route_constants: routeConsts.length,
      distinct_route_paths: routePaths.length,
      method_bound_routes: methodRoutes.length,
      adapter_groups: adapters.length,
      top_level_http_modules: topLevelHttp.length,
      routes_by_resource: byResource,
    },
    route_constants: routeConsts,
    route_paths: routePaths,
    method_routes: methodRoutes,
    adapters,
    top_level_modules: topLevelHttp.map((f) => ctx.rel(f)),
  };

  // Composition root.
  const compAbs = ctx.abs('src/http/composition.ts');
  const compText = existsSync(compAbs) ? readText(compAbs) : '';
  const factories = uniqueMatches(compText, RX.exportFn, (m) => m[1]);
  // Dependencies wired inside the production server assembly.
  const wired = uniqueMatches(compText, RX.wiredDep, (m) => m[1]);
  const stubMarkers = [];
  for (const marker of ['Noop', 'in-memory', 'stub', 'not token/JWT', 'future pass']) {
    if (compText.includes(marker)) stubMarkers.push(marker);
  }

  // Entry points: runnable scripts + server runtime host.
  const scripts = walk(ctx.abs('scripts'), (f) => f.endsWith('.ts')).map((f) => ctx.rel(f));
  const serverHost = walk(ctx.abs('src/server'), (f) => f.endsWith('.ts') && !/\.test\.ts$/.test(f)).map((f) =>
    ctx.rel(f),
  );

  const composition = {
    summary: {
      factory_functions: factories.length,
      production_server_assembly: factories.includes('createPgAffiliationHttpServer'),
      wired_dependencies: wired,
      declared_stub_markers: stubMarkers,
      runnable_scripts: scripts.length,
      server_host_modules: serverHost.length,
    },
    factory_functions: factories,
    server_host_modules: serverHost,
    scripts,
  };

  return { api, composition };
}
