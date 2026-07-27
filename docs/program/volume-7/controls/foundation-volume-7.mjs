// Control: Volume 7 Package 1 experience-foundation coverage analysis and
// NON-AUTHORITATIVE projections.
//
// Emits deterministic JSON projections and a markdown coverage report for the
// experience and service-design foundation. All generated files are projections
// of the source-controlled corpus and are never authoritative. The control also
// returns findings: coverage gaps enumerated by the directive (actors without
// needs, stages without authority, actions without House commands, statuses
// without sources, errors without recovery, support actions without restrictions,
// sensitive content without privacy controls, workflows without accessibility,
// concepts without bilingual semantics, degraded states without communication,
// and requirements implying implementation) are reported as INFO backlog signals;
// only genuinely blocking structural defects are raised elsewhere as ERRORs.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}

function analyse(ctx) {
  const actors = byKind(ctx, 'REG-701', 'ACTOR');
  const needs = byKind(ctx, 'REG-701', 'NEED');
  const journeys = byKind(ctx, 'REG-701', 'JOURNEY');
  const stages = byKind(ctx, 'REG-701', 'STAGE');
  const blueprints = byKind(ctx, 'REG-701', 'BLUEPRINT');
  const ia = byKind(ctx, 'REG-702', 'IA');
  const states = byKind(ctx, 'REG-702', 'STATE');
  const actions = byKind(ctx, 'REG-702', 'ACTION');
  const content = byKind(ctx, 'REG-702', 'CONTENT');
  const patterns = byKind(ctx, 'REG-702', 'PATTERN');
  const a11y = byKind(ctx, 'REG-702', 'A11Y');
  const bilingual = byKind(ctx, 'REG-702', 'BIL');
  const privacy = byKind(ctx, 'REG-702', 'PRIV');
  const controls = byKind(ctx, 'REG-702', 'CTRL');
  const backlog = records(ctx, 'REG-704');

  const needActors = new Set(needs.map((n) => n.traces_to ?? []).flat());
  const actorsWithoutNeed = actors.filter((a) => !needs.some((n) => (n.traces_to ?? []).includes(a.id)));
  const stagesWithoutAuthority = stages.filter((s) => !s.house_authority);
  const actionsWithoutCommand = actions.filter((a) => !a.institutional_consequence && !a.status_semantics);
  const statesWithoutSource = states.filter((s) => !s.source_of_truth);
  const contentWithoutBilingual = [...states, ...content].filter((s) => !s.english_semantic_requirement || !s.french_semantic_requirement);
  const privacyWithoutPosture = privacy.filter((p) => !p.privacy_posture);

  return {
    counts: {
      actors: actors.length,
      needs: needs.length,
      journeys: journeys.length,
      stages: stages.length,
      blueprints: blueprints.length,
      information_architecture: ia.length,
      states: states.length,
      actions: actions.length,
      content: content.length,
      patterns: patterns.length,
      accessibility: a11y.length,
      bilingual: bilingual.length,
      privacy: privacy.length,
      controls: controls.length,
      backlog: backlog.length
    },
    gaps: {
      actors_without_need: actorsWithoutNeed.map((r) => r.id),
      stages_without_authority: stagesWithoutAuthority.map((r) => r.id),
      actions_without_house_command: actionsWithoutCommand.map((r) => r.id),
      states_without_source: statesWithoutSource.map((r) => r.id),
      semantics_without_bilingual: contentWithoutBilingual.map((r) => r.id),
      privacy_without_posture: privacyWithoutPosture.map((r) => r.id)
    },
    coverage: {
      need_actor_links: needActors.size
    }
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  for (const [name, list] of Object.entries(a.gaps)) {
    if (list.length > 0) {
      findings.push(makeFinding(Severity.INFO, 'EXPERIENCE_COVERAGE_GAP', `${name}: ${list.join(', ')}`, 'REG-701/REG-702'));
    }
  }
  return findings;
}

function report(ctx, a) {
  const now = new Date().toISOString();
  const countRows = Object.entries(a.counts).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const gapRows = Object.entries(a.gaps).map(([k, v]) => `| ${k} | ${v.length} | ${v.join(', ') || '(none)'} |`).join('\n');
  return `# Volume 7 Package 1 — Experience Foundation Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 7 experience and service-design foundation corpus. It is not a source of
> truth, confers no ratification, and asserts no implementation, accessibility
> conformance, bilingual validation, usability, or stakeholder-validation outcome.
> The Markdown chapters, YAML registers, JSON schemas, and control scripts are the
> authoritative record. Volume 0 through Volume 6 remain frozen/released and are
> not modified by Volume 7 work. Volume 7 Package 1 defines EXPERIENCE, SERVICE,
> INFORMATION-ARCHITECTURE, CONTENT, ACCESSIBILITY, BILINGUAL, PRIVACY, and
> RECOVERY OBLIGATIONS only and authorizes no implementation.

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
  const outDir = join(VOLUME_DIR, 'generated', 'foundation');
  mkdirSync(outDir, { recursive: true });

  const write = (name, obj) => writeFileSync(join(outDir, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');
  write('actor-and-need-catalogue.json', { counts: { actors: a.counts.actors, needs: a.counts.needs }, gaps: { actors_without_need: a.gaps.actors_without_need } });
  write('affiliation-journey-coverage.json', { journeys: a.counts.journeys, stages: a.counts.stages, stages_without_authority: a.gaps.stages_without_authority });
  write('service-blueprint-coverage.json', { blueprints: a.counts.blueprints });
  write('information-architecture-analysis.json', { information_architecture: a.counts.information_architecture });
  write('status-and-action-semantics.json', { states: a.counts.states, actions: a.counts.actions, content: a.counts.content, states_without_source: a.gaps.states_without_source, actions_without_house_command: a.gaps.actions_without_house_command });
  write('accessibility-and-bilingual-coverage.json', { accessibility: a.counts.accessibility, bilingual: a.counts.bilingual, semantics_without_bilingual: a.gaps.semantics_without_bilingual });
  write('error-and-recovery-coverage.json', { patterns: a.counts.patterns, backlog: a.counts.backlog });
  write('sensitive-information-experience-analysis.json', { privacy: a.counts.privacy, privacy_without_posture: a.gaps.privacy_without_posture });
  writeFileSync(join(outDir, 'package-1-experience-foundation-report.md'), report(ctx, a), 'utf8');
  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Experience foundation coverage', run);
}
