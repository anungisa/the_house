// Control: structural, schema, and quality/test-governance conformance for the
// Volume 9 corpus.
//
// Validates: YAML parse integrity, JSON Schema conformance of every register,
// identifier uniqueness, chapter header/H1 integrity, and the fail-closed
// quality/test-governance guards required by the directive: quality attributes
// without institutional purpose, authoritative source, applicable test levels,
// required evidence tier, prohibited inference, acceptance authority, or a future
// gate; institutional invariants without a negative-expectation requirement;
// test objects without an object type or authoritative source; coverage records
// without a dimension, basis, or measurement posture; test levels without an
// object under test, permitted evidence, prohibited inference, environment
// dependency, independence requirement, or future execution gate; evidence tiers
// without a rank or substitution prohibition; test requirements without a source
// requirement, object under test, governed invariant, expected and negative
// outcome, evidence tier, independence requirement, or future gate; test
// scenarios without actor, tenant, jurisdiction, resource, or lifecycle-state
// context; test cases without preconditions, a stimulus, or an oracle reference;
// oracles without an authoritative basis, derivation, or prohibited basis;
// environment classes without a data classification, production-data prohibition,
// or provisioning gate; test-data requirements naming real production data as
// authorized; evidence requirements without provenance, configuration,
// environment, version, or reproducibility; result models without an
// inconclusive-distinct-from-pass posture; unresolved invariant/oracle
// references; backlog items without owners or future gates; unresolved items
// pointing to completed gates; records authorizing implementation; records not in
// a not-implemented posture; and executable-test/coded-artifact leakage.

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
const FOUNDATION_REGISTERS = ['REG-901', 'REG-902', 'REG-903', 'REG-904'];

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

