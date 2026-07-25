// Deterministic server-function inventory for the Base44 export.
//
// Scans base44/functions/*/entry.ts for: Deno.serve handler, server-side
// permission enforcement, direct entity mutations, and service-role privilege
// escalation. NON-AUTHORITATIVE evidence input.

import { join, basename } from 'node:path';
import { SOURCE_ROOT, listDirs, walk, readText, writeJson } from './base44-lib.mjs';

const FUNCTIONS_DIR = join(SOURCE_ROOT, 'base44', 'functions');

const MUTATION_RE = /\.(create|update|delete|bulkCreate|bulkUpdate|bulkDelete)\s*\(/;
const PERMISSION_RE = /(enforcePermission|checkPermission|requirePermission|assertPermission)/;
const SERVICE_ROLE_RE = /asServiceRole/;

export function analyze() {
  const dirs = listDirs(FUNCTIONS_DIR);
  const functions = [];
  for (const dir of dirs) {
    const name = basename(dir);
    const files = walk(dir, (f) => f.endsWith('.ts') || f.endsWith('.js'));
    let text = '';
    for (const f of files) text += `\n${readText(f)}`;
    functions.push({
      name,
      files: files.map((f) => `base44/functions/${name}/${basename(f)}`),
      is_http_handler: /Deno\.serve/.test(text),
      enforces_permission: PERMISSION_RE.test(text),
      mutates_entities: MUTATION_RE.test(text),
      uses_service_role: SERVICE_ROLE_RE.test(text),
      loc: text.split('\n').length,
    });
  }
  functions.sort((a, b) => a.name.localeCompare(b.name));

  const handlers = functions.filter((f) => f.is_http_handler);
  const mutating = functions.filter((f) => f.mutates_entities);
  const mutatingUnenforced = mutating.filter((f) => !f.enforces_permission);
  const serviceRole = functions.filter((f) => f.uses_service_role);

  return {
    summary: {
      total_functions: functions.length,
      http_handlers: handlers.length,
      enforce_permission: functions.filter((f) => f.enforces_permission).length,
      mutate_entities: mutating.length,
      mutating_without_permission_check: mutatingUnenforced.length,
      use_service_role: serviceRole.length,
    },
    functions,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = analyze();
  writeJson('function-inventory.json', data);
  console.log(`function-inventory.json: ${data.summary.total_functions} functions`);
}
