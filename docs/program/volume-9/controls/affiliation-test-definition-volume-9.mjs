// Control: Volume 9 Package 2 club-affiliation functional, contract, workflow,
// data, and migration test-definition coverage analysis and NON-AUTHORITATIVE
// projections.
//
// Emits deterministic JSON projections and a markdown report describing the
// affiliation test-definition corpus: test domains, the actor/authority/
// organization/jurisdiction matrix, experience-action-to-obligation traceability,
// the command/query/resource/response contract matrix, workflow negative/conflict/
// recovery coverage, requirement/evidence/completeness/submission analysis, review/
// return/correction/resubmission analysis, decision/finance/reconciliation/
// activation/standing analysis, event/webhook/provider/exchange analysis, data-
// integrity/database/migration/coexistence analysis, and House P0 affiliation test
// coverage. Every generated file is a projection of the source-controlled corpus
// and is never authoritative. It asserts no test execution, no passing result, no
// conformance, compatibility, integration, database, migration, provider,
// operational, readiness, or acceptance claim, and authorizes no implementation.
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

const REQUIREMENT_KINDS = [
  'FUNCTIONAL_TEST_REQUIREMENT',
  'WORKFLOW_TEST_REQUIREMENT',
  'CONTRACT_TEST_REQUIREMENT',
  'EVENT_TEST_REQUIREMENT',
  'WEBHOOK_TEST_REQUIREMENT',
  'PROVIDER_TEST_REQUIREMENT',
  'DATA_QUALITY_TEST_REQUIREMENT',
  'DATABASE_BEHAVIOUR_TEST_REQUIREMENT',
  'MIGRATION_TEST_REQUIREMENT'
];
const SCENARIO_KINDS = [
  'NEGATIVE_TEST_SCENARIO',
  'DENIAL_TEST_SCENARIO',
  'CONFLICT_TEST_SCENARIO',
  'STALE_STATE_TEST_SCENARIO',
  'DEGRADED_TEST_SCENARIO',
  'INTERRUPTION_TEST_SCENARIO',
  'DUPLICATE_TEST_SCENARIO',
  'REPLAY_TEST_SCENARIO',
  'RECOVERY_TEST_SCENARIO'
];

