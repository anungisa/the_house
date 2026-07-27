// Control: Gate V11-G1 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the thirty-three Gate V11-G1 conditions from the Volume 11 Package 1
// directive against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-1105 approval carrying GATE-V11-G1 and the disposition
// OPERATIONS_MIGRATION_ADOPTION_AND_ASSURANCE_GOVERNANCE_FOUNDATION_READY.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, completedGates, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-11.mjs';
import { isPlaceholder } from './provenance-integrity-volume-11.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}
function hasChapter(ctx, id) {
  return ctx.chapters.some((c) => c.fileId === id);
}
const norm = (s) => (s ?? '').replace(/\s+/g, ' ');
function bodyMentions(ctx, id, needle) {
  const ch = ctx.chapters.find((c) => c.fileId === id);
  return ch ? norm(ch.body).includes(norm(needle)) : false;
}
function allMention(ctx, id, needles) {
  return needles.every((n) => bodyMentions(ctx, id, n));
}

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok) => conditions.push({ n, title, satisfied: !!ok });

  const services = byKind(ctx, 'REG-1101', 'SERVICE');
  const capabilities = byKind(ctx, 'REG-1101', 'CAPABILITY');
  const owners = byKind(ctx, 'REG-1101', 'OWNER');
  const operatingStates = byKind(ctx, 'REG-1101', 'OPERATING_STATE');
  const supportClasses = byKind(ctx, 'REG-1101', 'SUPPORT_CLASS');
  const providers = byKind(ctx, 'REG-1101', 'PROVIDER');
  const signals = byKind(ctx, 'REG-1102', 'OBSERVABILITY_SIGNAL');
  const continuity = byKind(ctx, 'REG-1102', 'CONTINUITY_SCENARIO');
  const backups = byKind(ctx, 'REG-1102', 'BACKUP_REQUIREMENT');
  const restores = byKind(ctx, 'REG-1102', 'RESTORE_REQUIREMENT');
  const recoveries = byKind(ctx, 'REG-1102', 'RECOVERY_REQUIREMENT');
  const migrationStages = byKind(ctx, 'REG-1102', 'MIGRATION_STAGE');
  const trainingAudiences = byKind(ctx, 'REG-1102', 'TRAINING_AUDIENCE');
  const adoptionMeasures = byKind(ctx, 'REG-1102', 'ADOPTION_MEASURE');
  const evidenceReqs = byKind(ctx, 'REG-1102', 'EVIDENCE_REQUIREMENT');
  const acceptance = byKind(ctx, 'REG-1102', 'ACCEPTANCE_CRITERION');
  const handoffs = byKind(ctx, 'REG-1102', 'HANDOFF');
  const decisions = records(ctx, 'REG-1103');
  const backlog = records(ctx, 'REG-1104');
  const approvals = records(ctx, 'REG-1105');

  const materialCaps = [...services, ...capabilities].filter((r) => r.material_service_capability === true);
  const controlledRecords = ['REG-1101', 'REG-1102', 'REG-1103', 'REG-1104'].flatMap((r) => records(ctx, r));
  const allRegisterRecords = ['REG-1101', 'REG-1102', 'REG-1103', 'REG-1104', 'REG-1105'].flatMap((r) => records(ctx, r));

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;

  const allNotImplemented = controlledRecords.every((r) => r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');
  const allNotOperational = controlledRecords.every((r) => r.operational_status === 'NOT_OPERATIONAL_OR_NOT_PROVEN');
  const allNotExecuted = controlledRecords.every((r) => r.execution_status === 'NOT_EXECUTED');
  const noneAuthorizes = allRegisterRecords.every((r) => r.authorizes_implementation === false && r.authorizes_operations === false);

  const done = completedGates(ctx);
  const noBacklogPointsToCompletedGate = backlog.every((b) => !(b.future_blocking_gate && done.has(b.future_blocking_gate)));

  const closureApproval = approvals.some((a) => a.artifact_id === 'V11-A' && a.approval_state === 'ratified' && a.closure_record === true);
  const freezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-11-1' && a.approval_state === 'ratified' && a.frozen === true);
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V11-G1' && a.approval_state === 'ratified');
  const closureRecord = approvals.find((a) => a.artifact_id === 'V11-A' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-11-1' && a.approval_state === 'ratified');
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

  add(1, 'Released Volume 10 provenance inherited', bodyMentions(ctx, 'V11-00', 'central-registration-volume-10-v1.0.0'));
  add(2, 'Operational definition held distinct from operational execution', bodyMentions(ctx, 'V11-00', 'Operational definition is distinct from operational execution') && decisions.some((d) => d.id === 'ADR-V11-001'));
  add(3, 'Service ownership held distinct from institutional authority', hasChapter(ctx, 'V11-01') && bodyMentions(ctx, 'V11-01', 'Service ownership is distinct from institutional authority'));
  add(4, 'Every material service capability has an operational owner or a governed ownership gap', materialCaps.length >= 1 && materialCaps.every((r) => (r.operational_owner && r.operational_owner.trim()) || (r.governed_ownership_gap && r.governed_ownership_gap.trim())));
  add(5, 'Decision rights, escalation, and evidence control defined', bodyMentions(ctx, 'V11-01', 'decision rights') && bodyMentions(ctx, 'V11-01', 'escalation') && owners.length >= 1 && owners.every((o) => o.decision_rights && o.escalation_route));
  add(6, 'Prepared, accepted, deployed, stabilizing, and operating held distinct', hasChapter(ctx, 'V11-02') && allMention(ctx, 'V11-02', ['Operationally prepared is distinct from operationally accepted', 'Deployed is distinct from stabilizing', 'Stabilizing is distinct from operating']) && operatingStates.length >= 1);
  add(7, 'Degraded, suspended, recovering, and retired states controlled', allMention(ctx, 'V11-02', ['degraded', 'suspended', 'recovering', 'retired']));
  add(8, 'Request, incident, problem, workaround, defect, and obligation-closure held distinct', hasChapter(ctx, 'V11-03') && allMention(ctx, 'V11-03', ['request', 'incident', 'problem', 'workaround', 'defect', 'obligation closure']) && supportClasses.length >= 1);
  add(9, 'Support access held distinct from mutation and institutional authority', bodyMentions(ctx, 'V11-03', 'Support access is distinct from mutation and from institutional authority'));
  add(10, 'Observability identifies signal, context, sensitivity, owner, alert dependency, and evidence', signals.length >= 1 && signals.every((s) => s.signal_context && s.signal_sensitivity && s.signal_owner && s.alert_dependency && s.evidence_binding));
  add(11, 'Telemetry, alerting, detection, response, recovery, and reconciliation held distinct', hasChapter(ctx, 'V11-04') && allMention(ctx, 'V11-04', ['telemetry', 'alerting', 'detection', 'response', 'recovery', 'reconciliation']));
  add(12, 'Continuity scenarios define preserved work, prohibited actions, degraded mode, fallback, recovery, and evidence', continuity.length >= 1 && continuity.every((c) => c.preserved_work && c.prohibited_action && c.degraded_mode && c.fallback_procedure && c.recovery_procedure));
  add(13, 'Backup completion held distinct from verification and restoration', bodyMentions(ctx, 'V11-05', 'Backup completed is not backup verified is not backup restorable') && backups.length >= 1 && backups.every((b) => b.backup_completion_definition && b.backup_verification_definition));
  add(14, 'Restoration held distinct from recovery and reconciliation', bodyMentions(ctx, 'V11-05', 'Restoration is not recovery and is not reconciliation') && restores.length >= 1 && recoveries.length >= 1);
  add(15, 'Migration stages preserve source authority, provenance, uncertainty, identity candidates, quarantine, rehearsal, cutover, acceptance, rollback, and retirement', migrationStages.length >= 1 && migrationStages.every((m) => m.source_authority_preservation && m.provenance_preservation && m.uncertainty_preservation && m.identity_candidate_treatment && m.quarantine_treatment && m.rehearsal_boundary && m.cutover_boundary && m.acceptance_boundary && m.rollback_definition && m.source_retirement_boundary));
  add(16, 'Mapping held distinct from identity resolution', bodyMentions(ctx, 'V11-06', 'Mapping complete is not identity resolved'));
  add(17, 'Rehearsal held distinct from migration authorization', bodyMentions(ctx, 'V11-06', 'Rehearsal is not migration authorization'));
  add(18, 'Cutover held distinct from acceptance and source retirement', bodyMentions(ctx, 'V11-06', 'Cutover is not acceptance and is not source retirement'));
  add(19, 'Training content, delivery, competence, onboarding, and sustained adoption held distinct', hasChapter(ctx, 'V11-07') && allMention(ctx, 'V11-07', ['content', 'delivery', 'competence', 'onboarding', 'sustained adoption']) && trainingAudiences.length >= 1 && adoptionMeasures.length >= 1);
  add(20, 'Accessibility and bilingual obligations apply to training, support, communications, and procedures', bodyMentions(ctx, 'V11-07', 'accessibility') && bodyMentions(ctx, 'V11-07', 'bilingual') && bodyMentions(ctx, 'V11-07', 'training, support, communications, and procedures'));
  add(21, 'Provider operations include incident, continuity, return, deletion, residual, substitution, reconciliation, and exit', hasChapter(ctx, 'V11-08') && allMention(ctx, 'V11-08', ['incident', 'continuity', 'return', 'deletion', 'residual', 'substitution', 'reconciliation', 'exit']) && providers.length >= 1);
  add(22, 'Provider certification held distinct from end-to-end assurance', bodyMentions(ctx, 'V11-08', 'Provider certification is not end-to-end assurance') && providers.every((p) => p.provider_certification_boundary && p.end_to_end_assurance_boundary));
  add(23, 'Operational evidence binds environment, configuration, version, identity, organization, jurisdiction, data classification, provider state, and time', evidenceReqs.length >= 1 && evidenceReqs.every((e) => e.evidence_binds_environment && e.evidence_binds_config && e.evidence_binds_version && e.evidence_binds_identity && e.evidence_binds_org && e.evidence_binds_jurisdiction && e.evidence_binds_data_classification && e.evidence_binds_provider_state && e.evidence_binds_time));
  add(24, 'Independence and operational-acceptance authorities controlled', hasChapter(ctx, 'V11-09') && bodyMentions(ctx, 'V11-09', 'independence') && acceptance.length >= 1 && acceptance.every((c) => c.independence_requirement && c.acceptance_authority));
  add(25, 'Volume 12 handoff destinations defined', bodyMentions(ctx, 'V11-09', 'Volume 12') && handoffs.length >= 1 && handoffs.every((h) => h.handoff_destination && h.handoff_target_volume));
  add(26, 'Every unresolved item has an owner, evidence, and a valid future gate', backlog.length >= 1 && backlog.every((b) => b.owner && b.required_action_or_evidence && b.future_blocking_gate));
  add(27, 'No active unresolved item points to a completed Volume 11 gate', noBacklogPointsToCompletedGate);
  add(28, 'Deterministic Package 1 analysis completes without blocking defects', structuralErrors === 0);
  add(29, 'No runtime, tooling, environments, credentials, monitoring, queues, migration tooling, training platforms, provider integration, or production operations created', leakageErrors === 0 && allNotImplemented);
  add(30, 'No migration, rehearsal, backup, restore, recovery, training, onboarding, incident, provider, or operational exercise executed', allNotExecuted);
  add(31, 'No readiness, recovery, migration, adoption, provider-assurance, or acceptance claim made without evidence', allNotOperational);
  add(32, 'No record authorizes implementation or operations', noneAuthorizes);
  add(33, 'Genuine authoring, closure-freeze, and pre-merge provenance-binding separation preserved', closureApproval && freezeApproval && gateBindingsResolved);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V11_G1_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V11-G1'));
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
    gate: 'V11-G1',
    disposition_target: 'OPERATIONS_MIGRATION_ADOPTION_AND_ASSURANCE_GOVERNANCE_FOUNDATION_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v11-g1-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V11-G1 readiness', run);
}
