// Control: Volume 9 Package 1 quality & master-test-governance-foundation coverage
// analysis and NON-AUTHORITATIVE projections.
//
// Emits deterministic JSON projections and a markdown coverage report for the
// quality and test-governance foundation. All generated files are projections of
// the source-controlled corpus and are never authoritative. The control also
// returns findings: coverage gaps enumerated by the directive are reported as INFO
// backlog signals; only genuinely blocking structural defects are raised elsewhere
// as ERRORs.

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
  const quality = byKind(ctx, 'REG-901', 'QUALITY_ATTRIBUTE');
  const invariants = byKind(ctx, 'REG-901', 'INSTITUTIONAL_INVARIANT');
  const objects = byKind(ctx, 'REG-901', 'TEST_OBJECT');
  const coverage = byKind(ctx, 'REG-901', 'COVERAGE_RECORD');
  const levels = byKind(ctx, 'REG-901', 'TEST_LEVEL');
  const tiers = byKind(ctx, 'REG-901', 'EVIDENCE_TIER');
  const independence = byKind(ctx, 'REG-901', 'INDEPENDENCE_LEVEL');
  const controls = byKind(ctx, 'REG-901', 'CONTROL');
  const requirements = byKind(ctx, 'REG-902', 'TEST_REQUIREMENT');
  const scenarios = byKind(ctx, 'REG-902', 'TEST_SCENARIO');
  const cases = byKind(ctx, 'REG-902', 'TEST_CASE');
  const oracles = byKind(ctx, 'REG-902', 'TEST_ORACLE');
  const environments = byKind(ctx, 'REG-902', 'TEST_ENVIRONMENT_CLASS');
  const datasets = byKind(ctx, 'REG-902', 'TEST_DATA_REQUIREMENT');
  const evidence = byKind(ctx, 'REG-902', 'TEST_EVIDENCE_REQUIREMENT');
  const resultModels = byKind(ctx, 'REG-902', 'TEST_RESULT_MODEL');
  const decisions = records(ctx, 'REG-903');
  const backlog = records(ctx, 'REG-904');

  const qualityWithoutLevels = quality.filter((q) => !(q.applicable_test_levels && q.applicable_test_levels.length > 0));
  const qualityWithoutEvidence = quality.filter((q) => !q.required_evidence_tier);
  const invariantsWithoutNegative = invariants.filter((v) => v.negative_expectation_required !== true);
  const requirementsWithoutInvariant = requirements.filter((t) => !t.institutional_invariant_ref);
  const requirementsWithoutNegative = requirements.filter((t) => !t.negative_outcome);
  const casesWithoutOracle = cases.filter((c) => !c.expected_result_oracle_ref);
  const oraclesWithoutBasis = oracles.filter((o) => !o.authoritative_basis);
  const environmentsWithoutProhibition = environments.filter((e) => !e.production_data_prohibition);
  const datasetsWithoutMinimization = datasets.filter((d) => !d.minimization_posture);
  const evidenceWithoutReproducibility = evidence.filter((e) => !e.reproducibility_requirement);
  const resultsWithoutInconclusive = resultModels.filter((r) => r.inconclusive_distinct_from_pass !== true);
  const defects = backlog.filter((b) => b.kind === 'DEFECT');
  const waivers = backlog.filter((b) => b.kind === 'WAIVER');
  const readiness = backlog.filter((b) => b.kind === 'READINESS');

  const levelSet = new Set(levels.map((l) => l.test_level));

  return {
    counts: {
      quality_attributes: quality.length,
      institutional_invariants: invariants.length,
      test_objects: objects.length,
      coverage_records: coverage.length,
      test_levels: levels.length,
      evidence_tiers: tiers.length,
      independence_levels: independence.length,
      controls: controls.length,
      test_requirements: requirements.length,
      test_scenarios: scenarios.length,
      test_cases: cases.length,
      test_oracles: oracles.length,
      environment_classes: environments.length,
      test_data_requirements: datasets.length,
      evidence_requirements: evidence.length,
      result_models: resultModels.length,
      decisions: decisions.length,
      backlog: backlog.length,
      defects: defects.length,
      waivers: waivers.length,
      readiness: readiness.length,
      distinct_test_levels_catalogued: levelSet.size
    },
    gaps: {
      quality_without_applicable_levels: qualityWithoutLevels.map((r) => r.id),
      quality_without_required_evidence_tier: qualityWithoutEvidence.map((r) => r.id),
      invariants_without_negative_expectation: invariantsWithoutNegative.map((r) => r.id),
      requirements_without_governed_invariant: requirementsWithoutInvariant.map((r) => r.id),
      requirements_without_negative_outcome: requirementsWithoutNegative.map((r) => r.id),
      cases_without_oracle: casesWithoutOracle.map((r) => r.id),
      oracles_without_authoritative_basis: oraclesWithoutBasis.map((r) => r.id),
      environments_without_production_data_prohibition: environmentsWithoutProhibition.map((r) => r.id),
      datasets_without_minimization: datasetsWithoutMinimization.map((r) => r.id),
      evidence_without_reproducibility: evidenceWithoutReproducibility.map((r) => r.id),
      results_without_inconclusive_distinction: resultsWithoutInconclusive.map((r) => r.id)
    },
    levels: [...levelSet].sort()
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  for (const [name, list] of Object.entries(a.gaps)) {
    if (list.length > 0) {
      findings.push(makeFinding(Severity.INFO, 'QUALITY_COVERAGE_GAP', `${name}: ${list.join(', ')}`, 'REG-901/REG-902'));
    }
  }
  return findings;
}

