// Control: Gate V8-G2 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the twenty-seven Gate V8-G2 conditions from the Volume 8 Package 2
// directive (affiliation logical-contract definition) against the source-controlled
// corpus. Each condition is satisfied only by concrete corpus evidence; an
// unsatisfied condition is an ERROR. This control reports readiness; it never itself
// disposes the gate. The gate is dispositioned only by a ratified REG-805 approval
// carrying GATE-V8-G2 and the disposition AFFILIATION_LOGICAL_CONTRACT_DEFINITION_READY.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-8.mjs';
import { isPlaceholder } from './provenance-integrity-volume-8.mjs';

// Package 2 chapters (affiliation logical-contract definition).
const P2 = new Set(['V8-11', 'V8-12', 'V8-13', 'V8-14', 'V8-15', 'V8-16', 'V8-17', 'V8-18', 'V8-19', 'V8-20']);

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}
function inP2(list) {
  return list.filter((r) => P2.has(r.chapter_ref));
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
  const add = (n, title, ok, detail) => conditions.push({ n, title, satisfied: ok, detail });

  const logicalResources = inP2(byKind(ctx, 'REG-801', 'LOGICAL_RESOURCE'));
  const authContexts = inP2(byKind(ctx, 'REG-801', 'AUTHORIZATION_CONTEXT'));
  const trustBoundaries = inP2(byKind(ctx, 'REG-801', 'TRUST_BOUNDARY'));
  const commands = inP2(byKind(ctx, 'REG-802', 'COMMAND_CLASS'));
  const queries = inP2(byKind(ctx, 'REG-802', 'QUERY_CLASS'));
  const events = inP2(byKind(ctx, 'REG-802', 'EVENT_CLASS'));
  const errors = inP2(byKind(ctx, 'REG-802', 'ERROR_SEMANTIC'));
  const compatibility = inP2(byKind(ctx, 'REG-802', 'COMPATIBILITY_RULE'));
  const decisions = records(ctx, 'REG-803').filter((d) => P2.has(d.chapter_ref));
  const backlog = records(ctx, 'REG-804').filter((b) => P2.has(b.chapter_ref));
  const approvals = records(ctx, 'REG-805');

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;

  const allNotImplemented = ['REG-801', 'REG-802', 'REG-803', 'REG-804']
    .flatMap((r) => records(ctx, r))
    .every((r) => r.authorizes_implementation === false && r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');

  const backlogComplete = backlog.length > 0 && backlog.every((b) => b.owner && b.future_blocking_gate);

  const closureApproval = approvals.some((a) => a.artifact_id === 'V8-C' && a.approval_state === 'ratified');
  const freezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-8-2' && a.approval_state === 'ratified');
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V8-G2' && a.approval_state === 'ratified');
  const gateDispositioned = !!gateApproval && gateApproval.gate_disposition === 'AFFILIATION_LOGICAL_CONTRACT_DEFINITION_READY';

  // Fail-closed provenance binding: a completed gate must not report ready while any
  // required gate/closure/freeze effectiveness binding remains an unresolved
  // placeholder (PENDING/UNKNOWN/TBD/PLACEHOLDER/UNRESOLVED). Forward-referencing
  // provenance-amendment fields are excluded; they are validated by role classification.
  const closureRecord = approvals.find((a) => a.artifact_id === 'V8-C' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-8-2' && a.approval_state === 'ratified');
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

  add(1, 'Affiliation contract-domain decomposition and scope defined', hasChapter(ctx, 'V8-11'));
  add(2, 'Package 2 inherits the Package 1 contract-governance foundation', bodyMentions(ctx, 'V8-11', 'Package 1'));
  add(3, 'Affiliation authorization-context and actor contracts defined', hasChapter(ctx, 'V8-12') && authContexts.length >= 3);
  add(4, 'Applicant-to-House trust boundary defined and fail-closed', trustBoundaries.length >= 1 && trustBoundaries.every((t) => t.fail_closed_posture));
  add(5, 'Affiliation logical resource contracts defined', hasChapter(ctx, 'V8-13') && logicalResources.length >= 4);
  add(6, 'Every logical resource names authority, source, and purpose', logicalResources.length > 0 && logicalResources.every((r) => r.institutional_authority && r.authoritative_source && r.purpose));
  add(7, 'Requirement, response, and acceptance semantics defined', hasChapter(ctx, 'V8-14'));
  add(8, 'Evidence, attestation, and completeness contracts defined', hasChapter(ctx, 'V8-15'));
  add(9, 'Draft and submission command contracts defined', hasChapter(ctx, 'V8-16') && commands.length >= 8);
  add(10, 'Query and projection contracts defined', hasChapter(ctx, 'V8-17') && queries.length >= 3);
  add(11, 'Review, return, and resubmission contracts defined', hasChapter(ctx, 'V8-18'));
  add(12, 'Decision, finance, reconciliation, and activation contracts defined', hasChapter(ctx, 'V8-19'));
  add(13, 'Staff boundaries, error, compatibility, and traceability assessment defined', hasChapter(ctx, 'V8-20'));
  add(14, 'Affiliation commands name preconditions and result semantics', commands.length > 0 && commands.every((c) => (c.preconditions ?? []).length > 0 && c.result_semantics && c.error_semantics && c.idempotency_requirement));
  add(15, 'Affiliation queries name authority and staleness posture', queries.length > 0 && queries.every((q) => (q.institutional_authority || q.authoritative_source) && q.staleness_posture));
  add(16, 'Affiliation integration events name envelope and delivery posture', events.length >= 3 && events.every((e) => (e.envelope_fields ?? []).length > 0 && e.delivery_posture && e.ordering_requirement));
  add(17, 'Affiliation errors name canonical codes and privacy or logging constraints', errors.length >= 2 && errors.every((e) => e.canonical_code && (e.privacy_constraint || e.logging_constraint)));
  add(18, 'Affiliation compatibility rules name compatibility state and consumer evidence', compatibility.length >= 2 && compatibility.every((c) => c.compatibility_state && c.consumer_evidence));
  add(19, 'Affiliation decisions recorded for authority, resources, evidence, and finance', decisions.length >= 4);
  add(20, 'Every affiliation contract names a forward blocking gate', [...logicalResources, ...authContexts, ...trustBoundaries, ...commands, ...queries, ...events, ...errors, ...compatibility].every((r) => !!r.future_blocking_gate));
  add(21, 'Deterministic Package 2 analysis completes without blocking defects', structuralErrors === 0);
  add(22, 'No prohibited implementation/coded/executable-contract artifacts created', leakageErrors === 0);
  add(23, 'Unresolved Package 2 items have owners, evidence requirements, and future gates', backlogComplete);
  add(24, 'No record authorizes implementation', allNotImplemented);
  add(25, 'Package 2 receives a closure record and a separate freeze commit', closureApproval && freezeApproval);
  add(26, 'Gate V8-G2 disposition recorded as affiliation logical-contract definition ready', gateDispositioned);
  add(27, 'Completed gate has no unresolved required commit binding', gateBindingsResolved);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V8_G2_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V8-G2'));
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
    gate: 'V8-G2',
    disposition_target: 'AFFILIATION_LOGICAL_CONTRACT_DEFINITION_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v8-g2-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V8-G2 readiness', run);
}
