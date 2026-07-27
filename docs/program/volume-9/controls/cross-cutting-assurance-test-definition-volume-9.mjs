// Control: Volume 9 Package 3 cross-cutting assurance (security, privacy, records,
// accessibility, bilingual, financial-control, resilience, recovery, observability,
// provider-continuity, and operational-assurance) test-definition coverage analysis
// and NON-AUTHORITATIVE projections.
//
// Emits deterministic JSON projections and a markdown report describing the cross-
// cutting assurance test-definition corpus: the integrated assurance domain and
// evidence-boundary map, security/identity/authorization/privilege coverage,
// privacy/minimization/evidence/logging/export/records analysis, accessibility
// static/manual/keyboard/assistive-technology analysis, bilingual semantic analysis,
// financial-control/accounting/reconciliation/activation analysis, resilience/
// dependency/backup/restore/recovery/continuity analysis, observability/audit/
// incident/deployment-path analysis, provider-continuity/return/deletion/
// substitution/exit analysis, and House P0 cross-cutting assurance coverage. Every
// generated file is a projection of the source-controlled corpus and is never
// authoritative. It asserts no test execution, no passing result, and no security,
// privacy, accessibility, bilingual, financial, resilience, recovery, operational,
// provider-assurance, conformance, readiness, or acceptance claim, and authorizes no
// implementation. Coverage gaps are reported as INFO backlog signals; only genuinely
// blocking structural defects are raised elsewhere as ERRORs.

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

