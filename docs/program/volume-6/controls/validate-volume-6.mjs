// Control: structural, schema, protection, and trust conformance for the Volume 6
// corpus.
//
// Validates: YAML parse integrity, JSON Schema conformance of every register,
// identifier uniqueness, chapter header/H1 integrity, and the fail-closed
// protection/trust guards required by the directive: assets without owners or
// classification; trust boundaries without threats; threats without preventive,
// detective, and corrective objectives; authorization controls lacking
// resource-aware inputs; privacy purposes without information-domain mappings and
// disclosure/records authority; obligations without applicability status, owners,
// controls, evidence, or gates; controls without owners, evidence, or gates;
// accessibility obligations without verification; bilingual obligations without
// semantic-equivalence requirements; incident families without evidence
// preservation; exceptions without expiry or approval; validation items without
// owners or future gates; unresolved items pointing to completed gates; records
// authorizing implementation; and executable protection (DDL / IAM / migration /
// key-material) leakage.

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
const PROTECTION_REGISTERS = ['REG-601', 'REG-602', 'REG-603', 'REG-604'];

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
          makeFinding(Severity.ERROR, 'SCHEMA_CONFORMANCE', `${entry.path}: ${e.instancePath || '/'} ${e.message}`, regId)
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

// Implementation-authorization guard (fail closed): no Volume 6 record in any
// register may set authorizes_implementation: true. Package 1 defines protection
// and trust obligations only; construction is authorized only downstream through
// the governed gate sequence.
function validateNoImplementationAuthorization(ctx, findings) {
  for (const regId of Object.keys(REGISTER_SCHEMAS)) {
    for (const r of records(ctx, regId)) {
      if (r.authorizes_implementation === true) {
        findings.push(
          makeFinding(
            Severity.ERROR,
            'IMPLEMENTATION_UNAUTHORIZED',
            `${r.id}: authorizes_implementation must be false (Volume 6 foundation cannot authorize construction)`,
            r.id
          )
        );
      }
    }
  }
}

// Implementation-status guard (fail closed): every protection record must carry an
// implementation_status of NOT_IMPLEMENTED_OR_NOT_PROVEN. No record may claim an
// implemented, compliant, conformant, or independently assured state without
// evidence; the only permitted status in Package 1 is not-implemented/not-proven.
function validateImplementationStatus(ctx, findings) {
  for (const regId of PROTECTION_REGISTERS) {
    for (const r of records(ctx, regId)) {
      if (r.implementation_status !== 'NOT_IMPLEMENTED_OR_NOT_PROVEN') {
        findings.push(
          makeFinding(
            Severity.ERROR,
            'IMPLEMENTATION_STATUS_INVALID',
            `${r.id}: implementation_status must be NOT_IMPLEMENTED_OR_NOT_PROVEN in Package 1`,
            r.id
          )
        );
      }
    }
  }
}

// Assets without owners or classification.
function validateAssetGovernance(ctx, findings) {
  for (const a of records(ctx, 'REG-601')) {
    if (a.kind !== 'ASSET') continue;
    if (!a.authority_owner) {
      findings.push(makeFinding(Severity.ERROR, 'ASSET_WITHOUT_AUTHORITY', `${a.id}: asset names no authority_owner`, a.id));
    }
    if (!a.classification) {
      findings.push(makeFinding(Severity.ERROR, 'ASSET_WITHOUT_CLASSIFICATION', `${a.id}: asset names no classification`, a.id));
    }
  }
}

// Trust boundaries without threats: every TRUST_BOUNDARY must be named by at least
// one THREAT scenario.
function validateBoundaryThreatCoverage(ctx, findings) {
  const boundaries = records(ctx, 'REG-601').filter((r) => r.kind === 'TRUST_BOUNDARY');
  const threatBoundaries = new Set(
    records(ctx, 'REG-601')
      .filter((r) => r.kind === 'THREAT' || r.kind === 'ABUSE_CASE')
      .map((r) => r.trust_boundary)
      .filter(Boolean)
  );
  for (const b of boundaries) {
    if (!threatBoundaries.has(b.id)) {
      findings.push(makeFinding(Severity.ERROR, 'BOUNDARY_WITHOUT_THREAT', `${b.id}: trust boundary is named by no threat or abuse scenario`, b.id));
    }
  }
}