export function analyse(ctx) {
  const domains = byKind(ctx, 'REG-901', 'AFFILIATION_TEST_DOMAIN');
  const authority = byKind(ctx, 'REG-901', 'ACTOR_AUTHORITY_MATRIX');
  const lifecycleCoverage = byKind(ctx, 'REG-901', 'LIFECYCLE_COVERAGE');
  const contractCoverage = byKind(ctx, 'REG-901', 'CONTRACT_COVERAGE');
  const dataIntegrityCoverage = byKind(ctx, 'REG-901', 'DATA_INTEGRITY_COVERAGE');
  const migrationCoverage = byKind(ctx, 'REG-901', 'MIGRATION_COVERAGE');
  const p0Coverage = byKind(ctx, 'REG-901', 'HOUSE_P0_TEST_COVERAGE');

  const requirements = byKinds(ctx, 'REG-902', REQUIREMENT_KINDS);
  const scenarios = byKinds(ctx, 'REG-902', SCENARIO_KINDS);
  const oracles = byKind(ctx, 'REG-902', 'TEST_ORACLE');
  const evidenceRequirements = byKind(ctx, 'REG-902', 'TEST_EVIDENCE_REQUIREMENT');

  const requirementsByKind = {};
  for (const k of REQUIREMENT_KINDS) requirementsByKind[k] = requirements.filter((r) => r.kind === k).map((r) => r.id);
  const scenariosByKind = {};
  for (const k of SCENARIO_KINDS) scenariosByKind[k] = scenarios.filter((r) => r.kind === k).map((r) => r.id);

  const invariantIds = new Set(byKind(ctx, 'REG-901', 'INSTITUTIONAL_INVARIANT').map((r) => r.id));
  const oracleIds = new Set(oracles.map((r) => r.id));

  const requirementsWithoutInvariant = requirements.filter((r) => !r.institutional_invariant_ref || !invariantIds.has(r.institutional_invariant_ref)).map((r) => r.id);
  const requirementsWithoutNegative = requirements.filter((r) => !r.negative_outcome).map((r) => r.id);
  const requirementsWithoutEvidenceTier = requirements.filter((r) => !r.evidence_tier_required).map((r) => r.id);
  const scenariosWithoutOracle = scenarios.filter((r) => !r.expected_result_oracle_ref || !oracleIds.has(r.expected_result_oracle_ref)).map((r) => r.id);
  const scenariosWithoutEvidenceTier = scenarios.filter((r) => !r.evidence_tier_required).map((r) => r.id);

  const missingRequirementKinds = REQUIREMENT_KINDS.filter((k) => requirementsByKind[k].length === 0);
  const missingScenarioKinds = SCENARIO_KINDS.filter((k) => scenariosByKind[k].length === 0);

  return {
    counts: {
      affiliation_test_domains: domains.length,
      actor_authority_matrices: authority.length,
      lifecycle_coverage_records: lifecycleCoverage.length,
      contract_coverage_records: contractCoverage.length,
      data_integrity_coverage_records: dataIntegrityCoverage.length,
      migration_coverage_records: migrationCoverage.length,
      house_p0_coverage_records: p0Coverage.length,
      affiliation_test_requirements: requirements.length,
      affiliation_test_scenarios: scenarios.length,
      test_oracles: oracles.length,
      evidence_requirements: evidenceRequirements.length
    },
    requirements_by_kind: Object.fromEntries(REQUIREMENT_KINDS.map((k) => [k, requirementsByKind[k].length])),
    scenarios_by_kind: Object.fromEntries(SCENARIO_KINDS.map((k) => [k, scenariosByKind[k].length])),
    domains: domains.map((d) => ({ id: d.id, dimension: d.coverage_dimension, source: d.authoritative_source })),
    authority: authority.map((a) => ({ id: a.id, dimension: a.coverage_dimension, source: a.authoritative_source })),
    gaps: {
      missing_requirement_kinds: missingRequirementKinds,
      missing_scenario_kinds: missingScenarioKinds,
      requirements_without_governed_invariant: requirementsWithoutInvariant,
      requirements_without_negative_outcome: requirementsWithoutNegative,
      requirements_without_evidence_tier: requirementsWithoutEvidenceTier,
      scenarios_without_governed_oracle: scenariosWithoutOracle,
      scenarios_without_evidence_tier: scenariosWithoutEvidenceTier
    }
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  for (const [name, list] of Object.entries(a.gaps)) {
    if (Array.isArray(list) && list.length > 0) {
      findings.push(makeFinding(Severity.INFO, 'AFFILIATION_COVERAGE_GAP', `${name}: ${list.join(', ')}`, 'REG-901/REG-902'));
    }
  }
  return findings;
}

function report(ctx, a) {
  const now = new Date().toISOString();
  const countRows = Object.entries(a.counts).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const reqRows = Object.entries(a.requirements_by_kind).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const scnRows = Object.entries(a.scenarios_by_kind).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const gapRows = Object.entries(a.gaps).map(([k, v]) => `| ${k} | ${v.length} | ${v.join(', ') || '(none)'} |`).join('\n');
  return `# Volume 9 Package 2 — Club-Affiliation Test-Definition Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 9 Package 2 affiliation test-definition corpus. It is not a source of
> truth, confers no ratification, and asserts no implementation, executable test,
> test fixture, test dataset, test environment, credential, provider testing,
> migration execution, test execution, passing, conformance, compatibility,
> integration, database, migration, provider, operational, readiness, or
> acceptance result. The Markdown chapters, YAML registers, JSON schemas, and
> control scripts are the authoritative record. Volume 0 through Volume 8 and
> Volume 9 Package 1 remain frozen/released and are not modified by Package 2.
> Package 2 defines affiliation TEST REQUIREMENTS, SCENARIOS, ORACLE EXPECTATIONS,
> EVIDENCE EXPECTATIONS, and COVERAGE only and authorizes no implementation or test
> execution.

## Corpus counts

| Element | Count |
| --- | --- |
${countRows}

## Requirement coverage by kind

| Requirement kind | Count |
| --- | --- |
${reqRows}

## Scenario coverage by kind

| Scenario kind | Count |
| --- | --- |
${scnRows}

## Coverage backlog signals (non-blocking)

| Signal | Count | Identifiers |
| --- | --- | --- |
${gapRows}
`;
}

export function generate(ctx = loadContext()) {
  const a = analyse(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'affiliation-test-definition');
  mkdirSync(outDir, { recursive: true });
  const write = (name, obj) => writeFileSync(join(outDir, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');

  write('affiliation-test-domain-map.json', {
    inherited_baseline: 'central-registration-volume-8-v1.0.0',
    affiliation_test_domains: a.counts.affiliation_test_domains,
    domains: a.domains,
    note: 'Each affiliation journey stage inherited from Volumes 7-8 is decomposed into a governed test domain; no execution is authorized.'
  });
  write('actor-authority-organization-and-jurisdiction-coverage.json', {
    actor_authority_matrices: a.counts.actor_authority_matrices,
    matrices: a.authority,
    note: 'Account, membership, representative authority, delegation, assignment, finance, and support authority are held as distinct governed distinctions requiring negative tests.'
  });
  write('experience-action-to-test-obligation-traceability.json', {
    affiliation_test_requirements: a.counts.affiliation_test_requirements,
    requirements_by_kind: a.requirements_by_kind,
    requirements_without_governed_invariant: a.gaps.requirements_without_governed_invariant,
    note: 'Every material experience action maps to a governed test requirement that traces to an institutional invariant in REG-901.'
  });
  write('command-query-resource-and-response-test-matrix.json', {
    contract_requirements: a.requirements_by_kind.CONTRACT_TEST_REQUIREMENT,
    contract_coverage_records: a.counts.contract_coverage_records,
    note: 'Command, query, resource, and response contract obligations are catalogued as contract test requirements; no contract conformance is asserted.'
  });
  write('workflow-state-negative-conflict-and-recovery-coverage.json', {
    workflow_requirements: a.requirements_by_kind.WORKFLOW_TEST_REQUIREMENT,
    scenarios_by_kind: a.scenarios_by_kind,
    missing_scenario_kinds: a.gaps.missing_scenario_kinds,
    scenarios_without_governed_oracle: a.gaps.scenarios_without_governed_oracle,
    note: 'Positive, negative, denial, conflict, stale-state, degraded, interruption, duplicate, replay, and recovery scenarios are catalogued for the affiliation workflow.'
  });
  write('requirement-evidence-completeness-and-submission-analysis.json', {
    functional_requirements: a.requirements_by_kind.FUNCTIONAL_TEST_REQUIREMENT,
    evidence_requirements: a.counts.evidence_requirements,
    requirements_without_evidence_tier: a.gaps.requirements_without_evidence_tier,
    note: 'Requirement, response, attestation, evidence, and completeness obligations are defined; submission receipt is held distinct from approval and activation.'
  });
  write('review-return-correction-and-resubmission-analysis.json', {
    workflow_requirements: a.requirements_by_kind.WORKFLOW_TEST_REQUIREMENT,
    conflict_scenarios: a.scenarios_by_kind.CONFLICT_TEST_SCENARIO,
    stale_state_scenarios: a.scenarios_by_kind.STALE_STATE_TEST_SCENARIO,
    note: 'Review, return-for-information, correction, and resubmission obligations preserve history; return is held distinct from refusal.'
  });
  write('decision-finance-reconciliation-activation-and-standing-analysis.json', {
    functional_requirements: a.requirements_by_kind.FUNCTIONAL_TEST_REQUIREMENT,
    duplicate_scenarios: a.scenarios_by_kind.DUPLICATE_TEST_SCENARIO,
    note: 'Recommendation, decision, payment acknowledgement, reconciliation, approval, activation, active standing, and expiry are held as distinct governed distinctions.'
  });
  write('event-webhook-provider-and-exchange-test-analysis.json', {
    event_requirements: a.requirements_by_kind.EVENT_TEST_REQUIREMENT,
    webhook_requirements: a.requirements_by_kind.WEBHOOK_TEST_REQUIREMENT,
    provider_requirements: a.requirements_by_kind.PROVIDER_TEST_REQUIREMENT,
    replay_scenarios: a.scenarios_by_kind.REPLAY_TEST_SCENARIO,
    note: 'Event, outbox, webhook, provider, and exchange obligations are defined; mocked provider responses are held distinct from provider integration evidence and end-to-end proof.'
  });
  write('data-integrity-database-migration-and-coexistence-analysis.json', {
    data_quality_requirements: a.requirements_by_kind.DATA_QUALITY_TEST_REQUIREMENT,
    database_behaviour_requirements: a.requirements_by_kind.DATABASE_BEHAVIOUR_TEST_REQUIREMENT,
    migration_requirements: a.requirements_by_kind.MIGRATION_TEST_REQUIREMENT,
    data_integrity_coverage_records: a.counts.data_integrity_coverage_records,
    migration_coverage_records: a.counts.migration_coverage_records,
    note: 'Data-integrity, database-behavioural, migration, and coexistence obligations are defined; database behaviour is held distinct from schema inspection and migration execution is held distinct from business acceptance.'
  });
  write('house-p0-affiliation-test-coverage.json', {
    house_p0_coverage_records: a.counts.house_p0_coverage_records,
    affiliation_test_requirements: a.counts.affiliation_test_requirements,
    affiliation_test_scenarios: a.counts.affiliation_test_scenarios,
    note: 'House P0 affiliation obligations are covered by governed test requirements and scenarios; coverage confers no execution and no result.'
  });
  writeFileSync(join(outDir, 'package-2-affiliation-test-definition-report.md'), report(ctx, a), 'utf8');
  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Affiliation test-definition coverage', run);
}
