// Control: structural, schema, experience, and service-design conformance for the
// Volume 7 corpus.
//
// Validates: YAML parse integrity, JSON Schema conformance of every register,
// identifier uniqueness, chapter header/H1 integrity, and the fail-closed
// experience/service-design guards required by the directive: actors without
// authority posture, primary goal, or prohibited actions; journey stages without
// House authority, Button responsibility, or recovery; statuses and content
// without user-facing meaning, prohibited inference, authoritative source, or
// English/French semantic requirements; accessibility obligations without a
// requirement; blueprints without separation invariants; exceptions without expiry
// or approval; backlog items without owners or future gates; unresolved items
// pointing to completed gates; records authorizing implementation; records not in
// a not-implemented posture; and executable experience leakage (DDL / IAM /
// migration / key material / coded interface / design-system).

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
const FOUNDATION_REGISTERS = ['REG-701', 'REG-702', 'REG-703', 'REG-704'];

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

// Implementation-authorization guard (fail closed): no Volume 7 record in any
// register may set authorizes_implementation: true.
function validateNoImplementationAuthorization(ctx, findings) {
  for (const regId of Object.keys(REGISTER_SCHEMAS)) {
    for (const r of records(ctx, regId)) {
      if (r.authorizes_implementation === true) {
        findings.push(makeFinding(Severity.ERROR, 'IMPLEMENTATION_UNAUTHORIZED', `${r.id}: authorizes_implementation must be false (Volume 7 foundation cannot authorize construction)`, r.id));
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

// Actors without authority posture, primary goal, or explicit prohibited actions.
function validateActors(ctx, findings) {
  for (const a of records(ctx, 'REG-701')) {
    if (a.kind !== 'ACTOR') continue;
    if (!a.authority_posture) {
      findings.push(makeFinding(Severity.ERROR, 'ACTOR_WITHOUT_POSTURE', `${a.id}: actor names no authority_posture`, a.id));
    }
    if (!a.primary_goal) {
      findings.push(makeFinding(Severity.ERROR, 'ACTOR_WITHOUT_GOAL', `${a.id}: actor names no primary_goal`, a.id));
    }
    if (!(a.prohibited_actions && a.prohibited_actions.length > 0)) {
      findings.push(makeFinding(Severity.ERROR, 'ACTOR_WITHOUT_PROHIBITIONS', `${a.id}: actor names no prohibited_actions`, a.id));
    }
    if (!a.language_needs) {
      findings.push(makeFinding(Severity.ERROR, 'ACTOR_WITHOUT_LANGUAGE', `${a.id}: actor names no language_needs`, a.id));
    }
  }
}

// Journey stages without user objective, House authority, Button responsibility,
// states, or recovery.
function validateStages(ctx, findings) {
  for (const s of records(ctx, 'REG-701')) {
    if (s.kind !== 'STAGE') continue;
    if (!s.house_authority) {
      findings.push(makeFinding(Severity.ERROR, 'STAGE_WITHOUT_HOUSE_AUTHORITY', `${s.id}: journey stage names no house_authority`, s.id));
    }
    if (!s.button_responsibility) {
      findings.push(makeFinding(Severity.ERROR, 'STAGE_WITHOUT_BUTTON_RESPONSIBILITY', `${s.id}: journey stage names no button_responsibility`, s.id));
    }
    if (!(s.states && s.states.length > 0)) {
      findings.push(makeFinding(Severity.ERROR, 'STAGE_WITHOUT_STATES', `${s.id}: journey stage names no states`, s.id));
    }
    if (!s.recovery) {
      findings.push(makeFinding(Severity.ERROR, 'STAGE_WITHOUT_RECOVERY', `${s.id}: journey stage names no recovery path`, s.id));
    }
  }
}

// Blueprints without separation invariants.
function validateBlueprints(ctx, findings) {
  for (const b of records(ctx, 'REG-701')) {
    if (b.kind !== 'BLUEPRINT') continue;
    if (!(b.separation_invariants && b.separation_invariants.length > 0)) {
      findings.push(makeFinding(Severity.ERROR, 'BLUEPRINT_WITHOUT_INVARIANTS', `${b.id}: service blueprint names no separation_invariants`, b.id));
    }
  }
}

// Status and content semantics without user-facing meaning, prohibited inference,
// authoritative source, or English/French semantic requirements.
function validateStatesAndContent(ctx, findings) {
  for (const c of records(ctx, 'REG-702')) {
    if (c.kind !== 'STATE' && c.kind !== 'CONTENT') continue;
    if (!c.user_facing_meaning) {
      findings.push(makeFinding(Severity.ERROR, 'SEMANTIC_WITHOUT_MEANING', `${c.id}: names no user_facing_meaning`, c.id));
    }
    if (!c.prohibited_inference) {
      findings.push(makeFinding(Severity.ERROR, 'SEMANTIC_WITHOUT_PROHIBITED_INFERENCE', `${c.id}: names no prohibited_inference`, c.id));
    }
    if (!c.source_of_truth) {
      findings.push(makeFinding(Severity.ERROR, 'SEMANTIC_WITHOUT_SOURCE', `${c.id}: names no source_of_truth`, c.id));
    }
    if (!c.english_semantic_requirement) {
      findings.push(makeFinding(Severity.ERROR, 'SEMANTIC_WITHOUT_ENGLISH', `${c.id}: names no english_semantic_requirement`, c.id));
    }
    if (!c.french_semantic_requirement) {
      findings.push(makeFinding(Severity.ERROR, 'SEMANTIC_WITHOUT_FRENCH', `${c.id}: names no french_semantic_requirement`, c.id));
    }
  }
}

// Information-architecture areas without an authoritative source or access
// condition.
function validateInformationArchitecture(ctx, findings) {
  for (const ia of records(ctx, 'REG-702')) {
    if (ia.kind !== 'IA') continue;
    if (!ia.authoritative_source) {
      findings.push(makeFinding(Severity.ERROR, 'IA_WITHOUT_SOURCE', `${ia.id}: information-architecture area names no authoritative_source`, ia.id));
    }
    if (!ia.access_condition) {
      findings.push(makeFinding(Severity.ERROR, 'IA_WITHOUT_ACCESS_CONDITION', `${ia.id}: information-architecture area names no access_condition`, ia.id));
    }
  }
}

// Accessibility obligations without a verification method or requirement.
function validateAccessibility(ctx, findings) {
  for (const a of records(ctx, 'REG-702')) {
    if (a.kind !== 'A11Y') continue;
    if (!a.accessibility_requirement) {
      findings.push(makeFinding(Severity.ERROR, 'A11Y_WITHOUT_REQUIREMENT', `${a.id}: accessibility obligation names no accessibility_requirement`, a.id));
    }
    if (!a.verification_method) {
      findings.push(makeFinding(Severity.ERROR, 'A11Y_WITHOUT_VERIFICATION', `${a.id}: accessibility obligation names no verification_method`, a.id));
    }
  }
}

// Bilingual obligations without both English and French semantic requirements.
function validateBilingual(ctx, findings) {
  for (const b of records(ctx, 'REG-702')) {
    if (b.kind !== 'BIL') continue;
    if (!b.english_semantic_requirement || !b.french_semantic_requirement) {
      findings.push(makeFinding(Severity.ERROR, 'BILINGUAL_WITHOUT_EQUIVALENCE', `${b.id}: bilingual obligation names no English/French semantic-equivalence requirement`, b.id));
    }
  }
}

// Privacy interactions without a privacy posture or prohibited inference.
function validatePrivacy(ctx, findings) {
  for (const p of records(ctx, 'REG-702')) {
    if (p.kind !== 'PRIV') continue;
    if (!p.privacy_posture) {
      findings.push(makeFinding(Severity.ERROR, 'PRIVACY_WITHOUT_POSTURE', `${p.id}: privacy interaction names no privacy_posture`, p.id));
    }
    if (!p.prohibited_inference) {
      findings.push(makeFinding(Severity.ERROR, 'PRIVACY_WITHOUT_PROHIBITED_INFERENCE', `${p.id}: privacy interaction names no prohibited_inference (e.g. access confers no disclosure authority)`, p.id));
    }
  }
}

// Exceptions without expiry or approval; assumptions/risks/tests without owner or
// future gate.
function validateBacklog(ctx, findings) {
  for (const b of records(ctx, 'REG-704')) {
    if (!b.owner) {
      findings.push(makeFinding(Severity.ERROR, 'BACKLOG_WITHOUT_OWNER', `${b.id}: backlog item names no owner`, b.id));
    }
    if (!b.future_blocking_gate) {
      findings.push(makeFinding(Severity.ERROR, 'BACKLOG_WITHOUT_GATE', `${b.id}: backlog item names no future_blocking_gate`, b.id));
    }
    if (b.kind === 'EXC' && !b.expiry && !b.approval_ref) {
      findings.push(makeFinding(Severity.ERROR, 'EXCEPTION_WITHOUT_EXPIRY_OR_APPROVAL', `${b.id}: exception names neither expiry nor approval_ref`, b.id));
    }
  }
}

// Unresolved obligations must not name a completed gate as their future blocker.
function validateGateForwardOnly(ctx, findings) {
  const done = completedGates(ctx);
  const scan = (regId) => {
    for (const r of records(ctx, regId)) {
      const g = r.future_blocking_gate;
      if (g && done.has(g)) {
        findings.push(makeFinding(Severity.ERROR, 'GATE_ALREADY_COMPLETED', `${r.id}: future_blocking_gate ${g} is already dispositioned; unresolved items must name a forward gate`, r.id));
      }
    }
  };
  scan('REG-701');
  scan('REG-702');
  scan('REG-704');
}

// Executable-experience leakage: chapter prose must not embed DDL/IAM/migration/
// key-material or coded interface / design-system implementation.
function validateLeakage(ctx, findings) {
  for (const ch of ctx.chapters) {
    for (const p of LEAKAGE_PATTERNS) {
      if (p.re.test(ch.body)) {
        findings.push(makeFinding(Severity.ERROR, 'EXECUTABLE_LEAKAGE', `${ch.path}: chapter prose matches forbidden executable/coded pattern ${p.code}`, ch.id));
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
  validateNoImplementationAuthorization(ctx, findings);
  validateImplementationStatus(ctx, findings);
  validateActors(ctx, findings);
  validateStages(ctx, findings);
  validateBlueprints(ctx, findings);
  validateStatesAndContent(ctx, findings);
  validateInformationArchitecture(ctx, findings);
  validateAccessibility(ctx, findings);
  validateBilingual(ctx, findings);
  validatePrivacy(ctx, findings);
  validateBacklog(ctx, findings);
  validateGateForwardOnly(ctx, findings);
  validateLeakage(ctx, findings);
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStandalone('Structural, schema & experience conformance', run);
}
