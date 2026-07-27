// Control: Gate V7-G5 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the Gate V7-G5 conditions from the Volume 7 Package 5 integrated
// experience-and-service-design closure against the source-controlled corpus.
// Each condition is satisfied only by concrete corpus evidence; an unsatisfied
// condition is an ERROR. This control reports readiness; it never itself
// disposes the gate. The gate is dispositioned only by a ratified REG-705
// approval carrying GATE-V7-G5. Package 5 consolidates and closes Volume 7; it
// re-opens no prior package, re-runs no validation, and authorizes no
// implementation.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-7.mjs';
import { analyse as analyseInteraction } from './interaction-model-volume-7.mjs';
import { analyse as analyseDesign } from './design-system-volume-7.mjs';
import { analyse as analyseValidation } from './validation-handoff-volume-7.mjs';
import { analyse as analyseClosure } from './final-closure-volume-7.mjs';

const PRIOR_FREEZES = ['PACKAGE-7-1', 'PACKAGE-7-2', 'PACKAGE-7-3', 'PACKAGE-7-4'];

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function bodyMentions(ctx, id, needle) {
  const ch = ctx.chapters.find((c) => c.fileId === id);
  return ch ? ch.body.includes(needle) : false;
}

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok) => conditions.push({ n, title, satisfied: !!ok });

  const structural = runStructural(ctx);
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;

  const interaction = analyseInteraction(ctx);
  const design = analyseDesign(ctx);
  const validation = analyseValidation(ctx);
  const closure = analyseClosure(ctx);

  const approvals = records(ctx, 'REG-705');
  const decisions = records(ctx, 'REG-703');
  const decisionTitles = decisions.map((d) => String(d.title ?? '').toLowerCase());
  const hasDecision = (needle) => decisionTitles.some((t) => t.includes(needle));

  const ratified = (artifactId) =>
    approvals.some((x) => x.artifact_id === artifactId && x.approval_state === 'ratified');

  // Every controlled record across the Package 1-5 registers and approvals keeps
  // the governed non-implementation posture.
  const governed = ['REG-701', 'REG-702', 'REG-703', 'REG-704'].flatMap((r) => records(ctx, r));
  const allNotImplemented = governed.every(
    (r) => r.authorizes_implementation === false && r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN'
  );
  const approvalsAuthorizeNothing = approvals.every((a) => a.authorizes_implementation !== true);

  // Every Package 5 chapter states its explicit non-authorizations.
  const packageFiveChapters = ['V7-43', 'V7-44', 'V7-45', 'V7-46', 'V7-47', 'V7-48', 'V7-49', 'V7-50', 'V7-51', 'V7-52', 'V7-53', 'V7-54', 'V7-55'];
  const allChaptersNonAuthorized = packageFiveChapters.every((id) => bodyMentions(ctx, id, 'Explicit non-authorizations'));

  // Package 5 authoring and closure/freeze commits recorded as properly separated.
  const separation = approvals
    .map((a) => a.authoring_closure_separation)
    .find((s) => s && s.freeze_artifact === 'PACKAGE-7-5');
  const separationOk =
    !!separation &&
    separation.substantive_authoring_commit &&
    separation.closure_authored_commit &&
    separation.substantive_authoring_commit !== separation.closure_authored_commit &&
    separation.separation_status === 'SEPARATED';

  add(1, 'Package 4 chronology amendment inherited', bodyMentions(ctx, 'V7-I', 'V7-H-1'));
  add(2, 'Packages 1-4 remain frozen and unchanged', PRIOR_FREEZES.every(ratified));
  add(3, 'The complete affiliation experience is traceable end to end', bodyMentions(ctx, 'V7-44', 'affiliation') && closure.counts.blocking_defects === 0);
  add(4, 'The House and the Button remain distinct authorities', hasDecision('house and the button remain distinct'));
  add(5, 'All actions map to governed intents', interaction.gaps.actions_without_intent.length === 0 && interaction.gaps.commands_without_house_authority.length === 0);
  add(6, 'All material surfaces have complete state coverage', interaction.gaps.missing_required_screen_states.length === 0 && design.gaps.missing_complete_states.length === 0);
  add(7, 'Accessibility covers primary, exception, staff, interruption, and recovery paths', bodyMentions(ctx, 'V7-48', 'interruption') && bodyMentions(ctx, 'V7-48', 'recovery'));
  add(8, 'English and French concepts retain equivalent governed meanings', design.gaps.content_terms_without_bilingual_concept.length === 0);
  add(9, 'Privacy and restricted-evidence constraints are represented', bodyMentions(ctx, 'V7-48', 'privacy') && bodyMentions(ctx, 'V7-48', 'evidence'));
  add(10, 'Validation protocols exist without validation claims', validation.gaps.missing_validation_families.length === 0 && validation.gaps.underspecified_validation_families.length === 0 && closure.counts.improper_claims === 0);
  add(11, 'Measurement includes privacy and interpretation limits', validation.counts.measurement_definitions >= 1 && validation.gaps.underspecified_measurement_definitions.length === 0);
  add(12, 'Implementation handoffs include authority, state, and evidence requirements', validation.gaps.missing_handoff_classes.length === 0 && validation.gaps.underspecified_handoff_artifacts.length === 0 && hasDecision('a specification is not an implementation'));
  add(13, 'House P0 findings have experience coverage', closure.house_p0.uncovered.length === 0);
  add(14, 'Every unresolved item has a valid downstream destination', closure.downstream.backlog_pointing_to_completed_gate.length === 0 && closure.downstream.backlog_missing_gate.length === 0);
  add(15, 'Deterministic closure analysis reports no blocking defect', closure.counts.blocking_defects === 0);
  add(16, 'No record claims usability, accessibility, bilingual, stakeholder, operational, or production validation', closure.counts.improper_claims === 0);
  add(17, 'No production interface, runtime code, final content, procurement, pilot, rollout, or master development plan is created', leakageErrors === 0 && allChaptersNonAuthorized);
  add(18, 'No record authorizes implementation', allNotImplemented && approvalsAuthorizeNothing);
  add(19, 'Package 5 and the whole of Volume 7 receive explicit freezes', ratified('PACKAGE-7-5') && ratified('VOLUME-7'));
  add(20, 'Authoring and closure/freeze commits are properly separated', separationOk);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V7_G5_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V7-G5'));
    }
  }
  return findings;
}

export function generate(ctx = loadContext()) {
  const conditions = evaluate(ctx);
  const unmet = conditions.filter((c) => !c.satisfied);
  const outDir = join(VOLUME_DIR, 'generated', 'final-closure');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    gate: 'V7-G5',
    disposition: 'EXPERIENCE_AND_SERVICE_DESIGN_DEFINITION_COMPLETE',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v7-g5-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V7-G5 readiness', run);
}
