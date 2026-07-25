// Control: structural and schema conformance for the Volume 1 qualification corpus.
//
// Validates: YAML parse integrity, JSON Schema conformance of every register,
// identifier uniqueness, chapter header/H1 integrity, controlled-source integrity
// (REG-101), and the qualification-authorization guard (REG-106) that keeps
// Volume 1 findings from authorizing implementation on their own (fail closed).

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

// Controlled-source integrity: every registered assessment source must have a
// custodian and classification, and must be flagged controlled (fail closed).
function validateSources(ctx, findings) {
  const reg = ctx.registers['REG-101'];
  if (!reg) return;
  for (const r of reg.doc?.records ?? []) {
    if (!r.custodian || !r.classification) {
      findings.push(
        makeFinding(Severity.ERROR, 'SOURCE_UNASSIGNED', `${r.id}: source lacks custodian/classification (fail closed)`, r.id)
      );
    }
    if (r.controlled !== true) {
      findings.push(
        makeFinding(Severity.WARNING, 'SOURCE_UNCONTROLLED', `${r.id}: assessment source is not marked controlled`, r.id)
      );
    }
  }
}

// Qualification-authorization guard: a qualification decision may only authorize
// implementation when it is executive-accepted AND names an authorizing gate.
// Volume 1 findings alone must never authorize construction (Volume 1 operating
// rule; Gate V1-G1 condition).
function validateQualificationAuthorization(ctx, findings) {
  const reg = ctx.registers['REG-106'];
  if (!reg) return;
  for (const r of reg.doc?.records ?? []) {
    if (r.authorizes_implementation === true) {
      if (r.decision_status !== 'executive_accepted' || !r.authorizing_gate) {
        findings.push(
          makeFinding(
            Severity.ERROR,
            'IMPLEMENTATION_UNAUTHORIZED',
            `${r.id}: authorizes_implementation set without executive acceptance and an authorizing gate (Volume 1 findings cannot authorize construction)`,
            r.id
          )
        );
      }
    }
  }
}

export function run(ctx) {
  const findings = [];
  reportParseErrors(ctx, findings);
  validateSchemas(ctx, findings);
  validateIdUniqueness(ctx, findings);
  validateChapters(ctx, findings);
  validateSources(ctx, findings);
  validateQualificationAuthorization(ctx, findings);
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runStandalone('Volume 1 structural and schema conformance', run);
}
