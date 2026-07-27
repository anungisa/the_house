// Control: Gate V7-G2 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the twenty-four Gate V7-G2 conditions from the Volume 7 Package 2
// directive against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-705 approval carrying GATE-V7-G2.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-7.mjs';
import { analyse as analyseInteraction } from './interaction-model-volume-7.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}
function bodyMentions(ctx, id, needle) {
  const ch = ctx.chapters.find((c) => c.fileId === id);
  return ch ? ch.body.includes(needle) : false;
}
function statusMeaningPresent(msgs, needle) {
  return msgs.some((m) => `${m.message_requirement ?? ''} ${m.user_facing_meaning ?? ''} ${m.prohibited_inference ?? ''}`.toLowerCase().includes(needle));
}

const COMPLETED_GATES = ['V7-G1', 'V7-G2'];

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok) => conditions.push({ n, title, satisfied: !!ok });

  const a = analyseInteraction(ctx);
  const structural = runStructural(ctx);
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;

  const backlog = records(ctx, 'REG-704');
  const approvals = records(ctx, 'REG-705');
  const commands = byKind(ctx, 'REG-702', 'COMMAND_INTENT');
  const benches = byKind(ctx, 'REG-701', 'WORKBENCH');
  const statusMsgs = byKind(ctx, 'REG-702', 'STATUS_MESSAGE');
  const recoveries = byKind(ctx, 'REG-702', 'RECOVERY_PATH');
  const a11yBehaviours = byKind(ctx, 'REG-702', 'ACCESSIBILITY_BEHAVIOUR');
  const bilingualSemantics = byKind(ctx, 'REG-702', 'BILINGUAL_SEMANTIC');
  const decisions = records(ctx, 'REG-703');

  const p2Records = ['REG-701', 'REG-702', 'REG-703', 'REG-704']
    .flatMap((r) => records(ctx, r));
  const allNotImplemented = p2Records.every(
    (r) => r.authorizes_implementation === false && r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN'
  );

  const backlogForwardOnly = backlog
    .filter((b) => b.future_blocking_gate)
    .every((b) => !COMPLETED_GATES.includes(b.future_blocking_gate));

  const supportBench = benches.find((b) => b.authority_posture === 'SUPPORT_OPERATOR');
  const supportNoAuthority = supportBench
    ? (supportBench.prohibited_actions ?? []).length > 0 &&
      (supportBench.authority_constraints ?? []).some((c) => /no governed authority/i.test(String(c)))
    : false;

  const closureApproval = approvals.some((x) => x.artifact_id === 'V7-C' && x.approval_state === 'ratified');
  const freezeApproval = approvals.some((x) => x.artifact_id === 'PACKAGE-7-2' && x.approval_state === 'ratified');
  const decisionTitles = decisions.map((d) => String(d.title ?? '').toLowerCase());
  const hasDecision = (needle) => decisionTitles.some((t) => t.includes(needle));

  add(1, 'Package 1 experience foundation is inherited and frozen', bodyMentions(ctx, 'V7-11', 'frozen Package 1') || bodyMentions(ctx, 'V7-C', 'frozen Package 1'));
  add(2, 'No unresolved backlog item points to a completed gate', backlogForwardOnly);
  add(3, 'No record authorizes implementation or final visual design', allNotImplemented && leakageErrors === 0);
  add(4, 'Every controlled record carries a non-implementation status', allNotImplemented);
  add(5, 'Every user action maps to a command intent, query intent, or local interaction', a.gaps.actions_without_intent.length === 0);
  add(6, 'Every command intent names a House authority', commands.length >= 10 && a.gaps.commands_without_house_authority.length === 0);
  add(7, 'Every experience surface belongs to a defined authority domain', a.counts.surfaces >= 1 && a.gaps.surfaces_without_authority_domain.length === 0);
  add(8, 'Every actor journey is covered by at least one task flow', a.coverage.journeys_have_task_flows && a.counts.task_flows >= 1);
  add(9, 'Every affiliation stage traces to at least one surface or view', a.counts.stages >= 1 && a.gaps.stages_without_surface_or_view.length === 0);
  add(10, 'Every view defines its required screen states', a.counts.views >= 1 && a.counts.screen_states >= REQUIRED_MIN_SCREENS);
  add(11, 'Screen states cover loading, empty, success, error, denied, and recovery', a.gaps.missing_required_screen_states.length === 0 && recoveries.length >= 1);
  add(12, 'Representative authority and organization identity are modelled distinctly', hasDecision('organization and representative authority are distinct'));
  add(13, 'Applicability and completeness are derived from House facts and not asserted', hasDecision('applicability is derived') && hasDecision('completeness is derived'));
  add(14, 'Evidence interactions preserve provenance and history', hasDecision('evidence replacement preserves history'));
  add(15, 'Submission distinguishes receipt from approval', statusMeaningPresent(statusMsgs, 'not an approval') || hasDecision('submission receipt is not approval'));
  add(16, 'Return for information is distinguished from refusal', statusMeaningPresent(statusMsgs, 'not a refusal') || hasDecision('return for information is not refusal'));
  add(17, 'Review recommendation is distinguished from a governed decision', hasDecision('review recommendation is not a governed decision'));
  add(18, 'Payment acknowledgement is distinguished from accounting confirmation', statusMeaningPresent(statusMsgs, 'not accounting confirmation') || hasDecision('payment acknowledgement is not accounting confirmation'));
  add(19, 'Approval is distinguished from activation', statusMeaningPresent(statusMsgs, 'approval is not activation') || hasDecision('approval is not activation'));
  add(20, 'Staff workbenches declare authority constraints and prohibited actions', benches.length >= 5 && a.gaps.workbenches_without_constraints.length === 0);
  add(21, 'Support acquires no governed authority', supportNoAuthority);
  add(22, 'Accessibility applies to every state and recovery path', a11yBehaviours.length >= 4);
  add(23, 'Bilingual meaning is specified as equivalent and not literal', bilingualSemantics.length >= 1 && hasDecision('bilingual meaning is semantic'));
  add(24, 'Package 2 receives line-level review and a separate freeze commit', closureApproval && freezeApproval);

  return conditions;
}

const REQUIRED_MIN_SCREENS = 6;

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V7_G2_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V7-G2'));
    }
  }
  return findings;
}

export function generate(ctx = loadContext()) {
  const conditions = evaluate(ctx);
  const unmet = conditions.filter((c) => !c.satisfied);
  const outDir = join(VOLUME_DIR, 'generated', 'interaction-model');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    gate: 'V7-G2',
    disposition: 'AFFILIATION_INTERACTION_AND_SCREEN_STATE_MODEL_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v7-g2-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V7-G2 readiness', run);
}
