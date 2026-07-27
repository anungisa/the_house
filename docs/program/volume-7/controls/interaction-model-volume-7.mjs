// Control: Volume 7 Package 2 interaction-model coverage analysis and
// NON-AUTHORITATIVE projections.
//
// Emits deterministic JSON projections and a markdown report for the affiliation
// interaction architecture, task flows, and screen-state model. All generated
// files are projections of the source-controlled corpus and are never
// authoritative. Coverage gaps are reported as INFO backlog signals; only
// genuinely blocking structural defects are raised elsewhere as ERRORs.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}

const REQUIRED_SCREEN_STATES = ['loading', 'empty', 'success', 'error', 'denied'];

export function analyse(ctx) {
  const actors = byKind(ctx, 'REG-701', 'ACTOR');
  const journeys = byKind(ctx, 'REG-701', 'JOURNEY');
  const stages = byKind(ctx, 'REG-701', 'STAGE');
  const surfaces = byKind(ctx, 'REG-701', 'EXPERIENCE_SURFACE');
  const views = byKind(ctx, 'REG-701', 'VIEW');
  const flows = byKind(ctx, 'REG-701', 'TASK_FLOW');
  const wireflows = byKind(ctx, 'REG-701', 'WIRE_FLOW');
  const screens = byKind(ctx, 'REG-701', 'SCREEN_STATE');
  const benches = byKind(ctx, 'REG-701', 'WORKBENCH');
  const forms = byKind(ctx, 'REG-701', 'FORM_SECTION');

  const actions = byKind(ctx, 'REG-702', 'ACTION');
  const commands = byKind(ctx, 'REG-702', 'COMMAND_INTENT');
  const queries = byKind(ctx, 'REG-702', 'QUERY_INTENT');
  const validations = byKind(ctx, 'REG-702', 'VALIDATION_BEHAVIOUR');
  const contentReqs = byKind(ctx, 'REG-702', 'CONTENT_REQUIREMENT');
  const statusMsgs = byKind(ctx, 'REG-702', 'STATUS_MESSAGE');
  const errorMsgs = byKind(ctx, 'REG-702', 'ERROR_MESSAGE');
  const recoveries = byKind(ctx, 'REG-702', 'RECOVERY_PATH');
  const a11yBehaviours = byKind(ctx, 'REG-702', 'ACCESSIBILITY_BEHAVIOUR');
  const bilingualSemantics = byKind(ctx, 'REG-702', 'BILINGUAL_SEMANTIC');

  // Actions must map to a command intent, a query intent, or a local interaction.
  const actionsWithoutIntent = actions.filter(
    (a) => (a.command_or_query_intent ?? []).length === 0 && a.local_interaction !== true
  );
  // Every command intent must name its House authority.
  const commandsWithoutAuthority = commands.filter(
    (c) => !c.house_authority || !['House', 'Shared'].includes(c.expresses_intent_to)
  );
  // Every experience surface must declare an authority domain.
  const surfacesWithoutDomain = surfaces.filter((s) => !s.authority_domain);
  // Every actor journey must be covered by at least one task flow.
  const flowActors = new Set(flows.flatMap((f) => f.traces_to ?? []));
  const journeyActors = new Set(
    journeys.flatMap((j) => j.traces_to ?? []).concat(actors.map((a) => a.id))
  );
  const journeysWithoutFlow = journeys.length > 0 && flows.length === 0;
  // Every affiliation stage must trace to at least one surface or view.
  const stageRefTargets = new Set([...views, ...surfaces, ...flows].flatMap((r) => r.traces_to ?? []));
  const stagesWithoutSurface = stages.filter((s) => !stageRefTargets.has(s.id));
  // Every workbench must declare authority constraints and prohibited actions.
  const benchesWithoutConstraints = benches.filter(
    (b) => (b.authority_constraints ?? []).length === 0 || (b.prohibited_actions ?? []).length === 0
  );
  // Screen-state coverage across required documentary states.
  const screenTitles = screens.map((s) => String(s.title ?? '').toLowerCase());
  const missingScreenStates = REQUIRED_SCREEN_STATES.filter(
    (needle) => !screenTitles.some((t) => t.includes(needle))
  );

  return {
    counts: {
      actors: actors.length,
      journeys: journeys.length,
      stages: stages.length,
      surfaces: surfaces.length,
      views: views.length,
      task_flows: flows.length,
      wireflows: wireflows.length,
      screen_states: screens.length,
      workbenches: benches.length,
      form_sections: forms.length,
      actions: actions.length,
      command_intents: commands.length,
      query_intents: queries.length,
      validation_behaviours: validations.length,
      content_requirements: contentReqs.length,
      status_messages: statusMsgs.length,
      error_messages: errorMsgs.length,
      recovery_paths: recoveries.length,
      accessibility_behaviours: a11yBehaviours.length,
      bilingual_semantics: bilingualSemantics.length
    },
    gaps: {
      actions_without_intent: actionsWithoutIntent.map((r) => r.id),
      commands_without_house_authority: commandsWithoutAuthority.map((r) => r.id),
      surfaces_without_authority_domain: surfacesWithoutDomain.map((r) => r.id),
      stages_without_surface_or_view: stagesWithoutSurface.map((r) => r.id),
      workbenches_without_constraints: benchesWithoutConstraints.map((r) => r.id),
      missing_required_screen_states: missingScreenStates
    },
    coverage: {
      journeys_have_task_flows: !journeysWithoutFlow,
      flow_actor_links: flowActors.size,
      journey_actor_links: journeyActors.size
    },
    catalogues: {
      surfaces: surfaces.map((s) => ({ id: s.id, title: s.title, authority_domain: s.authority_domain })),
      views: views.map((v) => ({ id: v.id, title: v.title, surface_ref: v.surface_ref ?? null })),
      task_flows: flows.map((f) => ({ id: f.id, title: f.title, traces_to: f.traces_to ?? [] })),
      screen_states: screens.map((s) => ({ id: s.id, title: s.title })),
      workbenches: benches.map((b) => ({
        id: b.id,
        title: b.title,
        authority_posture: b.authority_posture ?? null,
        prohibited_actions: b.prohibited_actions ?? []
      })),
      command_intents: commands.map((c) => ({ id: c.id, title: c.title, house_authority: c.house_authority ?? null })),
      query_intents: queries.map((q) => ({ id: q.id, title: q.title }))
    }
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  for (const [name, list] of Object.entries(a.gaps)) {
    if (Array.isArray(list) && list.length > 0) {
      findings.push(makeFinding(Severity.INFO, 'INTERACTION_COVERAGE_GAP', `${name}: ${list.join(', ')}`, 'REG-701/REG-702'));
    }
  }
  return findings;
}

function report(ctx, a) {
  const now = new Date().toISOString();
  const countRows = Object.entries(a.counts).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const gapRows = Object.entries(a.gaps)
    .map(([k, v]) => `| ${k} | ${Array.isArray(v) ? v.length : 0} | ${(Array.isArray(v) ? v.join(', ') : '') || '(none)'} |`)
    .join('\n');
  return `# Volume 7 Package 2 — Interaction Model Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 7 affiliation interaction-model corpus. It is not a source of truth,
> confers no ratification, and asserts no implementation, final visual design,
> production content, accessibility conformance, bilingual validation, usability, or
> stakeholder-validation outcome. The Markdown chapters, YAML registers, JSON
> schemas, and control scripts are the authoritative record. Volume 0 through
> Volume 6 remain frozen/released and are not modified by Volume 7 work. Package 2
> defines documentary INTERACTION, TASK-FLOW, SCREEN-STATE, WORKBENCH, ACCESSIBILITY,
> BILINGUAL, and CONTENT-PATTERN specifications only and authorizes no implementation.

## Corpus counts

| Element | Count |
| --- | --- |
${countRows}

## Coverage backlog signals (non-blocking)

| Signal | Count | Identifiers |
| --- | --- | --- |
${gapRows}
`;
}

export function generate(ctx = loadContext()) {
  const a = analyse(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'interaction-model');
  mkdirSync(outDir, { recursive: true });

  const write = (name, obj) => writeFileSync(join(outDir, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');
  write('experience-surface-inventory.json', { surfaces: a.catalogues.surfaces, gaps: { surfaces_without_authority_domain: a.gaps.surfaces_without_authority_domain } });
  write('actor-task-flow-coverage.json', { actors: a.counts.actors, task_flows: a.catalogues.task_flows, journeys_have_task_flows: a.coverage.journeys_have_task_flows });
  write('affiliation-stage-to-surface-traceability.json', { stages: a.counts.stages, stages_without_surface_or_view: a.gaps.stages_without_surface_or_view });
  write('screen-state-matrix.json', { views: a.catalogues.views, screen_states: a.catalogues.screen_states, missing_required_screen_states: a.gaps.missing_required_screen_states });
  write('action-command-and-query-intent-analysis.json', { actions: a.counts.actions, command_intents: a.catalogues.command_intents, query_intents: a.catalogues.query_intents, actions_without_intent: a.gaps.actions_without_intent, commands_without_house_authority: a.gaps.commands_without_house_authority });
  write('representative-authority-flow-analysis.json', { command_intents: a.catalogues.command_intents.filter((c) => /authority|organization|club|session/i.test(c.title)) });
  write('requirement-response-and-evidence-interaction-analysis.json', { validation_behaviours: a.counts.validation_behaviours, form_sections: a.counts.form_sections });
  write('submission-review-and-resubmission-analysis.json', { status_messages: a.counts.status_messages, error_messages: a.counts.error_messages });
  write('decision-finance-reconciliation-and-activation-analysis.json', { status_messages: a.counts.status_messages });
  write('staff-workbench-authority-analysis.json', { workbenches: a.catalogues.workbenches, workbenches_without_constraints: a.gaps.workbenches_without_constraints });
  write('accessibility-bilingual-and-content-pattern-coverage.json', { accessibility_behaviours: a.counts.accessibility_behaviours, bilingual_semantics: a.counts.bilingual_semantics, content_requirements: a.counts.content_requirements });
  write('error-stale-degraded-and-recovery-coverage.json', { screen_states: a.counts.screen_states, recovery_paths: a.counts.recovery_paths, error_messages: a.counts.error_messages });
  writeFileSync(join(outDir, 'package-2-interaction-model-report.md'), report(ctx, a), 'utf8');
  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Interaction model coverage', run);
}
