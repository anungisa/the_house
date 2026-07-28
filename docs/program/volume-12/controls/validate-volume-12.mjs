// Control: structural, schema, and operational-governance conformance for the
// Volume 12 corpus.
//
// Validates: YAML parse integrity, JSON Schema conformance of every register
// (which enforces the required-field obligations of services, capabilities,
// owners, operating states, support classes, providers, observability signals,
// operational procedures, continuity scenarios, backup/restore/recovery/
// reconciliation requirements, migration stages, training audiences, adoption
// measures, evidence requirements, acceptance criteria, handoffs, decisions,
// assumptions, risks, issues, incidents, problems, migration backlog, adoption
// backlog, and assurance gaps), identifier uniqueness, chapter header/H1
// integrity, and the fail-closed operational-governance guards required by the
// directive: no record may authorize implementation or operations; every
// controlled record must be in a not-implemented, not-operational, and
// not-executed posture; unresolved items must not point to completed gates; and
// no implementation/operations/provisioning/deployment or executable-artifact
// leakage may appear in the corpus.

import Ajv from 'ajv';
import {
  Severity,
  REGISTER_SCHEMAS,
  LEAKAGE_PATTERNS,
  completedGates,
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

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

// Registers whose records must all carry the fail-closed operational posture:
// not implemented, not operational, and not executed.
const CONTROLLED_REGISTERS = ['REG-1201', 'REG-1202', 'REG-1203', 'REG-1204'];

function validateSchemas(ctx, findings) {
  const ajv = buildAjv();
  for (const [regId, schemaFile] of Object.entries(REGISTER_SCHEMAS)) {
    const entry = ctx.registers[regId];
    if (!entry) {
      findings.push(makeFinding(Severity.ERROR, 'REGISTER_MISSING', `Register ${regId} is not present in the corpus`, regId));
      continue;
    }
    const validate = ajv.getSchema(schemaFile);
    const ok = validate(entry.doc);
    if (!ok) {
      for (const e of validate.errors ?? []) {
        findings.push(makeFinding(Severity.ERROR, 'SCHEMA_CONFORMANCE', `${entry.path}: ${e.instancePath || '/'} ${e.message}`, regId));
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
        findings.push(makeFinding(Severity.ERROR, 'DUPLICATE_ID', `Duplicate identifier "${id}" in ${entry.id}`, entry.id));
      }
      seen.set(id, true);
    }
  }
  const chapterIds = new Map();
  for (const ch of ctx.chapters) {
    if (chapterIds.has(ch.fileId)) {
      findings.push(makeFinding(Severity.ERROR, 'DUPLICATE_ID', `Duplicate chapter identifier "${ch.fileId}"`, ch.file));
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
      findings.push(makeFinding(Severity.INFO, 'DRAFT_CHAPTER', `${ch.id}: chapter is DRAFT (not yet ratified)`, ch.id));
    }
  }
}

// Implementation-authorization guard (fail closed): no Volume 12 record in any
// register may set authorizes_implementation: true.
function validateNoImplementationAuthorization(ctx, findings) {
  for (const regId of Object.keys(REGISTER_SCHEMAS)) {
    for (const r of records(ctx, regId)) {
      if (r.authorizes_implementation === true) {
        findings.push(makeFinding(Severity.ERROR, 'IMPLEMENTATION_UNAUTHORIZED', `${r.id}: authorizes_implementation must be false (Volume 12 operational governance foundation cannot authorize implementation, provisioning, execution, procurement, or release)`, r.id));
      }
    }
  }
}

// Operations-authorization guard (fail closed): no Volume 12 record in any
// register may set authorizes_operations: true.
function validateNoOperationsAuthorization(ctx, findings) {
  for (const regId of Object.keys(REGISTER_SCHEMAS)) {
    for (const r of records(ctx, regId)) {
      if (r.authorizes_operations === true) {
        findings.push(makeFinding(Severity.ERROR, 'OPERATIONS_UNAUTHORIZED', `${r.id}: authorizes_operations must be false (Volume 12 evidence, gate, acceptance, and release-decision governance foundation cannot authorize operations, migration, backup, restore, recovery, training, provider integration, or any operational exercise)`, r.id));
      }
    }
  }
}

// Release-authorization guard (fail closed): no Volume 12 record in any register
// may set authorizes_release: true. Volume 12 defines the evidence, gate,
// acceptance, and release-decision governance system; it may not itself authorize
// a release, deployment, or launch.
function validateNoReleaseAuthorization(ctx, findings) {
  for (const regId of Object.keys(REGISTER_SCHEMAS)) {
    for (const r of records(ctx, regId)) {
      if (r.authorizes_release === true) {
        findings.push(makeFinding(Severity.ERROR, 'RELEASE_UNAUTHORIZED', `${r.id}: authorizes_release must be false (Volume 12 Package 1 defines the release-decision governance system; it cannot accept evidence, pass a final gate, or authorize a release)`, r.id));
      }
    }
  }
}

// Posture guard (fail closed): every controlled record must carry an
// implementation_status of NOT_IMPLEMENTED_OR_NOT_PROVEN, an operational_status
// of NOT_OPERATIONAL_OR_NOT_PROVEN, an execution_status of NOT_EXECUTED, an
// evidence_status of NOT_AVAILABLE_OR_NOT_ACCEPTED, an acceptance_status of
// NOT_ACCEPTED, and a release_status of NOT_AUTHORIZED.
function validateOperationalPosture(ctx, findings) {
  for (const regId of CONTROLLED_REGISTERS) {
    for (const r of records(ctx, regId)) {
      if (r.implementation_status !== 'NOT_IMPLEMENTED_OR_NOT_PROVEN') {
        findings.push(makeFinding(Severity.ERROR, 'IMPLEMENTATION_STATUS_INVALID', `${r.id}: implementation_status must be NOT_IMPLEMENTED_OR_NOT_PROVEN in Package 1`, r.id));
      }
      if (r.operational_status !== 'NOT_OPERATIONAL_OR_NOT_PROVEN') {
        findings.push(makeFinding(Severity.ERROR, 'OPERATIONAL_STATUS_INVALID', `${r.id}: operational_status must be NOT_OPERATIONAL_OR_NOT_PROVEN (an evidence or release definition is not an operating service)`, r.id));
      }
      if (r.execution_status !== 'NOT_EXECUTED') {
        findings.push(makeFinding(Severity.ERROR, 'EXECUTION_STATUS_INVALID', `${r.id}: execution_status must be NOT_EXECUTED (no test, migration, operational, or release exercise has been executed)`, r.id));
      }
      if (r.evidence_status !== 'NOT_AVAILABLE_OR_NOT_ACCEPTED') {
        findings.push(makeFinding(Severity.ERROR, 'EVIDENCE_STATUS_INVALID', `${r.id}: evidence_status must be NOT_AVAILABLE_OR_NOT_ACCEPTED (Package 1 defines evidence requirements; it manufactures and accepts no evidence)`, r.id));
      }
      if (r.acceptance_status !== 'NOT_ACCEPTED') {
        findings.push(makeFinding(Severity.ERROR, 'ACCEPTANCE_STATUS_INVALID', `${r.id}: acceptance_status must be NOT_ACCEPTED (no acceptance decision has been taken)`, r.id));
      }
      if (r.release_status !== 'NOT_AUTHORIZED') {
        findings.push(makeFinding(Severity.ERROR, 'RELEASE_STATUS_INVALID', `${r.id}: release_status must be NOT_AUTHORIZED (no release, deployment, or launch is authorized)`, r.id));
      }
    }
  }
}

// Completed-gate guard (fail closed): no unresolved backlog item may name a
// governance gate that has already been dispositioned as its future blocking gate.
function validateFutureGates(ctx, findings) {
  const done = completedGates(ctx);
  for (const r of records(ctx, 'REG-1204')) {
    if (r.future_blocking_gate && done.has(r.future_blocking_gate)) {
      findings.push(makeFinding(Severity.ERROR, 'BACKLOG_POINTS_TO_COMPLETED_GATE', `${r.id}: future_blocking_gate ${r.future_blocking_gate} is already dispositioned`, r.id));
    }
  }
}

// Executable/provisioning/deployment/operations leakage guard (fail closed).
function validateLeakage(ctx, findings) {
  const scan = (label, text, artifact) => {
    for (const p of LEAKAGE_PATTERNS) {
      if (p.re.test(text)) {
        findings.push(makeFinding(Severity.ERROR, 'EXECUTABLE_LEAKAGE', `${label}: prohibited ${p.code} artifact detected in a documentary operational governance foundation`, artifact));
      }
    }
  };
  for (const ch of ctx.chapters) {
    scan(ch.path, ch.body, ch.id);
  }
  for (const entry of Object.values(ctx.registers)) {
    scan(entry.path, entry.raw, entry.id);
  }
}

export function run(ctx) {
  const findings = [];
  reportParseErrors(ctx, findings);
  validateSchemas(ctx, findings);
  validateIdUniqueness(ctx, findings);
  validateChapters(ctx, findings);
  validateNoImplementationAuthorization(ctx, findings);
  validateNoOperationsAuthorization(ctx, findings);
  validateNoReleaseAuthorization(ctx, findings);
  validateOperationalPosture(ctx, findings);
  validateFutureGates(ctx, findings);
  validateLeakage(ctx, findings);
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStandalone('Structural, schema & operational-governance conformance', run);
}
