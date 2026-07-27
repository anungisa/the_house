// Control: Volume 10 Package 2 affiliation-implementation-plan foundation analysis
// (deterministic, NON-AUTHORITATIVE).
//
// Projects the source-controlled Package 2 corpus into twelve non-authoritative
// planning projections under generated/affiliation-implementation-plan/. These
// projections confer no ratification and authorize no implementation. The
// authoritative record remains the source-controlled chapters and registers.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}

const HOUSE_P0_FINDINGS = Object.freeze([
  'resource-aware authorization',
  'reviewer assignment and jurisdiction',
  'evidence binding',
  'production-dependency completeness',
  'composite tenant-parent integrity',
  'affiliation lifecycle',
  'versioned requirements',
  'return and resubmission',
  'exactly-once activation',
  'fail-closed configuration',
  'outbox publication',
  'PostgreSQL behavioural verification',
  'production-composition verification',
  'deployment-path, secret, and entry-point configuration'
]);

function analyse(ctx) {
  return {
    outcomes: byKind(ctx, 'REG-1001', 'AFFILIATION_OUTCOME'),
    streams: byKind(ctx, 'REG-1001', 'AFFILIATION_WORKSTREAM'),
    workPackages: byKind(ctx, 'REG-1001', 'IMPLEMENTATION_WORK_PACKAGE'),
    technicalSlices: byKind(ctx, 'REG-1001', 'TECHNICAL_DELIVERY_SLICE'),
    experienceSlices: byKind(ctx, 'REG-1001', 'EXPERIENCE_DELIVERY_SLICE'),
    migrationSlices: byKind(ctx, 'REG-1001', 'MIGRATION_DELIVERY_SLICE'),
    controlSlices: byKind(ctx, 'REG-1001', 'CONTROL_ENABLEMENT_SLICE'),
    integrationSlices: byKind(ctx, 'REG-1001', 'INTEGRATION_DELIVERY_SLICE'),
    testEnablementSlices: byKind(ctx, 'REG-1001', 'TEST_ENABLEMENT_SLICE'),
    p0Destinations: byKind(ctx, 'REG-1001', 'HOUSE_P0_DELIVERY_DESTINATION'),
    implMilestones: byKind(ctx, 'REG-1002', 'IMPLEMENTATION_MILESTONE'),
    environmentReqs: byKind(ctx, 'REG-1002', 'ENVIRONMENT_ENABLEMENT_REQUIREMENT'),
    testEnablementReqs: byKind(ctx, 'REG-1002', 'TEST_ENABLEMENT_REQUIREMENT'),
    migrationReqs: byKind(ctx, 'REG-1002', 'MIGRATION_READINESS_REQUIREMENT'),
    releaseCandidateReqs: byKind(ctx, 'REG-1002', 'RELEASE_CANDIDATE_REQUIREMENT'),
    rollbackReqs: byKind(ctx, 'REG-1002', 'ROLLBACK_REQUIREMENT'),
    handoffReqs: byKind(ctx, 'REG-1002', 'OPERATIONAL_HANDOFF_REQUIREMENT'),
    implEvidenceReqs: byKind(ctx, 'REG-1002', 'IMPLEMENTATION_EVIDENCE_REQUIREMENT'),
    operationalEvidenceReqs: byKind(ctx, 'REG-1002', 'OPERATIONAL_EVIDENCE_REQUIREMENT'),
    decisions: records(ctx, 'REG-1003'),
    backlog: records(ctx, 'REG-1004')
  };
}

export function run(ctx) {
  const a = analyse(ctx);
  return [makeFinding(
    Severity.INFO,
    'AFFILIATION_PLAN_COVERAGE',
    `Affiliation implementation plan coverage: ${a.workPackages.length} work packages, ${a.technicalSlices.length} technical slices, ${a.experienceSlices.length} experience slices, ${a.migrationSlices.length} migration slices, ${a.integrationSlices.length} integration slices, ${a.releaseCandidateReqs.length} release candidates, ${a.p0Destinations.length} House P0 destinations`,
    'REG-1001'
  )];
}