// Threats without preventive, detective, and corrective control objectives, or
// without an affected asset/right and an owner.
function validateThreatObjectives(ctx, findings) {
  for (const t of records(ctx, 'REG-601')) {
    if (t.kind !== 'THREAT') continue;
    if (!t.affected_asset && !t.affected_right) {
      findings.push(makeFinding(Severity.ERROR, 'THREAT_WITHOUT_TARGET', `${t.id}: threat names no affected_asset or affected_right`, t.id));
    }
    if (!t.preventive_objective) {
      findings.push(makeFinding(Severity.ERROR, 'THREAT_WITHOUT_PREVENTIVE', `${t.id}: threat names no preventive_objective`, t.id));
    }
    if (!t.detective_objective) {
      findings.push(makeFinding(Severity.ERROR, 'THREAT_WITHOUT_DETECTIVE', `${t.id}: threat names no detective_objective`, t.id));
    }
    if (!t.corrective_objective) {
      findings.push(makeFinding(Severity.ERROR, 'THREAT_WITHOUT_CORRECTIVE', `${t.id}: threat names no corrective_objective`, t.id));
    }
    if (!t.owner) {
      findings.push(makeFinding(Severity.ERROR, 'THREAT_WITHOUT_OWNER', `${t.id}: threat names no owner`, t.id));
    }
  }
}

function hasInput(inputs, token) {
  return (inputs ?? []).some((i) => String(i).toLowerCase().includes(token));
}

// Authorization control objectives missing resource-aware inputs: an AUTHORIZATION
// control objective must represent resource, organization, jurisdiction,
// assignment, action, lifecycle/state, and sensitivity in its authorization
// inputs. Role alone is insufficient.
function validateAuthorizationInputs(ctx, findings) {
  const required = [
    { token: 'resource', code: 'resource' },
    { token: 'organization', code: 'organization' },
    { token: 'jurisdiction', code: 'jurisdiction' },
    { token: 'assignment', code: 'assignment' },
    { token: 'action', code: 'action' },
    { token: 'lifecycle', code: 'lifecycle/state', alt: 'state' },
    { token: 'sensitiv', code: 'sensitivity' }
  ];
  for (const c of records(ctx, 'REG-602')) {
    if (c.kind !== 'CONTROL_OBJECTIVE' || c.control_family !== 'AUTHORIZATION') continue;
    const inputs = c.authorization_inputs ?? [];
    if (inputs.length === 0) {
      findings.push(makeFinding(Severity.ERROR, 'AUTHZ_CONTROL_MISSING_INPUTS', `${c.id}: authorization control objective names no authorization_inputs`, c.id));
      continue;
    }
    const missing = required
      .filter((r) => !hasInput(inputs, r.token) && !(r.alt && hasInput(inputs, r.alt)))
      .map((r) => r.code);
    if (missing.length > 0) {
      findings.push(makeFinding(Severity.ERROR, 'AUTHZ_CONTROL_MISSING_INPUTS', `${c.id}: authorization control objective omits resource-aware input(s): ${missing.join(', ')}`, c.id));
    }
  }
}

// Privacy purposes without information-domain mappings, disclosure authority, or
// records dependency.
function validatePrivacyPurposes(ctx, findings) {
  for (const p of records(ctx, 'REG-602')) {
    if (p.kind !== 'PROCESSING_PURPOSE') continue;
    if (!(p.information_domains && p.information_domains.length > 0)) {
      findings.push(makeFinding(Severity.ERROR, 'PURPOSE_WITHOUT_DOMAIN', `${p.id}: processing purpose maps to no information domain`, p.id));
    }
    if (!p.disclosure_authority) {
      findings.push(makeFinding(Severity.ERROR, 'PURPOSE_WITHOUT_DISCLOSURE_AUTHORITY', `${p.id}: processing purpose names no disclosure_authority`, p.id));
    }
    if (p.retention_dependency && !p.records_dependency) {
      findings.push(makeFinding(Severity.ERROR, 'RETENTION_WITHOUT_RECORDS_AUTHORITY', `${p.id}: processing purpose names a retention_dependency but no records_dependency (records authority)`, p.id));
    }
  }
}