const COVERAGE_KINDS = [
  'SECURITY_TEST_COVERAGE',
  'PRIVACY_RECORDS_TEST_COVERAGE',
  'ACCESSIBILITY_TEST_COVERAGE',
  'BILINGUAL_SEMANTIC_TEST_COVERAGE',
  'FINANCIAL_CONTROL_TEST_COVERAGE',
  'RESILIENCE_RECOVERY_TEST_COVERAGE',
  'OPERATIONAL_ASSURANCE_TEST_COVERAGE',
  'PROVIDER_ASSURANCE_TEST_COVERAGE',
  'HOUSE_P0_ASSURANCE_COVERAGE'
];
const REQUIREMENT_KINDS = [
  'SECURITY_TEST_REQUIREMENT',
  'PRIVACY_TEST_REQUIREMENT',
  'RECORDS_TEST_REQUIREMENT',
  'ACCESSIBILITY_STATIC_TEST_REQUIREMENT',
  'ACCESSIBILITY_MANUAL_TEST_REQUIREMENT',
  'ASSISTIVE_TECHNOLOGY_TEST_REQUIREMENT',
  'BILINGUAL_SEMANTIC_TEST_REQUIREMENT',
  'FINANCIAL_CONTROL_TEST_REQUIREMENT',
  'RESILIENCE_TEST_REQUIREMENT',
  'BACKUP_RESTORE_TEST_REQUIREMENT',
  'RECOVERY_EXERCISE_REQUIREMENT',
  'OBSERVABILITY_TEST_REQUIREMENT',
  'INCIDENT_RESPONSE_TEST_REQUIREMENT',
  'DEPLOYMENT_PATH_TEST_REQUIREMENT',
  'PROVIDER_CONTINUITY_TEST_REQUIREMENT',
  'INDEPENDENT_ASSURANCE_REQUIREMENT'
];
// Package 3 reuses the generic scenario kinds established in Package 2.
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
  const coverage = byKinds(ctx, 'REG-901', COVERAGE_KINDS);
  const coverageByKind = {};
  for (const k of COVERAGE_KINDS) coverageByKind[k] = coverage.filter((r) => r.kind === k).map((r) => r.id);

  const requirements = byKinds(ctx, 'REG-902', REQUIREMENT_KINDS);
  const requirementsByKind = {};
  for (const k of REQUIREMENT_KINDS) requirementsByKind[k] = requirements.filter((r) => r.kind === k).map((r) => r.id);

  const scenarios = byKinds(ctx, 'REG-902', SCENARIO_KINDS);
  const scenariosByKind = {};
  for (const k of SCENARIO_KINDS) scenariosByKind[k] = scenarios.filter((r) => r.kind === k).map((r) => r.id);

  const oracles = byKind(ctx, 'REG-902', 'TEST_ORACLE');
  const evidenceRequirements = byKind(ctx, 'REG-902', 'TEST_EVIDENCE_REQUIREMENT');
  const invariantIds = new Set(byKind(ctx, 'REG-901', 'INSTITUTIONAL_INVARIANT').map((r) => r.id));
  const oracleIds = new Set(oracles.map((r) => r.id));

  const requirementsWithoutInvariant = requirements.filter((r) => !r.institutional_invariant_ref || !invariantIds.has(r.institutional_invariant_ref)).map((r) => r.id);
  const requirementsWithoutNegative = requirements.filter((r) => !r.negative_outcome).map((r) => r.id);
  const requirementsWithoutEvidenceTier = requirements.filter((r) => !r.evidence_tier_required).map((r) => r.id);
  const requirementsWithoutIndependence = requirements.filter((r) => !r.independence_requirement).map((r) => r.id);
  const scenariosWithoutOracle = scenarios.filter((r) => !r.expected_result_oracle_ref || !oracleIds.has(r.expected_result_oracle_ref)).map((r) => r.id);

  const missingCoverageKinds = COVERAGE_KINDS.filter((k) => coverageByKind[k].length === 0);
  const missingRequirementKinds = REQUIREMENT_KINDS.filter((k) => requirementsByKind[k].length === 0);

  return {
    counts: {
      assurance_coverage_records: coverage.length,
      assurance_test_requirements: requirements.length,
      assurance_test_scenarios: scenarios.length,
      test_oracles: oracles.length,
      evidence_requirements: evidenceRequirements.length
    },
    coverage_by_kind: Object.fromEntries(COVERAGE_KINDS.map((k) => [k, coverageByKind[k].length])),
    requirements_by_kind: Object.fromEntries(REQUIREMENT_KINDS.map((k) => [k, requirementsByKind[k].length])),
    scenarios_by_kind: Object.fromEntries(SCENARIO_KINDS.map((k) => [k, scenariosByKind[k].length])),
    coverage: coverage.map((c) => ({ id: c.id, kind: c.kind, dimension: c.coverage_dimension, source: c.authoritative_source })),
    gaps: {
      missing_coverage_kinds: missingCoverageKinds,
      missing_requirement_kinds: missingRequirementKinds,
      requirements_without_governed_invariant: requirementsWithoutInvariant,
      requirements_without_negative_outcome: requirementsWithoutNegative,
      requirements_without_evidence_tier: requirementsWithoutEvidenceTier,
      requirements_without_independence: requirementsWithoutIndependence,
      scenarios_without_governed_oracle: scenariosWithoutOracle
    }
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  for (const [name, list] of Object.entries(a.gaps)) {
    if (Array.isArray(list) && list.length > 0) {
      findings.push(makeFinding(Severity.INFO, 'ASSURANCE_COVERAGE_GAP', `${name}: ${list.join(', ')}`, 'REG-901/REG-902'));
    }
  }
  return findings;
}

