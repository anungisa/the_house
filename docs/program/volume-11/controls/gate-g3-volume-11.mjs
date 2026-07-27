// Control: Gate V11-G3 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the forty-three Gate V11-G3 conditions from the Volume 11 Package 3
// directive against the source-controlled corpus. Each condition is satisfied only by
// concrete corpus evidence; an unsatisfied condition is an ERROR. This control reports
// readiness; it never itself disposes the gate. The gate is dispositioned only by a
// ratified REG-1105 approval carrying GATE-V11-G3 and the disposition
// OPERATIONS_MIGRATION_ADOPTION_SUPPORT_CONTINUITY_AND_OPERATIONAL_ASSURANCE_DEFINITION_COMPLETE.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, completedGates, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-11.mjs';
import { run as runAffiliation } from './foundation-affiliation-volume-11.mjs';
import { run as runFinalClosure, COVERAGE_KINDS, REQUIREMENT_KINDS } from './final-closure-volume-11.mjs';
import { isPlaceholder } from './provenance-integrity-volume-11.mjs';

// The commit that authored Volume 11 Package 2 amendment V11-D-1; its preservation in
// the Package 3 closure record demonstrates unbroken provenance lineage.
const V11_D1_AUTHORING_COMMIT = '94f91a5d810c59a9fe5bcd3f7ef4fd8e5f10893d';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}
const norm = (s) => (s ?? '').replace(/\s+/g, ' ');
function bodyMentions(ctx, id, needle) {
  const ch = ctx.chapters.find((c) => c.fileId === id);
  return ch ? norm(ch.body).includes(norm(needle)) : false;
}
function allMention(ctx, id, needles) {
  return needles.every((n) => bodyMentions(ctx, id, n));
}
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
function everyHas(rows, fields) {
  return rows.length >= 1 && rows.every((r) => fields.every((f) => nonEmpty(r[f])));
}

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok) => conditions.push({ n, title, satisfied: !!ok });

  const backlog = records(ctx, 'REG-1104');
  const approvals = records(ctx, 'REG-1105');

  const controlledRecords = ['REG-1101', 'REG-1102', 'REG-1103', 'REG-1104'].flatMap((r) => records(ctx, r));
  const allRegisterRecords = ['REG-1101', 'REG-1102', 'REG-1103', 'REG-1104', 'REG-1105'].flatMap((r) => records(ctx, r));

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;
  const affiliationErrors = summarize(runAffiliation(ctx)).errors;
  const finalClosureErrors = summarize(runFinalClosure(ctx)).errors;

  const allNotImplemented = controlledRecords.every((r) => r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');
  const allNotOperational = controlledRecords.every((r) => r.operational_status === 'NOT_OPERATIONAL_OR_NOT_PROVEN');
  const allNotExecuted = controlledRecords.every((r) => r.execution_status === 'NOT_EXECUTED');
  const noneAuthorizes = allRegisterRecords.every((r) => r.authorizes_implementation === false && r.authorizes_operations === false);

  const done = completedGates(ctx);
  const backlogHasOwnerEvidenceGate = backlog.length >= 1 && backlog.every((b) => nonEmpty(b.owner) && nonEmpty(b.required_action_or_evidence) && nonEmpty(b.future_blocking_gate));
  const noBacklogPointsToCompletedGate = backlog.every((b) => !(b.future_blocking_gate && done.has(b.future_blocking_gate)));

  const coveragePresent = COVERAGE_KINDS.every((k) => byKind(ctx, 'REG-1101', k).length >= 1);
  const requirementsPresent = REQUIREMENT_KINDS.every((k) => byKind(ctx, 'REG-1102', k).length >= 1);

  const iorRecords = byKind(ctx, 'REG-1102', 'INTEGRATED_OPERATIONAL_REQUIREMENT');
  const v12Release = byKind(ctx, 'REG-1102', 'VOLUME_12_RELEASE_EVIDENCE_REQUIREMENT');
  const houseP0 = byKind(ctx, 'REG-1101', 'HOUSE_P0_OPERATIONAL_COVERAGE');
  const v12Handoff = byKind(ctx, 'REG-1101', 'VOLUME_12_HANDOFF_COVERAGE');
  const integratedBaseline = byKind(ctx, 'REG-1101', 'INTEGRATED_OPERATING_BASELINE');

  // Package 1 and Package 2 freeze and lineage.
  const p1FreezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-11-1' && a.approval_state === 'ratified' && a.frozen === true);
  const p2FreezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-11-2' && a.approval_state === 'ratified' && a.frozen === true);

  // Package 3 closure, gate, and freeze artifacts (Commit B).
  const closureApproval = approvals.some((a) => a.artifact_id === 'V11-E' && a.approval_state === 'ratified' && a.closure_record === true);
  const p3FreezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-11-3' && a.approval_state === 'ratified' && a.frozen === true);
  const volumeFreezeApproval = approvals.some((a) => a.artifact_id === 'VOLUME-11' && a.approval_state === 'ratified' && a.frozen === true);
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V11-G3' && a.approval_state === 'ratified');
  const closureRecord = approvals.find((a) => a.artifact_id === 'V11-E' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-11-3' && a.approval_state === 'ratified');
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

  // 1-4: Package 1 and Package 2 lineage inherited and frozen.
  add(1, 'Package 1 lineage and V11-B-1 are inherited', bodyMentions(ctx, 'V11-21', 'central-registration-volume-10-v1.0.0') && bodyMentions(ctx, 'V11-21', 'V11-B-1'));
  add(2, 'Package 1 remains frozen and unchanged', p1FreezeApproval);
  add(3, 'Package 2 lineage and V11-D-1 are inherited', bodyMentions(ctx, 'V11-21', 'V11-D-1'));
  add(4, 'Package 2 remains frozen and unchanged', p2FreezeApproval);

  // 5-6: Integrated baseline consolidation and obligation completeness.
  add(5, 'The integrated baseline consolidates Packages 1 and 2', bodyMentions(ctx, 'V11-21', 'Operating model defined is not operating service') && bodyMentions(ctx, 'V11-21', 'consolidates') && integratedBaseline.length >= 1);
  add(6, 'Every integrated operational requirement carries its full obligation binding', everyHas(iorRecords, ['authoritative_source', 'institutional_purpose', 'institutional_owner', 'operational_owner', 'decision_authority', 'evidence_required', 'independence_requirement', 'acceptance_authority', 'volume_12_destination']));

  // 7: Authority and ownership distinctions.
  add(7, 'Authority and ownership distinctions are preserved', allMention(ctx, 'V11-22', [
    'Service ownership is not institutional decision authority',
    'Technical custody is not data authority is not records authority',
    'Provider custody is not Curling Canada authority',
    'Support access is not mutation authority'
  ]));

  // 8: Service-lifecycle distinctions.
  add(8, 'Service-lifecycle readiness and acceptance distinctions are preserved', allMention(ctx, 'V11-23', [
    'Operationally prepared is not operationally accepted',
    'Operationally accepted is not deployed',
    'Deployed is not stabilized is not operating successfully',
    'Service available is not business obligations completed',
    'Retired service is not data disposed is not records obligations closed'
  ]));

  // 9: Support synthesis distinctions.
  add(9, 'Support, incident, and problem distinctions are preserved', allMention(ctx, 'V11-24', [
    'Support access is not mutation authority is not decision authority',
    'Support request received is not support request resolved',
    'Service request is not incident is not problem'
  ]));

  // 10: Observability distinctions.
  add(10, 'Observability and reconciliation distinctions are preserved', allMention(ctx, 'V11-25', [
    'Telemetry emitted is not signal observed is not alert delivered is not incident declared is not incident handled',
    'Incident resolved is not underlying problem eliminated',
    'Service restored is not business reconciled'
  ]));

  // 11: Continuity synthesis distinctions.
  add(11, 'Continuity and recovery distinctions are preserved', allMention(ctx, 'V11-26', [
    'Backup generated is not backup verified is not backup restorable',
    'Restore completed is not service recovered',
    'Service recovered is not data reconciled'
  ]));

  // 12: Migration synthesis distinctions.
  add(12, 'Migration, cutover, and retirement distinctions are preserved', allMention(ctx, 'V11-27', [
    'Mapping complete is not identity resolved',
    'Rehearsal completed is not migration authorized',
    'Cutover completed is not business accepted',
    'Business accepted is not source retired'
  ]));

  // 13: Data-quality synthesis distinctions.
  add(13, 'Data-quality and reconciliation distinctions are preserved', allMention(ctx, 'V11-28', [
    'Quarantine is not rejection is not correction is not institutional resolution',
    'Acknowledgement is not accounting confirmation is not reconciliation',
    'Projection rebuilt is not authoritative state corrected',
    'Compensation is not history rewrite'
  ]));

  // 14: Training synthesis distinctions.
  add(14, 'Training and adoption distinctions are preserved', allMention(ctx, 'V11-29', [
    'Content authored is not content approved is not training delivered',
    'Training delivered is not competence demonstrated',
    'Account created is not authority established',
    'Onboarding completed is not sustained adoption'
  ]));

  // 15: Provider synthesis distinctions.
  add(15, 'Provider-operations distinctions are preserved', allMention(ctx, 'V11-30', [
    'Provider custody is not Curling Canada authority',
    'Provider certification is not operational assurance',
    'Provider availability is not end-to-end service availability'
  ]));

  // 16: All consolidated coverage areas present.
  add(16, 'All twelve consolidated coverage areas are present', coveragePresent);

  // 17-27: Each operational and acceptance requirement kind present.
  REQUIREMENT_KINDS.forEach((k, i) => {
    add(17 + i, `Requirement kind ${k} is present`, byKind(ctx, 'REG-1102', k).length >= 1);
  });
  // (indices 17..28 consumed by the twelve requirement kinds)

  // 28: Volume 12 release-evidence requirement binds every evidence dimension.
  add(28, 'Volume 12 release-evidence requirements bind every evidence dimension', everyHas(v12Release, ['evidence_binds_environment', 'evidence_binds_config', 'evidence_binds_version', 'evidence_binds_identity', 'evidence_binds_org', 'evidence_binds_jurisdiction', 'evidence_binds_data_classification', 'evidence_binds_provider_state', 'evidence_binds_time']));

  // 29: Volume 12 handoff destinations and House P0 destinations recorded.
  add(29, 'Volume 12 handoff destinations and House P0 destinations are recorded', bodyMentions(ctx, 'V11-31', 'Volume 12') && bodyMentions(ctx, 'V11-31', 'House P0 findings have operational-proof and release-evidence destinations') && v12Handoff.length >= 1 && houseP0.length >= 1 && houseP0.every((r) => nonEmpty(r.house_p0_destination)));

  // 30: Volume 12 assessment discipline recorded.
  add(30, 'Volume 12 may assess but may not infer missing evidence', bodyMentions(ctx, 'V11-31', 'Volume 12 may assess evidence but may not infer missing evidence'));

  // 31-33: Closure assessment distinctions.
  add(31, 'Definition completeness is not operational readiness', bodyMentions(ctx, 'V11-32', 'Definition completeness is not operational readiness'));
  add(32, 'Documentary approval is not operational proof', bodyMentions(ctx, 'V11-32', 'Documentary approval is not operational proof'));
  add(33, 'Volume 11 closure is not release acceptance', bodyMentions(ctx, 'V11-32', 'Volume 11 closure is not release acceptance'));

  // 34: Deterministic Package 3 analysis without blocking defects.
  add(34, 'Deterministic Package 3 analysis completes without blocking defects', structuralErrors === 0 && affiliationErrors === 0 && finalClosureErrors === 0);

  // 35: Backlog discipline.
  add(35, 'Every unresolved item has an owner, required evidence, and valid future gate that is not a completed gate', backlogHasOwnerEvidenceGate && noBacklogPointsToCompletedGate);

  // 36: Bounded Volume 12 authorization recorded.
  add(36, 'A bounded Volume 12 authorization is recorded in the closure record', bodyMentions(ctx, 'V11-E', 'AUTHORIZED FOR INTEGRATED GATE'));

  // 37-40: Execution-neutral posture.
  add(37, 'No runtime, environment, tooling, credential, or operational infrastructure is created', leakageErrors === 0 && allNotImplemented);
  add(38, 'No migration, recovery, reconciliation, training, provider, or operational procedure is executed', allNotExecuted);
  add(39, 'No operational-readiness, migration-success, recovery, adoption, provider-assurance, or acceptance claim is made without evidence', allNotOperational);
  add(40, 'No record authorizes implementation or operations', noneAuthorizes);

  // 41: Package 2 provenance lineage preserved.
  add(41, 'The Package 2 amendment authoring commit is preserved in the closure record', bodyMentions(ctx, 'V11-E', V11_D1_AUTHORING_COMMIT));

  // 42: Package 3 and whole-volume freeze ratified.
  add(42, 'Package 3 and the whole of Volume 11 are ratified frozen', p3FreezeApproval && volumeFreezeApproval);

  // 43: Closure, gate, and dual-freeze provenance separation resolved.
  add(43, 'Genuine closure, gate, freeze, and pre-merge provenance-binding separation is preserved', closureApproval && p3FreezeApproval && volumeFreezeApproval && requirementsPresent && gateBindingsResolved);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V11_G3_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V11-G3'));
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
    gate: 'V11-G3',
    disposition_target: 'OPERATIONS_MIGRATION_ADOPTION_SUPPORT_CONTINUITY_AND_OPERATIONAL_ASSURANCE_DEFINITION_COMPLETE',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v11-g3-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V11-G3 readiness', run);
}