// Compliance and policy obligations without applicability status, owners,
// controls, evidence, or future gates.
function validateObligations(ctx, findings) {
  for (const o of records(ctx, 'REG-602')) {
    if (o.kind !== 'OBLIGATION' && o.kind !== 'COMPLIANCE_OBLIGATION') continue;
    if (!o.applicability_status) {
      findings.push(makeFinding(Severity.ERROR, 'OBLIGATION_WITHOUT_APPLICABILITY', `${o.id}: obligation names no applicability_status`, o.id));
    }
    if (!o.authority_owner) {
      findings.push(makeFinding(Severity.ERROR, 'OBLIGATION_WITHOUT_OWNER', `${o.id}: obligation names no authority_owner`, o.id));
    }
    if (!o.control_objective_ref) {
      findings.push(makeFinding(Severity.ERROR, 'OBLIGATION_WITHOUT_CONTROL', `${o.id}: obligation names no control_objective_ref`, o.id));
    }
    if (!o.required_evidence) {
      findings.push(makeFinding(Severity.ERROR, 'OBLIGATION_WITHOUT_EVIDENCE', `${o.id}: obligation names no required_evidence`, o.id));
    }
    if (!o.future_blocking_gate) {
      findings.push(makeFinding(Severity.ERROR, 'OBLIGATION_WITHOUT_GATE', `${o.id}: obligation names no future_blocking_gate`, o.id));
    }
  }
}

// Control objectives without owners, evidence, or future gates.
function validateControlObjectives(ctx, findings) {
  for (const c of records(ctx, 'REG-602')) {
    if (c.kind !== 'CONTROL_OBJECTIVE') continue;
    if (!c.owner) {
      findings.push(makeFinding(Severity.ERROR, 'CONTROL_WITHOUT_OWNER', `${c.id}: control objective names no owner`, c.id));
    }
    if (!c.required_evidence) {
      findings.push(makeFinding(Severity.ERROR, 'CONTROL_WITHOUT_EVIDENCE', `${c.id}: control objective names no required_evidence`, c.id));
    }
    if (!c.future_blocking_gate) {
      findings.push(makeFinding(Severity.ERROR, 'CONTROL_WITHOUT_GATE', `${c.id}: control objective names no future_blocking_gate`, c.id));
    }
  }
}

// Accessibility obligations without a verification method.
function validateAccessibility(ctx, findings) {
  for (const a of records(ctx, 'REG-602')) {
    if (a.kind !== 'ACCESSIBILITY_OBLIGATION') continue;
    if (!a.verification_method) {
      findings.push(makeFinding(Severity.ERROR, 'A11Y_WITHOUT_VERIFICATION', `${a.id}: accessibility obligation names no verification_method`, a.id));
    }
  }
}

// Bilingual obligations without an equivalent semantic concept.
function validateBilingual(ctx, findings) {
  for (const b of records(ctx, 'REG-602')) {
    if (b.kind !== 'BILINGUAL_OBLIGATION') continue;
    if (!b.equivalent_concept && !b.semantic_equivalence) {
      findings.push(makeFinding(Severity.ERROR, 'BILINGUAL_WITHOUT_EQUIVALENCE', `${b.id}: bilingual obligation names no equivalent_concept or semantic_equivalence requirement`, b.id));
    }
  }
}

// Incident families without an evidence-preservation posture.
function validateIncidentFamilies(ctx, findings) {
  for (const i of records(ctx, 'REG-602')) {
    if (i.kind !== 'INCIDENT_FAMILY') continue;
    if (!i.evidence_preservation) {
      findings.push(makeFinding(Severity.ERROR, 'INCIDENT_WITHOUT_EVIDENCE', `${i.id}: incident family names no evidence_preservation posture`, i.id));
    }
  }
}

