// Control: structural, schema, and delivery-planning-governance conformance for
// the Volume 10 corpus.
//
// Validates: YAML parse integrity, JSON Schema conformance of every register
// (which enforces the required-field obligations of outcomes, capabilities,
// workstreams, work packages, deliverables, dependencies, milestones,
// environments, release units, evidence requirements, readiness conditions,
// acceptance criteria, decisions, assumptions, risks, issues, changes,
// commitments, estimates, funding, and procurement), identifier uniqueness,
// chapter header/H1 integrity, and the fail-closed delivery-planning guards
// required by the directive: no record may authorize implementation; foundation
// records must be in a not-implemented posture; planning records must carry a
// documentary-plan-only planning posture and a not-committed commitment posture;
// estimates must carry a planning-estimate posture; unresolved items must not
// point to completed gates; and no implementation/provisioning/deployment or
// executable-artifact leakage may appear in the corpus.

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

// Registers whose records must all carry a NOT_IMPLEMENTED_OR_NOT_PROVEN posture.
const FOUNDATION_REGISTERS = ['REG-1001', 'REG-1002', 'REG-1003', 'REG-1004'];
// Registers whose records must carry a documentary-plan-only planning posture and
// a not-committed commitment posture.
const PLANNING_REGISTERS = ['REG-1001', 'REG-1002'];

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

// Implementation-authorization guard (fail closed): no Volume 10 record in any
// register may set authorizes_implementation: true.
function validateNoImplementationAuthorization(ctx, findings) {
  for (const regId of Object.keys(REGISTER_SCHEMAS)) {
    for (const r of records(ctx, regId)) {
      if (r.authorizes_implementation === true) {
        findings.push(makeFinding(Severity.ERROR, 'IMPLEMENTATION_UNAUTHORIZED', `${r.id}: authorizes_implementation must be false (Volume 10 delivery-planning foundation cannot authorize implementation, provisioning, execution, procurement, or release)`, r.id));
      }
    }
  }
}

// Implementation-status guard (fail closed): every foundation record must carry an
// implementation_status of NOT_IMPLEMENTED_OR_NOT_PROVEN.
function validateImplementationStatus(ctx, findings) {
  for (const regId of FOUNDATION_REGISTERS) {
    for (const r of records(ctx, regId)) {
      if (r.implementation_status !== 'NOT_IMPLEMENTED_OR_NOT_PROVEN') {
        findings.push(makeFinding(Severity.ERROR, 'IMPLEMENTATION_STATUS_INVALID', `${r.id}: implementation_status must be NOT_IMPLEMENTED_OR_NOT_PROVEN in Package 1`, r.id));
      }
    }
  }
}

// Planning-posture guard (fail closed): every planning record must carry a
// documentary-plan-only planning posture and a not-committed commitment posture.
function validatePlanningPosture(ctx, findings) {
  for (const regId of PLANNING_REGISTERS) {
    for (const r of records(ctx, regId)) {
      if (r.planning_status !== 'DOCUMENTARY_PLAN_ONLY') {
        findings.push(makeFinding(Severity.ERROR, 'PLANNING_STATUS_INVALID', `${r.id}: planning_status must be DOCUMENTARY_PLAN_ONLY (a plan is not an implementation authorization)`, r.id));
      }
      if (r.commitment_status !== 'NOT_COMMITTED') {
        findings.push(makeFinding(Severity.ERROR, 'COMMITMENT_STATUS_INVALID', `${r.id}: commitment_status must be NOT_COMMITTED (a plan is not a commitment)`, r.id));
      }
    }
  }
}

// Estimate-posture guard (fail closed): every cost estimate must carry a
// planning-estimate posture and must not be recorded as an approved budget.
function validateEstimatePosture(ctx, findings) {
  for (const r of records(ctx, 'REG-1004')) {
    if (r.kind !== 'COST_ESTIMATE') continue;
    if (r.estimate_status !== 'PLANNING_ESTIMATE') {
      findings.push(makeFinding(Severity.ERROR, 'ESTIMATE_STATUS_INVALID', `${r.id}: estimate_status must be PLANNING_ESTIMATE (an estimate is not an approved budget, quote, purchase, or contract)`, r.id));
    }
    if (typeof r.approval_status === 'string' && /\bapproved\b|\bcommitted\b|\bpurchase\b|\bcontract\b/i.test(r.approval_status) && !/not\s+approved|no\s+approval|planning/i.test(r.approval_status)) {
      findings.push(makeFinding(Severity.ERROR, 'ESTIMATE_APPROVED_AS_BUDGET', `${r.id}: estimate approval_status implies an approved budget/commitment without authority`, r.id));
    }
  }
}

// Completed-gate guard (fail closed): no unresolved planning/backlog item may name
// a governance gate that has already been dispositioned as its future blocking gate.
function validateFutureGates(ctx, findings) {
  const done = completedGates(ctx);
  for (const r of records(ctx, 'REG-1004')) {
    if (r.future_blocking_gate && done.has(r.future_blocking_gate)) {
      findings.push(makeFinding(Severity.ERROR, 'BACKLOG_POINTS_TO_COMPLETED_GATE', `${r.id}: future_blocking_gate ${r.future_blocking_gate} is already dispositioned`, r.id));
    }
  }
  for (const r of records(ctx, 'REG-1002')) {
    if (r.kind === 'READINESS_CONDITION' && r.future_gate && done.has(r.future_gate)) {
      findings.push(makeFinding(Severity.ERROR, 'READINESS_POINTS_TO_COMPLETED_GATE', `${r.id}: future_gate ${r.future_gate} is already dispositioned`, r.id));
    }
  }
}

// Executable/provisioning/deployment leakage guard (fail closed).
function validateLeakage(ctx, findings) {
  const scan = (label, text, artifact) => {
    for (const p of LEAKAGE_PATTERNS) {
      if (p.re.test(text)) {
        findings.push(makeFinding(Severity.ERROR, 'EXECUTABLE_LEAKAGE', `${label}: prohibited ${p.code} artifact detected in a documentary planning foundation`, artifact));
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
  validateImplementationStatus(ctx, findings);
  validatePlanningPosture(ctx, findings);
  validateEstimatePosture(ctx, findings);
  validateFutureGates(ctx, findings);
  validateLeakage(ctx, findings);
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStandalone('Structural, schema & delivery-planning-governance conformance', run);
}
