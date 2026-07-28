// Control: Gate V12-G3 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the forty-five Gate V12-G3 conditions from the Volume 12 Package 3
// directive against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-1205 approval carrying GATE-V12-G3 and the disposition
// INTEGRATED_FINAL_EVIDENCE_GATE_ACCEPTANCE_AND_CORPUS_RELEASE_DEFINITION_COMPLETE.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, completedGates, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-12.mjs';
import { run as runFinalClosure, COVERAGE_KINDS, REQUIREMENT_KINDS } from './final-closure-volume-12.mjs';
import { isPlaceholder } from './provenance-integrity-volume-12.mjs';

// The commit that authored Volume 12 Package 2 provenance-role classification V12-D-1;
// its preservation in the Package 3 baseline demonstrates unbroken provenance lineage.
const V12_D1_AUTHORING_COMMIT = '4197e54e3f0d57bab7864b69cc03a4f2631caa16';
const V12_D1_MERGE_COMMIT = '3ae246163ae9396ae8e4b89502894e204c9a5b00';

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

  const backlog = records(ctx, 'REG-1204');
  const approvals = records(ctx, 'REG-1205');

  const controlledRecords = ['REG-1201', 'REG-1202', 'REG-1203', 'REG-1204'].flatMap((r) => records(ctx, r));
  const allRegisterRecords = ['REG-1201', 'REG-1202', 'REG-1203', 'REG-1204', 'REG-1205'].flatMap((r) => records(ctx, r));

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;
  const finalClosureErrors = summarize(runFinalClosure(ctx)).errors;

  const allNotImplemented = controlledRecords.every((r) => r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');
  const allNotOperational = controlledRecords.every((r) => r.operational_status === 'NOT_OPERATIONAL_OR_NOT_PROVEN');
  const allNotExecuted = controlledRecords.every((r) => r.execution_status === 'NOT_EXECUTED');
  const allEvidenceNotAccepted = controlledRecords.every((r) => r.evidence_status === 'NOT_AVAILABLE_OR_NOT_ACCEPTED');
  const allNotAccepted = controlledRecords.every((r) => r.acceptance_status === 'NOT_ACCEPTED');
  const allNotReleased = controlledRecords.every((r) => r.release_status === 'NOT_AUTHORIZED');
  const noneAuthorizes = allRegisterRecords.every((r) => r.authorizes_implementation === false && r.authorizes_operations === false && r.authorizes_release === false);

  const done = completedGates(ctx);
  const backlogHasOwnerEvidenceGate = backlog.length >= 1 && backlog.every((b) => b.owner && b.required_action_or_evidence && b.future_blocking_gate);
  const noBacklogPointsToCompletedGate = backlog.every((b) => !(b.future_blocking_gate && done.has(b.future_blocking_gate)));

  const coveragePresent = COVERAGE_KINDS.every((k) => byKind(ctx, 'REG-1201', k).length >= 1);
  const requirementsPresent = REQUIREMENT_KINDS.every((k) => byKind(ctx, 'REG-1202', k).length >= 1);
  const dossierReqs = byKind(ctx, 'REG-1202', 'FINAL_DOSSIER_REQUIREMENT');

  // Package 1 and Package 2 freeze.
  const p1FreezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-12-1' && a.approval_state === 'ratified' && a.frozen === true);
  const p2FreezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-12-2' && a.approval_state === 'ratified' && a.frozen === true);

  // Package 3 closure, gate, and triple-freeze artifacts (Commit B).
  const closureApproval = approvals.some((a) => a.artifact_id === 'V12-E' && a.approval_state === 'ratified' && a.closure_record === true);
  const p3FreezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-12-3' && a.approval_state === 'ratified' && a.frozen === true);
  const volumeFreezeApproval = approvals.some((a) => a.artifact_id === 'VOLUME-12' && a.approval_state === 'ratified' && a.frozen === true);
  const corpusFreezeApproval = approvals.some((a) => a.artifact_id === 'CENTRAL-REGISTRATION-CORPUS' && a.approval_state === 'ratified' && a.frozen === true);
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V12-G3' && a.approval_state === 'ratified');
  const closureRecord = approvals.find((a) => a.artifact_id === 'V12-E' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-12-3' && a.approval_state === 'ratified');
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

  // 1-5: Package 1 and Package 2 lineage inherited and frozen.
  add(1, 'Package 1, V12-B, and V12-B-1 lineage inherited', bodyMentions(ctx, 'V12-21', 'central-registration-volume-11-v1.0.0') && bodyMentions(ctx, 'V12-21', 'V12-B-1'));
  add(2, 'Package 2, V12-D, and V12-D-1 lineage inherited', bodyMentions(ctx, 'V12-21', 'V12-D') && bodyMentions(ctx, 'V12-21', 'V12-D-1'));
  add(3, 'Full V12-D-1 authoring and merge commits preserved', bodyMentions(ctx, 'V12-21', V12_D1_AUTHORING_COMMIT) && bodyMentions(ctx, 'V12-21', V12_D1_MERGE_COMMIT));
  add(4, 'Package 1 remains frozen', p1FreezeApproval);
  add(5, 'Package 2 remains frozen', p2FreezeApproval);

  // 6-8: Integrated final-evidence baseline consolidation.
  add(6, 'The integrated baseline consolidates Packages 1 and 2', bodyMentions(ctx, 'V12-21', 'consolidates') && byKind(ctx, 'REG-1201', 'INTEGRATED_FINAL_EVIDENCE_BASELINE').length >= 1);
  add(7, 'The integrated final-evidence requirement is present', byKind(ctx, 'REG-1202', 'FINAL_EVIDENCE_REQUIREMENT').length >= 1);
  add(8, 'The governing evidence distinction is preserved', bodyMentions(ctx, 'V12-21', 'Evidence requirement defined is not evidence produced is not evidence validated is not evidence accepted'));

  // 9-10: Whole-program traceability.
  add(9, 'The end-to-end requirement-to-gate trace is present', bodyMentions(ctx, 'V12-22', 'Institutional outcome → requirement') && byKind(ctx, 'REG-1201', 'WHOLE_PROGRAM_TRACEABILITY_COVERAGE').length >= 1);
  add(10, 'No missing link may be silently treated as complete', bodyMentions(ctx, 'V12-22', 'No missing link may be silently treated as complete'));

  // 11-15: Program-gate matrix and gate distinctions.
  add(11, 'The program-gate matrix is present', byKind(ctx, 'REG-1201', 'PROGRAM_GATE_MATRIX').length >= 1 && hasChapter(ctx, 'V12-23'));
  add(12, 'Earlier gate passed is not later gate passed', bodyMentions(ctx, 'V12-23', 'Earlier gate passed is not later gate passed'));
  add(13, 'Definition gate is not execution authorization', bodyMentions(ctx, 'V12-23', 'Definition gate is not execution authorization'));
  add(14, 'Evidence-intake gate is not evidence-acceptance gate', bodyMentions(ctx, 'V12-23', 'Evidence-intake gate is not evidence-acceptance gate'));
  add(15, 'Release authorization is not deployment authorization', bodyMentions(ctx, 'V12-23', 'Release authorization is not deployment authorization'));

  // 16-18: Evidence status, sufficiency, acceptance, revalidation ledger.
  add(16, 'The evidence status model is present', byKind(ctx, 'REG-1201', 'EVIDENCE_STATUS_MODEL').length >= 1 && hasChapter(ctx, 'V12-24'));
  add(17, 'The evidence status ladder distinctions are preserved', allMention(ctx, 'V12-24', ['Submitted is not valid', 'Valid is not sufficient', 'Sufficient is not accepted', 'Accepted is not current indefinitely']));
  add(18, 'Sufficiency, acceptance, and revalidation requirements are present', byKind(ctx, 'REG-1202', 'EVIDENCE_SUFFICIENCY_REQUIREMENT').length >= 1 && byKind(ctx, 'REG-1202', 'EVIDENCE_ACCEPTANCE_REQUIREMENT').length >= 1 && byKind(ctx, 'REG-1202', 'EVIDENCE_REVALIDATION_REQUIREMENT').length >= 1);

  // 19-23: Findings, waivers, conditions, commitments, and release-blocker disposition.
  add(19, 'The release-blocker disposition model is present', byKind(ctx, 'REG-1201', 'RELEASE_BLOCKER_MODEL').length >= 1 && hasChapter(ctx, 'V12-25'));
  add(20, 'Waiver approved is not failed result converted to pass', bodyMentions(ctx, 'V12-25', 'Waiver approved is not failed result converted to pass'));
  add(21, 'Expired conditions and unresolved release blockers fail closed', bodyMentions(ctx, 'V12-25', 'Expired conditions and unresolved release blockers fail closed'));
  add(22, 'No active unresolved item may point to a completed Volume 12 gate', bodyMentions(ctx, 'V12-25', 'No active unresolved item may point to a completed Volume 12 gate'));
  add(23, 'Release-blocker and material-commitment requirements are present', byKind(ctx, 'REG-1202', 'RELEASE_BLOCKER_REQUIREMENT').length >= 1 && byKind(ctx, 'REG-1202', 'MATERIAL_COMMITMENT_EVIDENCE_REQUIREMENT').length >= 1);

  // 24-25: Final-dossier composition.
  add(24, 'The final-dossier model and its requirements are present', byKind(ctx, 'REG-1201', 'FINAL_DOSSIER_MODEL').length >= 1 && dossierReqs.length >= 1 && hasChapter(ctx, 'V12-26'));
  add(25, 'Generated summaries remain non-authoritative projections', bodyMentions(ctx, 'V12-26', 'Generated summaries remain non-authoritative projections'));

  // 26-27: Affiliation acceptance synthesis.
  add(26, 'The affiliation acceptance synthesis is present', byKind(ctx, 'REG-1201', 'AFFILIATION_ACCEPTANCE_SYNTHESIS').length >= 1 && hasChapter(ctx, 'V12-27'));
  add(27, 'The affiliation acceptance ladder distinction is preserved', bodyMentions(ctx, 'V12-27', 'Affiliation evidence definition complete is not affiliation evidence available is not affiliation acceptance granted is not affiliation release authorized'));

  // 28-29: Independence, segregation, and challenge.
  add(28, 'The independence and challenge model is present', byKind(ctx, 'REG-1201', 'INDEPENDENCE_AND_CHALLENGE_MODEL').length >= 1 && hasChapter(ctx, 'V12-28'));
  add(29, 'The segregation distinctions are preserved', allMention(ctx, 'V12-28', ['Evidence producer is not evidence reviewer is not acceptance authority', 'Executive sponsor is not independent assurer', 'Prior acceptance is not irrevocable acceptance']));

  // 30-31: Executive decision brief and release-authorization record.
  add(30, 'The executive decision model and its evidence requirement are present', byKind(ctx, 'REG-1201', 'EXECUTIVE_DECISION_MODEL').length >= 1 && byKind(ctx, 'REG-1202', 'EXECUTIVE_DECISION_EVIDENCE_REQUIREMENT').length >= 1 && hasChapter(ctx, 'V12-29'));
  add(31, 'A decision brief is not a decision and no decision is fabricated', bodyMentions(ctx, 'V12-29', 'A decision brief is not a decision') && bodyMentions(ctx, 'V12-29', 'must not populate this model with fabricated'));

  // 32-33: Deployment, stabilization, and post-release obligations.
  add(32, 'The post-release obligation model and its requirements are present', byKind(ctx, 'REG-1201', 'POST_RELEASE_OBLIGATION_MODEL').length >= 1 && byKind(ctx, 'REG-1202', 'DEPLOYMENT_EVIDENCE_REQUIREMENT').length >= 1 && byKind(ctx, 'REG-1202', 'STABILIZATION_EVIDENCE_REQUIREMENT').length >= 1 && hasChapter(ctx, 'V12-30'));
  add(33, 'The post-release distinctions are preserved', allMention(ctx, 'V12-30', ['Release authorized is not deployed', 'Deployed is not functioning correctly', 'Service available is not stabilized', 'Stabilized is not institutional outcomes accepted']));

  // 34-36: Corpus closure and implementation-authorization handoff.
  add(34, 'The corpus-closure and handoff models are present', byKind(ctx, 'REG-1201', 'IMPLEMENTATION_AUTHORIZATION_HANDOFF').length >= 1 && byKind(ctx, 'REG-1201', 'CORPUS_RELEASE_DECISION').length >= 1 && hasChapter(ctx, 'V12-31'));
  add(35, 'The corpus-closure distinctions are preserved', allMention(ctx, 'V12-31', ['Definition corpus complete is not implementation authorized', 'Corpus release is not product release', 'The next action after corpus closure is a separate implementation-authorization decision package, not an implied Volume 13']));
  add(36, 'The implementation-authorization input and corpus-release record requirements are present', byKind(ctx, 'REG-1202', 'IMPLEMENTATION_AUTHORIZATION_INPUT_REQUIREMENT').length >= 1 && byKind(ctx, 'REG-1202', 'CORPUS_RELEASE_RECORD_REQUIREMENT').length >= 1);

  // 37-39: Integrated closure assessment.
  add(37, 'The integrated closure assessment consolidates every Package 3 model', bodyMentions(ctx, 'V12-32', 'consolidates') && hasChapter(ctx, 'V12-32'));
  add(38, 'Documentary corpus release is never represented as software release, acceptance, gate passage, or production authorization', bodyMentions(ctx, 'V12-32', 'a software release, an evidence acceptance, a gate passage beyond the Volume 12 definition gates, or a production authorization') && bodyMentions(ctx, 'V12-32', 'No evidence, assurance conclusion, acceptance decision, gate passage, or system-release authorization is fabricated'));
  add(39, 'House P0 findings have final evidence, acceptance, and release destinations', bodyMentions(ctx, 'V12-32', 'House P0 findings have final evidence, acceptance, and release destinations'));

  // 40-41: Model and requirement completeness.
  add(40, 'All twelve Package 3 model kinds are present', coveragePresent);
  add(41, 'All thirteen Package 3 requirement kinds are present', requirementsPresent);

  // 42: Deterministic Package 3 analysis without blocking defects.
  add(42, 'Deterministic Package 3 analysis completes without blocking defects', structuralErrors === 0 && finalClosureErrors === 0);

  // 43-44: Execution-neutral posture and backlog discipline.
  add(43, 'No evidence, acceptance, release, runtime, or execution is fabricated', leakageErrors === 0 && allNotImplemented && allNotExecuted && allNotOperational && allEvidenceNotAccepted && allNotAccepted && allNotReleased);
  add(44, 'Every unresolved item has an owner, required evidence, and a valid future gate, and no record authorizes implementation, operations, or release', backlogHasOwnerEvidenceGate && noBacklogPointsToCompletedGate && noneAuthorizes);

  // 45: Genuine closure, gate, triple-freeze, and corpus-release separation resolved.
  add(45, 'Genuine closure, gate, package, whole-volume, and whole-corpus freeze separation is preserved', closureApproval && p3FreezeApproval && volumeFreezeApproval && corpusFreezeApproval && requirementsPresent && gateBindingsResolved);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V12_G3_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V12-G3'));
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
    gate: 'V12-G3',
    disposition_target: 'INTEGRATED_FINAL_EVIDENCE_GATE_ACCEPTANCE_AND_CORPUS_RELEASE_DEFINITION_COMPLETE',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v12-g3-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V12-G3 readiness', run);
}
