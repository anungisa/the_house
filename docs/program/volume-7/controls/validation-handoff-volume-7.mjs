// Control: Volume 7 Package 4 experience-validation and implementation-handoff
// coverage analysis and NON-AUTHORITATIVE projections.
//
// Emits deterministic JSON projections and a markdown report for the validation
// families, evaluation scenarios, validation activities, measurement definitions,
// content-governance rules, and implementation/service/content handoff artifacts.
// All generated files are projections of the source-controlled corpus and are
// never authoritative. Package 4 DEFINES how the frozen Package 1-3 corpus will be
// validated and handed off; it executes no validation, approves no content,
// establishes no measurement result, and authorizes no implementation. Coverage
// gaps are reported as INFO backlog signals; genuinely blocking structural defects
// are raised elsewhere as ERRORs.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}
function nonEmpty(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && String(v).trim().length > 0;
}

// The validation families the experience-validation doctrine requires. Each family
// relies only on its own permitted evidence; no family substitutes for another.
export const REQUIRED_VALIDATION_FAMILIES = [
  'design-completeness',
  'expert-review',
  'prototype-evaluation',
  'usability',
  'accessibility',
  'bilingual',
  'operational',
  'stakeholder-acceptance',
  'production-approval'
];

// The governed path classes every evaluation scenario must jointly cover.
export const REQUIRED_SCENARIO_PATH_CLASSES = [
  'primary',
  'exception',
  'denied',
  'stale',
  'degraded',
  'recovery'
];

// The validation activities the plans must define.
export const REQUIRED_VALIDATION_ACTIVITIES = [
  'usability',
  'accessibility',
  'bilingual',
  'expert-review',
  'operational'
];

// The handoff classes the implementation and service handoff must define.
export const REQUIRED_HANDOFF_CLASSES = [
  'implementation-conformance',
  'service-readiness',
  'content-readiness'
];

