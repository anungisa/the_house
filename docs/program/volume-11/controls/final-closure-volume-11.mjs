// Control: Volume 11 Package 3 integrated operating-definition, closure, and
// Volume 12 handoff analysis (NON-AUTHORITATIVE).
//
// Derives deterministic, non-authoritative projections of the Package 3 consolidation
// corpus (REG-1101 coverage kinds and REG-1102 requirement kinds) into
// generated/final-closure/. The projections are analytical views only: they confer no
// ratification, assert no implementation, migration, recovery, adoption, provider
// assurance, or release, and authorize nothing. The Markdown chapters, YAML registers,
// JSON schemas, and control scripts remain the authoritative record. run() reports
// coverage findings; generate() writes the twelve Package 3 projections and the
// Volume 11 closure report.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}

// The twelve Package 3 consolidated coverage areas (REG-1101).
export const COVERAGE_KINDS = Object.freeze([
  'INTEGRATED_OPERATING_BASELINE',
  'AUTHORITY_OWNERSHIP_MAP',
  'SERVICE_LIFECYCLE_COVERAGE',
  'SUPPORT_OPERATIONAL_COVERAGE',
  'OBSERVABILITY_OPERATIONAL_COVERAGE',
  'CONTINUITY_RECOVERY_COVERAGE',
  'MIGRATION_OPERATIONAL_COVERAGE',
  'DATA_QUALITY_RECONCILIATION_COVERAGE',
  'TRAINING_ADOPTION_COVERAGE',
  'PROVIDER_OPERATIONAL_COVERAGE',
  'HOUSE_P0_OPERATIONAL_COVERAGE',
  'VOLUME_12_HANDOFF_COVERAGE'
]);

// The twelve Package 3 operational and acceptance requirement kinds (REG-1102).
export const REQUIREMENT_KINDS = Object.freeze([
  'INTEGRATED_OPERATIONAL_REQUIREMENT',
  'OPERATIONAL_READINESS_REQUIREMENT',
  'OPERATIONAL_ACCEPTANCE_REQUIREMENT',
  'MIGRATION_ACCEPTANCE_REQUIREMENT',
  'RECOVERY_EVIDENCE_REQUIREMENT',
  'RECONCILIATION_EVIDENCE_REQUIREMENT',
  'TRAINING_COMPETENCE_EVIDENCE_REQUIREMENT',
  'ADOPTION_EVIDENCE_REQUIREMENT',
  'PROVIDER_ASSURANCE_EVIDENCE_REQUIREMENT',
  'INDEPENDENT_ASSURANCE_REQUIREMENT',
  'VOLUME_12_RELEASE_EVIDENCE_REQUIREMENT',
  'MATERIAL_COMMITMENT_REQUIREMENT'
]);

export function analyse(ctx) {
  const coverage = {};
  for (const k of COVERAGE_KINDS) coverage[k] = byKind(ctx, 'REG-1101', k);
  const requirements = {};
  for (const k of REQUIREMENT_KINDS) requirements[k] = byKind(ctx, 'REG-1102', k);
  return { coverage, requirements };
}

export function run(ctx) {
  const findings = [];
  const { coverage, requirements } = analyse(ctx);
  for (const k of COVERAGE_KINDS) {
    if (coverage[k].length === 0) {
      findings.push(makeFinding(Severity.ERROR, 'FINAL_CLOSURE_COVERAGE_GAP', `No ${k} coverage record present in the integrated operating baseline`, 'REG-1101'));
    }
  }
  for (const k of REQUIREMENT_KINDS) {
    if (requirements[k].length === 0) {
      findings.push(makeFinding(Severity.ERROR, 'FINAL_CLOSURE_REQUIREMENT_GAP', `No ${k} requirement present in the operational-readiness requirement set`, 'REG-1102'));
    }
  }
  const totalCoverage = Object.values(coverage).reduce((n, rows) => n + rows.length, 0);
  const totalRequirements = Object.values(requirements).reduce((n, rows) => n + rows.length, 0);
  findings.push(makeFinding(Severity.INFO, 'FINAL_CLOSURE_COVERAGE', `Package 3 consolidation: ${totalCoverage} coverage records across ${COVERAGE_KINDS.length} areas, ${totalRequirements} requirements across ${REQUIREMENT_KINDS.length} kinds`, 'REG-1101/REG-1102'));
  return findings;
}

