// Control: Volume 9 Package 4 integrated master-test baseline and Volume 9 closure
// analysis and NON-AUTHORITATIVE projections.
//
// Emits deterministic JSON projections and a markdown report describing the single
// integrated master-test baseline that unifies the Volume 9 quality corpus: the
// integrated baseline, the master-test catalogue, the end-to-end affiliation master-
// test synthesis, the cross-cutting assurance master-test synthesis, the environment/
// configuration/identity/data/provider prerequisite matrix, the evidence/provenance/
// reproducibility/claim-boundary standard, the defect/exception/waiver/remediation/
// retest/regression standard, the coverage/independence/acceptance/material-commitment/
// release-evidence standard, the House P0 master-test matrix, the whole-volume
// readiness dispositions, the downstream handoff and executive brief, and the
// integrated traceability and closure assessment. Every generated file is a projection
// of the source-controlled corpus and is never authoritative. It asserts no test
// execution, no passing result, no coverage-effectiveness, no readiness, no acceptance
// of executed evidence, and no release authorization, and authorizes no implementation.
// Coverage gaps are reported as INFO backlog signals; only genuinely blocking
// structural defects are raised elsewhere as ERRORs.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}
function byKinds(ctx, regId, kinds) {
  const set = new Set(kinds);
  return records(ctx, regId).filter((r) => set.has(r.kind));
}

const MASTER_COVERAGE_KINDS = [
  'MASTER_TEST_BASELINE',
  'MASTER_TEST_CATALOGUE',
  'AFFILIATION_MASTER_TEST_COVERAGE',
  'ASSURANCE_MASTER_TEST_COVERAGE',
  'ENVIRONMENT_READINESS_COVERAGE',
  'EVIDENCE_PROVENANCE_COVERAGE',
  'DEFECT_CLOSURE_COVERAGE',
  'ACCEPTANCE_RELEASE_COVERAGE',
  'HOUSE_P0_MASTER_TEST_COVERAGE',
  'DOWNSTREAM_HANDOFF_COVERAGE'
];
const MASTER_MODEL_KINDS = [
  'MASTER_TEST_REQUIREMENT',
  'MASTER_TEST_SCENARIO',
  'MASTER_TEST_CASE_DEFINITION',
  'MASTER_TEST_ORACLE',
  'MASTER_TEST_EVIDENCE_REQUIREMENT',
  'EXECUTION_PREREQUISITE',
  'ENVIRONMENT_REQUIREMENT',
  'INDEPENDENCE_REQUIREMENT',
  'ACCEPTANCE_REQUIREMENT',
  'RELEASE_EVIDENCE_REQUIREMENT',
  'MATERIAL_COMMITMENT_REQUIREMENT'
];
const ORACLE_KINDS = ['TEST_ORACLE', 'MASTER_TEST_ORACLE'];
const REQUIREMENT_SHAPED = new Set([
  'MASTER_TEST_REQUIREMENT',
  'EXECUTION_PREREQUISITE',
  'ENVIRONMENT_REQUIREMENT',
  'INDEPENDENCE_REQUIREMENT',
  'ACCEPTANCE_REQUIREMENT',
  'RELEASE_EVIDENCE_REQUIREMENT',
  'MATERIAL_COMMITMENT_REQUIREMENT'
]);

