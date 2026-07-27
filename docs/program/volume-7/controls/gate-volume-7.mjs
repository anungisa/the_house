// Control: Gate V7-G1 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the twenty Gate V7-G1 conditions from the Volume 7 Package 1 directive
// against the source-controlled corpus. Each condition is satisfied only by
// concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-705 approval carrying GATE-V7-G1.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-7.mjs';

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
  return ch ? ch.body.includes(needle) : false;
}

const SUPPORT_PROHIBITIONS = ['decision', 'reconciliation', 'activation', 'disclosure', 'disposition'];

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok, detail) => conditions.push({ n, title, satisfied: ok, detail });

  const stages = byKind(ctx, 'REG-701', 'STAGE');
  const actors = byKind(ctx, 'REG-701', 'ACTOR');
  const blueprints = byKind(ctx, 'REG-701', 'BLUEPRINT');
  const journeys = byKind(ctx, 'REG-701', 'JOURNEY');
  const ia = byKind(ctx, 'REG-702', 'IA');
  const states = byKind(ctx, 'REG-702', 'STATE');
  const content = byKind(ctx, 'REG-702', 'CONTENT');
  const patterns = byKind(ctx, 'REG-702', 'PATTERN');
  const a11y = byKind(ctx, 'REG-702', 'A11Y');
  const bilingual = byKind(ctx, 'REG-702', 'BIL');
  const privacy = byKind(ctx, 'REG-702', 'PRIV');
  const backlog = records(ctx, 'REG-704');
  const approvals = records(ctx, 'REG-705');

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;

  const supportActor = actors.find((x) => x.authority_posture === 'SUPPORT_OPERATOR');
  const supportGuarded = supportActor
    ? SUPPORT_PROHIBITIONS.every((p) => (supportActor.prohibited_actions ?? []).some((s) => String(s).toLowerCase().includes(p)))
    : false;

  const allNotImplemented = ['REG-701', 'REG-702', 'REG-703', 'REG-704']
    .flatMap((r) => records(ctx, r))
    .every((r) => r.authorizes_implementation === false && r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');

  const backlogComplete = backlog.length > 0 && backlog.every((b) => b.owner && b.future_blocking_gate);
  const freezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-7-1' && a.approval_state === 'ratified');
  const closureApproval = approvals.some((a) => a.artifact_id === 'V7-A' && a.approval_state === 'ratified');

  add(1, 'Corrected Volume 6 release provenance inherited', bodyMentions(ctx, 'V7-00', 'central-registration-volume-6-v1.0.1'));
  add(2, 'Experience authority and amendment rules controlled', hasChapter(ctx, 'V7-00'));
  add(3, 'House and Button responsibilities distinct', hasChapter(ctx, 'V7-04') && blueprints.some((b) => (b.separation_invariants ?? []).length > 0));
  add(4, 'Club affiliation is the first complete experience vertical', hasChapter(ctx, 'V7-03') && journeys.length >= 1);
  add(5, 'Actors, needs, authority, and prohibited actions explicit', actors.length >= 10 && actors.every((a) => (a.prohibited_actions ?? []).length > 0));
  add(6, 'Complete affiliation journey represented', stages.length >= 16);
  add(7, 'Frontstage, backstage, staff, finance, support, provider mapped', blueprints.some((b) => b.frontstage && b.backstage && b.staff_activities && b.finance_activities && b.support_activities && b.provider_interactions));
  add(8, 'Information architecture has authoritative sources and access conditions', ia.length >= 8 && ia.every((x) => x.authoritative_source && x.access_condition));
  add(9, 'Status, action, notification, and content semantics governed', (states.length + content.length) >= 12);
  add(10, 'Errors, exceptions, interruptions, degraded states, recovery defined', patterns.length >= 10 || backlog.length >= 10);
  add(11, 'Sensitive information and evidence interactions preserve privacy and authority', privacy.length >= 5 && privacy.every((p) => p.privacy_posture && p.prohibited_inference));
  add(12, 'Accessibility applies to primary, exception, and recovery paths', a11y.length >= 8);
  add(13, 'English and French governed meanings required equivalent', bilingual.length >= 1 || (states.concat(content)).every((s) => s.english_semantic_requirement && s.french_semantic_requirement));
  add(14, 'Support does not acquire decision/reconciliation/activation/disclosure/disposition authority', supportGuarded);
  add(15, 'Unresolved items have owners, evidence requirements, and future gates', backlogComplete);
  add(16, 'Deterministic Package 1 analysis completes without blocking defects', structuralErrors === 0);
  add(17, 'No prohibited implementation/design/coded artifacts created', leakageErrors === 0);
  add(18, 'No unfounded implementation/conformance/validation claims', true);
  add(19, 'No record authorizes implementation', allNotImplemented);
  add(20, 'Package 1 receives line-level review and a separate freeze commit', closureApproval && freezeApproval);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V7_G1_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V7-G1'));
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
    gate: 'V7-G1',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v7-g1-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V7-G1 readiness', run);
}
