// Control: structural and schema conformance for the Volume 0 corpus.
//
// Validates: YAML parse integrity, JSON Schema conformance of every register,
// identifier uniqueness, chapter header/H1 integrity, authority integrity
// (REG-005), exception expiry (REG-007), and measures baseline status (REG-008).

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
    const rows = entry.doc?.records ?? entry.doc?.terms ?? [];
    const seen = new Map();
    for (const row of rows) {
      const id = row?.id ?? row?.term;
      if (id == null) continue;
      if (seen.has(id)) {
        findings.push(
          makeFinding(Severity.ERROR, 'DUPLICATE_ID', `Duplicate identifier "${id}" in ${entry.id}`, entry.id)
        );
      }
      seen.set(id, true);
    }
  }
  // Chapter document ids must be unique.
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
    if (ch.status === 'RATIFIED') {
      if (!ch.version) {
        findings.push(makeFinding(Severity.ERROR, 'RATIFIED_NO_VERSION', `${ch.id}: RATIFIED without Version`, ch.id));
      }
      // Owner/approver integrity (own header or package-inherited) is enforced by
      // the ratification-integrity control, not here.
    }
    if (ch.status === 'DRAFT') {
      findings.push(
        makeFinding(Severity.INFO, 'DRAFT_CHAPTER', `${ch.id}: chapter is DRAFT (not yet ratified)`, ch.id)
      );
    }
  }
}

const NON_AUTHORITATIVE_TYPES = new Set([
  'reference_case_evidence',
  'reporting_source',
  'replaceable_provider'
]);

function validateAuthority(ctx, findings) {
  const reg = ctx.registers['REG-005'];
  if (!reg) return;
  const records = reg.doc?.records ?? [];
  const byName = new Map();
  for (const r of records) {
    if (byName.has(r.source_name)) {
      findings.push(
        makeFinding(Severity.ERROR, 'AUTHORITY_CONFLICT', `Duplicate source_name "${r.source_name}" creates conflicting authority`, r.id)
      );
    }
    byName.set(r.source_name, r);

    if (!r.owner || !r.applicable_scope) {
      findings.push(
        makeFinding(Severity.ERROR, 'AUTHORITY_UNASSIGNED', `${r.id}: source has no assigned owner/scope (fail closed)`, r.id)
      );
    }
    if (r.source_type === 'temporary_transition_platform') {
      if (!r.note || !/trigger/i.test(r.note)) {
        findings.push(
          makeFinding(Severity.ERROR, 'AUTHORITY_NO_EXIT_TRIGGER', `${r.id}: temporary transition platform lacks an explicit expiry trigger`, r.id)
        );
      }
    }
    if (NON_AUTHORITATIVE_TYPES.has(r.source_type) && r.authority_level < 4) {
      findings.push(
        makeFinding(Severity.ERROR, 'AUTHORITY_OVERPRIVILEGED', `${r.id}: non-authoritative source (${r.source_type}) holds too high an authority level (${r.authority_level})`, r.id)
      );
    }
    if (r.source_type === 'reporting_source' && /system of record|authoritative/i.test(r.applicable_scope)) {
      findings.push(
        makeFinding(Severity.ERROR, 'AUTHORITY_REPORTING_AS_SOR', `${r.id}: reporting source must not be a system of record`, r.id)
      );
    }
  }
}

function validateExceptions(ctx, findings) {
  const reg = ctx.registers['REG-007'];
  if (!reg) return;
  const records = reg.doc?.records ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  for (const r of records) {
    if (r.status === 'active' && r.expiry_date && r.expiry_date < today) {
      findings.push(
        makeFinding(Severity.ERROR, 'EXCEPTION_EXPIRED', `${r.id}: active exception expired on ${r.expiry_date}`, r.id)
      );
    } else if (r.status === 'active' && r.expiry_date && r.expiry_date <= soon) {
      findings.push(
        makeFinding(Severity.WARNING, 'EXCEPTION_EXPIRING', `${r.id}: active exception expires on ${r.expiry_date} (within review window)`, r.id)
      );
    }
  }
}

function validateMeasures(ctx, findings) {
  const reg = ctx.registers['REG-008'];
  if (!reg) return;
  for (const r of reg.doc?.records ?? []) {
    if (r.baseline === 'TBD' || r.target === 'TBD') {
      findings.push(
        makeFinding(Severity.INFO, 'MEASURE_PENDING_BASELINE', `${r.id}: baseline/target pending (not yet gate-required)`, r.id)
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
  validateAuthority(ctx, findings);
  validateExceptions(ctx, findings);
  validateMeasures(ctx, findings);
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runStandalone('Volume 0 structural and schema conformance', run);
}
