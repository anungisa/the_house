// Control: Gate V11-G2 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the thirty-five Gate V11-G2 conditions from the Volume 11 Package 2
// directive against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-1105 approval carrying GATE-V11-G2 and the disposition
// AFFILIATION_OPERATING_MODEL_MIGRATION_CONTINUITY_ADOPTION_AND_OPERATIONAL_EVIDENCE_PLAN_READY.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, completedGates, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-11.mjs';
import { run as runAffiliation, OWNERSHIP_DIMENSIONS } from './foundation-affiliation-volume-11.mjs';
import { isPlaceholder } from './provenance-integrity-volume-11.mjs';

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

  const affiliationServices = byKind(ctx, 'REG-1101', 'AFFILIATION_SERVICE');
  const ownerAssignments = byKind(ctx, 'REG-1101', 'AFFILIATION_OWNER_ASSIGNMENT_REQUIREMENT');
  const operatingStates = byKind(ctx, 'REG-1101', 'AFFILIATION_OPERATING_STATE');
  const supportClasses = byKind(ctx, 'REG-1101', 'AFFILIATION_SUPPORT_CLASS');
  const dataQualityOps = byKind(ctx, 'REG-1101', 'DATA_QUALITY_OPERATION');

  const incidentRunbooks = byKind(ctx, 'REG-1102', 'INCIDENT_RUNBOOK');
  const continuityProcedures = byKind(ctx, 'REG-1102', 'CONTINUITY_PROCEDURE');
  const migrationRunbooks = byKind(ctx, 'REG-1102', 'MIGRATION_RUNBOOK');
  const providerRequirements = byKind(ctx, 'REG-1102', 'PROVIDER_OPERATIONAL_REQUIREMENT');
  const evidenceRequirements = byKind(ctx, 'REG-1102', 'OPERATIONAL_EVIDENCE_REQUIREMENT');

  const backlog = records(ctx, 'REG-1104');
  const approvals = records(ctx, 'REG-1105');

  const materialServices = affiliationServices.filter((r) => r.material_service_capability === true);
  const controlledRecords = ['REG-1101', 'REG-1102', 'REG-1103', 'REG-1104'].flatMap((r) => records(ctx, r));
  const allRegisterRecords = ['REG-1101', 'REG-1102', 'REG-1103', 'REG-1104', 'REG-1105'].flatMap((r) => records(ctx, r));

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;
  const affiliationErrors = summarize(runAffiliation(ctx)).errors;

  const allNotImplemented = controlledRecords.every((r) => r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');
  const allNotOperational = controlledRecords.every((r) => r.operational_status === 'NOT_OPERATIONAL_OR_NOT_PROVEN');
  const allNotExecuted = controlledRecords.every((r) => r.execution_status === 'NOT_EXECUTED');
  const noneAuthorizes = allRegisterRecords.every((r) => r.authorizes_implementation === false && r.authorizes_operations === false);

  const done = completedGates(ctx);
  const noBacklogPointsToCompletedGate = backlog.every((b) => !(b.future_blocking_gate && done.has(b.future_blocking_gate)));

  const dims = new Set(ownerAssignments.map((r) => r.ownership_dimension));
  const allDimensions = OWNERSHIP_DIMENSIONS.every((d) => dims.has(d));

  const p1FreezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-11-1' && a.approval_state === 'ratified' && a.frozen === true);
  const closureApproval = approvals.some((a) => a.artifact_id === 'V11-C' && a.approval_state === 'ratified' && a.closure_record === true);
  const freezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-11-2' && a.approval_state === 'ratified' && a.frozen === true);
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V11-G2' && a.approval_state === 'ratified');
  const closureRecord = approvals.find((a) => a.artifact_id === 'V11-C' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-11-2' && a.approval_state === 'ratified');
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

  add(1, 'Package 1 lineage, V11-B, and V11-B-1 are inherited', bodyMentions(ctx, 'V11-11', 'central-registration-volume-10-v1.0.0') && bodyMentions(ctx, 'V11-11', 'V11-B-1'));
  add(2, 'Package 1 remains frozen and unchanged', p1FreezeApproval);
  add(3, 'Club affiliation remains the first operational vertical', bodyMentions(ctx, 'V11-11', 'Club affiliation is the first operational vertical'));
  add(4, 'House institutional authority remains distinct from Button interaction', bodyMentions(ctx, 'V11-11', 'House authority is distinct from Button interaction'));
  add(5, 'Every material affiliation service has an owner or governed owner gap', materialServices.length >= 1 && materialServices.every((r) => nonEmpty(r.operational_owner) || nonEmpty(r.governed_ownership_gap)));
  add(6, 'All twelve ownership dimensions are represented', allDimensions);
  add(7, 'Operating states and transition evidence are defined', operatingStates.length >= 1 && operatingStates.every((r) => nonEmpty(r.required_operational_evidence)));
  add(8, 'Lifecycle states remain distinct', bodyMentions(ctx, 'V11-12', 'Operationally prepared is distinct from operationally accepted') && bodyMentions(ctx, 'V11-12', 'Deployed is distinct from stabilizing') && bodyMentions(ctx, 'V11-12', 'Stabilizing is distinct from operating') && allMention(ctx, 'V11-12', ['degraded', 'suspended', 'recovering', 'retired']));
  add(9, 'Support classes define requester, receiver, authority boundary, sensitivity, escalation, communication, resolution, and closure evidence', everyHas(supportClasses, ['requester', 'receiving_role', 'authority_boundary', 'escalation_route', 'communication_obligation', 'resolution_authority', 'closure_evidence']) && supportClasses.every((r) => nonEmpty(r.sensitivity)));
  add(10, 'Support access remains distinct from mutation and decision authority', bodyMentions(ctx, 'V11-13', 'Support access is distinct from mutation authority and from decision authority'));
  add(11, 'Incident and problem runbooks include signal, triage, containment, recovery, reconciliation, escalation, and evidence', everyHas(incidentRunbooks, ['signal_source', 'triage_criteria', 'containment_action_class', 'recovery_dependency', 'reconciliation_requirement', 'escalation_authority', 'evidence_required']));
  add(12, 'Telemetry, alerting, incident declaration, incident resolution, problem elimination, and reconciliation remain distinct', bodyMentions(ctx, 'V11-14', 'Telemetry emitted is not signal observed') && bodyMentions(ctx, 'V11-14', 'incident declared') && bodyMentions(ctx, 'V11-14', 'Incident resolved is not underlying problem eliminated') && bodyMentions(ctx, 'V11-14', 'Service restored is not business state reconciled'));
  add(13, 'Continuity procedures define preserved work, prohibited actions, degraded posture, fallback, recovery, and evidence', everyHas(continuityProcedures, ['preserved_work', 'prohibited_action', 'degraded_mode', 'fallback_procedure', 'recovery_procedure', 'evidence_required']));
  add(14, 'Backup generation, verification, restoration, recovery, and reconciliation remain distinct', bodyMentions(ctx, 'V11-15', 'Backup generated is not backup verified is not backup restorable') && bodyMentions(ctx, 'V11-15', 'Restore completed is not service recovered') && bodyMentions(ctx, 'V11-15', 'Service recovered is not data reconciled'));
  add(15, 'Migration runbooks preserve source authority, provenance, mapping, uncertainty, identity candidates, quarantine, rehearsal, cutover, acceptance, rollback, and retirement distinctions', everyHas(migrationRunbooks, ['source_authority', 'provenance_capture', 'mapping_dependency', 'uncertainty_treatment', 'quarantine_posture', 'rehearsal_requirement', 'cutover_boundary', 'acceptance_criteria', 'rollback_dependency', 'source_retirement_boundary']));
  add(16, 'Mapping remains distinct from identity resolution', bodyMentions(ctx, 'V11-16', 'Mapping complete is not identity resolved'));
  add(17, 'Rehearsal remains distinct from migration authorization', bodyMentions(ctx, 'V11-16', 'Rehearsal completed is not migration authorized'));
  add(18, 'Cutover remains distinct from business acceptance and source retirement', bodyMentions(ctx, 'V11-16', 'Cutover completed is not business accepted') && bodyMentions(ctx, 'V11-16', 'Business accepted is not source retired'));
  add(19, 'Data-quality and quarantine procedures define owners, permitted actions, prohibited actions, correction, reconciliation, escalation, and closure authority', everyHas(dataQualityOps, ['authoritative_source', 'operational_owner', 'institutional_decision_owner', 'quarantine_status', 'permitted_actions', 'prohibited_actions', 'correction_method_dependency', 'reconciliation_method', 'escalation_route', 'closure_authority']));
  add(20, 'Financial acknowledgement, accounting confirmation, reconciliation, activation, and standing remain distinct', bodyMentions(ctx, 'V11-17', 'Acknowledgement is not reconciliation') && bodyMentions(ctx, 'V11-17', 'Projection rebuilt is not authoritative state corrected'));
  add(21, 'Training content, approval, delivery, competence, onboarding, and sustained adoption remain distinct', bodyMentions(ctx, 'V11-18', 'Content written is not content approved is not training delivered') && bodyMentions(ctx, 'V11-18', 'Training delivered is not competence demonstrated') && bodyMentions(ctx, 'V11-18', 'Onboarding completed is not sustained adoption'));
  add(22, 'Accessibility and bilingual obligations apply to training, support, communications, documents, and operational procedures', bodyMentions(ctx, 'V11-18', 'accessibility') && bodyMentions(ctx, 'V11-18', 'bilingual') && bodyMentions(ctx, 'V11-18', 'training, support, communications, documents, and operational procedures'));
  add(23, 'Provider runbooks cover incidents, continuity, subcontractors, return, deletion evidence, residual copies, backups, substitution, reconciliation, and exit', everyHas(providerRequirements, ['incident_obligation', 'continuity_obligation', 'subcontractor_dependency', 'return_requirement', 'deletion_evidence_requirement', 'residual_copy_posture', 'backup_posture', 'substitution_dependency', 'reconciliation_requirement', 'exit_procedure']));
  add(24, 'Provider certification remains distinct from end-to-end assurance', bodyMentions(ctx, 'V11-19', 'Provider certification is not operational assurance') && bodyMentions(ctx, 'V11-19', 'Provider availability is not end-to-end service availability') && providerRequirements.every((r) => nonEmpty(r.provider_certification_boundary) && nonEmpty(r.end_to_end_assurance_boundary)));
  add(25, 'Operational evidence binds environment, configuration, version, identity, organization, jurisdiction, data, provider state, and time', everyHas(evidenceRequirements, ['evidence_binds_environment', 'evidence_binds_config', 'evidence_binds_version', 'evidence_binds_identity', 'evidence_binds_org', 'evidence_binds_jurisdiction', 'evidence_binds_data_classification', 'evidence_binds_provider_state', 'evidence_binds_time']));
  add(26, 'Volume 12 operational-evidence destinations are defined', bodyMentions(ctx, 'V11-20', 'Volume 12') && evidenceRequirements.length >= 1 && evidenceRequirements.every((r) => nonEmpty(r.volume_12_destination)));
  add(27, 'House P0 findings have operational-proof and release-evidence destinations', bodyMentions(ctx, 'V11-20', 'House P0 findings have operational-proof and release-evidence destinations') && evidenceRequirements.some((r) => nonEmpty(r.house_p0_destination)));
  add(28, 'Every unresolved item has an owner, required evidence, and valid future gate', backlog.length >= 1 && backlog.every((b) => nonEmpty(b.owner) && nonEmpty(b.required_action_or_evidence) && nonEmpty(b.future_blocking_gate)));
  add(29, 'No active unresolved item points to a completed Volume 11 gate', noBacklogPointsToCompletedGate);
  add(30, 'Deterministic Package 2 analysis completes without blocking defects', structuralErrors === 0 && affiliationErrors === 0);
  add(31, 'No runtime code, monitoring, service-desk tooling, support queue, environment, credential, migration tooling, training delivery, provider integration, or operational infrastructure is created', leakageErrors === 0 && allNotImplemented);
  add(32, 'No migration, rehearsal, cutover, reconciliation, backup, restore, recovery, incident, training, onboarding, provider, or operational procedure is executed', allNotExecuted);
  add(33, 'No operational-readiness, recovery, migration-success, adoption, provider-assurance, continuity, or acceptance claim is made without evidence', allNotOperational);
  add(34, 'No record authorizes implementation or operations', noneAuthorizes);
  add(35, 'Genuine authoring, closure/freeze, and pre-merge provenance-binding separation is preserved', closureApproval && freezeApproval && gateBindingsResolved);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V11_G2_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V11-G2'));
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
    gate: 'V11-G2',
    disposition_target: 'AFFILIATION_OPERATING_MODEL_MIGRATION_CONTINUITY_ADOPTION_AND_OPERATIONAL_EVIDENCE_PLAN_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v11-g2-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V11-G2 readiness', run);
}
