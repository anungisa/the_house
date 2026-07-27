// Control: Gate V7-G4 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the Gate V7-G4 conditions from the Volume 7 Package 4 experience-
// validation and implementation-handoff definition against the source-controlled
// corpus. Each condition is satisfied only by concrete corpus evidence; an
// unsatisfied condition is an ERROR. This control reports readiness; it never
// itself disposes the gate. The gate is dispositioned only by a ratified REG-705
// approval carrying GATE-V7-G4. Package 4 defines validation and handoff only and
// authorizes no validation execution, content approval, production approval, or
// implementation.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-7.mjs';
import { analyse as analyseValidation } from './validation-handoff-volume-7.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function bodyMentions(ctx, id, needle) {
  const ch = ctx.chapters.find((c) => c.fileId === id);
  return ch ? ch.body.includes(needle) : false;
}

const COMPLETED_GATES = ['V7-G1', 'V7-G2', 'V7-G3', 'V7-G4'];

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok) => conditions.push({ n, title, satisfied: !!ok });

  const a = analyseValidation(ctx);
  const structural = runStructural(ctx);
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;

  const backlog = records(ctx, 'REG-704');
  const approvals = records(ctx, 'REG-705');
  const decisions = records(ctx, 'REG-703');

  const p4Registers = ['REG-701', 'REG-702', 'REG-703', 'REG-704'].flatMap((r) => records(ctx, r));
  const allNotImplemented = p4Registers.every(
    (r) => r.authorizes_implementation === false && r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN'
  );

  const backlogForwardOnly = backlog
    .filter((b) => b.future_blocking_gate)
    .every((b) => !COMPLETED_GATES.includes(b.future_blocking_gate));

  const decisionTitles = decisions.map((d) => String(d.title ?? '').toLowerCase());
  const hasDecision = (needle) => decisionTitles.some((t) => t.includes(needle));

  const validationBacklog = backlog.filter((b) => b.kind === 'TEST');
  const validationBacklogGoverned =
    validationBacklog.length > 0 &&
    validationBacklog.every((b) => b.owner && b.future_blocking_gate && !COMPLETED_GATES.includes(b.future_blocking_gate));

  const closureApproval = approvals.some((x) => x.artifact_id === 'V7-G' && x.approval_state === 'ratified');
  const freezeApproval = approvals.some((x) => x.artifact_id === 'PACKAGE-7-4' && x.approval_state === 'ratified');

  add(1, 'Corrected Volume 6, frozen Package 1-3, and the Package 3 governance amendment are inherited', bodyMentions(ctx, 'V7-G', 'frozen') && bodyMentions(ctx, 'V7-G', 'V7-F-1'));
  add(2, 'No unresolved backlog item points to a completed gate', backlogForwardOnly);
  add(3, 'No record authorizes validation execution, production approval, or implementation', allNotImplemented && leakageErrors === 0);
  add(4, 'Every controlled record carries a non-implementation status', allNotImplemented);
  add(5, 'The validation families are complete and no family substitutes for another', a.gaps.missing_validation_families.length === 0 && a.gaps.underspecified_validation_families.length === 0 && hasDecision('no validation family substitutes for another'));
  add(6, 'Evaluation scenarios cover every affiliation stage', a.counts.evaluation_scenarios >= 1 && a.gaps.stages_without_evaluation_scenario.length === 0);
  add(7, 'Evaluation scenarios cover every governed path class', a.gaps.missing_scenario_path_classes.length === 0 && a.gaps.underspecified_evaluation_scenarios.length === 0);
  add(8, 'Usability, accessibility, bilingual, expert-review, and operational activities are defined', a.gaps.missing_validation_activities.length === 0 && a.gaps.underspecified_validation_activities.length === 0);
  add(9, 'Bilingual equivalence requires qualified human judgement', hasDecision('machine translation is insufficient for bilingual equivalence'));
  add(10, 'Measurement definitions bound consent, interpretation, and aggregation', a.counts.measurement_definitions >= 1 && a.gaps.underspecified_measurement_definitions.length === 0 && hasDecision('aggregation is not anonymization'));
  add(11, 'Content governance defines approval, lifecycle, and localization', a.counts.content_governance_rules >= 1 && a.gaps.underspecified_content_governance_rules.length === 0);
  add(12, 'Implementation-conformance, service-readiness, and content-readiness handoff are defined', a.gaps.missing_handoff_classes.length === 0 && a.gaps.underspecified_handoff_artifacts.length === 0 && hasDecision('a specification is not an implementation'));
  add(13, 'An issue closes only on retest under the family that raised it', hasDecision('no issue closes on a design-file change alone'));
  add(14, 'The validation backlog carries forward gates and owners', validationBacklogGoverned);
  add(15, 'Every Package 4 chapter states its explicit non-authorizations', bodyMentions(ctx, 'V7-32', 'Explicit non-authorizations') && bodyMentions(ctx, 'V7-42', 'Explicit non-authorizations'));
  add(16, 'Package 4 receives line-level review and a separate freeze commit', closureApproval && freezeApproval);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V7_G4_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V7-G4'));
    }
  }
  return findings;
}

export function generate(ctx = loadContext()) {
  const conditions = evaluate(ctx);
  const unmet = conditions.filter((c) => !c.satisfied);
  const outDir = join(VOLUME_DIR, 'generated', 'validation-handoff');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    gate: 'V7-G4',
    disposition: 'EXPERIENCE_VALIDATION_AND_IMPLEMENTATION_HANDOFF_DEFINITION_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v7-g4-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V7-G4 readiness', run);
}
