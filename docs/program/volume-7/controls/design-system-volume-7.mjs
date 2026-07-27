// Control: Volume 7 Package 3 design-system coverage analysis and
// NON-AUTHORITATIVE projections.
//
// Emits deterministic JSON projections and a markdown report for the visual
// system, component taxonomy, content terms, complete-state specifications, and
// affiliation reference prototypes. All generated files are projections of the
// source-controlled corpus and are never authoritative. Coverage gaps are
// reported as INFO backlog signals; genuinely blocking structural defects are
// raised elsewhere as ERRORs.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}

// The component families the affiliation experience requires.
export const REQUIRED_COMPONENT_FAMILIES = [
  'navigation',
  'page-headers',
  'cards',
  'task-items',
  'progress',
  'forms',
  'validation',
  'status',
  'timelines',
  'tables',
  'responsive-lists',
  'evidence',
  'documents',
  'confirmations',
  'notifications',
  'help-support'
];

// The complete set of interaction states Package 3 must specify.
export const REQUIRED_COMPLETE_STATES = [
  'default',
  'hover',
  'focus',
  'keyboard',
  'loading',
  'empty',
  'success',
  'error',
  'denied',
  'conflict',
  'stale',
  'degraded',
  'interrupted',
  'recovery',
  'confirmation',
  'destructive'
];

// The governed staff workbench authority postures that must remain distinct.
export const REQUIRED_WORKBENCH_POSTURES = [
  'JURISDICTION_REVIEWER',
  'FINANCE_OPERATOR',
  'SUPPORT_OPERATOR',
  'PRIVACY_OR_RECORDS_FUNCTION',
  'SERVICE_ADMINISTRATOR'
];

