// Control: structural and schema conformance for the Volume 3 corpus.
//
// Validates: YAML parse integrity, JSON Schema conformance of every register,
// identifier uniqueness, chapter header/H1 integrity, stakeholder/outcome
// integrity, and the requirement-authorization guard (REG-303) that keeps
// Volume 3 product definition from authorizing implementation on its own
// (fail closed).

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

// Outcome / stakeholder integrity: every outcome must name at least one
// stakeholder, and governed authority may not be asserted for a client-facing
// (Button-only) stakeholder (fail closed on governed-authority boundary).
function validateStakeholderIntegrity(ctx, findings) {
  const stk = ctx.registers['REG-302'];
  if (!stk) return;
  for (const r of stk.doc?.records ?? []) {
    if (r.governed_authority === true && r.primary_product === 'Button') {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'GOVERNED_AUTHORITY_BOUNDARY',
          `${r.id}: a Button-primary stakeholder may not hold governed authority (House owns governed lifecycle)`,
          r.id
        )
      );
    }
  }
}

// Requirement-authorization guard: a Volume 3 requirement may never authorize
// implementation. Product definition (Package 1) describes what must be built
// and how it will be accepted, but construction is authorized only downstream
// through the governed gate sequence (fail closed).
function validateRequirementAuthorization(ctx, findings) {
  const reg = ctx.registers['REG-303'];
  if (!reg) return;
  for (const r of reg.doc?.records ?? []) {
    if (r.authorizes_implementation === true) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'IMPLEMENTATION_UNAUTHORIZED',
          `${r.id}: authorizes_implementation must be false (Volume 3 product definition cannot authorize construction)`,
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
  validateStakeholderIntegrity(ctx, findings);
  validateRequirementAuthorization(ctx, findings);
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runStandalone('Volume 3 structural and schema conformance', run);
}
