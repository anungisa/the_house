// Control: Gate V10-G3 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the forty Gate V10-G3 conditions from the Volume 10 Package 3 directive
// against the source-controlled corpus. Each condition is satisfied only by concrete
// corpus evidence; an unsatisfied condition is an ERROR. This control reports
// readiness; it never itself disposes the gate. The gate is dispositioned only by a
// ratified REG-1005 approval carrying GATE-V10-G3 and the disposition
// MASTER_DEVELOPMENT_PLAN_AND_RELEASE_ROADMAP_DEFINITION_COMPLETE.

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
  if (!ch) return false;
  const norm = (s) => s.replace(/\s+/g, ' ');
  return norm(ch.body).includes(norm(needle));
}

// The fourteen House P0 findings; each must have a master-plan implementation,
// testing, operational-proof, and release-evidence destination in V10-32.
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

// Valid future gates exclude every completed Volume 10 gate (G1, G2, G3).
const VALID_FUTURE_GATES = new Set(['V11-G1', 'V11-G2', 'V12-G1', 'V12-G2', 'EXEC-MCG']);

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok) => conditions.push({ n, title, satisfied: !!ok });

  const masterPlan = byKind(ctx, 'REG-1001', 'MASTER_PLAN_OBJECTIVE');
  const edges = byKind(ctx, 'REG-1001', 'DEPENDENCY_EDGE');
  const capabilityDemands = byKind(ctx, 'REG-1001', 'CAPABILITY_DEMAND');
  const operationalCapabilities = byKind(ctx, 'REG-1001', 'OPERATIONAL_CAPABILITY');
  const p0Destinations = byKind(ctx, 'REG-1001', 'HOUSE_P0_DELIVERY_DESTINATION');

  const waves = byKind(ctx, 'REG-1002', 'IMPLEMENTATION_WAVE');
  const environmentReqs = byKind(ctx, 'REG-1002', 'ENVIRONMENT_ENABLEMENT_REQUIREMENT');
  const testEnablementReqs = byKind(ctx, 'REG-1002', 'TEST_ENABLEMENT_REQUIREMENT');

  const backlog = records(ctx, 'REG-1004');
  const costEstimates = backlog.filter((b) => b.kind === 'COST_ESTIMATE');
  const funding = backlog.filter((b) => b.kind === 'FUNDING');
  const procurement = backlog.filter((b) => b.kind === 'PROCUREMENT');
  const materialCommitments = backlog.filter((b) => b.kind === 'COMMITMENT' || b.kind === 'PROCUREMENT');
  const approvals = records(ctx, 'REG-1005');

  const allRegisterRecords = ['REG-1001', 'REG-1002', 'REG-1003', 'REG-1004', 'REG-1005'].flatMap((r) => records(ctx, r));
  const foundationRecords = ['REG-1001', 'REG-1002', 'REG-1003', 'REG-1004'].flatMap((r) => records(ctx, r));
  const planningRecords = ['REG-1001', 'REG-1002'].flatMap((r) => records(ctx, r));

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;

  const allNotImplemented = foundationRecords.every((r) => r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');
  const noneAuthorizesImplementation = allRegisterRecords.every((r) => r.authorizes_implementation === false);

  const isFrozen = (artifact) => approvals.some((a) => a.artifact_id === artifact && a.approval_state === 'ratified' && a.frozen === true);
  const package1Frozen = isFrozen('PACKAGE-10-1');
  const package2Frozen = isFrozen('PACKAGE-10-2');
  const package3Frozen = isFrozen('PACKAGE-10-3');
  const volume10Frozen = isFrozen('VOLUME-10');

  const corpusIds = new Set((records(ctx, 'REG-1000')).map((r) => r.id));
  const indexHasAmendments = corpusIds.has('V10-D') && corpusIds.has('V10-D-1');

  const mpoComplete = masterPlan.length > 0 && masterPlan.every((m) =>
    (m.deliverables ?? []).length > 0 && m.definition_of_ready && m.definition_of_done &&
    m.evidence_obligations && m.implementation_authorization_gate && m.release_gate);

  const criticalPathEvidenceDerived = edges.some((e) => e.critical_path_status === 'ON_CRITICAL_PATH') &&
    bodyMentions(ctx, 'V10-22', 'critical path is evidence-derived and is not visually convenient');

  const wavesComplete = waves.length > 0 && waves.every((w) => w.entry_conditions && w.exit_conditions);
  const capacityByWave = capabilityDemands.length > 0 && capabilityDemands.every((c) => c.demand_by_wave);
  const soloRiskVisible = bodyMentions(ctx, 'V10-24', 'solo-delivery') &&
    (capabilityDemands.some((c) => /YES/i.test(c.single_person_dependency ?? '')) ||
      backlog.some((b) => b.kind === 'RISK' && /solo|single-person/i.test(b.statement ?? '')));

  const estimatesComplete = costEstimates.length > 0 && costEstimates.every((e) =>
    e.estimate_basis && e.range && e.confidence && e.assumptions && (e.dependencies ?? []).length > 0 && e.currency && e.approval_status);

  const opsHaveVolume11 = operationalCapabilities.length > 0 && operationalCapabilities.every((o) => o.volume_11_destination);

  // Condition 40: authoring / closure-and-dual-freeze / pre-merge provenance binding.
  const closureApproval = approvals.some((a) => a.artifact_id === 'V10-E' && a.approval_state === 'ratified' && a.closure_record === true);
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V10-G3' && a.approval_state === 'ratified');
  const closureRecord = approvals.find((a) => a.artifact_id === 'V10-E' && a.approval_state === 'ratified');
  const packageFreezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-10-3' && a.approval_state === 'ratified' && a.frozen === true);
  const volumeFreezeRecord = approvals.find((a) => a.artifact_id === 'VOLUME-10' && a.approval_state === 'ratified' && a.frozen === true);
  const bindingValues = [
    gateApproval?.effective_commit,
    gateApproval?.gate_effective_commit,
    closureRecord?.closure_binding?.closure_authored_commit,
    closureRecord?.closure_binding?.closure_effective_commit,
    closureRecord?.closure_binding?.freeze_commit,
    closureRecord?.closure_binding?.gate_effective_commit,
    packageFreezeRecord?.authoring_closure_separation?.substantive_authoring_commit,
    packageFreezeRecord?.authoring_closure_separation?.closure_authored_commit,
    packageFreezeRecord?.authoring_closure_separation?.freeze_commit,
    packageFreezeRecord?.package_provenance?.authoring_commit,
    packageFreezeRecord?.package_provenance?.freeze_commit
  ];
  const gateBindingsResolved = !!gateApproval && bindingValues.filter((v) => v !== undefined).length > 0 && !bindingValues.some((v) => isPlaceholder(v));

  add(1, 'Package 1 and Package 2 lineages and freezes are inherited',
    bodyMentions(ctx, 'V10-21', 'central-registration-volume-9-v1.0.0') && bodyMentions(ctx, 'V10-21', 'V10-B') && bodyMentions(ctx, 'V10-21', 'V10-B-1') && bodyMentions(ctx, 'V10-21', 'V10-D') && bodyMentions(ctx, 'V10-21', 'V10-D-1'));
  add(2, 'Packages 1 and 2 remain frozen and unchanged', package1Frozen && package2Frozen);
  add(3, 'REG-1000 indexes all controlled chapters and amendments, including V10-D and V10-D-1', indexHasAmendments);
  add(4, 'One integrated master-development-plan baseline exists', masterPlan.length >= 1);
  add(5, 'Club affiliation remains the first implementation vertical', bodyMentions(ctx, 'V10-21', 'club affiliation is the first implementation vertical'));
  add(6, 'House authority remains distinct from Button interaction', bodyMentions(ctx, 'V10-21', 'House authority remains distinct from Button interaction'));
  add(7, 'Every material inherited obligation maps to a work package or governed disposition', bodyMentions(ctx, 'V10-21', 'either to an implementation work package or to a governed disposition') && masterPlan.length >= 1);
  add(8, 'Every work package has deliverables, readiness, completion, evidence, and authorization gates', mpoComplete);
  add(9, 'A complete dependency graph exists', edges.length >= 1 && edges.every((e) => (e.predecessors ?? []).length > 0 && (e.successors ?? []).length > 0));
  add(10, 'Critical-path items are evidence-derived and explicitly identified', criticalPathEvidenceDerived);
  add(11, 'Prerequisite, parallel, deferred, and blocked work remain distinct', bodyMentions(ctx, 'V10-22', 'Prerequisite, parallel, deferred, and blocked work remain distinct'));
  add(12, 'Implementation waves have entry and exit conditions', wavesComplete);
  add(13, 'Release units remain distinct from accepted releases and deployments', bodyMentions(ctx, 'V10-23', 'A release candidate is not an accepted release and is not a deployment'));
  add(14, 'Capability and capacity demand is defined by wave', capacityByWave);
  add(15, 'Named roles remain distinct from assignments and confirmed availability', bodyMentions(ctx, 'V10-24', 'A named role is not an assigned person and is not a confirmed capacity'));
  add(16, 'Solo-delivery and specialist-capacity risks remain visible', soloRiskVisible);
  add(17, 'Estimates include basis, range, confidence, assumptions, dependencies, currency, and approval status', estimatesComplete);
  add(18, 'Estimates remain distinct from budgets, quotes, expenditures, procurements, and contracts', bodyMentions(ctx, 'V10-25', 'An estimate is not a budget, a quote, an approved expenditure, a procurement commitment, or a contract') && costEstimates.every((e) => e.estimate_status === 'PLANNING_ESTIMATE'));
  add(19, 'Funding scenarios and decision dependencies are represented', funding.length >= 1);
  add(20, 'Procurement readiness remains distinct from provider selection and engagement', bodyMentions(ctx, 'V10-26', 'Procurement readiness is not procurement authorization') && procurement.length >= 1);
  add(21, 'Environment and infrastructure enablement roadmaps are defined', environmentReqs.length >= 1 && hasChapter(ctx, 'V10-27'));
  add(22, 'Environment planning remains distinct from provisioning and qualification', bodyMentions(ctx, 'V10-27', 'Environment definition is not provisioning and is not qualification') && environmentReqs.every((e) => e.provisioning_status === 'NOT_AUTHORIZED'));
  add(23, 'Test-enablement destinations trace to Volume 9', bodyMentions(ctx, 'V10-27', 'central-registration-volume-9-v1.0.0') && testEnablementReqs.length >= 1);
  add(24, 'Test enablement remains distinct from executable tests and execution', bodyMentions(ctx, 'V10-27', 'Test-enablement planning is not an executable test and does not execute any test'));
  add(25, 'Migration, coexistence, rehearsal, cutover, reconciliation, rollback, acceptance, and retirement remain distinct',
    bodyMentions(ctx, 'V10-28', 'quarantine') && bodyMentions(ctx, 'V10-28', 'reconciliation') && bodyMentions(ctx, 'V10-28', 'coexistence') && bodyMentions(ctx, 'V10-28', 'rollback') && bodyMentions(ctx, 'V10-28', 'Mapping complete is not identity resolved'));
  add(26, 'Operations, support, adoption, training, and transition have Volume 11 destinations', opsHaveVolume11 && hasChapter(ctx, 'V10-29'));
  add(27, 'Security, privacy, records, accessibility, bilingual, financial, data, and audit obligations remain embedded', bodyMentions(ctx, 'V10-30', 'Security, privacy, records, accessibility, bilingual, financial, data, and audit obligations remain embedded'));
  add(28, 'All 14 House P0 findings have implementation, testing, operational-proof, and release-evidence destinations', HOUSE_P0_FINDINGS.every((f) => bodyMentions(ctx, 'V10-32', f)) && p0Destinations.length === HOUSE_P0_FINDINGS.length);
  add(29, 'Every active unresolved item has an owner, required evidence, decision dependency, and valid future gate', backlog.length > 0 && backlog.every((b) => b.owner && b.required_action_or_evidence && VALID_FUTURE_GATES.has(b.future_blocking_gate)));
  add(30, 'No active unresolved item points to a completed Volume 10 gate', backlog.every((b) => !/^V10-G[0-9]$/.test(b.future_blocking_gate ?? '')));
  add(31, 'Material commitments remain explicit and unapproved unless evidenced', materialCommitments.every((m) => m.commitment_status === 'NOT_COMMITTED'));
  add(32, 'The executive brief distinguishes requested planning decisions from prohibited implementation or release approvals', bodyMentions(ctx, 'V10-31', 'planning baseline') && bodyMentions(ctx, 'V10-31', 'not yet being asked'));
  add(33, 'Deterministic Volume 10 closure analysis completes without blocking defects', structuralErrors === 0);
  add(34, 'No runtime code, executable tests, environments, datasets, credentials, secrets, migrations, integrations, or infrastructure is created', leakageErrors === 0 && allNotImplemented);
  add(35, 'No provider engagement, procurement, expenditure, hiring, staff assignment, or consultant commitment is authorized', allNotImplemented && noneAuthorizesImplementation && procurement.every((p) => p.commitment_status === 'NOT_COMMITTED'));
  add(36, 'No test execution, migration execution, pilot, rollout, deployment, release, or launch is authorized', allNotImplemented && noneAuthorizesImplementation);
  add(37, 'No estimate, target date, capacity state, readiness state, or release state is represented as approved without evidence', planningRecords.every((r) => r.planning_status === 'DOCUMENTARY_PLAN_ONLY' && r.commitment_status === 'NOT_COMMITTED') && costEstimates.every((e) => e.estimate_status === 'PLANNING_ESTIMATE' && e.approval_status !== 'APPROVED'));
  add(38, 'No record authorizes implementation', noneAuthorizesImplementation);
  add(39, 'Package 3 and the complete Volume 10 corpus receive explicit freeze approvals', package3Frozen && volume10Frozen);
  add(40, 'Genuine authoring, closure/dual-freeze, and pre-merge provenance-binding separation is preserved', closureApproval && package3Frozen && volume10Frozen && !!volumeFreezeRecord && gateBindingsResolved);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V10_G3_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V10-G3'));
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
    gate: 'V10-G3',
    disposition_target: 'MASTER_DEVELOPMENT_PLAN_AND_RELEASE_ROADMAP_DEFINITION_COMPLETE',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v10-g3-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V10-G3 readiness', run);
}
