// Deterministic entity inventory for the Base44 export.
//
// Parses base44/entities/*.jsonc, extracting property count, required fields,
// status/state enums, and presence of an rls (row-level security) block.
// NON-AUTHORITATIVE evidence input.

import { join, basename } from 'node:path';
import { createContext, walk, readText, parseJsonc } from './base44-lib.mjs';

export function analyze(ctx) {
  const ENTITIES_DIR = join(ctx.SOURCE_ROOT, 'base44', 'entities');
  const files = walk(ENTITIES_DIR, (f) => f.endsWith('.jsonc'));
  const entities = [];
  const parseErrors = [];
  for (const file of files) {
    const name = basename(file, '.jsonc');
    try {
      const doc = parseJsonc(readText(file));
      const props = doc.properties ?? {};
      const propNames = Object.keys(props);
      const statusField = props.status || props.state || props.lifecycle_state;
      entities.push({
        name: doc.name ?? name,
        file: `base44/entities/${basename(file)}`,
        property_count: propNames.length,
        required: Array.isArray(doc.required) ? doc.required.length : 0,
        has_rls: Boolean(doc.rls),
        has_status_enum: Boolean(statusField && statusField.enum),
        status_values: statusField && statusField.enum ? statusField.enum : [],
      });
    } catch (err) {
      parseErrors.push({ file: `base44/entities/${basename(file)}`, error: String(err.message ?? err) });
    }
  }
  entities.sort((a, b) => a.name.localeCompare(b.name));

  const withRls = entities.filter((e) => e.has_rls).length;
  const withStatus = entities.filter((e) => e.has_status_enum).length;

  return {
    summary: {
      total_entities: entities.length,
      parse_errors: parseErrors.length,
      entities_with_rls_block: withRls,
      entities_with_status_enum: withStatus,
      total_declared_properties: entities.reduce((s, e) => s + e.property_count, 0),
    },
    parse_errors: parseErrors,
    entities,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ctx = createContext(process.argv.slice(2));
  const data = analyze(ctx);
  ctx.writeJson('entity-inventory.json', data);
  console.log(`entity-inventory.json: ${data.summary.total_entities} entities`);
}
