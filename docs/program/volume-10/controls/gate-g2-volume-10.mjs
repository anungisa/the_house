// Control: Gate V10-G2 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the thirty-five Gate V10-G2 conditions from the Volume 10 Package 2
// directive against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-1005 approval carrying GATE-V10-G2 and the disposition
// AFFILIATION_IMPLEMENTATION_AND_TECHNICAL_DELIVERY_PLAN_READY.

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

// The fourteen House P0 findings; each must have a Package 2 delivery destination
// in the House delivery-slice chapter (V10-13).
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

const VALID_FUTURE_GATES = new Set(['V11-G1', 'V11-G2', 'V12-G1', 'V12-G2', 'EXEC-MCG']);

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok) => conditions.push({ n, title, satisfied: !!ok });

  const affiliationOutcomes = byKind(ctx, 'REG-1001', 'AFFILIATION_OUTCOME');
  const implWorkPackages = byKind(ctx, 'REG-1001', 'IMPLEMENTATION_WORK_PACKAGE');
  const technicalSlices = byKind(ctx, 'REG-1001', 'TECHNICAL_DELIVERY_SLICE');
  const experienceSlices = byKind(ctx, 'REG-1001', 'EXPERIENCE_DELIVERY_SLICE');
  const migrationSlices = byKind(ctx, 'REG-1001', 'MIGRATION_DELIVERY_SLICE');
  const controlSlices = byKind(ctx, 'REG-1001', 'CONTROL_ENABLEMENT_SLICE');
  const integrationSlices = byKind(ctx, 'REG-1001', 'INTEGRATION_DELIVERY_SLICE');
  const p0Destinations = byKind(ctx, 'REG-1001', 'HOUSE_P0_DELIVERY_DESTINATION');

  const environmentReqs = byKind(ctx, 'REG-1002', 'ENVIRONMENT_ENABLEMENT_REQUIREMENT');
  const testEnablementReqs = byKind(ctx, 'REG-1002', 'TEST_ENABLEMENT_REQUIREMENT');
  const releaseCandidateReqs = byKind(ctx, 'REG-1002', 'RELEASE_CANDIDATE_REQUIREMENT');

  const backlog = records(ctx, 'REG-1004');
  const costEstimates = backlog.filter((b) => b.kind === 'COST_ESTIMATE');
  const approvals = records(ctx, 'REG-1005');

  const allRegisterRecords = ['REG-1001', 'REG-1002', 'REG-1003', 'REG-1004', 'REG-1005'].flatMap((r) => records(ctx, r));
  const foundationRecords = ['REG-1001', 'REG-1002', 'REG-1003', 'REG-1004'].flatMap((r) => records(ctx, r));
  const planningRecords = ['REG-1001', 'REG-1002'].flatMap((r) => records(ctx, r));

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;

  const allNotImplemented = foundationRecords.every((r) => r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');
  const noneAuthorizesImplementation = allRegisterRecords.every((r) => r.authorizes_implementation === false);

  // Package 1 freeze remains present and unchanged (frozen approval still ratified).
  const package1Frozen = approvals.some((a) => a.artifact_id === 'PACKAGE-10-1' && a.approval_state === 'ratified' && a.frozen === true);

  const iwpComplete = implWorkPackages.length > 0 && implWorkPackages.every((w) =>
    w.objective && w.scope && w.excluded_scope && (w.dependencies ?? []).length > 0 && (w.deliverables ?? []).length > 0 &&
    w.definition_of_ready && w.definition_of_done && w.implementation_evidence && w.evidence_obligations &&
    w.operational_proof_destination && w.test_enablement_destination);

  // Condition 35: genuine authoring / closure-and-freeze / pre-merge provenance
  // binding separation for Package 2, mirroring the Gate V10-G1 provenance check.
  const closureApproval = approvals.some((a) => a.artifact_id === 'V10-C' && a.approval_state === 'ratified' && a.closure_record === true);
  const freezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-10-2' && a.approval_state === 'ratified' && a.frozen === true);
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V10-G2' && a.approval_state === 'ratified');
  const closureRecord = approvals.find((a) => a.artifact_id === 'V10-C' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-10-2' && a.approval_state === 'ratified');
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

  add(1, 'Package 1 lineage, V10-B, and V10-B-1 are inherited', bodyMentions(ctx, 'V10-11', 'central-registration-volume-9-v1.0.0') && bodyMentions(ctx, 'V10-11', 'V10-B') && bodyMentions(ctx, 'V10-11', 'V10-B-1'));
  add(2, 'Package 1 remains frozen and unchanged', package1Frozen);
  add(3, 'Club affiliation remains the first implementation vertical', bodyMentions(ctx, 'V10-11', 'club affiliation is the first implementation vertical'));
  add(4, 'The full affiliation lifecycle has delivery destinations', affiliationOutcomes.length >= 1 && bodyMentions(ctx, 'V10-11', 'Requirement, evidence, completeness, submission, review, return, resubmission, decision, reconciliation, activation, standing, and expiry'));
  add(5, 'House and Button responsibilities remain distinct', bodyMentions(ctx, 'V10-11', 'House responsibility is distinct from Button responsibility'));
  add(6, 'External providers retain no institutional decision authority', bodyMentions(ctx, 'V10-11', 'A provider acknowledgement is not a Curling Canada determination') && integrationSlices.length >= 1 && integrationSlices.every((s) => s.institutional_authority));
  add(7, 'Every material inherited requirement maps to a work package or governed disposition', bodyMentions(ctx, 'V10-12', 'either to an implementation work package or to a governed disposition') && implWorkPackages.length >= 1);
  add(8, 'Work packages define scope, exclusions, dependencies, deliverables, readiness, completion, and evidence', iwpComplete);
  add(9, 'House domain, application, persistence, and infrastructure slices are represented', hasChapter(ctx, 'V10-13') && technicalSlices.length >= 1);
  add(10, 'Button experience and staff-workbench slices are represented', hasChapter(ctx, 'V10-14') && bodyMentions(ctx, 'V10-14', 'workbench') && experienceSlices.length >= 1);
  add(11, 'Actor, organization, jurisdiction, authority, delegation, assignment, and service-identity boundaries are represented', bodyMentions(ctx, 'V10-16', 'Actor, organization, jurisdiction, authority, delegation, assignment, and service-identity boundaries'));
  add(12, 'Requirement, evidence, completeness, submission, review, return, resubmission, decision, reconciliation, activation, standing, and expiry are represented', bodyMentions(ctx, 'V10-11', 'Requirement, evidence, completeness, submission, review, return, resubmission, decision, reconciliation, activation, standing, and expiry'));
  add(13, 'Database-integrity and PostgreSQL-behaviour evidence destinations are defined', bodyMentions(ctx, 'V10-13', 'Database-integrity and PostgreSQL-behaviour evidence destinations are defined'));
  add(14, 'Exactly-once activation remains a business invariant rather than a transport claim', bodyMentions(ctx, 'V10-13', 'Exactly-once activation is a business invariant and is not a transport claim'));
  add(15, 'API, query, event, outbox, webhook, provider, file, batch, and exchange implementation destinations are defined', bodyMentions(ctx, 'V10-17', 'API, query, event, outbox, webhook, provider, file, batch, and exchange implementation destinations are defined') && integrationSlices.length >= 1);
  add(16, 'Provider requirements remain distinct from provider selection or engagement', bodyMentions(ctx, 'V10-17', 'A provider requirement is not a provider selection and is not a provider engagement'));
  add(17, 'Migration planning preserves provenance, uncertainty, quarantine, coexistence, reconciliation, rollback, and acceptance distinctions', migrationSlices.length >= 1 && bodyMentions(ctx, 'V10-15', 'quarantine') && bodyMentions(ctx, 'V10-15', 'reconciliation') && bodyMentions(ctx, 'V10-15', 'coexistence') && bodyMentions(ctx, 'V10-15', 'rollback'));
  add(18, 'Identity resolution remains distinct from migration mapping', bodyMentions(ctx, 'V10-15', 'Mapping completed is not identity resolved'));
  add(19, 'Security, privacy, records, accessibility, bilingual, data, financial, and audit obligations are embedded', bodyMentions(ctx, 'V10-16', 'Security, privacy, records, accessibility, bilingual, data, financial, and audit obligations are embedded') && controlSlices.length >= 1);
  add(20, 'Environment and test-enablement requirements trace to Volume 9', bodyMentions(ctx, 'V10-18', 'central-registration-volume-9-v1.0.0') && environmentReqs.length >= 1 && testEnablementReqs.length >= 1);
  add(21, 'Environment planning remains distinct from provisioning and qualification', bodyMentions(ctx, 'V10-18', 'Environment definition is not provisioning and is not qualification') && environmentReqs.every((e) => e.provisioning_status === 'NOT_AUTHORIZED'));
  add(22, 'Test-enablement planning remains distinct from executable tests and execution', bodyMentions(ctx, 'V10-18', 'Test-enablement planning is not an executable test and does not execute any test'));
  add(23, 'Estimates identify basis, range, confidence, assumptions, dependencies, and approval status', costEstimates.length >= 1 && costEstimates.every((e) => e.estimate_basis && e.range && e.confidence && e.assumptions && (e.dependencies ?? []).length > 0 && e.approval_status));
  add(24, 'Estimates remain distinct from budgets, quotes, procurements, and contracts', bodyMentions(ctx, 'V10-19', 'An estimate is not a budget, a quote, a procurement, or a contract') && costEstimates.every((e) => e.estimate_status === 'PLANNING_ESTIMATE'));
  add(25, 'Capability requirements remain distinct from staffing assignments or engagements', bodyMentions(ctx, 'V10-19', 'A capability requirement is not a staffing assignment and is not an engagement'));
  add(26, 'Release units identify required evidence, rollback dependencies, acceptance authority, and future gates', releaseCandidateReqs.length >= 1 && releaseCandidateReqs.every((r) => r.required_test_evidence && r.rollback_dependency && r.acceptance_authority && r.release_gate));
  add(27, 'Release units remain distinct from accepted releases and deployments', bodyMentions(ctx, 'V10-20', 'A release candidate is not an accepted release and is not a deployment'));
  add(28, 'House P0 findings have implementation, test-enablement, operational-proof, and release-evidence destinations', HOUSE_P0_FINDINGS.every((f) => bodyMentions(ctx, 'V10-13', f)) && p0Destinations.length === HOUSE_P0_FINDINGS.length && p0Destinations.every((d) => d.implementation_evidence && d.test_enablement_destination && d.operational_proof_destination && d.proof_destination));
  add(29, 'Every unresolved item has an owner, required evidence, and valid future gate', backlog.length > 0 && backlog.every((b) => b.owner && b.required_action_or_evidence && VALID_FUTURE_GATES.has(b.future_blocking_gate)));
  add(30, 'Deterministic Package 2 analysis completes without blocking defects', structuralErrors === 0);
  add(31, 'No runtime code, executable tests, environment, dataset, identity, credential, secret, provider integration, migration, or infrastructure is created', leakageErrors === 0 && allNotImplemented);
  add(32, 'No procurement, expenditure, staff assignment, provider engagement, provisioning, test execution, pilot, rollout, deployment, release, or launch is authorized', allNotImplemented && noneAuthorizesImplementation);
  add(33, 'No estimate, target date, resource model, implementation-readiness state, or release-candidate state is represented as approved without evidence', planningRecords.every((r) => r.planning_status === 'DOCUMENTARY_PLAN_ONLY' && r.commitment_status === 'NOT_COMMITTED') && costEstimates.every((e) => e.estimate_status === 'PLANNING_ESTIMATE' && e.approval_status !== 'APPROVED') && releaseCandidateReqs.every((r) => r.commitment_status !== 'COMMITTED'));
  add(34, 'No record authorizes implementation', noneAuthorizesImplementation);
  add(35, 'Genuine authoring, closure/freeze, and pre-merge provenance-binding separation is preserved', closureApproval && freezeApproval && gateBindingsResolved);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V10_G2_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V10-G2'));
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
    gate: 'V10-G2',
    disposition_target: 'AFFILIATION_IMPLEMENTATION_AND_TECHNICAL_DELIVERY_PLAN_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v10-g2-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V10-G2 readiness', run);
}