function report(ctx, a) {
  const now = new Date().toISOString();
  const countRows = Object.entries(a.counts).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const gapRows = Object.entries(a.gaps).map(([k, v]) => `| ${k} | ${v.length} | ${v.join(', ') || '(none)'} |`).join('\n');
  return `# Volume 9 Package 1 — Quality & Master-Test Governance Foundation Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 9 quality and master-test-governance foundation corpus. It is not a source
> of truth, confers no ratification, and asserts no implementation, executable test,
> test execution, passing result, conformance, compatibility, recovery, readiness,
> migration success, provider assurance, operational proof, or acceptance. The
> Markdown chapters, YAML registers, JSON schemas, and control scripts are the
> authoritative record. Volume 0 through Volume 8 remain frozen/released and are not
> modified by Volume 9 work. Volume 9 Package 1 defines QUALITY DIMENSIONS, TEST
> TAXONOMY, TEST OBJECTS, ENVIRONMENT AND DATA GOVERNANCE, EVIDENCE, TRACEABILITY,
> DEFECT, INDEPENDENCE, and ACCEPTANCE OBLIGATIONS only and authorizes no
> implementation or test execution.

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

  write('inherited-test-obligation-map.json', {
    inherited_baseline: 'central-registration-volume-8-v1.0.0',
    quality_attributes: a.counts.quality_attributes,
    institutional_invariants: a.counts.institutional_invariants,
    note: 'Volume 9 inherits Volume 0-8 obligations as the source of quality/test requirements; it authorizes no execution.'
  });
  write('quality-attribute-and-invariant-catalogue.json', {
    quality_attributes: a.counts.quality_attributes,
    institutional_invariants: a.counts.institutional_invariants,
    invariants_without_negative_expectation: a.gaps.invariants_without_negative_expectation,
    quality_without_applicable_levels: a.gaps.quality_without_applicable_levels
  });
  write('test-taxonomy-and-level-coverage.json', {
    test_levels_catalogued: a.counts.test_levels,
    distinct_test_levels: a.levels,
    evidence_tiers: a.counts.evidence_tiers,
    independence_levels: a.counts.independence_levels
  });
  write('test-object-scenario-case-oracle-evidence-model.json', {
    test_objects: a.counts.test_objects,
    test_requirements: a.counts.test_requirements,
    test_scenarios: a.counts.test_scenarios,
    test_cases: a.counts.test_cases,
    test_oracles: a.counts.test_oracles,
    evidence_requirements: a.counts.evidence_requirements,
    result_models: a.counts.result_models,
    cases_without_oracle: a.gaps.cases_without_oracle,
    oracles_without_authoritative_basis: a.gaps.oracles_without_authoritative_basis
  });
  write('environment-configuration-identity-and-data-coverage.json', {
    environment_classes: a.counts.environment_classes,
    test_data_requirements: a.counts.test_data_requirements,
    environments_without_production_data_prohibition: a.gaps.environments_without_production_data_prohibition,
    datasets_without_minimization: a.gaps.datasets_without_minimization
  });
  write('authority-tenant-jurisdiction-role-and-state-matrix.json', {
    test_scenarios: a.counts.test_scenarios,
    note: 'Each governed scenario carries actor/service, tenant, jurisdiction, resource, and lifecycle-state context.'
  });
  write('functional-contract-integration-data-and-migration-test-foundation.json', {
    test_requirements: a.counts.test_requirements,
    requirements_without_governed_invariant: a.gaps.requirements_without_governed_invariant,
    requirements_without_negative_outcome: a.gaps.requirements_without_negative_outcome
  });
  write('security-privacy-accessibility-bilingual-resilience-test-foundation.json', {
    quality_attributes: a.counts.quality_attributes,
    quality_without_required_evidence_tier: a.gaps.quality_without_required_evidence_tier
  });
  write('defect-exception-waiver-retest-and-regression-analysis.json', {
    defects: a.counts.defects,
    waivers: a.counts.waivers,
    backlog: a.counts.backlog
  });
  write('traceability-independence-acceptance-and-release-handoff.json', {
    independence_levels: a.counts.independence_levels,
    result_models: a.counts.result_models,
    results_without_inconclusive_distinction: a.gaps.results_without_inconclusive_distinction,
    readiness: a.counts.readiness
  });
  writeFileSync(join(outDir, 'package-1-quality-governance-report.md'), report(ctx, a), 'utf8');
  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Quality & master-test-governance foundation coverage', run);
}
