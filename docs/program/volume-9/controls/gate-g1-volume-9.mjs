// Control: Gate V9-G1 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the twenty-nine Gate V9-G1 conditions from the Volume 9 Package 1
// directive against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-905 approval carrying GATE-V9-G1 and the disposition
// QUALITY_AND_MASTER_TEST_GOVERNANCE_FOUNDATION_READY.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-9.mjs';
import { isPlaceholder } from './provenance-integrity-volume-9.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}
function hasChapter(ctx, id) {
  return ctx.chapters.some((c) => c.fileId === id);
}
function bodyMentions(ctx, id, needle) {
  const ch = ctx.chapters.find((c) => c.fileId === id);
  return ch ? ch.body.includes(needle) : false;
}

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok) => conditions.push({ n, title, satisfied: !!ok });

  const quality = byKind(ctx, 'REG-901', 'QUALITY_ATTRIBUTE');
  const invariants = byKind(ctx, 'REG-901', 'INSTITUTIONAL_INVARIANT');
  const objects = byKind(ctx, 'REG-901', 'TEST_OBJECT');
  const coverage = byKind(ctx, 'REG-901', 'COVERAGE_RECORD');
  const levels = byKind(ctx, 'REG-901', 'TEST_LEVEL');
  const tiers = byKind(ctx, 'REG-901', 'EVIDENCE_TIER');
  const independence = byKind(ctx, 'REG-901', 'INDEPENDENCE_LEVEL');
  const requirements = byKind(ctx, 'REG-902', 'TEST_REQUIREMENT');
  const scenarios = byKind(ctx, 'REG-902', 'TEST_SCENARIO');
  const cases = byKind(ctx, 'REG-902', 'TEST_CASE');
  const oracles = byKind(ctx, 'REG-902', 'TEST_ORACLE');
  const environments = byKind(ctx, 'REG-902', 'TEST_ENVIRONMENT_CLASS');
  const datasets = byKind(ctx, 'REG-902', 'TEST_DATA_REQUIREMENT');
  const resultModels = byKind(ctx, 'REG-902', 'TEST_RESULT_MODEL');
  const backlog = records(ctx, 'REG-904');
  const approvals = records(ctx, 'REG-905');

  const levelSet = new Set(levels.map((l) => l.test_level));
  const backlogKinds = new Set(backlog.map((b) => b.kind));

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;
  const productionDataErrors = structural.filter((f) => f.code === 'PRODUCTION_DATA_NOT_AUTHORIZED').length;

  const allNotImplemented = ['REG-901', 'REG-902', 'REG-903', 'REG-904']
    .flatMap((r) => records(ctx, r))
    .every((r) => r.authorizes_implementation === false && r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');

  const backlogComplete = backlog.length > 0 && backlog.every((b) => b.owner && b.future_blocking_gate);
  const closureApproval = approvals.some((a) => a.artifact_id === 'V9-A' && a.approval_state === 'ratified');
  const freezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-9-1' && a.approval_state === 'ratified');

  // Fail-closed provenance binding: a completed gate must not report ready while any
  // required gate/closure/freeze effectiveness binding remains an unresolved
  // placeholder (PENDING/UNKNOWN/TBD/PLACEHOLDER/UNRESOLVED). The forward-referencing
  // provenance-amendment fields are excluded; they are validated by role classification.
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V9-G1' && a.approval_state === 'ratified');
  const closureRecord = approvals.find((a) => a.artifact_id === 'V9-A' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-9-1' && a.approval_state === 'ratified');
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

  add(1, 'Released Volume 8 provenance inherited', bodyMentions(ctx, 'V9-00', 'central-registration-volume-8-v1.0.0'));
  add(2, 'Volume control and test-definition authority controlled', hasChapter(ctx, 'V9-00'));
  add(3, 'Test definition held distinct from test execution and acceptance', hasChapter(ctx, 'V9-00') && bodyMentions(ctx, 'V9-00', 'execution'));
  add(4, 'Quality doctrine and evidence hierarchy defined', hasChapter(ctx, 'V9-01') && tiers.length >= 12);
  add(5, 'Evidence tiers ranked with substitution prohibition', tiers.length >= 12 && tiers.every((t) => typeof t.tier_rank === 'number' && t.substitution_prohibition));
  add(6, 'Quality attributes catalogued', hasChapter(ctx, 'V9-02') && quality.length >= 15);
  add(7, 'Every quality attribute names purpose, source, levels, evidence, prohibited inference, and acceptance authority', quality.length > 0 && quality.every((q) => q.institutional_purpose && q.authoritative_source && (q.applicable_test_levels ?? []).length > 0 && q.required_evidence_tier && q.prohibited_inference && q.acceptance_authority));
  add(8, 'Institutional invariants catalogued with required negative expectations', invariants.length >= 6 && invariants.every((v) => v.negative_expectation_required === true));
  add(9, 'Verification, validation, assurance, and acceptance distinguished', hasChapter(ctx, 'V9-03'));
  add(10, 'Test-level taxonomy present', levels.length >= 30);
  add(11, 'Every test level names object under test, permitted evidence, prohibited inference, environment, and independence', levels.length > 0 && levels.every((l) => l.object_under_test && l.permitted_evidence && l.prohibited_inference && l.environment_dependency && l.independence_requirement));
  add(12, 'Test object, requirement, scenario, case, oracle, evidence, and result model defined', hasChapter(ctx, 'V9-04') && objects.length >= 5 && requirements.length >= 3 && scenarios.length >= 2 && cases.length >= 2 && oracles.length >= 2);
  add(13, 'Test requirements trace to governed invariants and name expected and negative outcomes', requirements.length > 0 && requirements.every((t) => t.institutional_invariant_ref && t.expected_outcome && t.negative_outcome));
  add(14, 'Test cases name preconditions, a stimulus, and an oracle', cases.length > 0 && cases.every((c) => (c.preconditions ?? []).length > 0 && c.action_or_stimulus && c.expected_result_oracle_ref));
  add(15, 'Oracles derive from an authoritative basis, not tester intuition', oracles.length > 0 && oracles.every((o) => o.authoritative_basis && o.derived_from && o.prohibited_basis));
  add(16, 'Environment, configuration, identity, jurisdiction, and data governance defined', hasChapter(ctx, 'V9-05') && environments.length >= 8);
  add(17, 'Environment classes name data classification, production-data prohibition, and provisioning gate', environments.length > 0 && environments.every((e) => e.data_classification && e.production_data_prohibition && e.provisioning_gate));
  add(18, 'Test-data governance prohibits unauthorized real production data', datasets.length > 0 && datasets.every((d) => d.production_data_prohibition) && productionDataErrors === 0);
  add(19, 'Scenarios carry authority, tenant, jurisdiction, resource, and lifecycle-state context', scenarios.length > 0 && scenarios.every((s) => s.actor_or_service && s.tenant_context && s.jurisdiction_context && s.resource_context && s.lifecycle_state_context));
  add(20, 'Functional, contract, integration, workflow, data, and migration-test foundation defined', hasChapter(ctx, 'V9-06') && ['CONTRACT_TEST', 'INTEGRATION_TEST', 'WORKFLOW_TEST', 'DATA_QUALITY_TEST', 'MIGRATION_TEST'].every((k) => levelSet.has(k)));
  add(21, 'Security, privacy, accessibility, bilingual, resilience, and operational-assurance test foundation defined', hasChapter(ctx, 'V9-07') && ['SECURITY_TEST', 'PRIVACY_TEST', 'ACCESSIBILITY_MANUAL_TEST', 'ASSISTIVE_TECHNOLOGY_TEST', 'BILINGUAL_SEMANTIC_REVIEW', 'RESILIENCE_TEST', 'RECOVERY_EXERCISE', 'OPERATIONAL_EXERCISE'].every((k) => levelSet.has(k)));
  add(22, 'Defect, exception, waiver, remediation, retest, and regression model defined', hasChapter(ctx, 'V9-08') && ['DEFECT', 'EXC', 'WAIVER', 'REMEDIATION', 'RETEST', 'REGRESSION'].every((k) => backlogKinds.has(k)));
  add(23, 'Traceability, coverage, and independence model defined', hasChapter(ctx, 'V9-09') && independence.length >= 8 && coverage.length >= 1);
  add(24, 'Result models keep inconclusive distinct from pass and name an acceptance authority', resultModels.length > 0 && resultModels.every((r) => r.inconclusive_distinct_from_pass === true && r.acceptance_authority));
  add(25, 'Release-evidence handoff to Volumes 10-12 defined', hasChapter(ctx, 'V9-09') && bodyMentions(ctx, 'V9-09', 'V10') && bodyMentions(ctx, 'V9-09', 'V11') && bodyMentions(ctx, 'V9-09', 'V12'));
  add(26, 'Deterministic Package 1 analysis completes without blocking defects', structuralErrors === 0);
  add(27, 'No prohibited implementation, executable-test, or coded-artifact leakage created', leakageErrors === 0);
  add(28, 'Unresolved items have owners and future gates, and no record authorizes implementation', backlogComplete && allNotImplemented);
  add(29, 'Package 1 receives line-level review, a separate freeze commit, and no unresolved required commit binding', closureApproval && freezeApproval && gateBindingsResolved);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V9_G1_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V9-G1'));
    }
  }
  return findings;
}

export function generate(ctx = loadContext()) {
  const conditions = evaluate(ctx);
  const unmet = conditions.filter((c) => !c.satisfied);
  const outDir = join(VOLUME_DIR, 'generated', 'foundation');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    gate: 'V9-G1',
    disposition_target: 'QUALITY_AND_MASTER_TEST_GOVERNANCE_FOUNDATION_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v9-g1-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V9-G1 readiness', run);
}