// Implementation-authorization guard (fail closed): no Volume 9 record in any
// register may set authorizes_implementation: true.
function validateNoImplementationAuthorization(ctx, findings) {
  for (const regId of Object.keys(REGISTER_SCHEMAS)) {
    for (const r of records(ctx, regId)) {
      if (r.authorizes_implementation === true) {
        findings.push(makeFinding(Severity.ERROR, 'IMPLEMENTATION_UNAUTHORIZED', `${r.id}: authorizes_implementation must be false (Volume 9 quality/test foundation cannot authorize construction or execution)`, r.id));
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

// Quality attributes without institutional purpose, authoritative source,
// applicable test levels, required evidence tier, prohibited inference,
// acceptance authority, or a future gate.
function validateQualityAttributes(ctx, findings) {
  for (const q of records(ctx, 'REG-901')) {
    if (q.kind !== 'QUALITY_ATTRIBUTE') continue;
    if (!q.institutional_purpose) findings.push(makeFinding(Severity.ERROR, 'QUALITY_WITHOUT_PURPOSE', `${q.id}: quality attribute names no institutional_purpose`, q.id));
    if (!q.authoritative_source) findings.push(makeFinding(Severity.ERROR, 'QUALITY_WITHOUT_SOURCE', `${q.id}: quality attribute names no authoritative_source`, q.id));
    if (!(q.applicable_test_levels && q.applicable_test_levels.length > 0)) findings.push(makeFinding(Severity.ERROR, 'QUALITY_WITHOUT_TEST_LEVELS', `${q.id}: quality attribute names no applicable_test_levels`, q.id));
    if (!q.required_evidence_tier) findings.push(makeFinding(Severity.ERROR, 'QUALITY_WITHOUT_EVIDENCE_TIER', `${q.id}: quality attribute names no required_evidence_tier`, q.id));
    if (!q.prohibited_inference) findings.push(makeFinding(Severity.ERROR, 'QUALITY_WITHOUT_PROHIBITED_INFERENCE', `${q.id}: quality attribute names no prohibited_inference`, q.id));
    if (!q.acceptance_authority) findings.push(makeFinding(Severity.ERROR, 'QUALITY_WITHOUT_ACCEPTANCE_AUTHORITY', `${q.id}: quality attribute names no acceptance_authority`, q.id));
    if (!q.future_gate) findings.push(makeFinding(Severity.ERROR, 'QUALITY_WITHOUT_FUTURE_GATE', `${q.id}: quality attribute names no future_gate`, q.id));
  }
}

// Institutional invariants without institutional purpose, authoritative source,
// prohibited inference, a required negative expectation, or a future gate.
function validateInstitutionalInvariants(ctx, findings) {
  for (const v of records(ctx, 'REG-901')) {
    if (v.kind !== 'INSTITUTIONAL_INVARIANT') continue;
    if (!v.institutional_purpose) findings.push(makeFinding(Severity.ERROR, 'INVARIANT_WITHOUT_PURPOSE', `${v.id}: institutional invariant names no institutional_purpose`, v.id));
    if (!v.authoritative_source) findings.push(makeFinding(Severity.ERROR, 'INVARIANT_WITHOUT_SOURCE', `${v.id}: institutional invariant names no authoritative_source`, v.id));
    if (!v.prohibited_inference) findings.push(makeFinding(Severity.ERROR, 'INVARIANT_WITHOUT_PROHIBITED_INFERENCE', `${v.id}: institutional invariant names no prohibited_inference`, v.id));
    if (v.negative_expectation_required !== true) findings.push(makeFinding(Severity.ERROR, 'INVARIANT_WITHOUT_NEGATIVE_EXPECTATION', `${v.id}: institutional invariant must require a negative expectation (negative_expectation_required: true)`, v.id));
    if (!v.future_gate) findings.push(makeFinding(Severity.ERROR, 'INVARIANT_WITHOUT_FUTURE_GATE', `${v.id}: institutional invariant names no future_gate`, v.id));
  }
}

// Test objects without an object type or authoritative source.
function validateTestObjects(ctx, findings) {
  for (const o of records(ctx, 'REG-901')) {
    if (o.kind !== 'TEST_OBJECT') continue;
    if (!o.object_type) findings.push(makeFinding(Severity.ERROR, 'OBJECT_WITHOUT_TYPE', `${o.id}: test object names no object_type`, o.id));
    if (!o.authoritative_source) findings.push(makeFinding(Severity.ERROR, 'OBJECT_WITHOUT_SOURCE', `${o.id}: test object names no authoritative_source`, o.id));
  }
}

// Coverage records without a dimension, basis, or measurement posture.
function validateCoverageRecords(ctx, findings) {
  for (const c of records(ctx, 'REG-901')) {
    if (c.kind !== 'COVERAGE_RECORD') continue;
    if (!c.coverage_dimension) findings.push(makeFinding(Severity.ERROR, 'COVERAGE_WITHOUT_DIMENSION', `${c.id}: coverage record names no coverage_dimension`, c.id));
    if (!c.coverage_basis) findings.push(makeFinding(Severity.ERROR, 'COVERAGE_WITHOUT_BASIS', `${c.id}: coverage record names no coverage_basis`, c.id));
    if (!c.measurement_posture) findings.push(makeFinding(Severity.ERROR, 'COVERAGE_WITHOUT_MEASUREMENT', `${c.id}: coverage record names no measurement_posture`, c.id));
  }
}

// Test levels without an object under test, permitted evidence, prohibited
// inference, environment dependency, independence requirement, or a future
// execution gate.
function validateTestLevels(ctx, findings) {
  for (const l of records(ctx, 'REG-901')) {
    if (l.kind !== 'TEST_LEVEL') continue;
    if (!l.test_level) findings.push(makeFinding(Severity.ERROR, 'LEVEL_WITHOUT_LEVEL', `${l.id}: test level names no test_level`, l.id));
    if (!l.object_under_test) findings.push(makeFinding(Severity.ERROR, 'LEVEL_WITHOUT_OBJECT', `${l.id}: test level names no object_under_test`, l.id));
    if (!l.permitted_evidence) findings.push(makeFinding(Severity.ERROR, 'LEVEL_WITHOUT_PERMITTED_EVIDENCE', `${l.id}: test level names no permitted_evidence`, l.id));
    if (!l.prohibited_inference) findings.push(makeFinding(Severity.ERROR, 'LEVEL_WITHOUT_PROHIBITED_INFERENCE', `${l.id}: test level names no prohibited_inference`, l.id));
    if (!l.environment_dependency) findings.push(makeFinding(Severity.ERROR, 'LEVEL_WITHOUT_ENVIRONMENT', `${l.id}: test level names no environment_dependency`, l.id));
    if (!l.independence_requirement) findings.push(makeFinding(Severity.ERROR, 'LEVEL_WITHOUT_INDEPENDENCE', `${l.id}: test level names no independence_requirement`, l.id));
    if (!l.future_gate) findings.push(makeFinding(Severity.ERROR, 'LEVEL_WITHOUT_FUTURE_GATE', `${l.id}: test level names no future_gate`, l.id));
  }
}

// Evidence tiers without a rank or a substitution prohibition.
function validateEvidenceTiers(ctx, findings) {
  for (const e of records(ctx, 'REG-901')) {
    if (e.kind !== 'EVIDENCE_TIER') continue;
    if (!e.evidence_tier) findings.push(makeFinding(Severity.ERROR, 'TIER_WITHOUT_TIER', `${e.id}: evidence tier names no evidence_tier`, e.id));
    if (typeof e.tier_rank !== 'number') findings.push(makeFinding(Severity.ERROR, 'TIER_WITHOUT_RANK', `${e.id}: evidence tier names no numeric tier_rank`, e.id));
    if (!e.substitution_prohibition) findings.push(makeFinding(Severity.ERROR, 'TIER_WITHOUT_SUBSTITUTION_PROHIBITION', `${e.id}: evidence tier names no substitution_prohibition`, e.id));
  }
}

// Independence levels without a named level.
function validateIndependenceLevels(ctx, findings) {
  for (const i of records(ctx, 'REG-901')) {
    if (i.kind !== 'INDEPENDENCE_LEVEL') continue;
    if (!i.independence_level) findings.push(makeFinding(Severity.ERROR, 'INDEPENDENCE_WITHOUT_LEVEL', `${i.id}: independence level names no independence_level`, i.id));
  }
}

// Governance controls without a purpose or a determinism posture.
function validateControls(ctx, findings) {
  for (const c of records(ctx, 'REG-901')) {
    if (c.kind !== 'CONTROL') continue;
    if (!c.control_purpose) findings.push(makeFinding(Severity.ERROR, 'CONTROL_WITHOUT_PURPOSE', `${c.id}: control names no control_purpose`, c.id));
    if (!c.control_determinism) findings.push(makeFinding(Severity.ERROR, 'CONTROL_WITHOUT_DETERMINISM', `${c.id}: control names no control_determinism`, c.id));
  }
}

// Test requirements without a source requirement, object under test, governed
// invariant, applicable test level, expected and negative outcome, evidence tier,
// independence requirement, or future gate.
function validateTestRequirements(ctx, findings) {
  for (const t of records(ctx, 'REG-902')) {
    if (t.kind !== 'TEST_REQUIREMENT') continue;
    if (!t.source_requirement) findings.push(makeFinding(Severity.ERROR, 'TESTREQ_WITHOUT_SOURCE', `${t.id}: test requirement names no source_requirement`, t.id));
    if (!t.object_under_test) findings.push(makeFinding(Severity.ERROR, 'TESTREQ_WITHOUT_OBJECT', `${t.id}: test requirement names no object_under_test`, t.id));
    if (!t.institutional_invariant_ref) findings.push(makeFinding(Severity.ERROR, 'TESTREQ_WITHOUT_INVARIANT', `${t.id}: test requirement names no institutional_invariant_ref`, t.id));
    if (!t.applicable_test_level) findings.push(makeFinding(Severity.ERROR, 'TESTREQ_WITHOUT_LEVEL', `${t.id}: test requirement names no applicable_test_level`, t.id));
    if (!t.expected_outcome) findings.push(makeFinding(Severity.ERROR, 'TESTREQ_WITHOUT_EXPECTED', `${t.id}: test requirement names no expected_outcome`, t.id));
    if (!t.negative_outcome) findings.push(makeFinding(Severity.ERROR, 'TESTREQ_WITHOUT_NEGATIVE', `${t.id}: test requirement names no negative_outcome`, t.id));
    if (!t.evidence_tier_required) findings.push(makeFinding(Severity.ERROR, 'TESTREQ_WITHOUT_EVIDENCE_TIER', `${t.id}: test requirement names no evidence_tier_required`, t.id));
    if (!t.independence_requirement) findings.push(makeFinding(Severity.ERROR, 'TESTREQ_WITHOUT_INDEPENDENCE', `${t.id}: test requirement names no independence_requirement`, t.id));
    if (!t.future_gate) findings.push(makeFinding(Severity.ERROR, 'TESTREQ_WITHOUT_FUTURE_GATE', `${t.id}: test requirement names no future_gate`, t.id));
  }
}

// Test scenarios without actor, tenant, jurisdiction, resource, or lifecycle-state
// context, or a scenario disposition.
function validateTestScenarios(ctx, findings) {
  for (const s of records(ctx, 'REG-902')) {
    if (s.kind !== 'TEST_SCENARIO') continue;
    if (!s.actor_or_service) findings.push(makeFinding(Severity.ERROR, 'SCENARIO_WITHOUT_ACTOR', `${s.id}: test scenario names no actor_or_service`, s.id));
    if (!s.tenant_context) findings.push(makeFinding(Severity.ERROR, 'SCENARIO_WITHOUT_TENANT', `${s.id}: test scenario names no tenant_context`, s.id));
    if (!s.jurisdiction_context) findings.push(makeFinding(Severity.ERROR, 'SCENARIO_WITHOUT_JURISDICTION', `${s.id}: test scenario names no jurisdiction_context`, s.id));
    if (!s.resource_context) findings.push(makeFinding(Severity.ERROR, 'SCENARIO_WITHOUT_RESOURCE', `${s.id}: test scenario names no resource_context`, s.id));
    if (!s.lifecycle_state_context) findings.push(makeFinding(Severity.ERROR, 'SCENARIO_WITHOUT_STATE', `${s.id}: test scenario names no lifecycle_state_context`, s.id));
    if (!s.scenario_disposition) findings.push(makeFinding(Severity.ERROR, 'SCENARIO_WITHOUT_DISPOSITION', `${s.id}: test scenario names no scenario_disposition`, s.id));
  }
}

// Test cases without preconditions, a stimulus, or an oracle reference.
function validateTestCases(ctx, findings) {
  for (const c of records(ctx, 'REG-902')) {
    if (c.kind !== 'TEST_CASE') continue;
    if (!(c.preconditions && c.preconditions.length > 0)) findings.push(makeFinding(Severity.ERROR, 'CASE_WITHOUT_PRECONDITIONS', `${c.id}: test case names no preconditions`, c.id));
    if (!c.action_or_stimulus) findings.push(makeFinding(Severity.ERROR, 'CASE_WITHOUT_STIMULUS', `${c.id}: test case names no action_or_stimulus`, c.id));
    if (!c.expected_result_oracle_ref) findings.push(makeFinding(Severity.ERROR, 'CASE_WITHOUT_ORACLE', `${c.id}: test case names no expected_result_oracle_ref`, c.id));
  }
}

// Oracles without an authoritative basis, a derivation, or a prohibited basis.
function validateTestOracles(ctx, findings) {
  for (const o of records(ctx, 'REG-902')) {
    if (o.kind !== 'TEST_ORACLE') continue;
    if (!o.authoritative_basis) findings.push(makeFinding(Severity.ERROR, 'ORACLE_WITHOUT_BASIS', `${o.id}: oracle names no authoritative_basis`, o.id));
    if (!o.derived_from) findings.push(makeFinding(Severity.ERROR, 'ORACLE_WITHOUT_DERIVATION', `${o.id}: oracle names no derived_from`, o.id));
    if (!o.prohibited_basis) findings.push(makeFinding(Severity.ERROR, 'ORACLE_WITHOUT_PROHIBITED_BASIS', `${o.id}: oracle names no prohibited_basis`, o.id));
  }
}

// Environment classes without an environment class, permitted families, data
// classification, a production-data prohibition, or a provisioning gate.
function validateTestEnvironments(ctx, findings) {
  for (const e of records(ctx, 'REG-902')) {
    if (e.kind !== 'TEST_ENVIRONMENT_CLASS') continue;
    if (!e.environment_class) findings.push(makeFinding(Severity.ERROR, 'ENV_WITHOUT_CLASS', `${e.id}: environment class names no environment_class`, e.id));
    if (!(e.permitted_test_families && e.permitted_test_families.length > 0)) findings.push(makeFinding(Severity.ERROR, 'ENV_WITHOUT_FAMILIES', `${e.id}: environment class names no permitted_test_families`, e.id));
    if (!e.data_classification) findings.push(makeFinding(Severity.ERROR, 'ENV_WITHOUT_DATA_CLASSIFICATION', `${e.id}: environment class names no data_classification`, e.id));
    if (!e.production_data_prohibition) findings.push(makeFinding(Severity.ERROR, 'ENV_WITHOUT_PRODUCTION_DATA_PROHIBITION', `${e.id}: environment class names no production_data_prohibition`, e.id));
    if (!e.provisioning_gate) findings.push(makeFinding(Severity.ERROR, 'ENV_WITHOUT_PROVISIONING_GATE', `${e.id}: environment class names no provisioning_gate`, e.id));
  }
}

// Test-data requirements without a data category, classification, minimization
// posture, or a production-data prohibition.
function validateTestDataRequirements(ctx, findings) {
  for (const d of records(ctx, 'REG-902')) {
    if (d.kind !== 'TEST_DATA_REQUIREMENT') continue;
    if (!d.data_category) findings.push(makeFinding(Severity.ERROR, 'DATASET_WITHOUT_CATEGORY', `${d.id}: test-data requirement names no data_category`, d.id));
    if (!d.data_classification) findings.push(makeFinding(Severity.ERROR, 'DATASET_WITHOUT_CLASSIFICATION', `${d.id}: test-data requirement names no data_classification`, d.id));
    if (!d.minimization_posture) findings.push(makeFinding(Severity.ERROR, 'DATASET_WITHOUT_MINIMIZATION', `${d.id}: test-data requirement names no minimization_posture`, d.id));
    if (!d.production_data_prohibition) findings.push(makeFinding(Severity.ERROR, 'DATASET_WITHOUT_PRODUCTION_DATA_PROHIBITION', `${d.id}: test-data requirement names no production_data_prohibition`, d.id));
  }
}

// Production-data prohibition (fail closed): Package 1 authorizes no test data, so
// no test-data requirement or environment class may declare real production
// personal, financial, or restricted-evidence data. Real production data requires
// a separate, later, purpose-limited authorization that Package 1 does not grant.
function validateProductionDataProhibition(ctx, findings) {
  const REAL = new Set(['REAL_PERSONAL_INFORMATION', 'REAL_FINANCIAL', 'REAL_RESTRICTED_EVIDENCE']);
  for (const r of records(ctx, 'REG-902')) {
    if (r.kind !== 'TEST_DATA_REQUIREMENT' && r.kind !== 'TEST_ENVIRONMENT_CLASS') continue;
    if (REAL.has(r.data_classification)) {
      findings.push(makeFinding(Severity.ERROR, 'PRODUCTION_DATA_NOT_AUTHORIZED', `${r.id}: real production data (${r.data_classification}) is not authorized by Package 1`, r.id));
    }
  }
}

// Evidence requirements without provenance, configuration, environment, version,
// or reproducibility.
function validateTestEvidenceRequirements(ctx, findings) {
  for (const e of records(ctx, 'REG-902')) {
    if (e.kind !== 'TEST_EVIDENCE_REQUIREMENT') continue;
    if (!e.provenance_requirement) findings.push(makeFinding(Severity.ERROR, 'EVID_WITHOUT_PROVENANCE', `${e.id}: evidence requirement names no provenance_requirement`, e.id));
    if (!e.configuration_requirement) findings.push(makeFinding(Severity.ERROR, 'EVID_WITHOUT_CONFIGURATION', `${e.id}: evidence requirement names no configuration_requirement`, e.id));
    if (!e.environment_requirement) findings.push(makeFinding(Severity.ERROR, 'EVID_WITHOUT_ENVIRONMENT', `${e.id}: evidence requirement names no environment_requirement`, e.id));
    if (!e.version_requirement) findings.push(makeFinding(Severity.ERROR, 'EVID_WITHOUT_VERSION', `${e.id}: evidence requirement names no version_requirement`, e.id));
    if (!e.reproducibility_requirement) findings.push(makeFinding(Severity.ERROR, 'EVID_WITHOUT_REPRODUCIBILITY', `${e.id}: evidence requirement names no reproducibility_requirement`, e.id));
  }
}

// Result models without a set of disposition values, an inconclusive-distinct-from-
// pass posture, or an acceptance authority.
function validateTestResultModels(ctx, findings) {
  for (const r of records(ctx, 'REG-902')) {
    if (r.kind !== 'TEST_RESULT_MODEL') continue;
    if (!(r.disposition_values && r.disposition_values.length > 0)) findings.push(makeFinding(Severity.ERROR, 'RESULT_WITHOUT_DISPOSITIONS', `${r.id}: result model names no disposition_values`, r.id));
    if (r.inconclusive_distinct_from_pass !== true) findings.push(makeFinding(Severity.ERROR, 'RESULT_WITHOUT_INCONCLUSIVE_DISTINCTION', `${r.id}: result model must hold inconclusive_distinct_from_pass: true`, r.id));
    if (!r.acceptance_authority) findings.push(makeFinding(Severity.ERROR, 'RESULT_WITHOUT_ACCEPTANCE_AUTHORITY', `${r.id}: result model names no acceptance_authority`, r.id));
  }
}

// Traceability (fail closed): every test requirement must name a governed
// institutional invariant that exists in REG-901, and every test case must name an
// oracle that exists in REG-902. Unknown references block.
function validateModelTraceability(ctx, findings) {
  const invariants = new Set(records(ctx, 'REG-901').filter((r) => r.kind === 'INSTITUTIONAL_INVARIANT').map((r) => r.id));
  const oracles = new Set(records(ctx, 'REG-902').filter((r) => r.kind === 'TEST_ORACLE').map((r) => r.id));
  for (const t of records(ctx, 'REG-902')) {
    if (t.kind === 'TEST_REQUIREMENT' && t.institutional_invariant_ref && !invariants.has(t.institutional_invariant_ref)) {
      findings.push(makeFinding(Severity.ERROR, 'TESTREQ_INVARIANT_UNRESOLVED', `${t.id}: institutional_invariant_ref "${t.institutional_invariant_ref}" resolves to no INSTITUTIONAL_INVARIANT`, t.id));
    }
    if (t.kind === 'TEST_CASE' && t.expected_result_oracle_ref && !oracles.has(t.expected_result_oracle_ref)) {
      findings.push(makeFinding(Severity.ERROR, 'CASE_ORACLE_UNRESOLVED', `${t.id}: expected_result_oracle_ref "${t.expected_result_oracle_ref}" resolves to no TEST_ORACLE`, t.id));
    }
  }
}

// Package 2 coverage records (fail closed): affiliation test domains, actor/
// authority matrices, and lifecycle/contract/data-integrity/migration/House-P0
// coverage records are modelled as coverage-shaped quality records. Each must name
// a coverage dimension, a coverage basis, a measurement posture, an authoritative
// source, and a forward execution gate. They confer no execution and no result.
const AFFILIATION_COVERAGE_KINDS = new Set([
  'AFFILIATION_TEST_DOMAIN',
  'ACTOR_AUTHORITY_MATRIX',
  'LIFECYCLE_COVERAGE',
  'CONTRACT_COVERAGE',
  'DATA_INTEGRITY_COVERAGE',
  'MIGRATION_COVERAGE',
  'HOUSE_P0_TEST_COVERAGE'
]);
function validateAffiliationCoverage(ctx, findings) {
  for (const c of records(ctx, 'REG-901')) {
    if (!AFFILIATION_COVERAGE_KINDS.has(c.kind)) continue;
    if (!c.coverage_dimension) findings.push(makeFinding(Severity.ERROR, 'AFFIL_COVERAGE_WITHOUT_DIMENSION', `${c.id}: ${c.kind} names no coverage_dimension`, c.id));
    if (!c.coverage_basis) findings.push(makeFinding(Severity.ERROR, 'AFFIL_COVERAGE_WITHOUT_BASIS', `${c.id}: ${c.kind} names no coverage_basis`, c.id));
    if (!c.measurement_posture) findings.push(makeFinding(Severity.ERROR, 'AFFIL_COVERAGE_WITHOUT_MEASUREMENT', `${c.id}: ${c.kind} names no measurement_posture`, c.id));
    if (!c.authoritative_source) findings.push(makeFinding(Severity.ERROR, 'AFFIL_COVERAGE_WITHOUT_SOURCE', `${c.id}: ${c.kind} names no authoritative_source`, c.id));
    if (!c.future_gate) findings.push(makeFinding(Severity.ERROR, 'AFFIL_COVERAGE_WITHOUT_FUTURE_GATE', `${c.id}: ${c.kind} names no future_gate`, c.id));
  }
}

// Package 2 test-model records (fail closed): the affiliation functional, workflow,
// contract, event, webhook, provider, data-quality, database-behaviour, and
// migration requirement kinds are requirement-shaped and must carry the same
// governed-authority, negative-outcome, evidence, independence, and forward-gate
// obligations as a base TEST_REQUIREMENT, and must trace to a governed
// institutional invariant in REG-901. The negative, denial, conflict, stale-state,
// degraded, interruption, duplicate, replay, and recovery scenario kinds are
// scenario-shaped and must carry full actor/tenant/jurisdiction/resource/state
// context, a disposition, an evidence tier, and a governed oracle that resolves in
// REG-902. Unknown references block.
const AFFILIATION_REQUIREMENT_KINDS = new Set([
  'FUNCTIONAL_TEST_REQUIREMENT',
  'WORKFLOW_TEST_REQUIREMENT',
  'CONTRACT_TEST_REQUIREMENT',
  'EVENT_TEST_REQUIREMENT',
  'WEBHOOK_TEST_REQUIREMENT',
  'PROVIDER_TEST_REQUIREMENT',
  'DATA_QUALITY_TEST_REQUIREMENT',
  'DATABASE_BEHAVIOUR_TEST_REQUIREMENT',
  'MIGRATION_TEST_REQUIREMENT'
]);
const AFFILIATION_SCENARIO_KINDS = new Set([
  'NEGATIVE_TEST_SCENARIO',
  'DENIAL_TEST_SCENARIO',
  'CONFLICT_TEST_SCENARIO',
  'STALE_STATE_TEST_SCENARIO',
  'DEGRADED_TEST_SCENARIO',
  'INTERRUPTION_TEST_SCENARIO',
  'DUPLICATE_TEST_SCENARIO',
  'REPLAY_TEST_SCENARIO',
  'RECOVERY_TEST_SCENARIO'
]);
function validateAffiliationTestModel(ctx, findings) {
  const invariants = new Set(records(ctx, 'REG-901').filter((r) => r.kind === 'INSTITUTIONAL_INVARIANT').map((r) => r.id));
  const oracles = new Set(records(ctx, 'REG-902').filter((r) => r.kind === 'TEST_ORACLE').map((r) => r.id));
  for (const t of records(ctx, 'REG-902')) {
    if (AFFILIATION_REQUIREMENT_KINDS.has(t.kind)) {
      if (!t.source_requirement) findings.push(makeFinding(Severity.ERROR, 'AFFIL_REQ_WITHOUT_SOURCE', `${t.id}: ${t.kind} names no source_requirement`, t.id));
      if (!t.object_under_test) findings.push(makeFinding(Severity.ERROR, 'AFFIL_REQ_WITHOUT_OBJECT', `${t.id}: ${t.kind} names no object_under_test`, t.id));
      if (!t.institutional_invariant_ref) findings.push(makeFinding(Severity.ERROR, 'AFFIL_REQ_WITHOUT_INVARIANT', `${t.id}: ${t.kind} names no institutional_invariant_ref`, t.id));
      else if (!invariants.has(t.institutional_invariant_ref)) findings.push(makeFinding(Severity.ERROR, 'AFFIL_REQ_INVARIANT_UNRESOLVED', `${t.id}: institutional_invariant_ref "${t.institutional_invariant_ref}" resolves to no INSTITUTIONAL_INVARIANT`, t.id));
      if (!t.applicable_test_level) findings.push(makeFinding(Severity.ERROR, 'AFFIL_REQ_WITHOUT_LEVEL', `${t.id}: ${t.kind} names no applicable_test_level`, t.id));
      if (!t.expected_outcome) findings.push(makeFinding(Severity.ERROR, 'AFFIL_REQ_WITHOUT_EXPECTED', `${t.id}: ${t.kind} names no expected_outcome`, t.id));
      if (!t.negative_outcome) findings.push(makeFinding(Severity.ERROR, 'AFFIL_REQ_WITHOUT_NEGATIVE', `${t.id}: ${t.kind} names no negative_outcome`, t.id));
      if (!t.evidence_tier_required) findings.push(makeFinding(Severity.ERROR, 'AFFIL_REQ_WITHOUT_EVIDENCE_TIER', `${t.id}: ${t.kind} names no evidence_tier_required`, t.id));
      if (!t.independence_requirement) findings.push(makeFinding(Severity.ERROR, 'AFFIL_REQ_WITHOUT_INDEPENDENCE', `${t.id}: ${t.kind} names no independence_requirement`, t.id));
      if (!t.future_gate) findings.push(makeFinding(Severity.ERROR, 'AFFIL_REQ_WITHOUT_FUTURE_GATE', `${t.id}: ${t.kind} names no future_gate`, t.id));
    } else if (AFFILIATION_SCENARIO_KINDS.has(t.kind)) {
      if (!t.actor_or_service) findings.push(makeFinding(Severity.ERROR, 'AFFIL_SCENARIO_WITHOUT_ACTOR', `${t.id}: ${t.kind} names no actor_or_service`, t.id));
      if (!t.tenant_context) findings.push(makeFinding(Severity.ERROR, 'AFFIL_SCENARIO_WITHOUT_TENANT', `${t.id}: ${t.kind} names no tenant_context`, t.id));
      if (!t.jurisdiction_context) findings.push(makeFinding(Severity.ERROR, 'AFFIL_SCENARIO_WITHOUT_JURISDICTION', `${t.id}: ${t.kind} names no jurisdiction_context`, t.id));
      if (!t.resource_context) findings.push(makeFinding(Severity.ERROR, 'AFFIL_SCENARIO_WITHOUT_RESOURCE', `${t.id}: ${t.kind} names no resource_context`, t.id));
      if (!t.lifecycle_state_context) findings.push(makeFinding(Severity.ERROR, 'AFFIL_SCENARIO_WITHOUT_STATE', `${t.id}: ${t.kind} names no lifecycle_state_context`, t.id));
      if (!t.scenario_disposition) findings.push(makeFinding(Severity.ERROR, 'AFFIL_SCENARIO_WITHOUT_DISPOSITION', `${t.id}: ${t.kind} names no scenario_disposition`, t.id));
      if (!t.evidence_tier_required) findings.push(makeFinding(Severity.ERROR, 'AFFIL_SCENARIO_WITHOUT_EVIDENCE_TIER', `${t.id}: ${t.kind} names no evidence_tier_required`, t.id));
      if (!t.expected_result_oracle_ref) findings.push(makeFinding(Severity.ERROR, 'AFFIL_SCENARIO_WITHOUT_ORACLE', `${t.id}: ${t.kind} names no expected_result_oracle_ref`, t.id));
      else if (!oracles.has(t.expected_result_oracle_ref)) findings.push(makeFinding(Severity.ERROR, 'AFFIL_SCENARIO_ORACLE_UNRESOLVED', `${t.id}: expected_result_oracle_ref "${t.expected_result_oracle_ref}" resolves to no TEST_ORACLE`, t.id));
    }
  }
}

// Backlog: items without owners or future gates; exceptions and waivers without an
// expiry or approval; defect-family records without a defect state.
function validateBacklog(ctx, findings) {
  for (const b of records(ctx, 'REG-904')) {
    if (!b.owner) findings.push(makeFinding(Severity.ERROR, 'BACKLOG_WITHOUT_OWNER', `${b.id}: backlog item names no owner`, b.id));
    if (!b.future_blocking_gate) findings.push(makeFinding(Severity.ERROR, 'BACKLOG_WITHOUT_GATE', `${b.id}: backlog item names no future_blocking_gate`, b.id));
    if ((b.kind === 'EXC' || b.kind === 'WAIVER') && !b.expiry && !b.approval_ref) {
      findings.push(makeFinding(Severity.ERROR, 'EXCEPTION_WITHOUT_EXPIRY_OR_APPROVAL', `${b.id}: exception/waiver names neither expiry nor approval_ref`, b.id));
    }
    if (['DEFECT', 'WAIVER', 'REMEDIATION', 'RETEST', 'REGRESSION'].includes(b.kind) && !b.defect_state) {
      findings.push(makeFinding(Severity.ERROR, 'DEFECT_WITHOUT_STATE', `${b.id}: ${b.kind.toLowerCase()} names no defect_state`, b.id));
    }
    if (b.kind === 'DEFECT' && !b.retest_requirement) {
      findings.push(makeFinding(Severity.ERROR, 'DEFECT_WITHOUT_RETEST', `${b.id}: defect names no retest_requirement`, b.id));
    }
  }
}

// Unresolved obligations must not name a completed gate as their future blocker.
function validateGateForwardOnly(ctx, findings) {
  const done = completedGates(ctx);
  const scan = (regId) => {
    for (const r of records(ctx, regId)) {
      const g = r.future_blocking_gate ?? r.future_gate ?? r.provisioning_gate;
      if (g && done.has(g)) {
        findings.push(makeFinding(Severity.ERROR, 'GATE_ALREADY_COMPLETED', `${r.id}: forward gate ${g} is already dispositioned; unresolved items must name a forward gate`, r.id));
      }
    }
  };
  scan('REG-901');
  scan('REG-902');
  scan('REG-904');
}

// Executable-test/coded leakage: chapter prose must not embed executable test
// code, DDL/IAM/migration/key-material, or coded interface specifications.
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
  validateQualityAttributes(ctx, findings);
  validateInstitutionalInvariants(ctx, findings);
  validateTestObjects(ctx, findings);
  validateCoverageRecords(ctx, findings);
  validateTestLevels(ctx, findings);
  validateEvidenceTiers(ctx, findings);
  validateIndependenceLevels(ctx, findings);
  validateControls(ctx, findings);
  validateTestRequirements(ctx, findings);
  validateTestScenarios(ctx, findings);
  validateTestCases(ctx, findings);
  validateTestOracles(ctx, findings);
  validateTestEnvironments(ctx, findings);
  validateTestDataRequirements(ctx, findings);
  validateProductionDataProhibition(ctx, findings);
  validateTestEvidenceRequirements(ctx, findings);
  validateTestResultModels(ctx, findings);
  validateModelTraceability(ctx, findings);
  validateAffiliationCoverage(ctx, findings);
  validateAffiliationTestModel(ctx, findings);
  validateBacklog(ctx, findings);
  validateGateForwardOnly(ctx, findings);
  validateLeakage(ctx, findings);
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStandalone('Structural, schema & quality/test-governance conformance', run);
}