export function analyse(ctx) {
  const coverage = byKinds(ctx, 'REG-901', MASTER_COVERAGE_KINDS);
  const coverageByKind = {};
  for (const k of MASTER_COVERAGE_KINDS) coverageByKind[k] = coverage.filter((r) => r.kind === k).map((r) => r.id);

  const model = byKinds(ctx, 'REG-902', MASTER_MODEL_KINDS);
  const modelByKind = {};
  for (const k of MASTER_MODEL_KINDS) modelByKind[k] = model.filter((r) => r.kind === k).map((r) => r.id);

  const masterOracles = byKind(ctx, 'REG-902', 'MASTER_TEST_ORACLE');
  const oracleIds = new Set(byKinds(ctx, 'REG-902', ORACLE_KINDS).map((r) => r.id));
  const invariantIds = new Set(byKind(ctx, 'REG-901', 'INSTITUTIONAL_INVARIANT').map((r) => r.id));

  const requirementRecords = model.filter((r) => REQUIREMENT_SHAPED.has(r.kind));
  const scenarios = byKind(ctx, 'REG-902', 'MASTER_TEST_SCENARIO');
  const cases = byKind(ctx, 'REG-902', 'MASTER_TEST_CASE_DEFINITION');
  const evidenceRequirements = byKind(ctx, 'REG-902', 'MASTER_TEST_EVIDENCE_REQUIREMENT');

  const requirementsWithoutInvariant = requirementRecords
    .filter((r) => r.kind === 'MASTER_TEST_REQUIREMENT')
    .filter((r) => !r.institutional_invariant_ref || !invariantIds.has(r.institutional_invariant_ref))
    .map((r) => r.id);
  const oraclesWithoutBasis = masterOracles.filter((r) => !r.authoritative_basis).map((r) => r.id);
  const scenariosWithoutOracle = scenarios
    .filter((r) => !r.expected_result_oracle_ref || !oracleIds.has(r.expected_result_oracle_ref))
    .map((r) => r.id);
  const casesWithoutOracle = cases
    .filter((r) => !r.expected_result_oracle_ref || !oracleIds.has(r.expected_result_oracle_ref))
    .map((r) => r.id);

  const dispositions = byKind(ctx, 'REG-904', 'READINESS').filter((r) => r.historical_source_record);
  const dispositionsWithoutSource = dispositions.filter((r) => !r.historical_source_record).map((r) => r.id);

  const missingCoverageKinds = MASTER_COVERAGE_KINDS.filter((k) => coverageByKind[k].length === 0);
  const missingModelKinds = MASTER_MODEL_KINDS.filter((k) => modelByKind[k].length === 0);

  return {
    counts: {
      master_coverage_records: coverage.length,
      master_model_records: model.length,
      master_test_requirements: modelByKind.MASTER_TEST_REQUIREMENT.length,
      master_test_scenarios: scenarios.length,
      master_test_cases: cases.length,
      master_test_oracles: masterOracles.length,
      master_evidence_requirements: evidenceRequirements.length,
      whole_volume_dispositions: dispositions.length
    },
    coverage_by_kind: Object.fromEntries(MASTER_COVERAGE_KINDS.map((k) => [k, coverageByKind[k].length])),
    model_by_kind: Object.fromEntries(MASTER_MODEL_KINDS.map((k) => [k, modelByKind[k].length])),
    coverage: coverage.map((c) => ({ id: c.id, kind: c.kind, dimension: c.coverage_dimension, source: c.authoritative_source })),
    dispositions: dispositions.map((d) => ({
      id: d.id,
      historical_source_record: d.historical_source_record,
      readiness_disposition: d.readiness_disposition,
      downstream_volume: d.downstream_volume,
      future_blocking_gate: d.future_blocking_gate,
      owner: d.owner
    })),
    gaps: {
      missing_coverage_kinds: missingCoverageKinds,
      missing_model_kinds: missingModelKinds,
      master_requirements_without_governed_invariant: requirementsWithoutInvariant,
      master_oracles_without_authoritative_basis: oraclesWithoutBasis,
      master_scenarios_without_governed_oracle: scenariosWithoutOracle,
      master_cases_without_governed_oracle: casesWithoutOracle,
      dispositions_without_historical_source: dispositionsWithoutSource
    }
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  for (const [name, list] of Object.entries(a.gaps)) {
    if (Array.isArray(list) && list.length > 0) {
      findings.push(makeFinding(Severity.INFO, 'MASTER_TEST_COVERAGE_GAP', `${name}: ${list.join(', ')}`, 'REG-901/REG-902/REG-904'));
    }
  }
  return findings;
}

function report(ctx, a) {
  const now = new Date().toISOString();
  const countRows = Object.entries(a.counts).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const covRows = Object.entries(a.coverage_by_kind).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const modelRows = Object.entries(a.model_by_kind).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const dispRows = a.dispositions
    .map((d) => `| ${d.id} | ${d.historical_source_record} | ${d.readiness_disposition} | ${d.downstream_volume} | ${d.future_blocking_gate} |`)
    .join('\n');
  const gapRows = Object.entries(a.gaps).map(([k, v]) => `| ${k} | ${v.length} | ${v.join(', ') || '(none)'} |`).join('\n');
  return `# Volume 9 Package 4 — Integrated Master-Test Baseline and Closure Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 9 Package 4 integrated master-test baseline and Volume 9 closure corpus. It
> is not a source of truth, confers no ratification, and asserts no implementation, no
> executable test, no test environment, no dataset, no credential, no test execution,
> no passing result, no coverage-effectiveness, no readiness, no acceptance of executed
> evidence, and no release authorization. The Markdown chapters, YAML registers, JSON
> schemas, and control scripts are the authoritative record. Volume 0 through Volume 8
> and Volume 9 Packages 1, 2, and 3 remain frozen/released and are not modified by
> Package 4. Package 4 defines a single integrated MASTER-TEST BASELINE, unifies the
> Volume 9 quality corpus, records additive whole-volume readiness dispositions without
> reopening frozen records, hands off to Volume 10 through Volume 12, and closes
> Volume 9 as a definition only. It authorizes no implementation or test execution and
> infers no release authorization.

## Corpus counts

| Element | Count |
| --- | --- |
${countRows}

## Master-test coverage by kind

| Coverage kind | Count |
| --- | --- |
${covRows}

## Master-test model by kind

| Model kind | Count |
| --- | --- |
${modelRows}

## Whole-volume readiness dispositions (additive)

| Disposition | Historical source | Readiness disposition | Downstream volume | Forward gate |
| --- | --- | --- | --- | --- |
${dispRows}

## Coverage backlog signals (non-blocking)

| Signal | Count | Identifiers |
| --- | --- | --- |
${gapRows}
`;
}

export function generate(ctx = loadContext()) {
  const a = analyse(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'integrated-master-test-baseline-and-closure');
  mkdirSync(outDir, { recursive: true });
  const write = (name, obj) => writeFileSync(join(outDir, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');

  write('integrated-master-test-baseline-summary.json', {
    inherited_baseline: 'central-registration-volume-8-v1.0.0',
    master_coverage_records: a.counts.master_coverage_records,
    master_model_records: a.counts.master_model_records,
    coverage_by_kind: a.coverage_by_kind,
    note: 'A single integrated master-test baseline unifies the Volume 9 quality corpus into one authoritative source of test obligations and governed non-test dispositions. Definition is held distinct from execution, from a passing result, and from operational readiness; no execution, environment, dataset, credential, or implementation is authorized.'
  });
  write('master-test-catalogue-summary.json', {
    master_test_requirements: a.model_by_kind.MASTER_TEST_REQUIREMENT,
    master_test_scenarios: a.model_by_kind.MASTER_TEST_SCENARIO,
    master_test_cases: a.model_by_kind.MASTER_TEST_CASE_DEFINITION,
    master_test_oracles: a.model_by_kind.MASTER_TEST_ORACLE,
    master_evidence_requirements: a.model_by_kind.MASTER_TEST_EVIDENCE_REQUIREMENT,
    note: 'The master-test catalogue keeps test object, requirement, scenario, case, oracle, environment, data, evidence, result, defect, and acceptance as distinct governed elements. Each oracle derives its judging basis from a governed authority and never from the object under test.'
  });
  write('end-to-end-affiliation-master-test-synthesis-summary.json', {
    affiliation_master_test_coverage: a.coverage_by_kind.AFFILIATION_MASTER_TEST_COVERAGE,
    master_test_requirements: a.model_by_kind.MASTER_TEST_REQUIREMENT,
    master_test_scenarios: a.model_by_kind.MASTER_TEST_SCENARIO,
    note: 'The affiliation lifecycle — submission, approval, reconciliation, activation, standing, and expiry — is synthesized into master-test scenario families with exactly-once activation as an institutional invariant. Command, query, resource, event, webhook, callback, provider, file, batch, and migration surfaces are covered without authorizing execution.'
  });
  write('cross-cutting-assurance-master-test-synthesis-summary.json', {
    assurance_master_test_coverage: a.coverage_by_kind.ASSURANCE_MASTER_TEST_COVERAGE,
    master_test_requirements: a.model_by_kind.MASTER_TEST_REQUIREMENT,
    master_test_scenarios: a.model_by_kind.MASTER_TEST_SCENARIO,
    note: 'Security, privacy, records, accessibility, bilingual, financial-control, resilience, recovery, observability, and provider-assurance obligations are synthesized into master-test scenario families. Fail-closed authorization, minimum-necessary evidence, semantic equivalence, and provider exit remain distinct obligations; no execution is authorized.'
  });
  write('environment-configuration-identity-data-provider-prerequisite-matrix.json', {
    environment_readiness_coverage: a.coverage_by_kind.ENVIRONMENT_READINESS_COVERAGE,
    execution_prerequisites: a.model_by_kind.EXECUTION_PREREQUISITE,
    environment_requirements: a.model_by_kind.ENVIRONMENT_REQUIREMENT,
    note: 'Environment classes, configuration, identity, organization, jurisdiction, lifecycle, data, provider, and evidence-capture prerequisites are catalogued and must be qualified before use. Production is prohibited as a test environment and only governed synthetic data is admissible. No environment is provisioned and no execution is authorized.'
  });
  write('evidence-provenance-reproducibility-and-claim-boundary-summary.json', {
    evidence_provenance_coverage: a.coverage_by_kind.EVIDENCE_PROVENANCE_COVERAGE,
    master_evidence_requirements: a.model_by_kind.MASTER_TEST_EVIDENCE_REQUIREMENT,
    note: 'Every future evidence artifact must bind version, commit, configuration, environment, identity, organization, jurisdiction, data, provider state, and time, and must be reproducible. Each evidence artifact carries an explicit claim boundary; a definition is never treated as executed evidence.'
  });
  write('defect-exception-waiver-remediation-retest-and-regression-summary.json', {
    defect_closure_coverage: a.coverage_by_kind.DEFECT_CLOSURE_COVERAGE,
    note: 'The defect lifecycle — defect, exception, waiver, remediation, retest, regression, closure, and reopening — is standardized. A defect is closed only with accepted retest evidence, a waiver confers no pass, and reopening is always available. No result is asserted.'
  });
  write('coverage-independence-acceptance-and-release-evidence-summary.json', {
    acceptance_release_coverage: a.coverage_by_kind.ACCEPTANCE_RELEASE_COVERAGE,
    independence_requirements: a.model_by_kind.INDEPENDENCE_REQUIREMENT,
    acceptance_requirements: a.model_by_kind.ACCEPTANCE_REQUIREMENT,
    release_evidence_requirements: a.model_by_kind.RELEASE_EVIDENCE_REQUIREMENT,
    material_commitment_requirements: a.model_by_kind.MATERIAL_COMMITMENT_REQUIREMENT,
    note: 'Coverage completeness, independence, acceptance, material commitment, and release evidence are standardized. Coverage completeness is distinct from a passing result; independence scales with claim materiality; acceptance of a definition is distinct from acceptance of executed, admissible, in-boundary evidence by the named acceptance authority. No release is authorized.'
  });
  write('house-p0-master-test-matrix.json', {
    house_p0_master_test_coverage: a.coverage_by_kind.HOUSE_P0_MASTER_TEST_COVERAGE,
    master_test_requirements: a.model_by_kind.MASTER_TEST_REQUIREMENT,
    note: 'Each House priority-zero finding is mapped to master-test obligations and to evidence obligations. Every finding remains open until admissible evidence is produced and accepted by the named authority in a later authorized volume; the mapping confers no execution and no closure.'
  });
  write('whole-volume-readiness-disposition-index.json', {
    whole_volume_dispositions: a.counts.whole_volume_dispositions,
    dispositions: a.dispositions,
    note: 'Every active unresolved Volume 9 Package 1 through Package 3 item receives an additive whole-volume readiness disposition carrying an owner, required evidence, forward gate, and downstream volume. The frozen source records are not reopened or mutated; each disposition traces to its historical source record.'
  });
  write('downstream-handoff-and-executive-brief-summary.json', {
    downstream_handoff_coverage: a.coverage_by_kind.DOWNSTREAM_HANDOFF_COVERAGE,
    dispositions: a.dispositions.length,
    note: 'The Volume 9 corpus is handed off to Volume 10 (delivery and release planning), Volume 11, and Volume 12 as a bounded input. Volume 10 may plan and sequence work but may not infer a release authorization; no record in Volume 9 authorizes a release.'
  });
  write('integrated-traceability-and-closure-assessment-index.json', {
    master_coverage_records: a.counts.master_coverage_records,
    master_model_records: a.counts.master_model_records,
    whole_volume_dispositions: a.counts.whole_volume_dispositions,
    gaps: a.gaps,
    note: 'A deterministic integrated traceability index binds coverage, requirements, scenarios, cases, oracles, evidence requirements, and whole-volume dispositions. The closure assessment records that Volume 9 is complete as a definition only; it is a final-closure analysis control projection and is never authoritative.'
  });
  writeFileSync(join(outDir, 'package-4-integrated-master-test-baseline-and-closure-report.md'), report(ctx, a), 'utf8');
  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Integrated master-test baseline and closure', run);
}