export function analyse(ctx) {
  const visualSystems = byKind(ctx, 'REG-701', 'VISUAL_SYSTEM');
  const components = byKind(ctx, 'REG-701', 'COMPONENT');
  const prototypes = byKind(ctx, 'REG-701', 'REFERENCE_PROTOTYPE');

  const designSpecs = byKind(ctx, 'REG-702', 'DESIGN_SPEC');
  const componentStates = byKind(ctx, 'REG-702', 'COMPONENT_STATE');
  const contentTerms = byKind(ctx, 'REG-702', 'CONTENT_TERM');

  const workbenchComponents = components.filter((c) => c.component_family === 'workbench');
  const familyComponents = components.filter((c) => c.component_family !== 'workbench');

  // Component families present (excluding the workbench family, checked separately).
  const familiesPresent = new Set(familyComponents.map((c) => c.component_family).filter(Boolean));
  const missingFamilies = REQUIRED_COMPONENT_FAMILIES.filter((f) => !familiesPresent.has(f));

  // Non-workbench components must fully specify anatomy, variants, states, and uses.
  const underspecifiedComponents = familyComponents.filter(
    (c) =>
      (c.anatomy ?? []).length === 0 ||
      (c.variants ?? []).length === 0 ||
      (c.states ?? []).length === 0 ||
      (c.permitted_uses ?? []).length === 0 ||
      (c.prohibited_uses ?? []).length === 0
  );

  // Every component must name a governed semantic source.
  const componentsWithoutSemanticSource = components.filter((c) => !c.governed_semantic_source);

  // Workbench design postures present and distinct.
  const posturesPresent = new Set(workbenchComponents.map((c) => c.authority_posture).filter(Boolean));
  const missingWorkbenchPostures = REQUIRED_WORKBENCH_POSTURES.filter((p) => !posturesPresent.has(p));
  const workbenchPosturesDistinct =
    workbenchComponents.length > 0 &&
    posturesPresent.size === workbenchComponents.length &&
    missingWorkbenchPostures.length === 0;

  // Complete-state coverage across the required set.
  const statesCovered = new Set(
    componentStates.flatMap((s) => (s.required_states ?? []).map((x) => String(x).toLowerCase()))
  );
  const missingCompleteStates = REQUIRED_COMPLETE_STATES.filter((s) => !statesCovered.has(s));

  // Content terms must trace English and French to one canonical governed concept.
  const contentTermsWithoutBilingualConcept = contentTerms.filter(
    (t) => !t.canonical_concept || !t.english_semantic_requirement || !t.french_semantic_requirement
  );

  // Reference-prototype vertical coverage and reference-candidate labelling.
  const stages = records(ctx, 'REG-701').filter((r) => r.kind === 'STAGE').map((r) => r.id);
  const stagesCovered = new Set(prototypes.flatMap((p) => p.covers_stages ?? []));
  const stagesWithoutPrototype = stages.filter((s) => !stagesCovered.has(s));
  const prototypesNotLabelledCandidate = prototypes.filter(
    (p) => p.reference_status !== 'REFERENCE_CANDIDATE_NOT_APPROVED'
  );

  // Design-spec class coverage.
  const specClasses = new Set(designSpecs.map((d) => d.spec_class).filter(Boolean));

  return {
    counts: {
      visual_systems: visualSystems.length,
      components: components.length,
      component_families: familiesPresent.size,
      workbench_designs: workbenchComponents.length,
      reference_prototypes: prototypes.length,
      design_specs: designSpecs.length,
      component_state_specs: componentStates.length,
      content_terms: contentTerms.length
    },
    gaps: {
      missing_component_families: missingFamilies,
      underspecified_components: underspecifiedComponents.map((r) => r.id),
      components_without_semantic_source: componentsWithoutSemanticSource.map((r) => r.id),
      missing_workbench_postures: missingWorkbenchPostures,
      missing_complete_states: missingCompleteStates,
      content_terms_without_bilingual_concept: contentTermsWithoutBilingualConcept.map((r) => r.id),
      stages_without_reference_prototype: stagesWithoutPrototype,
      prototypes_not_labelled_candidate: prototypesNotLabelledCandidate.map((r) => r.id)
    },
    coverage: {
      workbench_postures_distinct: workbenchPosturesDistinct,
      spec_classes: [...specClasses]
    },
    catalogues: {
      visual_systems: visualSystems.map((v) => ({ id: v.id, title: v.title })),
      components: familyComponents.map((c) => ({ id: c.id, title: c.title, component_family: c.component_family })),
      workbench_designs: workbenchComponents.map((c) => ({ id: c.id, title: c.title, authority_posture: c.authority_posture ?? null })),
      reference_prototypes: prototypes.map((p) => ({ id: p.id, title: p.title, reference_status: p.reference_status ?? null, covers_stages: p.covers_stages ?? [] })),
      content_terms: contentTerms.map((t) => ({ id: t.id, title: t.title, canonical_concept: t.canonical_concept ?? null }))
    }
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  for (const [name, list] of Object.entries(a.gaps)) {
    if (Array.isArray(list) && list.length > 0) {
      findings.push(makeFinding(Severity.INFO, 'DESIGN_SYSTEM_COVERAGE_GAP', `${name}: ${list.join(', ')}`, 'REG-701/REG-702'));
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
  return `# Volume 7 Package 3 — Design-System Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 7 Package 3 design corpus. It is not a source of truth, confers no
> ratification, and asserts no implementation, production content, validated
> translation, accessibility conformance, usability, stakeholder approval, or
> production finality. Reference prototypes are reference candidates that are not
> approved. The Markdown chapters, YAML registers, JSON schemas, and control
> scripts are the authoritative record. Volume 0 through Volume 6 remain
> frozen/released and are not modified by Volume 7 work. Package 3 defines
> documentary visual, component, content, and reference-prototype design only and
> authorizes no implementation.

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
  const outDir = join(VOLUME_DIR, 'generated', 'design-system');
  mkdirSync(outDir, { recursive: true });

  const write = (name, obj) => writeFileSync(join(outDir, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');
  write('visual-system-inventory.json', { visual_systems: a.catalogues.visual_systems, spec_classes: a.coverage.spec_classes });
  write('component-taxonomy-coverage.json', { components: a.catalogues.components, missing_component_families: a.gaps.missing_component_families, underspecified_components: a.gaps.underspecified_components });
  write('workbench-authority-separation.json', { workbench_designs: a.catalogues.workbench_designs, workbench_postures_distinct: a.coverage.workbench_postures_distinct, missing_workbench_postures: a.gaps.missing_workbench_postures });
  write('complete-state-coverage.json', { component_state_specs: a.counts.component_state_specs, missing_complete_states: a.gaps.missing_complete_states });
  write('content-term-bilingual-coverage.json', { content_terms: a.catalogues.content_terms, content_terms_without_bilingual_concept: a.gaps.content_terms_without_bilingual_concept });
  write('reference-prototype-coverage.json', { reference_prototypes: a.catalogues.reference_prototypes, stages_without_reference_prototype: a.gaps.stages_without_reference_prototype, prototypes_not_labelled_candidate: a.gaps.prototypes_not_labelled_candidate });
  writeFileSync(join(outDir, 'package-3-design-system-report.md'), report(ctx, a), 'utf8');
  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Design-system coverage', run);
}
