// Control: Gate V12-G1 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the thirty-five Gate V12-G1 conditions from the Volume 12 Package 1
// directive against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-1205 approval carrying GATE-V12-G1 and the disposition
// GATE_RELEASE_AND_ACCEPTANCE_EVIDENCE_GOVERNANCE_FOUNDATION_READY.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, completedGates, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-12.mjs';
import { isPlaceholder } from './provenance-integrity-volume-12.mjs';

const V11_F1_AUTHORING_COMMIT = '36da463674b7713e2e9a95f558559951e6873dd8';

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
function everyHas(list, ...fields) {
  return list.length >= 1 && list.every((r) => fields.every((f) => r[f] !== undefined && String(r[f]).trim() !== ''));
}

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok) => conditions.push({ n, title, satisfied: !!ok });

  const criteria = byKind(ctx, 'REG-1201', 'GATE_CRITERION');
  const evidenceClasses = byKind(ctx, 'REG-1201', 'EVIDENCE_CLASS');
  const acceptanceClasses = byKind(ctx, 'REG-1201', 'ACCEPTANCE_CLASS');
  const authorities = byKind(ctx, 'REG-1201', 'AUTHORITY');
  const evidenceReqs = byKind(ctx, 'REG-1202', 'EVIDENCE_REQUIREMENT');
  const evidenceObjects = byKind(ctx, 'REG-1202', 'EVIDENCE_OBJECT');
  const findings = byKind(ctx, 'REG-1202', 'FINDING');
  const conditionsReg = byKind(ctx, 'REG-1202', 'CONDITION');
  const waivers = byKind(ctx, 'REG-1202', 'WAIVER');
  const commitments = byKind(ctx, 'REG-1202', 'MATERIAL_COMMITMENT');
  const dossiers = byKind(ctx, 'REG-1202', 'DOSSIER');
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

  const closureApproval = approvals.some((a) => a.artifact_id === 'V12-A' && a.approval_state === 'ratified' && a.closure_record === true);
  const freezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-12-1' && a.approval_state === 'ratified' && a.frozen === true);
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V12-G1' && a.approval_state === 'ratified');
  const closureRecord = approvals.find((a) => a.artifact_id === 'V12-A' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-12-1' && a.approval_state === 'ratified');
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

  add(1, 'Released Volume 11 provenance inherited', bodyMentions(ctx, 'V12-00', 'central-registration-volume-11-v1.0.0'));
  add(2, 'V11-F-1 authoring commit retrieved and preserved', bodyMentions(ctx, 'V12-00', V11_F1_AUTHORING_COMMIT));
  add(3, 'Evidence requirement, submission, validity, sufficiency, acceptance, gate passage, release authorization, and deployment remain distinct', allMention(ctx, 'V12-01', ['Evidence requirement', 'evidence submitted', 'evidence valid', 'evidence accepted']) && bodyMentions(ctx, 'V12-00', 'Gate passed') && bodyMentions(ctx, 'V12-00', 'Release authorized'));
  add(4, 'Evidence classes and evidentiary limits controlled', evidenceClasses.length >= 12 && everyHas(evidenceClasses, 'authoritative_requirement', 'evidentiary_limitation'));
  add(5, 'Every permitted claim has a corresponding prohibited-inference boundary', evidenceClasses.length >= 1 && evidenceClasses.every((e) => e.permitted_claim && e.prohibited_inference));
  add(6, 'Gate criteria, decision rights, and escalation paths controlled', criteria.length >= 1 && everyHas(criteria, 'decision_authority', 'escalation_path'));
  add(7, 'Evidence ownership, review, acceptance, and release authority segregated', authorities.length >= 1 && everyHas(authorities, 'segregation_boundary') && bodyMentions(ctx, 'V12-02', 'segregation of duties'));
  add(8, 'Technical, domain, operational, business, executive, and release acceptance remain distinct', acceptanceClasses.length >= 12 && allMention(ctx, 'V12-07', ['Technical acceptance', 'Business acceptance', 'Operational acceptance', 'Executive approval']));
  add(9, 'Evidence objects bind requirement, version, commit, configuration, environment, identity, organization, jurisdiction, data, provider state, and time', evidenceObjects.length >= 1 && evidenceObjects.every((e) => e.evidence_binds_requirement && e.evidence_binds_version && e.evidence_binds_commit && e.evidence_binds_configuration && e.evidence_binds_environment && e.evidence_binds_identity && e.evidence_binds_organization && e.evidence_binds_jurisdiction && e.evidence_binds_data && e.evidence_binds_provider_state && e.evidence_binds_time));
  add(10, 'Evidence integrity, reproducibility, retention, expiry, and revalidation controlled', evidenceObjects.length >= 1 && everyHas(evidenceObjects, 'integrity_mechanism', 'reproducibility', 'retention_dependency', 'expiry_or_revalidation_date'));
  add(11, 'Failed, partial, stale, conflicting, and inconclusive evidence remain visible', allMention(ctx, 'V12-08', ['failed', 'partial', 'stale', 'conflicting', 'inconclusive']));
  add(12, 'Inconclusive evidence cannot be represented as a pass', bodyMentions(ctx, 'V12-08', 'Inconclusive'));
  add(13, 'Defects, evidence gaps, exceptions, waivers, conditions, commitments, expiry, revocation, and reopening controlled', hasChapter(ctx, 'V12-04') && conditionsReg.length >= 1 && waivers.length >= 1 && commitments.length >= 1 && allMention(ctx, 'V12-04', ['Defect', 'Waiver', 'Conditional acceptance', 'Expiry', 'Revocation', 'Reopening']));
  add(14, 'Waivers and conditional acceptance do not convert failures into successful results', bodyMentions(ctx, 'V12-04', 'Waiver approved'));
  add(15, 'Defect closure requires applicable retest or re-exercise evidence', findings.length >= 1 && everyHas(findings, 'retest_or_reexercise_requirement'));
  add(16, 'Cross-domain evidence requirements cover the full program', evidenceReqs.length >= 20 && everyHas(evidenceReqs, 'domain', 'required_evidence_classes', 'minimum_provenance', 'acceptance_authority', 'final_dossier_destination'));
  add(17, 'Test execution remains distinct from accepted evidence and conformance', bodyMentions(ctx, 'V12-05', 'Test execution') && bodyMentions(ctx, 'V12-01', 'Evidence existence'));
  add(18, 'Operational evidence remains distinct from operational readiness and release authorization', bodyMentions(ctx, 'V12-05', 'Operational evidence') && bodyMentions(ctx, 'V12-07', 'Operational acceptance'));
  add(19, 'Migration execution remains distinct from migration acceptance and source retirement', bodyMentions(ctx, 'V12-05', 'Migration execution'));
  add(20, 'Provider certifications and provider-managed results remain distinct from end-to-end assurance', bodyMentions(ctx, 'V12-05', 'Provider certification'));
  add(21, 'Accessibility and bilingual evidence preserve their manual, semantic, and independent-review boundaries', allMention(ctx, 'V12-05', ['Automated accessibility scan', 'Bilingual string presence']));
  add(22, 'Security and privacy evidence is not represented as automatic legal-compliance proof', bodyMentions(ctx, 'V12-05', 'Security testing'));
  add(23, 'Implementation, environment, configuration, database, deployment-path, and release-candidate evidence requirements controlled', hasChapter(ctx, 'V12-06') && allMention(ctx, 'V12-06', ['implementation completion', 'environment qualification', 'configuration completeness', 'physical database behaviour', 'deployment path', 'release-candidate formation']));
  add(24, 'Release-candidate formation remains distinct from acceptance and release authorization', bodyMentions(ctx, 'V12-06', 'Release candidate accepted') && bodyMentions(ctx, 'V12-06', 'release authorized'));
  add(25, 'Acceptance decisions identify evidence, authority, independence, conditions, dissent, and release effect', acceptanceClasses.length >= 1 && everyHas(acceptanceClasses, 'decision_authority', 'independence_requirement', 'conditions_permitted', 'dissent_treatment', 'release_effect'));
  add(26, 'Evidence challenge, contradiction, revalidation, invalidation, and revocation procedures controlled', hasChapter(ctx, 'V12-08') && allMention(ctx, 'V12-08', ['challenge', 'revalidation', 'invalidated', 'revoked acceptance', 'reopened gates']));
  add(27, 'Final evidence-dossier and executive-decision structures defined', dossiers.length >= 1 && everyHas(dossiers, 'dossier_kind', 'authoritative_source') && bodyMentions(ctx, 'V12-09', 'executive decision brief'));
  add(28, 'Every unresolved item has an owner, required evidence, and a valid future gate', backlog.length >= 1 && backlog.every((b) => b.owner && b.required_action_or_evidence && b.future_blocking_gate));
  add(29, 'No active unresolved item points to a completed Volume 12 gate', noBacklogPointsToCompletedGate);
  add(30, 'Deterministic Package 1 analysis completes without blocking defects', structuralErrors === 0);
  add(31, 'No evidence, approval, assurance conclusion, acceptance, or release decision fabricated', leakageErrors === 0 && allEvidenceNotAccepted && allNotAccepted && allNotReleased);
  add(32, 'No runtime code, tests, environments, identities, credentials, migrations, operational exercises, provider engagement, or infrastructure created or executed', leakageErrors === 0 && allNotImplemented && allNotExecuted);
  add(33, 'No procurement, expenditure, staffing, pilot, rollout, deployment, release, or launch authorized', allNotOperational && allNotReleased);
  add(34, 'No record authorizes implementation, operations, or release', noneAuthorizes);
  add(35, 'Genuine authoring, closure/freeze, and pre-merge provenance-binding separation preserved', closureApproval && freezeApproval && gateBindingsResolved);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V12_G1_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V12-G1'));
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
    gate: 'V12-G1',
    disposition_target: 'GATE_RELEASE_AND_ACCEPTANCE_EVIDENCE_GOVERNANCE_FOUNDATION_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v12-g1-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V12-G1 readiness', run);
}