export function generate(ctx = loadContext()) {
  const { coverage, requirements } = analyse(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'final-closure');
  mkdirSync(outDir, { recursive: true });
  const write = (name, payload) => writeFileSync(join(outDir, name), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const note = 'Non-authoritative projection of the source-controlled Volume 11 Package 3 corpus. Confers no ratification and authorizes no implementation, migration, recovery, adoption, provider engagement, or release.';

  const cov = (k) => coverage[k].map((r) => ({ id: r.id, title: r.title, coverage_area: r.coverage_area, consolidated_from: r.consolidated_from ?? [], preserved_distinction: r.preserved_distinction, coverage_status: r.coverage_status, institutional_owner: r.institutional_owner, operational_owner: r.operational_owner, decision_authority: r.decision_authority, acceptance_authority: r.acceptance_authority, independence_requirement: r.independence_requirement, volume_12_destination: r.volume_12_destination, house_p0_destination: r.house_p0_destination ?? null, owner_gap_status: r.owner_gap_status, traces_to: r.traces_to ?? [], future_gate: r.future_gate }));
  const req = (k) => requirements[k].map((r) => ({ id: r.id, title: r.title, authoritative_source: r.authoritative_source, institutional_purpose: r.institutional_purpose, institutional_owner: r.institutional_owner, operational_owner: r.operational_owner, decision_authority: r.decision_authority, evidence_required: r.evidence_required, independence_requirement: r.independence_requirement, acceptance_authority: r.acceptance_authority, volume_12_destination: r.volume_12_destination, traces_to: r.traces_to ?? [], future_gate: r.future_gate }));

  // 1. Integrated operations, migration, adoption, and assurance baseline.
  write('integrated-operations-migration-adoption-and-assurance-baseline.json', {
    note,
    integrated_baseline: cov('INTEGRATED_OPERATING_BASELINE'),
    integrated_requirements: req('INTEGRATED_OPERATIONAL_REQUIREMENT')
  });

  // 2. Authority, ownership, accountability, and decision-rights map.
  write('authority-ownership-accountability-and-decision-rights-map.json', {
    note,
    authority_ownership_map: cov('AUTHORITY_OWNERSHIP_MAP')
  });

  // 3. Service-lifecycle readiness, acceptance, and stabilization model.
  write('service-lifecycle-readiness-acceptance-and-stabilization-model.json', {
    note,
    service_lifecycle_coverage: cov('SERVICE_LIFECYCLE_COVERAGE'),
    operational_readiness_requirements: req('OPERATIONAL_READINESS_REQUIREMENT'),
    operational_acceptance_requirements: req('OPERATIONAL_ACCEPTANCE_REQUIREMENT')
  });

  // 4. Support, incident, problem, escalation, and communications map.
  write('support-incident-problem-escalation-and-communications-map.json', {
    note,
    support_operational_coverage: cov('SUPPORT_OPERATIONAL_COVERAGE')
  });

  // 5. Observability, audit, reconciliation, and operational-evidence map.
  write('observability-audit-reconciliation-and-operational-evidence-map.json', {
    note,
    observability_operational_coverage: cov('OBSERVABILITY_OPERATIONAL_COVERAGE'),
    reconciliation_evidence_requirements: req('RECONCILIATION_EVIDENCE_REQUIREMENT')
  });

  // 6. Continuity, backup, restoration, recovery, and degraded-operation map.
  write('continuity-backup-restoration-recovery-and-degraded-operation-map.json', {
    note,
    continuity_recovery_coverage: cov('CONTINUITY_RECOVERY_COVERAGE'),
    recovery_evidence_requirements: req('RECOVERY_EVIDENCE_REQUIREMENT')
  });

  // 7. Migration, coexistence, cutover, rollback, acceptance, and retirement map.
  write('migration-coexistence-cutover-rollback-acceptance-and-retirement-map.json', {
    note,
    migration_operational_coverage: cov('MIGRATION_OPERATIONAL_COVERAGE'),
    migration_acceptance_requirements: req('MIGRATION_ACCEPTANCE_REQUIREMENT')
  });

  // 8. Data-quality, quarantine, reconciliation, and obligation map.
  write('data-quality-quarantine-reconciliation-and-obligation-map.json', {
    note,
    data_quality_reconciliation_coverage: cov('DATA_QUALITY_RECONCILIATION_COVERAGE')
  });

  // 9. Training, onboarding, accessibility, bilingual, and adoption map.
  write('training-onboarding-accessibility-bilingual-and-adoption-map.json', {
    note,
    training_adoption_coverage: cov('TRAINING_ADOPTION_COVERAGE'),
    training_competence_evidence_requirements: req('TRAINING_COMPETENCE_EVIDENCE_REQUIREMENT'),
    adoption_evidence_requirements: req('ADOPTION_EVIDENCE_REQUIREMENT')
  });

  // 10. Provider operations, continuity, return, deletion, substitution, and exit map.
  write('provider-operations-continuity-return-deletion-substitution-and-exit-map.json', {
    note,
    provider_operational_coverage: cov('PROVIDER_OPERATIONAL_COVERAGE'),
    provider_assurance_evidence_requirements: req('PROVIDER_ASSURANCE_EVIDENCE_REQUIREMENT')
  });

  // 11. Operational-readiness, independent-assurance, and Volume 12 handoff.
  write('operational-readiness-independent-assurance-and-volume-12-handoff.json', {
    note,
    house_p0_operational_coverage: cov('HOUSE_P0_OPERATIONAL_COVERAGE'),
    volume_12_handoff_coverage: cov('VOLUME_12_HANDOFF_COVERAGE'),
    independent_assurance_requirements: req('INDEPENDENT_ASSURANCE_REQUIREMENT'),
    volume_12_release_evidence_requirements: req('VOLUME_12_RELEASE_EVIDENCE_REQUIREMENT'),
    material_commitment_requirements: req('MATERIAL_COMMITMENT_REQUIREMENT')
  });

  // 12. Unresolved operational-readiness disposition.
  const backlog = records(ctx, 'REG-1104').filter((b) => /-V11-003$/.test(b.id));
  write('unresolved-operational-readiness-disposition.json', {
    note,
    unresolved: backlog.map((b) => ({ id: b.id, title: b.title, source: b.source, owner: b.owner, required_action_or_evidence: b.required_action_or_evidence, acceptance_authority: b.acceptance_authority, volume_12_destination: b.volume_12_destination, readiness_disposition: b.readiness_disposition, future_blocking_gate: b.future_blocking_gate }))
  });

  // 13. Volume 11 closure report (Markdown).
  const totalCoverage = Object.values(coverage).reduce((n, rows) => n + rows.length, 0);
  const totalRequirements = Object.values(requirements).reduce((n, rows) => n + rows.length, 0);
  const lines = [];
  lines.push('# Volume 11 Closure Report (non-authoritative projection)');
  lines.push('');
  lines.push(note);
  lines.push('');
  lines.push('## Consolidated coverage');
  lines.push('');
  for (const k of COVERAGE_KINDS) lines.push(`- ${k}: ${coverage[k].length} record(s)`);
  lines.push('');
  lines.push('## Operational and acceptance requirements');
  lines.push('');
  for (const k of REQUIREMENT_KINDS) lines.push(`- ${k}: ${requirements[k].length} record(s)`);
  lines.push('');
  lines.push(`Total: ${totalCoverage} coverage record(s) and ${totalRequirements} requirement(s).`);
  lines.push('');
  lines.push('## Posture');
  lines.push('');
  lines.push('Definition completeness is not operational readiness. Documentary approval is not');
  lines.push('operational proof. Volume 11 closure is not release acceptance. No record in');
  lines.push('Volume 11 asserts that any operational capability has been implemented, exercised,');
  lines.push('or accepted.');
  lines.push('');
  writeFileSync(join(outDir, 'volume-11-closure-report.md'), lines.join('\n'), 'utf8');

  return { coverage: totalCoverage, requirements: totalRequirements };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Volume 11 Package 3 final-closure analysis', run);
}