export function analyse(ctx) {
  const families = byKind(ctx, 'REG-702', 'VALIDATION_FAMILY');
  const measurements = byKind(ctx, 'REG-702', 'MEASUREMENT_DEFINITION');
  const contentRules = byKind(ctx, 'REG-702', 'CONTENT_GOVERNANCE_RULE');

  const scenarios = byKind(ctx, 'REG-701', 'EVALUATION_SCENARIO');
  const activities = byKind(ctx, 'REG-701', 'VALIDATION_ACTIVITY');
  const handoffs = byKind(ctx, 'REG-701', 'HANDOFF_ARTIFACT');

  // Validation-family coverage and completeness.
  const familyClasses = new Set(families.map((f) => f.spec_class).filter(Boolean));
  const missingValidationFamilies = REQUIRED_VALIDATION_FAMILIES.filter((f) => !familyClasses.has(f));
  const underspecifiedFamilies = families.filter(
    (f) =>
      !nonEmpty(f.validation_objective) ||
      !nonEmpty(f.permitted_evidence) ||
      !nonEmpty(f.prohibited_inference) ||
      !nonEmpty(f.qualification_requirement) ||
      !nonEmpty(f.evaluation_environment) ||
      !nonEmpty(f.defect_treatment) ||
      !nonEmpty(f.retest_rule) ||
      !nonEmpty(f.acceptance_authority)
  );

  // Evaluation-scenario stage and path-class coverage.
  const stages = records(ctx, 'REG-701').filter((r) => r.kind === 'STAGE').map((r) => r.id);
  const stagesCovered = new Set(scenarios.flatMap((s) => s.covers_stages ?? []));
  const stagesWithoutScenario = stages.filter((s) => !stagesCovered.has(s));
  const pathClassesCovered = new Set(
    scenarios.flatMap((s) => (s.states ?? []).map((x) => String(x).toLowerCase()))
  );
  const missingScenarioPathClasses = REQUIRED_SCENARIO_PATH_CLASSES.filter((c) => !pathClassesCovered.has(c));
  const underspecifiedScenarios = scenarios.filter(
    (s) =>
      !nonEmpty(s.protocol_steps) ||
      !nonEmpty(s.expected_evidence) ||
      !nonEmpty(s.exception_paths) ||
      !nonEmpty(s.validation_family_ref)
  );

  // Validation-activity coverage and completeness.
  const activityClasses = new Set(activities.map((a) => a.activity_class).filter(Boolean));
  const missingValidationActivities = REQUIRED_VALIDATION_ACTIVITIES.filter((a) => !activityClasses.has(a));
  const underspecifiedActivities = activities.filter(
    (a) =>
      !nonEmpty(a.participant_governance) ||
      !nonEmpty(a.permitted_evidence) ||
      !nonEmpty(a.prohibited_inferences) ||
      !nonEmpty(a.acceptance_authority) ||
      !nonEmpty(a.evaluation_environment) ||
      !nonEmpty(a.defect_treatment) ||
      !nonEmpty(a.retest_rule)
  );

  // Handoff-artifact coverage and completeness.
  const handoffClasses = new Set(handoffs.map((h) => h.handoff_class).filter(Boolean));
  const missingHandoffClasses = REQUIRED_HANDOFF_CLASSES.filter((c) => !handoffClasses.has(c));
  const underspecifiedHandoffs = handoffs.filter(
    (h) =>
      !nonEmpty(h.design_sources) ||
      !nonEmpty(h.conformance_dimensions) ||
      !nonEmpty(h.implementation_evidence) ||
      !nonEmpty(h.design_review_evidence) ||
      !nonEmpty(h.deviation_treatment) ||
      !nonEmpty(h.future_authority)
  );

  // Measurement-definition completeness (consent and interpretation bounds).
  const underspecifiedMeasurements = measurements.filter(
    (m) =>
      !nonEmpty(m.measure_definition) ||
      !nonEmpty(m.consent_basis) ||
      !nonEmpty(m.interpretation_limit) ||
      !nonEmpty(m.aggregation_rule)
  );

  // Content-governance-rule completeness (approval, lifecycle, localization).
  const underspecifiedContentRules = contentRules.filter(
    (c) =>
      !nonEmpty(c.governance_rule) ||
      !nonEmpty(c.approval_authority) ||
      !nonEmpty(c.lifecycle_rule) ||
      !nonEmpty(c.localization_rule)
  );

  return {
    counts: {
      validation_families: families.length,
      evaluation_scenarios: scenarios.length,
      validation_activities: activities.length,
      handoff_artifacts: handoffs.length,
      measurement_definitions: measurements.length,
      content_governance_rules: contentRules.length
    },
    gaps: {
      missing_validation_families: missingValidationFamilies,
      underspecified_validation_families: underspecifiedFamilies.map((r) => r.id),
      stages_without_evaluation_scenario: stagesWithoutScenario,
      missing_scenario_path_classes: missingScenarioPathClasses,
      underspecified_evaluation_scenarios: underspecifiedScenarios.map((r) => r.id),
      missing_validation_activities: missingValidationActivities,
      underspecified_validation_activities: underspecifiedActivities.map((r) => r.id),
      missing_handoff_classes: missingHandoffClasses,
      underspecified_handoff_artifacts: underspecifiedHandoffs.map((r) => r.id),
      underspecified_measurement_definitions: underspecifiedMeasurements.map((r) => r.id),
      underspecified_content_governance_rules: underspecifiedContentRules.map((r) => r.id)
    },
    coverage: {
      validation_family_classes: [...familyClasses],
      validation_activity_classes: [...activityClasses],
      handoff_classes: [...handoffClasses]
    },
    catalogues: {
      validation_families: families.map((f) => ({ id: f.id, title: f.title, spec_class: f.spec_class ?? null })),
      evaluation_scenarios: scenarios.map((s) => ({ id: s.id, title: s.title, covers_stages: s.covers_stages ?? [], states: s.states ?? [] })),
      validation_activities: activities.map((a) => ({ id: a.id, title: a.title, activity_class: a.activity_class ?? null })),
      handoff_artifacts: handoffs.map((h) => ({ id: h.id, title: h.title, handoff_class: h.handoff_class ?? null })),
      measurement_definitions: measurements.map((m) => ({ id: m.id, title: m.title })),
      content_governance_rules: contentRules.map((c) => ({ id: c.id, title: c.title }))
    }
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  for (const [name, list] of Object.entries(a.gaps)) {
    if (Array.isArray(list) && list.length > 0) {
      findings.push(makeFinding(Severity.INFO, 'VALIDATION_HANDOFF_COVERAGE_GAP', `${name}: ${list.join(', ')}`, 'REG-701/REG-702'));
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
  return `# Volume 7 Package 4 — Experience-Validation and Handoff Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 7 Package 4 experience-validation and implementation-handoff corpus. It is
> not a source of truth, confers no ratification, and asserts no executed
> validation, usability result, accessibility conformance, bilingual equivalence,
> stakeholder approval, production design approval, measurement result, content
> approval, or implementation. Package 4 defines how the frozen Package 1-3 corpus
> will be validated and handed off and authorizes no implementation. The Markdown
> chapters, YAML registers, JSON schemas, and control scripts are the authoritative
> record. Volume 0 through Volume 6 remain frozen/released and are not modified by
> Volume 7 work.

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
  const outDir = join(VOLUME_DIR, 'generated', 'validation-handoff');
  mkdirSync(outDir, { recursive: true });

  const write = (name, obj) => writeFileSync(join(outDir, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');
  write('validation-family-coverage.json', { validation_families: a.catalogues.validation_families, missing_validation_families: a.gaps.missing_validation_families, underspecified_validation_families: a.gaps.underspecified_validation_families });
  write('evaluation-scenario-coverage.json', { evaluation_scenarios: a.catalogues.evaluation_scenarios, stages_without_evaluation_scenario: a.gaps.stages_without_evaluation_scenario, missing_scenario_path_classes: a.gaps.missing_scenario_path_classes, underspecified_evaluation_scenarios: a.gaps.underspecified_evaluation_scenarios });
  write('validation-activity-coverage.json', { validation_activities: a.catalogues.validation_activities, missing_validation_activities: a.gaps.missing_validation_activities, underspecified_validation_activities: a.gaps.underspecified_validation_activities });
  write('handoff-artifact-coverage.json', { handoff_artifacts: a.catalogues.handoff_artifacts, missing_handoff_classes: a.gaps.missing_handoff_classes, underspecified_handoff_artifacts: a.gaps.underspecified_handoff_artifacts });
  write('measurement-consent-coverage.json', { measurement_definitions: a.catalogues.measurement_definitions, underspecified_measurement_definitions: a.gaps.underspecified_measurement_definitions });
  write('content-governance-coverage.json', { content_governance_rules: a.catalogues.content_governance_rules, underspecified_content_governance_rules: a.gaps.underspecified_content_governance_rules });
  writeFileSync(join(outDir, 'package-4-validation-handoff-report.md'), report(ctx, a), 'utf8');
  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Validation-handoff coverage', run);
}
