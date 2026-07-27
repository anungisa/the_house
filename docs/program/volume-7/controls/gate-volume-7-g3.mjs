// Control: Gate V7-G3 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the sixteen Gate V7-G3 conditions from the Volume 7 Package 3
// directive against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-705 approval carrying GATE-V7-G3.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-7.mjs';
import { analyse as analyseDesign } from './design-system-volume-7.mjs';

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

const COMPLETED_GATES = ['V7-G1', 'V7-G2', 'V7-G3'];

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok) => conditions.push({ n, title, satisfied: !!ok });

  const a = analyseDesign(ctx);
  const structural = runStructural(ctx);
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;

  const backlog = records(ctx, 'REG-704');
  const approvals = records(ctx, 'REG-705');
  const decisions = records(ctx, 'REG-703');

  const p3Registers = ['REG-701', 'REG-702', 'REG-703', 'REG-704'].flatMap((r) => records(ctx, r));
  const allNotImplemented = p3Registers.every(
    (r) => r.authorizes_implementation === false && r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN'
  );

  const backlogForwardOnly = backlog
    .filter((b) => b.future_blocking_gate)
    .every((b) => !COMPLETED_GATES.includes(b.future_blocking_gate));

  const decisionTitles = decisions.map((d) => String(d.title ?? '').toLowerCase());
  const hasDecision = (needle) => decisionTitles.some((t) => t.includes(needle));

  const designSpecs = byKind(ctx, 'REG-702', 'DESIGN_SPEC');
  const specClass = (cls) => designSpecs.some((d) => d.spec_class === cls);

  const closureApproval = approvals.some((x) => x.artifact_id === 'V7-E' && x.approval_state === 'ratified');
  const freezeApproval = approvals.some((x) => x.artifact_id === 'PACKAGE-7-3' && x.approval_state === 'ratified');

  add(1, 'Corrected Volume 6, frozen Package 1, and corrected frozen Package 2 provenance are inherited', bodyMentions(ctx, 'V7-E', 'frozen Package 1') && bodyMentions(ctx, 'V7-E', 'corrected'));
  add(2, 'No unresolved backlog item points to a completed gate', backlogForwardOnly);
  add(3, 'No record authorizes implementation or final production design', allNotImplemented && leakageErrors === 0);
  add(4, 'Every controlled record carries a non-implementation status', allNotImplemented);
  add(5, 'The visual language is documentary and names design specifications without production tokens', a.counts.visual_systems >= 2 && a.counts.design_specs >= 1 && hasDecision('visual form expresses governed meaning'));
  add(6, 'Every component names anatomy, variants, states, and permitted and prohibited uses', a.counts.components >= 1 && a.gaps.underspecified_components.length === 0);
  add(7, 'The component taxonomy covers the required component families', a.gaps.missing_component_families.length === 0);
  add(8, 'Every visual and status state retains a governed semantic source', a.gaps.components_without_semantic_source.length === 0 && specClass('status-messaging') && hasDecision('every visual state retains a governed semantic source'));
  add(9, 'Forms, validation, evidence, upload, and document design are specified', specClass('forms-evidence'));
  add(10, 'Status, task, notification, timeline, and messaging design are specified', specClass('status-messaging'));
  add(11, 'Workbench design preserves reviewer, finance, support, privacy, and administrative-correction separation', a.coverage.workbench_postures_distinct && a.gaps.missing_workbench_postures.length === 0 && hasDecision('workbench design preserves authority separation'));
  add(12, 'Responsive, adaptive, low-bandwidth, and interrupted-service design are specified', specClass('responsive-interruption'));
  add(13, 'Content terms trace English and French to one canonical governed concept', a.counts.content_terms >= 1 && a.gaps.content_terms_without_bilingual_concept.length === 0 && hasDecision('canonical governed concept'));
  add(14, 'Complete-state coverage includes every required state', a.counts.component_state_specs >= 1 && a.gaps.missing_complete_states.length === 0);
  add(15, 'Reference prototypes cover the full affiliation vertical as reference candidates that are not approved', a.counts.reference_prototypes >= 1 && a.gaps.stages_without_reference_prototype.length === 0 && a.gaps.prototypes_not_labelled_candidate.length === 0 && hasDecision('reference prototypes are candidates'));
  add(16, 'Package 3 receives line-level review and a separate freeze commit', closureApproval && freezeApproval);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V7_G3_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V7-G3'));
    }
  }
  return findings;
}

export function generate(ctx = loadContext()) {
  const conditions = evaluate(ctx);
  const unmet = conditions.filter((c) => !c.satisfied);
  const outDir = join(VOLUME_DIR, 'generated', 'design-system');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    gate: 'V7-G3',
    disposition: 'VISUAL_COMPONENT_CONTENT_AND_REFERENCE_PROTOTYPE_DEFINITION_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v7-g3-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V7-G3 readiness', run);
}
