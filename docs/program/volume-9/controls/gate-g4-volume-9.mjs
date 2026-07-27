// Control: Gate V9-G4 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the thirty-eight Gate V9-G4 conditions from the Volume 9 Package 4
// directive against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-905 approval carrying GATE-V9-G4 and the disposition
// QUALITY_AND_MASTER_TEST_DEFINITION_COMPLETE. Gate V9-G4 also closes Volume 9.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, summarize, runStandalone, completedGates } from './lib.mjs';
import { run as runStructural } from './validate-volume-9.mjs';
import { isPlaceholder } from './provenance-integrity-volume-9.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}
function byKinds(ctx, regId, kinds) {
  const set = new Set(kinds);
  return records(ctx, regId).filter((r) => set.has(r.kind));
}
function hasChapter(ctx, id) {
  return ctx.chapters.some((c) => c.fileId === id);
}
function bodyMentions(ctx, id, needle) {
  const ch = ctx.chapters.find((c) => c.fileId === id);
  return ch ? ch.body.toLowerCase().includes(needle.toLowerCase()) : false;
}
function allMention(ctx, id, needles) {
  return needles.every((n) => bodyMentions(ctx, id, n));
}

const MASTER_COVERAGE_KINDS = [
  'MASTER_TEST_BASELINE',
  'MASTER_TEST_CATALOGUE',
  'AFFILIATION_MASTER_TEST_COVERAGE',
  'ASSURANCE_MASTER_TEST_COVERAGE',
  'ENVIRONMENT_READINESS_COVERAGE',
  'EVIDENCE_PROVENANCE_COVERAGE',
  'DEFECT_CLOSURE_COVERAGE',
  'ACCEPTANCE_RELEASE_COVERAGE',
  'HOUSE_P0_MASTER_TEST_COVERAGE',
  'DOWNSTREAM_HANDOFF_COVERAGE'
];
const MASTER_MODEL_KINDS = [
  'MASTER_TEST_REQUIREMENT',
  'MASTER_TEST_SCENARIO',
  'MASTER_TEST_CASE_DEFINITION',
  'MASTER_TEST_ORACLE',
  'MASTER_TEST_EVIDENCE_REQUIREMENT',
  'EXECUTION_PREREQUISITE',
  'ENVIRONMENT_REQUIREMENT',
  'INDEPENDENCE_REQUIREMENT',
  'ACCEPTANCE_REQUIREMENT',
  'RELEASE_EVIDENCE_REQUIREMENT',
  'MATERIAL_COMMITMENT_REQUIREMENT'
];
const ORACLE_KINDS = ['TEST_ORACLE', 'MASTER_TEST_ORACLE'];

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok) => conditions.push({ n, title, satisfied: !!ok });

  const coverage = byKinds(ctx, 'REG-901', MASTER_COVERAGE_KINDS);
  const covByKind = Object.fromEntries(MASTER_COVERAGE_KINDS.map((k) => [k, coverage.filter((r) => r.kind === k)]));
  const hasCov = (k) => (covByKind[k]?.length ?? 0) > 0;
  const invariants = new Set(byKind(ctx, 'REG-901', 'INSTITUTIONAL_INVARIANT').map((r) => r.id));

  const model = byKinds(ctx, 'REG-902', MASTER_MODEL_KINDS);
  const modelByKind = Object.fromEntries(MASTER_MODEL_KINDS.map((k) => [k, model.filter((r) => r.kind === k)]));
  const has = (k) => (modelByKind[k]?.length ?? 0) > 0;
  const masterOracles = byKind(ctx, 'REG-902', 'MASTER_TEST_ORACLE');
  const oracleIds = new Set(byKinds(ctx, 'REG-902', ORACLE_KINDS).map((r) => r.id));
  const masterRequirements = byKind(ctx, 'REG-902', 'MASTER_TEST_REQUIREMENT');
  const masterScenarios = byKind(ctx, 'REG-902', 'MASTER_TEST_SCENARIO');
  const masterCases = byKind(ctx, 'REG-902', 'MASTER_TEST_CASE_DEFINITION');

  const backlog = records(ctx, 'REG-904');
  const approvals = records(ctx, 'REG-905');
  const done = completedGates(ctx);

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;
  const productionDataErrors = structural.filter((f) => f.code === 'PRODUCTION_DATA_NOT_AUTHORIZED').length;

  const allNotImplemented = ['REG-901', 'REG-902', 'REG-903', 'REG-904']
    .flatMap((r) => records(ctx, r))
    .every((r) => r.authorizes_implementation === false && r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');
  const allNoImplAuth = ['REG-900', 'REG-901', 'REG-902', 'REG-903', 'REG-904', 'REG-905']
    .flatMap((r) => records(ctx, r))
    .every((r) => r.authorizes_implementation === false || r.authorizes_implementation === undefined);

  // Master-test model integrity.
  const requirementsTrace = masterRequirements.length > 0 && masterRequirements.every((r) => r.institutional_invariant_ref && invariants.has(r.institutional_invariant_ref));
  const coverageSourced = coverage.length > 0 && coverage.every((c) => c.authoritative_source);
  const oraclesGoverned = masterOracles.length > 0 && masterOracles.every((o) => o.authoritative_basis && o.prohibited_basis);
  const scenariosOracle = masterScenarios.length > 0 && masterScenarios.every((s) => s.expected_result_oracle_ref && oracleIds.has(s.expected_result_oracle_ref));
  const casesOracle = masterCases.length > 0 && masterCases.every((s) => s.expected_result_oracle_ref && oracleIds.has(s.expected_result_oracle_ref));

  // Additive whole-volume readiness dispositions.
  const dispositions = byKind(ctx, 'REG-904', 'READINESS').filter((r) => r.historical_source_record);
  const dispositionsComplete = dispositions.length >= 21 && dispositions.every((d) => d.owner && d.required_evidence && d.future_blocking_gate && d.readiness_disposition && d.downstream_volume);
  const backlogForwardOnly = backlog.every((b) => !b.future_blocking_gate || !done.has(b.future_blocking_gate));

  // Package 1, 2, and 3 inheritance and freeze integrity.
  const gateRatified = (id) => approvals.some((a) => a.artifact_id === id && a.approval_state === 'ratified');
  const frozenRatified = (id) => approvals.some((a) => a.artifact_id === id && a.approval_state === 'ratified' && (a.frozen === true || (a.frozen_artifacts ?? []).length > 0));
  const roleClassified = (pkg) => approvals.some((a) => a.approval_state === 'ratified' && a.provenance_role_classification && a.provenance_role_classification.package === pkg);
  const priorRoleClassification = roleClassified('PACKAGE-9-1') && roleClassified('PACKAGE-9-2') && roleClassified('PACKAGE-9-3');
  const priorGates = gateRatified('GATE-V9-G1') && gateRatified('GATE-V9-G2') && gateRatified('GATE-V9-G3');
  const priorFreezes = frozenRatified('PACKAGE-9-1') && frozenRatified('PACKAGE-9-2') && frozenRatified('PACKAGE-9-3');
  const priorChapters = ['V9-B', 'V9-B-1', 'V9-D', 'V9-D-1', 'V9-F', 'V9-F-1'].every((id) => hasChapter(ctx, id));

  // Package 4 closure, gate disposition, package freeze, and whole-volume freeze.
  const closureApproval = approvals.some((a) => a.artifact_id === 'V9-G' && a.approval_state === 'ratified');
  const packageFreeze = approvals.find((a) => a.artifact_id === 'PACKAGE-9-4' && a.approval_state === 'ratified' && (a.frozen === true || (a.frozen_artifacts ?? []).length > 0));
  const volumeFreeze = approvals.find((a) => a.artifact_id === 'VOLUME-9' && a.approval_state === 'ratified' && (a.frozen === true || (a.frozen_artifacts ?? []).length > 0));
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V9-G4' && a.approval_state === 'ratified' && a.gate_disposition === 'QUALITY_AND_MASTER_TEST_DEFINITION_COMPLETE');
  const closureRecord = approvals.find((a) => a.artifact_id === 'V9-G' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-9-4' && a.approval_state === 'ratified');
  const bindingValues = [
    gateApproval?.effective_commit,
    gateApproval?.gate_effective_commit,
    closureRecord?.closure_binding?.closure_authored_commit,
    closureRecord?.closure_binding?.closure_effective_commit,
    closureRecord?.closure_binding?.freeze_commit,
    closureRecord?.closure_binding?.gate_effective_commit,
    freezeRecord?.authoring_closure_separation?.substantive_authoring_commit,
    freezeRecord?.authoring_closure_separation?.closure_authored_commit,
    freezeRecord?.authoring_closure_separation?.closure_effective_commit,
    freezeRecord?.authoring_closure_separation?.gate_effective_commit,
    freezeRecord?.authoring_closure_separation?.freeze_commit,
    freezeRecord?.package_provenance?.authoring_commit,
    freezeRecord?.package_provenance?.closure_freeze_commit,
    freezeRecord?.package_provenance?.freeze_commit,
    freezeRecord?.package_provenance?.effective_commit
  ];
  const gateBindingsResolved = !!gateApproval && bindingValues.filter((v) => v !== undefined).length > 0 && !bindingValues.some((v) => isPlaceholder(v));

  add(1, 'Package 1, 2, and 3 provenance-role classifications are inherited', priorRoleClassification && priorChapters);
  add(2, 'Packages 1, 2, and 3 remain gated and frozen unchanged', priorGates && priorFreezes);
  add(3, 'Package 1, 2, and 3 provenance projections remain complete', priorRoleClassification);
  add(4, 'A single integrated master-test baseline unifies the Volume 9 quality corpus', hasCov('MASTER_TEST_BASELINE') && bodyMentions(ctx, 'V9-31', 'single integrated master-test baseline'));
  add(5, 'Every material requirement has a test obligation or a governed non-test disposition', has('MASTER_TEST_REQUIREMENT') && bodyMentions(ctx, 'V9-31', 'material requirement') && bodyMentions(ctx, 'V9-31', 'governed non-test disposition'));
  add(6, 'Every obligation traces to an authoritative source and an institutional invariant', requirementsTrace && coverageSourced && bodyMentions(ctx, 'V9-31', 'authoritative source'));
  add(7, 'Test objects, requirements, scenarios, cases, oracles, environments, data, evidence, results, defects, and acceptance remain distinct', hasCov('MASTER_TEST_CATALOGUE') && has('MASTER_TEST_CASE_DEFINITION') && casesOracle && bodyMentions(ctx, 'V9-32', 'remain distinct'));
  add(8, 'Every master-test oracle derives from a governed authority and never from the object under test', oraclesGoverned && bodyMentions(ctx, 'V9-32', 'oracle'));
  add(9, 'The affiliation lifecycle has full master-test scenario-family coverage', hasCov('AFFILIATION_MASTER_TEST_COVERAGE') && has('MASTER_TEST_SCENARIO') && scenariosOracle && bodyMentions(ctx, 'V9-33', 'scenario family'));
  add(10, 'Command, query, resource, event, webhook, callback, provider, file, batch, and migration surfaces have master-test dispositions', allMention(ctx, 'V9-33', ['command', 'query', 'resource', 'event', 'webhook', 'callback', 'provider', 'file', 'batch', 'migration']));
  add(11, 'Account, membership, authority, delegation, assignment, finance, support, and denial paths are covered', allMention(ctx, 'V9-33', ['account', 'membership', 'authority', 'delegation', 'assignment', 'finance', 'support', 'denial']));
  add(12, 'Organization and jurisdiction isolation are covered', allMention(ctx, 'V9-33', ['organization', 'jurisdiction', 'isolation']));
  add(13, 'Requirement and evidence versioning are covered', bodyMentions(ctx, 'V9-33', 'requirement versioning') && bodyMentions(ctx, 'V9-33', 'evidence versioning'));
  add(14, 'Submission, approval, reconciliation, activation, standing, and expiry remain distinct', allMention(ctx, 'V9-33', ['submission', 'approval', 'reconciliation', 'activation', 'standing', 'expiry']));
  add(15, 'Exactly-once activation is an institutional invariant', bodyMentions(ctx, 'V9-33', 'exactly-once activation'));
  add(16, 'Security obligations define fail-closed negatives and preserve the authentication/authorization distinction', hasCov('ASSURANCE_MASTER_TEST_COVERAGE') && allMention(ctx, 'V9-34', ['fail-closed', 'authorization', 'authentication']));
  add(17, 'Privacy obligations cover minimum necessary, evidence, logs, traces, exports, legal hold, and disposition', allMention(ctx, 'V9-34', ['minimum necessary', 'evidence', 'logs', 'traces', 'exports', 'legal hold', 'disposition']));
  add(18, 'Accessibility obligations cover automated, manual, keyboard, assistive technology, document, interruption, and recovery', allMention(ctx, 'V9-34', ['automated', 'manual', 'keyboard', 'assistive technology', 'document', 'interruption', 'recovery']));
  add(19, 'Bilingual string presence remains distinct from semantic equivalence', allMention(ctx, 'V9-34', ['string presence', 'semantic equivalence']));
  add(20, 'Financial obligations cover acknowledgement, accounting, reconciliation, activation, and standing', allMention(ctx, 'V9-34', ['acknowledgement', 'accounting', 'reconciliation', 'activation', 'standing']));
  add(21, 'Resilience obligations cover backup, restore, recovery, and reconciliation', allMention(ctx, 'V9-34', ['backup', 'restore', 'recovery', 'reconciliation']));
  add(22, 'Observability obligations cover telemetry, alerting, detection, and response', allMention(ctx, 'V9-34', ['telemetry', 'alerting', 'detection', 'response']));
  add(23, 'Provider obligations cover continuity, incident, substitution, return, deletion, residual, and exit', allMention(ctx, 'V9-34', ['continuity', 'incident', 'substitution', 'return', 'deletion', 'residual', 'exit']));
  add(24, 'Environment, configuration, identity, organization, jurisdiction, lifecycle, data, provider, and evidence-capture prerequisites are catalogued', hasCov('ENVIRONMENT_READINESS_COVERAGE') && has('EXECUTION_PREREQUISITE') && has('ENVIRONMENT_REQUIREMENT') && allMention(ctx, 'V9-35', ['configuration', 'identity', 'lifecycle', 'evidence-capture', 'prerequisite']));
  add(25, 'Production is prohibited as a test environment and only governed synthetic data is admissible', allMention(ctx, 'V9-35', ['production', 'personal information', 'prohibited', 'synthetic']));
  add(26, 'Evidence binds version, commit, configuration, environment, identity, organization, jurisdiction, data, provider state, and time and is reproducible', hasCov('EVIDENCE_PROVENANCE_COVERAGE') && has('MASTER_TEST_EVIDENCE_REQUIREMENT') && allMention(ctx, 'V9-36', ['reproducibility', 'claim boundary', 'provider state']));
  add(27, 'Defect, exception, waiver, remediation, retest, regression, closure, and reopening are controlled', hasCov('DEFECT_CLOSURE_COVERAGE') && allMention(ctx, 'V9-37', ['defect', 'exception', 'waiver', 'remediation', 'retest', 'regression', 'closure', 'reopening']));
  add(28, 'Coverage, independence, acceptance, material commitment, and release evidence are controlled with named acceptance authority', hasCov('ACCEPTANCE_RELEASE_COVERAGE') && has('INDEPENDENCE_REQUIREMENT') && has('ACCEPTANCE_REQUIREMENT') && has('RELEASE_EVIDENCE_REQUIREMENT') && has('MATERIAL_COMMITMENT_REQUIREMENT') && bodyMentions(ctx, 'V9-38', 'acceptance authority'));
  add(29, 'Every House P0 finding has a test mapping and an evidence mapping', hasCov('HOUSE_P0_MASTER_TEST_COVERAGE') && bodyMentions(ctx, 'V9-39', 'test mapping') && bodyMentions(ctx, 'V9-39', 'evidence mapping'));
  add(30, 'Every active unresolved item has an owner, required evidence, a forward gate, and a readiness disposition', dispositionsComplete && bodyMentions(ctx, 'V9-40', 'historical source record'));
  add(31, 'No active unresolved item points to a completed Volume 9 gate', backlogForwardOnly);
  add(32, 'The deterministic final-closure analysis completes without blocking defects', structuralErrors === 0 && bodyMentions(ctx, 'V9-42', 'closure assessment') && bodyMentions(ctx, 'V9-42', 'final-closure analysis control'));
  add(33, 'No executable tests, environments, datasets, credentials, secrets, tools, services, or implementation are created', leakageErrors === 0 && productionDataErrors === 0);
  add(34, 'No passing, conformance, effectiveness, compliance, readiness, or acceptance claim is made without evidence', allNotImplemented);
  add(35, 'No procurement, sequencing, staffing, cost, pilot, rollout, release, or master plan is created and no release is authorized', hasCov('DOWNSTREAM_HANDOFF_COVERAGE') && bodyMentions(ctx, 'V9-41', 'volume 10') && bodyMentions(ctx, 'V9-41', 'no release authorization'));
  add(36, 'No record authorizes implementation or test execution', allNoImplAuth);
  add(37, 'Package 4 and the whole Volume 9 corpus carry explicit freeze approvals and the gate disposition is complete', !!packageFreeze && !!volumeFreeze && !!gateApproval);
  add(38, 'Genuine authoring, closure-and-freeze, and pre-merge provenance-binding separation is preserved', closureApproval && !!packageFreeze && gateBindingsResolved);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V9_G4_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V9-G4'));
    }
  }
  return findings;
}

export function generate(ctx = loadContext()) {
  const conditions = evaluate(ctx);
  const unmet = conditions.filter((c) => !c.satisfied);
  const outDir = join(VOLUME_DIR, 'generated', 'integrated-master-test-baseline-and-closure');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    gate: 'V9-G4',
    disposition_target: 'QUALITY_AND_MASTER_TEST_DEFINITION_COMPLETE',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v9-g4-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V9-G4 readiness', run);
}
