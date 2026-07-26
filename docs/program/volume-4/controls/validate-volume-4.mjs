// Control: structural and schema conformance for the Volume 4 corpus.
//
// Validates: YAML parse integrity, JSON Schema conformance of every register,
// identifier uniqueness, chapter header/H1 integrity, and the fail-closed
// architecture-authorization guards that keep Volume 4 architecture definition
// from authorizing implementation, procurement, provisioning, delivery
// sequencing, staffing, or cost on its own.

import Ajv from 'ajv';
import {
  Severity,
  REGISTER_SCHEMAS,
  loadSchema,
  makeFinding,
  runStandalone
} from './lib.mjs';

function buildAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addSchema(loadSchema('common.schema.json'));
  for (const file of Object.values(REGISTER_SCHEMAS)) {
    ajv.addSchema(loadSchema(file));
  }
  return ajv;
}

function validateSchemas(ctx, findings) {
  const ajv = buildAjv();
  for (const [regId, schemaFile] of Object.entries(REGISTER_SCHEMAS)) {
    const entry = ctx.registers[regId];
    if (!entry) {
      findings.push(
        makeFinding(Severity.ERROR, 'REGISTER_MISSING', `Register ${regId} is not present in the corpus`, regId)
      );
      continue;
    }
    const validate = ajv.getSchema(schemaFile);
    const ok = validate(entry.doc);
    if (!ok) {
      for (const e of validate.errors ?? []) {
        findings.push(
          makeFinding(
            Severity.ERROR,
            'SCHEMA_CONFORMANCE',
            `${entry.path}: ${e.instancePath || '/'} ${e.message}`,
            regId
          )
        );
      }
    }
  }
}

function reportParseErrors(ctx, findings) {
  for (const e of ctx.registerErrors) {
    findings.push(makeFinding(Severity.ERROR, 'YAML_PARSE', `${e.path}: ${e.message}`, e.file));
  }
}

function validateIdUniqueness(ctx, findings) {
  for (const entry of Object.values(ctx.registers)) {
    const rows = entry.doc?.records ?? [];
    const seen = new Map();
    for (const row of rows) {
      const id = row?.id;
      if (id == null) continue;
      if (seen.has(id)) {
        findings.push(
          makeFinding(Severity.ERROR, 'DUPLICATE_ID', `Duplicate identifier "${id}" in ${entry.id}`, entry.id)
        );
      }
      seen.set(id, true);
    }
  }
  const chapterIds = new Map();
  for (const ch of ctx.chapters) {
    if (chapterIds.has(ch.fileId)) {
      findings.push(
        makeFinding(Severity.ERROR, 'DUPLICATE_ID', `Duplicate chapter identifier "${ch.fileId}"`, ch.file)
      );
    }
    chapterIds.set(ch.fileId, true);
  }
}

function validateChapters(ctx, findings) {
  for (const ch of ctx.chapters) {
    if (!ch.hasH1) {
      findings.push(makeFinding(Severity.ERROR, 'MISSING_H1', `${ch.path}: missing level-1 heading`, ch.id));
    }
    if (!ch.status) {
      findings.push(makeFinding(Severity.ERROR, 'MISSING_STATUS', `${ch.path}: missing Status header`, ch.id));
      continue;
    }
    if (ch.status === 'RATIFIED' && !ch.version) {
      findings.push(makeFinding(Severity.ERROR, 'RATIFIED_NO_VERSION', `${ch.id}: RATIFIED without Version`, ch.id));
    }
    if (ch.status === 'DRAFT') {
      findings.push(
        makeFinding(Severity.INFO, 'DRAFT_CHAPTER', `${ch.id}: chapter is DRAFT (not yet ratified)`, ch.id)
      );
    }
  }
}

// Architecture-authorization guard: no Volume 4 architecture element, decision,
// or fitness function may authorize implementation, and no fitness function may
// claim to be implemented. Package 1 defines TARGET architecture only;
// construction is authorized only downstream through the governed gate sequence
// (fail closed).
function validateArchitectureAuthorization(ctx, findings) {
  const elementRegs = ['REG-401', 'REG-402', 'REG-403'];
  for (const regId of elementRegs) {
    const reg = ctx.registers[regId];
    if (!reg) continue;
    for (const r of reg.doc?.records ?? []) {
      if (r.authorizes_implementation === true) {
        findings.push(
          makeFinding(
            Severity.ERROR,
            'IMPLEMENTATION_UNAUTHORIZED',
            `${r.id}: authorizes_implementation must be false (Volume 4 architecture definition cannot authorize construction)`,
            r.id
          )
        );
      }
    }
  }
  const fitness = ctx.registers['REG-403'];
  for (const r of fitness?.doc?.records ?? []) {
    if (r.implemented === true) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'ARCHITECTURE_NOT_IMPLEMENTED',
          `${r.id}: implemented must be false (Package 1 specifies fitness functions; it does not implement them)`,
          r.id
        )
      );
    }
  }
}

export function run(ctx) {
  const findings = [];
  reportParseErrors(ctx, findings);
  validateSchemas(ctx, findings);
  validateIdUniqueness(ctx, findings);
  validateChapters(ctx, findings);
  validateArchitectureAuthorization(ctx, findings);
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runStandalone('Volume 4 structural and schema conformance', run);
}