export function generate(ctx = loadContext()) {
  const a = analyse(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'affiliation-implementation-plan');
  mkdirSync(outDir, { recursive: true });
  const write = (name, payload) => writeFileSync(join(outDir, name), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const note = 'Non-authoritative projection of the source-controlled Volume 10 Package 2 corpus. Confers no ratification and authorizes no implementation. Documentary and implementation-neutral.';
  const bodyOf = (id) => (ctx.chapters.find((c) => c.fileId === id)?.body ?? '');

  // 1. Affiliation outcome and scope map.
  write('affiliation-outcome-and-scope-map.json', {
    note,
    outcomes: a.outcomes.map((r) => ({
      id: r.id, title: r.title, house_responsibility: r.house_responsibility,
      button_responsibility: r.button_responsibility, external_system_responsibility: r.external_system_responsibility,
      lifecycle_states: r.lifecycle_states, release_gate: r.release_gate
    }))
  });

  // 2. Workstream, work-package, and deliverable catalogue.
  write('workstream-work-package-and-deliverable-catalogue.json', {
    note,
    workstreams: a.streams.map((r) => ({ id: r.id, title: r.title })),
    work_packages: a.workPackages.map((r) => ({
      id: r.id, title: r.title, affected_application_layers: r.affected_application_layers,
      dependencies: r.dependencies ?? [], deliverables: r.deliverables ?? [], future_gate: r.future_gate
    }))
  });

  // 3. House domain, application, persistence, and infrastructure plan.
  write('house-domain-application-persistence-and-infrastructure-plan.json', {
    note,
    technical_slices: a.technicalSlices.map((r) => ({
      id: r.id, title: r.title, delivery_layer: r.delivery_layer, persistence_dependency: r.persistence_dependency,
      data_integrity_invariant: r.data_integrity_invariant, database_behaviour_evidence: r.database_behaviour_evidence,
      rollback_dependency: r.rollback_dependency
    }))
  });

  // 4. Button experience and staff-workbench plan.
  write('button-experience-and-staff-workbench-plan.json', {
    note,
    experience_slices: a.experienceSlices.map((r) => ({
      id: r.id, title: r.title, experience_outcome: r.experience_outcome, volume_7_action: r.volume_7_action,
      house_command_or_query_dependency: r.house_command_or_query_dependency,
      accessibility_obligations: r.accessibility_obligations, bilingual_content_dependencies: r.bilingual_content_dependencies
    }))
  });

  // 5. Data, database, migration, coexistence, and cutover plan.
  write('data-database-migration-coexistence-and-cutover-plan.json', {
    note,
    migration_slices: a.migrationSlices.map((r) => ({ id: r.id, title: r.title, data_integrity_invariant: r.data_integrity_invariant, reconciliation_dependency: r.reconciliation_dependency, rollback_dependency: r.rollback_dependency })),
    migration_readiness_requirements: a.migrationReqs.map((r) => ({ id: r.id, title: r.title, rehearsal_requirement: r.rehearsal_requirement, reconciliation_requirement: r.reconciliation_requirement, rollback_dependency: r.rollback_dependency }))
  });

  // 6. Identity, security, privacy, records, accessibility, and bilingual plan.
  write('identity-security-privacy-records-accessibility-and-bilingual-plan.json', {
    note,
    control_enablement_slices: a.controlSlices.map((r) => ({ id: r.id, title: r.title, security_boundary: r.security_boundary, security_privacy_obligations: r.security_privacy_obligations }))
  });

  // 7. API, event, provider, file, batch, and exchange plan.
  write('api-event-provider-file-batch-and-exchange-plan.json', {
    note,
    integration_slices: a.integrationSlices.map((r) => ({
      id: r.id, title: r.title, producer: r.producer, consumer: r.consumer, institutional_authority: r.institutional_authority,
      idempotency_dependency: r.idempotency_dependency, provider_dependency: r.provider_dependency
    }))
  });

  // 8. Environment, test-enablement, CI, and evidence-capture plan.
  write('environment-test-enablement-ci-and-evidence-capture-plan.json', {
    note,
    environment_requirements: a.environmentReqs.map((r) => ({ id: r.id, environment_class: r.environment_class, provisioning_status: r.provisioning_status, provisioning_gate: r.provisioning_gate, execution_authority_status: r.execution_authority_status, production_data_prohibition: Boolean(r.production_data_prohibition) })),
    test_enablement_requirements: a.testEnablementReqs.map((r) => ({ id: r.id, permitted_test_levels: r.permitted_test_levels ?? [], traces_to: r.traces_to ?? [] })),
    test_enablement_slices: a.testEnablementSlices.map((r) => ({ id: r.id, title: r.title, test_enablement_destination: r.test_enablement_destination }))
  });

  // 9. Capability, estimate, cost, dependency, and risk analysis.
  write('capability-estimate-cost-dependency-and-risk-analysis.json', {
    note,
    assumptions: a.backlog.filter((b) => b.kind === 'ASSUMPTION').map((r) => ({ id: r.id, owner: r.owner, status: r.current_status, future_blocking_gate: r.future_blocking_gate })),
    risks: a.backlog.filter((b) => b.kind === 'RISK').map((r) => ({ id: r.id, owner: r.owner, likelihood: r.likelihood_or_occurrence, future_blocking_gate: r.future_blocking_gate })),
    cost_estimates: a.backlog.filter((b) => b.kind === 'COST_ESTIMATE').map((r) => ({ id: r.id, range: r.range, confidence: r.confidence, estimate_status: r.estimate_status, approval_status: r.approval_status })),
    procurement: a.backlog.filter((b) => b.kind === 'PROCUREMENT').map((r) => ({ id: r.id, status: r.current_status, approval_status: r.approval_status, commitment_status: r.commitment_status }))
  });

  // 10. Release-unit, release-candidate, rollback, and handoff plan.
  write('release-unit-release-candidate-rollback-and-handoff-plan.json', {
    note,
    release_candidate_requirements: a.releaseCandidateReqs.map((r) => ({ id: r.id, title: r.title, contained_work_packages: r.contained_work_packages ?? [], rollback_dependency: r.rollback_dependency, acceptance_authority: r.acceptance_authority, release_gate: r.release_gate })),
    rollback_requirements: a.rollbackReqs.map((r) => ({ id: r.id, title: r.title, rollback_dependency: r.rollback_dependency })),
    handoff_requirements: a.handoffReqs.map((r) => ({ id: r.id, title: r.title, handoff_requirement_basis: r.handoff_requirement_basis }))
  });

  // 11. House P0 implementation and proof-destination map.
  write('house-p0-implementation-and-proof-destination-map.json', {
    note,
    findings: HOUSE_P0_FINDINGS.map((f) => {
      const dest = a.p0Destinations.find((d) => d.affected_house_p0_finding === f);
      return {
        finding: f,
        has_delivery_destination: Boolean(dest),
        has_chapter_destination: bodyOf('V10-13').includes(f),
        implementation_evidence: dest?.implementation_evidence,
        test_enablement_destination: dest?.test_enablement_destination,
        operational_proof_destination: dest?.operational_proof_destination
      };
    }),
    all_mapped: HOUSE_P0_FINDINGS.every((f) => a.p0Destinations.some((d) => d.affected_house_p0_finding === f) && bodyOf('V10-13').includes(f))
  });

  // 12. Package 2 affiliation implementation-plan report (Markdown).
  const now = new Date().toISOString();
  const md = [
    '# Volume 10 Package 2 — Affiliation Implementation-Plan Foundation Report',
    '',
    `Generated: ${now}`,
    '',
    note,
    '',
    '## Coverage summary',
    '',
    `- Affiliation outcomes: ${a.outcomes.length}`,
    `- Workstreams: ${a.streams.length}`,
    `- Implementation work packages: ${a.workPackages.length}`,
    `- House technical delivery slices: ${a.technicalSlices.length}`,
    `- Button experience delivery slices: ${a.experienceSlices.length}`,
    `- Migration delivery slices: ${a.migrationSlices.length}`,
    `- Control-enablement slices: ${a.controlSlices.length}`,
    `- Integration delivery slices: ${a.integrationSlices.length}`,
    `- Test-enablement slices: ${a.testEnablementSlices.length}`,
    `- House P0 delivery destinations: ${a.p0Destinations.length}`,
    `- Environment enablement requirements: ${a.environmentReqs.length}`,
    `- Release-candidate requirements: ${a.releaseCandidateReqs.length}`,
    `- Cost estimates: ${a.backlog.filter((b) => b.kind === 'COST_ESTIMATE').length}`,
    '',
    '## Boundary',
    '',
    'Package 2 is a documentary plan. It authorizes no construction, provisioning,',
    'test execution, procurement, staffing, release, or deployment. Every record',
    'carries the not-implemented, documentary-plan-only, and not-committed posture',
    'and is bound to a future authorization gate.',
    ''
  ].join('\n');
  writeFileSync(join(outDir, 'package-2-affiliation-implementation-plan-report.md'), md, 'utf8');

  return { projections: 12 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Affiliation implementation-plan foundation', run);
}
