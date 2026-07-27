// Control: Gate V10-G1 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the thirty-two Gate V10-G1 conditions from the Volume 10 Package 1
// directive against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-1005 approval carrying GATE-V10-G1 and the disposition
// DELIVERY_AND_MASTER_DEVELOPMENT_PLAN_GOVERNANCE_FOUNDATION_READY.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-10.mjs';
import { isPlaceholder } from './provenance-integrity-volume-10.mjs';

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

// The fourteen House P0 findings; each must have a planning destination in V10-10.
const HOUSE_P0_FINDINGS = Object.freeze([
  'resource-aware authorization',
  'reviewer assignment and jurisdiction',
  'evidence binding',
  'production-dependency completeness',
  'composite tenant-parent integrity',
  'affiliation lifecycle',
  'versioned requirements',
  'return and resubmission',
  'exactly-once activation',
  'fail-closed configuration',
  'outbox publication',
  'PostgreSQL behavioural verification',
  'production-composition verification',
  'deployment-path, secret, and entry-point configuration'
]);

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok) => conditions.push({ n, title, satisfied: !!ok });

  const outcomes = byKind(ctx, 'REG-1001', 'OUTCOME');
  const caps = byKind(ctx, 'REG-1001', 'CAPABILITY');
  const streams = byKind(ctx, 'REG-1001', 'WORKSTREAM');
  const workPackages = byKind(ctx, 'REG-1001', 'WORK_PACKAGE');
  const deliverables = byKind(ctx, 'REG-1001', 'DELIVERABLE');
  const dependencies = byKind(ctx, 'REG-1001', 'DEPENDENCY');
  const environments = byKind(ctx, 'REG-1002', 'ENVIRONMENT');
  const releaseUnits = byKind(ctx, 'REG-1002', 'RELEASE_UNIT');
  const readiness = byKind(ctx, 'REG-1002', 'READINESS_CONDITION');
  const decisions = records(ctx, 'REG-1003');
  const backlog = records(ctx, 'REG-1004');
  const costEstimates = backlog.filter((b) => b.kind === 'COST_ESTIMATE');
  const commitments = backlog.filter((b) => b.kind === 'COMMITMENT' || b.kind === 'PROCUREMENT');
  const approvals = records(ctx, 'REG-1005');
  const backlogKinds = new Set(backlog.map((b) => b.kind));

  const allRegisterRecords = ['REG-1001', 'REG-1002', 'REG-1003', 'REG-1004', 'REG-1005'].flatMap((r) => records(ctx, r));
  const planningRecords = ['REG-1001', 'REG-1002'].flatMap((r) => records(ctx, r));

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;

  const foundationRecords = ['REG-1001', 'REG-1002', 'REG-1003', 'REG-1004'].flatMap((r) => records(ctx, r));
  const allNotImplemented = foundationRecords.every((r) => r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');
  const noneAuthorizesImplementation = allRegisterRecords.every((r) => r.authorizes_implementation === false);

  const wpComplete = workPackages.length > 0 && workPackages.every((w) =>
    w.objective && w.scope && w.excluded_scope && (w.source_requirements ?? []).length > 0 && w.responsible_role &&
    (w.required_capabilities ?? []).length > 0 && (w.dependencies ?? []).length > 0 && (w.deliverables ?? []).length > 0 &&
    w.definition_of_ready && w.definition_of_done && w.evidence_obligations && w.security_privacy_obligations &&
    w.accessibility_bilingual_obligations && w.future_gate);

  // Provenance-binding separation (matches Volume 9 Gate condition 29): a completed
  // gate must not report ready while any required gate/closure/freeze effectiveness
  // binding remains an unresolved placeholder. Forward-referencing provenance-
  // amendment fields are excluded; they are validated by role classification.
  const closureApproval = approvals.some((a) => a.artifact_id === 'V10-A' && a.approval_state === 'ratified' && a.closure_record === true);
  const freezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-10-1' && a.approval_state === 'ratified' && a.frozen === true);
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V10-G1' && a.approval_state === 'ratified');
  const closureRecord = approvals.find((a) => a.artifact_id === 'V10-A' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-10-1' && a.approval_state === 'ratified');
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

  add(1, 'Released Volume 9 provenance inherited', bodyMentions(ctx, 'V10-00', 'central-registration-volume-9-v1.0.0'));
  add(2, 'Planning authority distinct from implementation authority', bodyMentions(ctx, 'V10-00', 'Planning authority is distinct from implementation authority') && decisions.some((d) => d.id === 'ADR-V10-001'));
  add(3, 'Delivery phases and gate boundaries defined', hasChapter(ctx, 'V10-01') && bodyMentions(ctx, 'V10-01', 'phase-gate'));
  add(4, 'Delivery phases held distinct', ['Implementation readiness', 'Construction is distinct from Verification', 'Operational readiness is distinct from Release acceptance', 'Release acceptance is distinct from Deployment'].every((n) => bodyMentions(ctx, 'V10-01', n)));
  add(5, 'Complete planning hierarchy controlled', hasChapter(ctx, 'V10-02') && bodyMentions(ctx, 'V10-02', 'planning hierarchy') && outcomes.length >= 1 && caps.length >= 1 && streams.length >= 1 && workPackages.length >= 1 && deliverables.length >= 1);
  add(6, 'Every material inherited obligation has a work-package destination or governed disposition', hasChapter(ctx, 'V10-10') && bodyMentions(ctx, 'V10-10', 'governed disposition') && workPackages.length > 0);
  add(7, 'Work packages identify scope, exclusions, owner, capabilities, dependencies, deliverables, readiness, completion, evidence, and future gate', wpComplete);
  add(8, 'Scope baseline and change-control rules defined', hasChapter(ctx, 'V10-03') && bodyMentions(ctx, 'V10-03', 'scope baseline') && bodyMentions(ctx, 'V10-03', 'change control') && backlogKinds.has('CHANGE'));
  add(9, 'Configuration baselines and release units controlled', hasChapter(ctx, 'V10-03') && bodyMentions(ctx, 'V10-03', 'configuration baseline') && releaseUnits.length >= 1);
  add(10, 'Assumptions, dependencies, decisions, commitments, risks, issues, and blockers held distinct', ['ASSUMPTION', 'RISK', 'ISSUE', 'CHANGE', 'COMMITMENT'].every((k) => backlogKinds.has(k)) && decisions.length >= 1 && dependencies.length >= 1);
  add(11, 'Every dependency and readiness condition has owner, evidence requirement, and future gate', dependencies.length > 0 && dependencies.every((d) => d.owner && d.required_decision_or_evidence && d.future_gate) && readiness.length > 0 && readiness.every((r) => r.owner && r.required_evidence && r.future_gate));
  add(12, 'Estimates contain basis, range, confidence, assumptions, inclusions, exclusions, dependencies, and approval status', costEstimates.length >= 1 && costEstimates.every((e) => e.estimate_basis && e.range && e.confidence && e.assumptions && e.included_scope && e.excluded_scope && (e.dependencies ?? []).length > 0 && e.approval_status));
  add(13, 'Estimates held distinct from budgets, quotes, purchases, and contracts', hasChapter(ctx, 'V10-07') && bodyMentions(ctx, 'V10-07', 'An estimate is not a budget, a quote, a purchase, or a contract') && costEstimates.every((e) => e.estimate_status === 'PLANNING_ESTIMATE'));
  add(14, 'Resource models held distinct from assignments, hiring, and engagement authority', hasChapter(ctx, 'V10-06') && bodyMentions(ctx, 'V10-06', 'Resource modelling is not staff assignment, hiring, or engagement authority'));
  add(15, 'Capability and decision-rights requirements controlled', hasChapter(ctx, 'V10-06') && bodyMentions(ctx, 'V10-06', 'decision rights') && caps.length >= 1 && caps.every((c) => c.decision_rights && c.capability_domain));
  add(16, 'Environment classes and qualification requirements defined', hasChapter(ctx, 'V10-05') && bodyMentions(ctx, 'V10-05', 'environment class') && environments.length >= 1 && environments.every((e) => e.qualification_criteria));
  add(17, 'Environment planning held distinct from provisioning and qualification', bodyMentions(ctx, 'V10-05', 'Environment definition is not provisioning and is not qualification') && environments.every((e) => e.provisioning_status === 'NOT_AUTHORIZED'));
  add(18, 'Test-enablement planning traces to Volume 9 obligations', bodyMentions(ctx, 'V10-05', 'central-registration-volume-9-v1.0.0') && workPackages.some((w) => (w.source_requirements ?? []).includes('central-registration-volume-9-v1.0.0')));
  add(19, 'Test-enablement held distinct from executable tests and execution', bodyMentions(ctx, 'V10-05', 'Test-enablement planning is not an executable test and does not execute any test'));
  add(20, 'Data, identity, secret, provider, observability, isolation, reset, and evidence-capture dependencies represented', environments.length >= 1 && environments.every((e) => e.identity_requirements && e.synthetic_data_requirements && e.secret_dependencies && e.provider_dependencies && e.observability_requirements && e.isolation_reset_requirements && e.evidence_capture_requirements));
  add(21, 'Security, privacy, accessibility, and bilingual obligations embedded in work-package planning', workPackages.length > 0 && workPackages.every((w) => w.security_privacy_obligations && w.accessibility_bilingual_obligations));
  add(22, 'Delivery risk, issue, defect, exception, waiver, evidence-gap, and escalation flows controlled', hasChapter(ctx, 'V10-08') && bodyMentions(ctx, 'V10-08', 'escalation') && backlogKinds.has('RISK') && backlogKinds.has('ISSUE'));
  add(23, 'Migration, coexistence, cutover, rollback, operational handoff, and stabilization remain planning concepts', hasChapter(ctx, 'V10-09') && bodyMentions(ctx, 'V10-09', 'rollback') && bodyMentions(ctx, 'V10-09', 'cutover'));
  add(24, 'Release candidates held distinct from accepted releases and deployments', bodyMentions(ctx, 'V10-09', 'A release candidate is not an accepted release and is not a deployment') && releaseUnits.length >= 1 && releaseUnits.every((r) => r.release_unit_state === 'DEFINED'));
  add(25, 'House P0 findings have implementation, test-enablement, operational-proof, and release-evidence destinations', hasChapter(ctx, 'V10-10') && HOUSE_P0_FINDINGS.every((f) => bodyMentions(ctx, 'V10-10', f)));
  add(26, 'Deterministic Package 1 analysis completes without blocking defects', structuralErrors === 0);
  add(27, 'No prohibited implementation, provisioning, deployment, or executable-artifact leakage created', leakageErrors === 0);
  add(28, 'No runtime code, executable tests, environments, datasets, identities, secrets, provider integration, or infrastructure created', leakageErrors === 0 && allNotImplemented);
  add(29, 'No procurement, expenditure, staffing, provisioning, execution, release, or deployment authorized', allNotImplemented && noneAuthorizesImplementation);
  add(30, 'No schedule, cost, staffing, readiness, delivery, or release commitment represented as approved without evidence', planningRecords.every((r) => r.planning_status === 'DOCUMENTARY_PLAN_ONLY' && r.commitment_status === 'NOT_COMMITTED') && costEstimates.every((e) => e.estimate_status === 'PLANNING_ESTIMATE') && commitments.every((c) => c.commitment_status === 'NOT_COMMITTED'));
  add(31, 'No record authorizes implementation', noneAuthorizesImplementation);
  add(32, 'Genuine authoring, closure-freeze, and pre-merge provenance-binding separation preserved', closureApproval && freezeApproval && gateBindingsResolved);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V10_G1_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V10-G1'));
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
    gate: 'V10-G1',
    disposition_target: 'DELIVERY_AND_MASTER_DEVELOPMENT_PLAN_GOVERNANCE_FOUNDATION_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v10-g1-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V10-G1 readiness', run);
}