// Assurance requirements without owner, evidence, classification, or future gate.
function validateAssuranceRequirements(ctx, findings) {
  for (const a of records(ctx, 'REG-602')) {
    if (a.kind !== 'ASSURANCE_REQUIREMENT') continue;
    if (!a.control_owner && !a.owner) {
      findings.push(makeFinding(Severity.ERROR, 'ASSURANCE_WITHOUT_OWNER', `${a.id}: assurance requirement names no control_owner`, a.id));
    }
    if (!a.required_evidence) {
      findings.push(makeFinding(Severity.ERROR, 'ASSURANCE_WITHOUT_EVIDENCE', `${a.id}: assurance requirement names no required_evidence`, a.id));
    }
    if (!a.assurance_classification) {
      findings.push(makeFinding(Severity.ERROR, 'ASSURANCE_WITHOUT_CLASSIFICATION', `${a.id}: assurance requirement names no assurance_classification`, a.id));
    }
    if (!a.future_blocking_gate) {
      findings.push(makeFinding(Severity.ERROR, 'ASSURANCE_WITHOUT_GATE', `${a.id}: assurance requirement names no future_blocking_gate`, a.id));
    }
  }
}

// Exceptions without expiry or approval authority; validation items without owners
// or future gates.
function validateBacklogItems(ctx, findings) {
  for (const item of records(ctx, 'REG-604')) {
    if (item.kind === 'EXC') {
      if (!item.exception_authority) {
        findings.push(makeFinding(Severity.ERROR, 'EXCEPTION_WITHOUT_AUTHORITY', `${item.id}: exception names no exception_authority`, item.id));
      }
      if (!item.exception_expiry) {
        findings.push(makeFinding(Severity.ERROR, 'EXCEPTION_WITHOUT_EXPIRY', `${item.id}: exception names no exception_expiry`, item.id));
      }
    }
    if (item.kind === 'TEST') {
      if (!item.owner) {
        findings.push(makeFinding(Severity.ERROR, 'VALIDATION_WITHOUT_OWNER', `${item.id}: validation backlog item names no owner`, item.id));
      }
      if (!item.future_blocking_gate) {
        findings.push(makeFinding(Severity.ERROR, 'VALIDATION_WITHOUT_GATE', `${item.id}: validation backlog item names no future_blocking_gate`, item.id));
      }
    }
  }
}

// Validation-gate correctness (fail closed): no unresolved obligation, control,
// assurance requirement, threat, or backlog item may name a governance gate that
// has already been dispositioned (passed). An obligation blocked by a completed
// gate can never clear.
function validateGateCorrectness(ctx, findings) {
  const done = completedGates(ctx);
  if (done.size === 0) return;
  for (const regId of ['REG-601', 'REG-602', 'REG-604']) {
    for (const r of records(ctx, regId)) {
      const g = r.future_blocking_gate;
      if (g && done.has(g)) {
        findings.push(
          makeFinding(
            Severity.ERROR,
            'GATE_ALREADY_PASSED',
            `${r.id}: future_blocking_gate ${g} has already been dispositioned; reassign to an uncompleted future gate`,
            r.id
          )
        );
      }
    }
  }
}

function validateNoProtectionLeakage(ctx, findings) {
  for (const ch of ctx.chapters) {
    for (const p of LEAKAGE_PATTERNS) {
      if (p.re.test(ch.body)) {
        findings.push(makeFinding(Severity.ERROR, 'PROTECTION_LEAKAGE', `${ch.path}: contains executable protection artifact (${p.code})`, ch.id));
      }
    }
  }
  for (const entry of Object.values(ctx.registers)) {
    for (const p of LEAKAGE_PATTERNS) {
      if (p.re.test(entry.raw)) {
        findings.push(makeFinding(Severity.ERROR, 'PROTECTION_LEAKAGE', `${entry.path}: contains executable protection artifact (${p.code})`, entry.id));
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
  validateAssetGovernance(ctx, findings);
  validateBoundaryThreatCoverage(ctx, findings);
  validateThreatObjectives(ctx, findings);
  validateAuthorizationInputs(ctx, findings);
  validatePrivacyPurposes(ctx, findings);
  validateObligations(ctx, findings);
  validateControlObjectives(ctx, findings);
  validateAccessibility(ctx, findings);
  validateBilingual(ctx, findings);
  validateIncidentFamilies(ctx, findings);
  validateAssuranceRequirements(ctx, findings);
  validateBacklogItems(ctx, findings);
  validateGateCorrectness(ctx, findings);
  validateNoProtectionLeakage(ctx, findings);
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runStandalone('Volume 6 structural, schema, and protection/trust conformance', run);
}
