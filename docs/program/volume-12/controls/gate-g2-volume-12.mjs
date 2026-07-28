// Control: Gate V12-G2 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the thirty-nine Gate V12-G2 conditions from the Volume 12 Package 2
// directive against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-1205 approval carrying GATE-V12-G2 and the disposition
// AFFILIATION_EVIDENCE_REQUIREMENTS_AND_ACCEPTANCE_DOSSIER_DEFINITION_READY.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, completedGates, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-12.mjs';
import { isPlaceholder } from './provenance-integrity-volume-12.mjs';
import { P2_EVIDENCE_KINDS, P2_ACCEPTANCE_KINDS } from './foundation-affiliation-volume-12.mjs';

const V12_B1_AUTHORING_COMMIT = '417293ec686aba2cd155888ae0410d282f106fc2';
const V12_B1_MERGE_COMMIT = '9a8629a23b45bfcb83a2006a3177b0b80a098cc4';

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
function hasKind(ctx, regId, kind) {
  return byKind(ctx, regId, kind).length >= 1;
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
function everyHas(list, ...fields) {
  return list.length >= 1 && list.every((r) => fields.every((f) => r[f] !== undefined && String(r[f]).trim() !== ''));
}

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok) => conditions.push({ n, title, satisfied: !!ok });

  const domains = byKind(ctx, 'REG-1201', 'AFFILIATION_EVIDENCE_DOMAIN');
  const acceptanceClasses = byKinds(ctx, 'REG-1201', P2_ACCEPTANCE_KINDS);
  const evidenceReqs = byKinds(ctx, 'REG-1202', P2_EVIDENCE_KINDS);
  const dossiers = byKind(ctx, 'REG-1202', 'ACCEPTANCE_DOSSIER_REQUIREMENT');
  const findings = byKind(ctx, 'REG-1202', 'FINDING');
  const conditionsReg = byKind(ctx, 'REG-1202', 'CONDITION');
  const waivers = byKind(ctx, 'REG-1202', 'WAIVER');
  const commitments = byKind(ctx, 'REG-1202', 'MATERIAL_COMMITMENT');
  const backlog = records(ctx, 'REG-1204');
  const approvals = records(ctx, 'REG-1205');

  const controlledRecords = ['REG-1201', 'REG-1202', 'REG-1203', 'REG-1204'].flatMap((r) => records(ctx, r));
  const allRegisterRecords = ['REG-1201', 'REG-1202', 'REG-1203', 'REG-1204', 'REG-1205'].flatMap((r) => records(ctx, r));

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;

  const allNotImplemented = controlledRecords.every((r) => r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');
  const allNotOperational = controlledRecords.every((r) => r.operational_status === 'NOT_OPERATIONAL_OR_NOT_PROVEN');
  const allNotExecuted = controlledRecords.every((r) => r.execution_status === 'NOT_EXECUTED');
  const allEvidenceNotAccepted = controlledRecords.every((r) => r.evidence_status === 'NOT_AVAILABLE_OR_NOT_ACCEPTED');
  const allNotAccepted = controlledRecords.every((r) => r.acceptance_status === 'NOT_ACCEPTED');
  const allNotReleased = controlledRecords.every((r) => r.release_status === 'NOT_AUTHORIZED');
  const noneAuthorizes = allRegisterRecords.every((r) => r.authorizes_implementation === false && r.authorizes_operations === false && r.authorizes_release === false);

  const done = completedGates(ctx);
  const noBacklogPointsToCompletedGate = backlog.every((b) => !(b.future_blocking_gate && done.has(b.future_blocking_gate)));

  const domainWellFormed = domains.length >= 12 && domains.every((d) => d.authoritative_requirement && d.institutional_invariant && d.acceptance_authority && (d.dossier_destination || d.governed_documentary_disposition));

  const packageFrozenP1 = approvals.some((a) => a.artifact_id === 'PACKAGE-12-1' && a.approval_state === 'ratified' && a.frozen === true);

  const closureApproval = approvals.some((a) => a.artifact_id === 'V12-C' && a.approval_state === 'ratified' && a.closure_record === true);
  const freezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-12-2' && a.approval_state === 'ratified' && a.frozen === true);
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V12-G2' && a.approval_state === 'ratified');
  const closureRecord = approvals.find((a) => a.artifact_id === 'V12-C' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-12-2' && a.approval_state === 'ratified');
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

  add(1, 'Package 1, V12-B, and V12-B-1 lineage inherited', bodyMentions(ctx, 'V12-11', 'central-registration-volume-11-v1.0.0') && bodyMentions(ctx, 'V12-11', 'V12-B-1'));
  add(2, 'Full V12-B-1 authoring and merge commits preserved', bodyMentions(ctx, 'V12-11', V12_B1_AUTHORING_COMMIT) && bodyMentions(ctx, 'V12-11', V12_B1_MERGE_COMMIT));
  add(3, 'Package 1 remains frozen', packageFrozenP1);
  add(4, 'Club affiliation is the first evidence-definition vertical', bodyMentions(ctx, 'V12-11', 'Club affiliation is the first evidence-definition vertical'));
  add(5, 'Every affiliation evidence domain is fully specified with a documentary disposition', domainWellFormed);
  add(6, 'Evidence-domain coverage is distinct from evidence availability and acceptance', bodyMentions(ctx, 'V12-11', 'Evidence-domain coverage complete is not evidence available is not evidence accepted'));
  add(7, 'Every affiliation evidence requirement binds an authoritative source and destination', evidenceReqs.length >= 23 && everyHas(evidenceReqs, 'domain', 'required_evidence_classes', 'minimum_provenance', 'acceptance_authority', 'final_dossier_destination', 'affected_requirement'));
  add(8, 'Implementation, build, database, environment, and deployment-path evidence defined', hasKind(ctx, 'REG-1202', 'IMPLEMENTATION_EVIDENCE_REQUIREMENT') && hasKind(ctx, 'REG-1202', 'BUILD_PROVENANCE_EVIDENCE_REQUIREMENT') && hasKind(ctx, 'REG-1202', 'DATABASE_BEHAVIOUR_EVIDENCE_REQUIREMENT') && hasKind(ctx, 'REG-1202', 'ENVIRONMENT_QUALIFICATION_EVIDENCE_REQUIREMENT') && hasKind(ctx, 'REG-1202', 'DEPLOYMENT_PATH_EVIDENCE_REQUIREMENT'));
  add(9, 'Schema inspection remains distinct from proven database behaviour', bodyMentions(ctx, 'V12-12', 'Schema exists is not database invariant proven'));
  add(10, 'Authorization and isolation-denial evidence defined', hasKind(ctx, 'REG-1202', 'AUTHORIZATION_EVIDENCE_REQUIREMENT') && hasChapter(ctx, 'V12-13'));
  add(11, 'Cross-organization and cross-jurisdiction denial required', bodyMentions(ctx, 'V12-13', 'Cross-organization denial') && bodyMentions(ctx, 'V12-13', 'Cross-jurisdiction denial'));
  add(12, 'Security, privacy, records, and audit evidence defined with their limits', hasKind(ctx, 'REG-1202', 'SECURITY_EVIDENCE_REQUIREMENT') && hasKind(ctx, 'REG-1202', 'PRIVACY_RECORDS_EVIDENCE_REQUIREMENT') && bodyMentions(ctx, 'V12-13', 'Security evidence is not privacy compliance is not legal compliance') && bodyMentions(ctx, 'V12-13', 'Audit record exists is not audit completeness is not institutional acceptance'));
  add(13, 'Functional evidence covers the full behavioural path surface', allMention(ctx, 'V12-14', ['positive, negative, denied, stale, conflict, duplicate, replay, interrupted, degraded, and recovery']));
  add(14, 'Functional, contract, integration, event, and provider evidence defined', hasKind(ctx, 'REG-1202', 'FUNCTIONAL_EVIDENCE_REQUIREMENT') && hasKind(ctx, 'REG-1202', 'CONTRACT_EVIDENCE_REQUIREMENT') && hasKind(ctx, 'REG-1202', 'INTEGRATION_EVIDENCE_REQUIREMENT') && hasKind(ctx, 'REG-1202', 'EVENT_WEBHOOK_EVIDENCE_REQUIREMENT') && hasKind(ctx, 'REG-1202', 'PROVIDER_EVIDENCE_REQUIREMENT'));
  add(15, 'A mocked provider result is not integration or operational evidence', bodyMentions(ctx, 'V12-14', 'Mocked provider result is not provider integration evidence is not operational proof'));
  add(16, 'Data-integrity evidence defined', hasKind(ctx, 'REG-1202', 'DATA_INTEGRITY_EVIDENCE_REQUIREMENT'));
  add(17, 'Provider acknowledgement remains distinct from reconciliation', bodyMentions(ctx, 'V12-15', 'Provider acknowledgement is not accounting confirmation is not reconciliation'));
  add(18, 'Exactly-once activation is a business invariant, not a transport claim', bodyMentions(ctx, 'V12-15', 'Exactly-once activation is a business invariant and not an exactly-once transport claim'));
  add(19, 'Migration and activation-standing evidence defined with their distinctions', hasKind(ctx, 'REG-1202', 'MIGRATION_EVIDENCE_REQUIREMENT') && hasKind(ctx, 'REG-1202', 'ACTIVATION_STANDING_EVIDENCE_REQUIREMENT') && bodyMentions(ctx, 'V12-15', 'Migration executed is not migration accepted is not source retired'));
  add(20, 'Accessibility ladder preserved', hasKind(ctx, 'REG-1202', 'ACCESSIBILITY_EVIDENCE_REQUIREMENT') && bodyMentions(ctx, 'V12-16', 'Automated accessibility scan is not manual inspection is not keyboard completion is not assistive-technology completion is not conformance determination'));
  add(21, 'Bilingual semantic ladder preserved', hasKind(ctx, 'REG-1202', 'BILINGUAL_SEMANTIC_EVIDENCE_REQUIREMENT') && bodyMentions(ctx, 'V12-16', 'English and French strings exist is not translation accuracy is not semantic equivalence is not validated bilingual experience'));
  add(22, 'Operational and recovery evidence defined', hasKind(ctx, 'REG-1202', 'OPERATIONAL_EVIDENCE_REQUIREMENT') && hasKind(ctx, 'REG-1202', 'RECOVERY_EVIDENCE_REQUIREMENT'));
  add(23, 'Training and adoption distinctions preserved', bodyMentions(ctx, 'V12-17', 'Training delivered is not competence demonstrated') && bodyMentions(ctx, 'V12-17', 'Onboarding completed is not sustained adoption'));
  add(24, 'Provider, training, and adoption evidence defined', hasKind(ctx, 'REG-1202', 'PROVIDER_EVIDENCE_REQUIREMENT') && hasKind(ctx, 'REG-1202', 'TRAINING_COMPETENCE_EVIDENCE_REQUIREMENT') && hasKind(ctx, 'REG-1202', 'ADOPTION_EVIDENCE_REQUIREMENT') && bodyMentions(ctx, 'V12-17', 'Provider certification is not end-to-end operational assurance'));
  add(25, 'Findings, conditions, waivers, and commitments controlled', findings.length >= 1 && conditionsReg.length >= 1 && waivers.length >= 1 && commitments.length >= 1 && hasChapter(ctx, 'V12-18'));
  add(26, 'Waivers and conditions do not convert failures to successes', bodyMentions(ctx, 'V12-18', 'Waiver approved is not failed result converted to pass') && bodyMentions(ctx, 'V12-18', 'Conditional acceptance is not unconditional acceptance'));
  add(27, 'Every affiliation acceptance class is fully specified', acceptanceClasses.length >= 11 && everyHas(acceptanceClasses, 'decision_authority', 'reviewer_qualification', 'independence_requirement', 'conditions_permitted', 'dissent_treatment', 'release_effect', 'required_evidence'));
  add(28, 'The acceptance ladder remains distinct at every rung', allMention(ctx, 'V12-19', ['Technical acceptance is not business acceptance', 'Business acceptance is not operational acceptance', 'Operational acceptance is not executive release authorization']));
  add(29, 'Every acceptance dossier is fully specified', dossiers.length >= 12 && everyHas(dossiers, 'dossier_kind', 'contained_sections', 'authoritative_source'));
  add(30, 'Challenge, contradiction, dissent, invalidation, revocation, and reopening controlled', bodyMentions(ctx, 'V12-18', 'challenge, contradiction, dissent, invalidation, revocation, and gate reopening'));
  add(31, 'House P0 findings have evidence and release destinations', bodyMentions(ctx, 'V12-20', 'House P0 findings have evidence and release destinations'));
  add(32, 'Every unresolved item has an owner, required evidence, and a valid future gate', backlog.length >= 1 && backlog.every((b) => b.owner && b.required_action_or_evidence && b.future_blocking_gate));
  add(33, 'No active unresolved item points to a completed Volume 12 gate', noBacklogPointsToCompletedGate);
  add(34, 'Deterministic Package 2 analysis completes without blocking defects', structuralErrors === 0);
  add(35, 'No evidence, assurance, acceptance, gate, or release fabricated', leakageErrors === 0 && allEvidenceNotAccepted && allNotAccepted && allNotReleased && bodyMentions(ctx, 'V12-20', 'No evidence, assurance result, acceptance decision, gate passage, or release authorization is fabricated'));
  add(36, 'No runtime code, tests, environments, identities, migrations, or provider engagement created or executed', leakageErrors === 0 && allNotImplemented && allNotExecuted);
  add(37, 'No procurement, staffing, pilot, rollout, deployment, release, or launch authorized', allNotOperational && allNotReleased);
  add(38, 'No record authorizes implementation, operations, or release', noneAuthorizes);
  add(39, 'Genuine authoring, closure/freeze, and gate-binding separation preserved', closureApproval && freezeApproval && gateBindingsResolved);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V12_G2_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V12-G2'));
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
    gate: 'V12-G2',
    disposition_target: 'AFFILIATION_EVIDENCE_REQUIREMENTS_AND_ACCEPTANCE_DOSSIER_DEFINITION_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v12-g2-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V12-G2 readiness', run);
}
