// Deterministic capability-domain normalization for the Base44 export.
//
// Buckets routes, entities, and functions into candidate capability domains by
// keyword. These are INITIAL SEARCH DOMAINS for qualification, NOT pre-approved
// capability conclusions. NON-AUTHORITATIVE evidence input.

import { join, basename } from 'node:path';
import { createContext, walk } from './base44-lib.mjs';
import { analyze as analyzeRoutes } from './analyze-base44-routes.mjs';
import { analyze as analyzeEntities } from './analyze-base44-entities.mjs';
import { analyze as analyzeFunctions } from './analyze-base44-functions.mjs';

// domain id -> matching regex over lowercased artifact identifiers.
const DOMAINS = [
  ['club_affiliation', /affiliat|application|onboard/i],
  ['organization_registry', /\borg|organization|ptso|node|registry|canonical.?club|club(view|comparison|s)?\b/i],
  ['club_360', /club.?360|club.?success|club.?health|club.?profile/i],
  ['membership', /member|household|roster|curler.?number/i],
  ['participant_identity', /identity|curler.?registration|profile|user.?context|persona/i],
  ['compliance', /complian|gdpr|privacy|waiver|safe.?sport|consent|data.?regul/i],
  ['registration', /registration|register|intake|enrol/i],
  ['payments', /payment|invoice|fee|revenue|finance|reconcil|stripe|expense/i],
  ['support', /support|ticket|help|document360/i],
  ['knowledge', /document|knowledge|docs?hub|policy|rules/i],
  ['analytics', /analytic|report|forecast|intelligence|insight|dashboard|penetration/i],
  ['national_operations', /national|cc_|strategic|board|governance|operationa|command.?center/i],
  ['event_operations', /event|game|league|standing|score|result|facilit|attendance/i],
  ['governance_administration', /admin|platform|system.?health|audit|maintenance|settings|role|permission|workflow/i],
];

function classify(label) {
  const hits = [];
  for (const [id, re] of DOMAINS) {
    if (re.test(label)) hits.push(id);
  }
  return hits.length ? hits : ['unclassified'];
}

export function analyze(ctx) {
  const routes = analyzeRoutes(ctx).routes;
  const entities = analyzeEntities(ctx).entities;
  const functions = analyzeFunctions(ctx).functions;
  const pages = walk(join(ctx.SOURCE_ROOT, 'src', 'pages'), (f) => f.endsWith('.jsx')).map((f) => basename(f, '.jsx'));

  const domains = {};
  const ensure = (id) => {
    domains[id] = domains[id] ?? { routes: [], entities: [], functions: [], pages: [] };
    return domains[id];
  };

  for (const r of routes) {
    const label = `${r.path} ${r.component ?? ''}`;
    for (const id of classify(label)) ensure(id).routes.push(r.path);
  }
  for (const e of entities) {
    for (const id of classify(e.name)) ensure(id).entities.push(e.name);
  }
  for (const f of functions) {
    for (const id of classify(f.name)) ensure(id).functions.push(f.name);
  }
  for (const p of pages) {
    for (const id of classify(p)) ensure(id).pages.push(p);
  }

  const summary = Object.entries(domains)
    .map(([id, d]) => ({
      domain: id,
      routes: d.routes.length,
      entities: d.entities.length,
      functions: d.functions.length,
      pages: d.pages.length,
    }))
    .sort((a, b) => b.routes + b.entities - (a.routes + a.entities));

  return {
    note: 'Candidate search domains only. Overlaps are expected and are themselves evidence of surface duplication. No domain here is a qualified capability or an approved conclusion.',
    summary,
    domains,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ctx = createContext(process.argv.slice(2));
  const data = analyze(ctx);
  ctx.writeJson('capability-domain-analysis.json', data);
  console.log(`capability-domain-analysis.json: ${data.summary.length} candidate domains`);
}