function report(ctx, a) {
  const now = new Date().toISOString();
  const countRows = Object.entries(a.counts).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const covRows = Object.entries(a.coverage_by_kind).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const reqRows = Object.entries(a.requirements_by_kind).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const scnRows = Object.entries(a.scenarios_by_kind).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const gapRows = Object.entries(a.gaps).map(([k, v]) => `| ${k} | ${v.length} | ${v.join(', ') || '(none)'} |`).join('\n');
  return `# Volume 9 Package 3 — Cross-Cutting Assurance Test-Definition Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 9 Package 3 cross-cutting assurance test-definition corpus. It is not a
> source of truth, confers no ratification, and asserts no implementation, executable
> security/privacy/accessibility/resilience/recovery/performance/operational test,
> test environment, identity, credential, secret, dataset, monitoring system, backup,
> recovery infrastructure, provider assurance, test execution, passing, conformance,
> control-effectiveness, privacy-compliance, accessibility, bilingual, financial,
> resilience, recovery, operational, provider-assurance, readiness, or acceptance
> result. The Markdown chapters, YAML registers, JSON schemas, and control scripts
> are the authoritative record. Volume 0 through Volume 8 and Volume 9 Packages 1 and
> 2 remain frozen/released and are not modified by Package 3. Package 3 defines cross-
> cutting assurance TEST REQUIREMENTS, SCENARIOS, ORACLE EXPECTATIONS, EVIDENCE
> STANDARDS, INDEPENDENCE REQUIREMENTS, and ACCEPTANCE BOUNDARIES only and authorizes
> no implementation or test execution.

## Corpus counts

| Element | Count |
| --- | --- |
${countRows}

## Assurance coverage by kind

| Coverage kind | Count |
| --- | --- |
${covRows}

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
  const outDir = join(VOLUME_DIR, 'generated', 'cross-cutting-assurance-test-definition');
  mkdirSync(outDir, { recursive: true });
  const write = (name, obj) => writeFileSync(join(outDir, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');

  write('assurance-domain-and-evidence-boundary-map.json', {
    inherited_baseline: 'central-registration-volume-8-v1.0.0',
    assurance_coverage_records: a.counts.assurance_coverage_records,
    coverage_by_kind: a.coverage_by_kind,
    coverage: a.coverage,
    note: 'Each cross-cutting assurance domain is decomposed into a governed coverage record naming its authoritative obligation, protected asset, evidence standard, and future gate. Control definition is held distinct from control implementation, operation, and effectiveness; no execution is authorized.'
  });
  write('security-identity-authorization-and-privilege-test-coverage.json', {
    security_requirements: a.requirements_by_kind.SECURITY_TEST_REQUIREMENT,
    denial_scenarios: a.scenarios_by_kind.DENIAL_TEST_SCENARIO,
    negative_scenarios: a.scenarios_by_kind.NEGATIVE_TEST_SCENARIO,
    note: 'Authentication, account state, resource-aware authorization, organization/jurisdiction isolation, delegation, assignment, service-identity, privileged-action, and fail-closed obligations are catalogued. Authentication success is never the authorization oracle.'
  });
  write('privacy-minimization-evidence-logging-export-and-records-analysis.json', {
    privacy_requirements: a.requirements_by_kind.PRIVACY_TEST_REQUIREMENT,
    records_requirements: a.requirements_by_kind.RECORDS_TEST_REQUIREMENT,
    denial_scenarios: a.scenarios_by_kind.DENIAL_TEST_SCENARIO,
    note: 'Collection/purpose limitation, minimum-necessary fields, evidence references vs copies, restricted-evidence access, logging/trace minimization, exports, legal hold, retention dependencies, and disposition are catalogued. Read access is distinct from export authority; projection deletion is distinct from authoritative disposition. No legal, privacy, or records compliance is claimed.'
  });
  write('accessibility-static-manual-keyboard-and-assistive-technology-analysis.json', {
    accessibility_static_requirements: a.requirements_by_kind.ACCESSIBILITY_STATIC_TEST_REQUIREMENT,
    accessibility_manual_requirements: a.requirements_by_kind.ACCESSIBILITY_MANUAL_TEST_REQUIREMENT,
    assistive_technology_requirements: a.requirements_by_kind.ASSISTIVE_TECHNOLOGY_TEST_REQUIREMENT,
    note: 'Automated static analysis, semantic inspection, keyboard completion, focus management, zoom/reflow, screen-reader interaction, status announcements, error recovery, document access, and recovery tasks are catalogued as distinct obligations. Automated scan is distinct from manual inspection, keyboard completion, and assistive-technology completion. No conformance claim is created.'
  });
  write('bilingual-semantic-status-action-error-and-document-analysis.json', {
    bilingual_semantic_requirements: a.requirements_by_kind.BILINGUAL_SEMANTIC_TEST_REQUIREMENT,
    note: 'Canonical concepts, English and French semantic requirements, statuses, actions, errors, denials, notices, financial distinctions, decisions, notifications, documents, and historical terminology are catalogued. String existence is distinct from accurate translation and governed semantic equivalence. Machine translation and literal string matching cannot satisfy semantic-equivalence evidence.'
  });
  write('financial-control-accounting-reconciliation-and-activation-analysis.json', {
    financial_control_requirements: a.requirements_by_kind.FINANCIAL_CONTROL_TEST_REQUIREMENT,
    duplicate_scenarios: a.scenarios_by_kind.DUPLICATE_TEST_SCENARIO,
    stale_state_scenarios: a.scenarios_by_kind.STALE_STATE_TEST_SCENARIO,
    note: 'Obligations, fees, exemptions/waivers, provider acknowledgements, accounting confirmation, duplicates, delays, disputes/reversals, reconciliation mismatch and resolution, activation authorization/execution, and standing are catalogued. Payment acknowledgement is distinct from accounting confirmation and reconciliation; approval is distinct from activation authorization, execution, and standing.'
  });
  write('resilience-dependency-backup-restore-recovery-and-continuity-analysis.json', {
    resilience_requirements: a.requirements_by_kind.RESILIENCE_TEST_REQUIREMENT,
    backup_restore_requirements: a.requirements_by_kind.BACKUP_RESTORE_TEST_REQUIREMENT,
    recovery_exercise_requirements: a.requirements_by_kind.RECOVERY_EXERCISE_REQUIREMENT,
    degraded_scenarios: a.scenarios_by_kind.DEGRADED_TEST_SCENARIO,
    interruption_scenarios: a.scenarios_by_kind.INTERRUPTION_TEST_SCENARIO,
    recovery_scenarios: a.scenarios_by_kind.RECOVERY_TEST_SCENARIO,
    note: 'Dependency unavailability, provider outage, database interruption, delayed/duplicated delivery, outbox backlog, quarantine growth, interrupted uploads, partial batch failure, stale projections, backup integrity, restoration, recovery reconciliation, and continuity are catalogued. Backup completed is distinct from backup restorable; restore completed is distinct from service recovered and data reconciled. No recovery-time or recovery-point target is established.'
  });
  write('observability-audit-incident-and-deployment-path-analysis.json', {
    observability_requirements: a.requirements_by_kind.OBSERVABILITY_TEST_REQUIREMENT,
    incident_response_requirements: a.requirements_by_kind.INCIDENT_RESPONSE_TEST_REQUIREMENT,
    deployment_path_requirements: a.requirements_by_kind.DEPLOYMENT_PATH_TEST_REQUIREMENT,
    note: 'Structured audit evidence, correlation/causation, security signals, privacy-safe diagnostics, tracing, outbox/consumer monitoring, reconciliation monitoring, provider incident signals, alert evidence, incident declaration/investigation/containment/recovery, post-incident reconciliation, deployment-path validation, configuration completeness, secret/entry-point dependencies, composition evidence, and rollback are catalogued. Telemetry emitted is distinct from alert delivered, incident detected, and incident handled; successful build is distinct from valid deployment path and functioning production composition.'
  });
  write('provider-continuity-return-deletion-substitution-and-exit-analysis.json', {
    provider_continuity_requirements: a.requirements_by_kind.PROVIDER_CONTINUITY_TEST_REQUIREMENT,
    independent_assurance_requirements: a.requirements_by_kind.INDEPENDENT_ASSURANCE_REQUIREMENT,
    degraded_scenarios: a.scenarios_by_kind.DEGRADED_TEST_SCENARIO,
    note: 'Provider authentication/integrity, subcontractors, incidents, continuity, degraded service, substitution, portability, data return, deletion evidence, residual copies, backups, reconciliation, termination, and exit acceptance are catalogued. Provider certification is distinct from end-to-end assurance; contract termination is distinct from data returned, deleted, and reconciled; provider test result is distinct from operational evidence.'
  });
  write('house-p0-cross-cutting-assurance-coverage.json', {
    house_p0_assurance_coverage_records: a.coverage_by_kind.HOUSE_P0_ASSURANCE_COVERAGE,
    assurance_test_requirements: a.counts.assurance_test_requirements,
    assurance_test_scenarios: a.counts.assurance_test_scenarios,
    note: 'House P0 cross-cutting assurance obligations are covered by governed test requirements and scenarios; coverage confers no execution and no result.'
  });
  writeFileSync(join(outDir, 'package-3-cross-cutting-assurance-test-definition-report.md'), report(ctx, a), 'utf8');
  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Cross-cutting assurance test-definition coverage', run);
}
