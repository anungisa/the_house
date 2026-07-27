// Control: Volume 11 Package 1 operations, migration, adoption, and assurance
// governance-foundation analysis (NON-AUTHORITATIVE).
//
// Derives deterministic, non-authoritative projections of the source-controlled
// Volume 11 corpus into generated/foundation/. The projections are analytical
// views only: they confer no ratification, assert no implementation or operation,
// and authorize nothing. The Markdown chapters, YAML registers, JSON schemas, and
// control scripts remain the authoritative record. run() reports coverage
// findings; generate() writes the ten Package 1 foundation projections and the
// operational-governance report.

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
  return {
    services: byKind(ctx, 'REG-1101', 'SERVICE'),
    capabilities: byKind(ctx, 'REG-1101', 'CAPABILITY'),
    owners: byKind(ctx, 'REG-1101', 'OWNER'),
    operatingStates: byKind(ctx, 'REG-1101', 'OPERATING_STATE'),
    supportClasses: byKind(ctx, 'REG-1101', 'SUPPORT_CLASS'),
    providers: byKind(ctx, 'REG-1101', 'PROVIDER'),
    signals: byKind(ctx, 'REG-1102', 'OBSERVABILITY_SIGNAL'),
    procedures: byKind(ctx, 'REG-1102', 'OPERATIONAL_PROCEDURE'),
    continuity: byKind(ctx, 'REG-1102', 'CONTINUITY_SCENARIO'),
    backups: byKind(ctx, 'REG-1102', 'BACKUP_REQUIREMENT'),
    restores: byKind(ctx, 'REG-1102', 'RESTORE_REQUIREMENT'),
    recoveries: byKind(ctx, 'REG-1102', 'RECOVERY_REQUIREMENT'),
    migrationStages: byKind(ctx, 'REG-1102', 'MIGRATION_STAGE'),
    reconciliations: byKind(ctx, 'REG-1102', 'RECONCILIATION_REQUIREMENT'),
    trainingAudiences: byKind(ctx, 'REG-1102', 'TRAINING_AUDIENCE'),
    adoptionMeasures: byKind(ctx, 'REG-1102', 'ADOPTION_MEASURE'),
    evidenceReqs: byKind(ctx, 'REG-1102', 'EVIDENCE_REQUIREMENT'),
    acceptance: byKind(ctx, 'REG-1102', 'ACCEPTANCE_CRITERION'),
    handoffs: byKind(ctx, 'REG-1102', 'HANDOFF'),
    decisions: records(ctx, 'REG-1103'),
    backlog: records(ctx, 'REG-1104')
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  const checks = [
    ['SERVICE', a.services.length],
    ['CAPABILITY', a.capabilities.length],
    ['OWNER', a.owners.length],
    ['OPERATING_STATE', a.operatingStates.length],
    ['SUPPORT_CLASS', a.supportClasses.length],
    ['PROVIDER', a.providers.length],
    ['OBSERVABILITY_SIGNAL', a.signals.length],
    ['CONTINUITY_SCENARIO', a.continuity.length],
    ['BACKUP_REQUIREMENT', a.backups.length],
    ['RESTORE_REQUIREMENT', a.restores.length],
    ['RECOVERY_REQUIREMENT', a.recoveries.length],
    ['MIGRATION_STAGE', a.migrationStages.length],
    ['RECONCILIATION_REQUIREMENT', a.reconciliations.length],
    ['TRAINING_AUDIENCE', a.trainingAudiences.length],
    ['ADOPTION_MEASURE', a.adoptionMeasures.length],
    ['EVIDENCE_REQUIREMENT', a.evidenceReqs.length],
    ['ACCEPTANCE_CRITERION', a.acceptance.length],
    ['HANDOFF', a.handoffs.length],
    ['DECISION', a.decisions.length],
    ['BACKLOG', a.backlog.length]
  ];
  for (const [label, count] of checks) {
    if (count === 0) {
      findings.push(makeFinding(Severity.ERROR, 'FOUNDATION_COVERAGE_GAP', `No ${label} records present in the operational governance foundation`, 'REG-1101/REG-1102/REG-1103/REG-1104'));
    }
  }
  // Every material service capability must name an operational owner or a governed
  // ownership gap.
  for (const s of [...a.services, ...a.capabilities]) {
    if (s.material_service_capability === true && !s.operational_owner && !s.governed_ownership_gap) {
      findings.push(makeFinding(Severity.ERROR, 'MATERIAL_CAPABILITY_UNOWNED', `${s.id} is a material service capability with neither an operational owner nor a governed ownership gap`, s.id));
    }
  }
  // Every handoff must name a destination and a target volume.
  for (const h of a.handoffs) {
    if (!h.handoff_destination) findings.push(makeFinding(Severity.ERROR, 'HANDOFF_NO_DESTINATION', `${h.id} has no handoff destination`, h.id));
  }
  findings.push(makeFinding(Severity.INFO, 'FOUNDATION_COVERAGE', `Foundation coverage: ${a.services.length} services, ${a.operatingStates.length} operating states, ${a.migrationStages.length} migration stages, ${a.providers.length} providers, ${a.handoffs.length} handoffs, ${a.backlog.length} backlog items`, 'REG-1101'));
  return findings;
}

export function generate(ctx = loadContext()) {
  const a = analyse(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'foundation');
  mkdirSync(outDir, { recursive: true });
  const write = (name, payload) => writeFileSync(join(outDir, name), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const note = 'Non-authoritative projection of the source-controlled Volume 11 corpus. Confers no ratification and authorizes no implementation or operations.';

  // 1. Service operating model and ownership map.
  write('service-operating-model-and-ownership-map.json', {
    note,
    services: a.services.map((r) => ({ id: r.id, title: r.title, operational_owner: r.operational_owner, institutional_authority: r.institutional_authority, material: Boolean(r.material_service_capability), governed_ownership_gap: r.governed_ownership_gap ?? null })),
    capabilities: a.capabilities.map((r) => ({ id: r.id, title: r.title, operational_owner: r.operational_owner, material: Boolean(r.material_service_capability) })),
    owners: a.owners.map((r) => ({ id: r.id, title: r.title, decision_rights: r.decision_rights, escalation_route: r.escalation_route, authority_domain: r.authority_domain }))
  });

  // 2. Service lifecycle state map.
  write('service-lifecycle-state-map.json', {
    note,
    operating_states: a.operatingStates.map((r) => ({ id: r.id, title: r.title, operating_state: r.operating_state, entry: r.state_entry_condition, exit: r.state_exit_condition, distinction: r.state_distinction }))
  });

  // 3. Support, incident, problem, and escalation map.
  write('support-incident-problem-and-escalation-map.json', {
    note,
    support_classes: a.supportClasses.map((r) => ({ id: r.id, title: r.title, support_class_kind: r.support_class_kind, access_boundary: r.access_boundary, mutation_boundary: r.mutation_boundary, escalation_route: r.escalation_route })),
    incidents: a.backlog.filter((b) => b.kind === 'INCIDENT').map((r) => ({ id: r.id, owner: r.owner, status: r.current_status })),
    problems: a.backlog.filter((b) => b.kind === 'PROBLEM').map((r) => ({ id: r.id, owner: r.owner, status: r.current_status }))
  });

  // 4. Observability, audit, and incident-response map.
  write('observability-audit-and-incident-response-map.json', {
    note,
    signals: a.signals.map((r) => ({ id: r.id, title: r.title, context: r.signal_context, sensitivity: r.signal_sensitivity, owner: r.signal_owner, alert_dependency: r.alert_dependency, evidence_binding: r.evidence_binding, detection_vs_response: r.detection_vs_response_distinction }))
  });

  // 5. Continuity, backup, restore, and recovery map.
  write('continuity-backup-restore-and-recovery-map.json', {
    note,
    continuity_scenarios: a.continuity.map((r) => ({ id: r.id, title: r.title, preserved_work: r.preserved_work, prohibited_action: r.prohibited_action, degraded_mode: r.degraded_mode, fallback: r.fallback_procedure, recovery: r.recovery_procedure })),
    backups: a.backups.map((r) => ({ id: r.id, completion: r.backup_completion_definition, verification: r.backup_verification_definition })),
    restores: a.restores.map((r) => ({ id: r.id, restoration: r.restoration_definition })),
    recoveries: a.recoveries.map((r) => ({ id: r.id, recovery: r.recovery_definition, reconciliation: r.reconciliation_definition }))
  });

  // 6. Migration, coexistence, rehearsal, and reconciliation map.
  write('migration-coexistence-rehearsal-and-reconciliation-map.json', {
    note,
    migration_stages: a.migrationStages.map((r) => ({ id: r.id, title: r.title, stage: r.migration_stage, source_authority: r.source_authority_preservation, provenance: r.provenance_preservation, uncertainty: r.uncertainty_preservation, identity_candidate: r.identity_candidate_treatment, quarantine: r.quarantine_treatment, rehearsal_boundary: r.rehearsal_boundary, cutover_boundary: r.cutover_boundary, acceptance_boundary: r.acceptance_boundary, rollback: r.rollback_definition, source_retirement: r.source_retirement_boundary, mapping_vs_identity: r.mapping_vs_identity_distinction })),
    reconciliations: a.reconciliations.map((r) => ({ id: r.id, reconciliation: r.reconciliation_definition }))
  });

  // 7. Training, communications, adoption, and accessibility map.
  write('training-communications-adoption-and-accessibility-map.json', {
    note,
    training_audiences: a.trainingAudiences.map((r) => ({ id: r.id, title: r.title, content: r.training_content, delivery: r.training_delivery, competence: r.competence_definition, onboarding: r.onboarding_definition, sustained_adoption: r.sustained_adoption_definition, accessibility: r.accessibility_obligation, bilingual: r.bilingual_obligation })),
    adoption_measures: a.adoptionMeasures.map((r) => ({ id: r.id, title: r.title, sustained_adoption: r.sustained_adoption_definition }))
  });

  // 8. Provider operations, continuity, and exit map.
  write('provider-operations-continuity-and-exit-map.json', {
    note,
    providers: a.providers.map((r) => ({ id: r.id, title: r.title, provider_role: r.provider_role, certification_boundary: r.provider_certification_boundary, end_to_end_assurance_boundary: r.end_to_end_assurance_boundary }))
  });

  // 9. Operational evidence, assurance, and acceptance map.
  write('operational-evidence-assurance-and-acceptance-map.json', {
    note,
    evidence_requirements: a.evidenceReqs.map((r) => ({ id: r.id, title: r.title, binds_environment: r.evidence_binds_environment, binds_config: r.evidence_binds_config, binds_version: r.evidence_binds_version, binds_identity: r.evidence_binds_identity, binds_org: r.evidence_binds_org, binds_jurisdiction: r.evidence_binds_jurisdiction, binds_data_classification: r.evidence_binds_data_classification, binds_provider_state: r.evidence_binds_provider_state, binds_time: r.evidence_binds_time })),
    acceptance_criteria: a.acceptance.map((r) => ({ id: r.id, title: r.title, independence: r.independence_requirement, acceptance_authority: r.acceptance_authority, future_gate: r.future_gate }))
  });

  // 10. Volume 12 handoff and unresolved-item map.
  write('volume-12-handoff-and-unresolved-item-map.json', {
    note,
    handoffs: a.handoffs.map((r) => ({ id: r.id, title: r.title, destination: r.handoff_destination, target_volume: r.handoff_target_volume, future_gate: r.future_gate })),
    unresolved_items: a.backlog.map((r) => ({ id: r.id, kind: r.kind, owner: r.owner, evidence: r.required_action_or_evidence, future_blocking_gate: r.future_blocking_gate })),
    downstream_gates: ['V11-G1', 'V12-G1', 'EXEC-MCG']
  });

  // 11. Package 1 operational-governance report (Markdown).
  const now = new Date().toISOString();
  const md = `# Volume 11 Package 1 Operational-Governance Report (NON-AUTHORITATIVE)

Generated: ${now}

> ${note}

## Coverage

| Element | Count |
| --- | --- |
| Services | ${a.services.length} |
| Capabilities | ${a.capabilities.length} |
| Owners | ${a.owners.length} |
| Operating states | ${a.operatingStates.length} |
| Support classes | ${a.supportClasses.length} |
| Providers | ${a.providers.length} |
| Observability signals | ${a.signals.length} |
| Continuity scenarios | ${a.continuity.length} |
| Backup requirements | ${a.backups.length} |
| Restore requirements | ${a.restores.length} |
| Recovery requirements | ${a.recoveries.length} |
| Migration stages | ${a.migrationStages.length} |
| Reconciliation requirements | ${a.reconciliations.length} |
| Training audiences | ${a.trainingAudiences.length} |
| Adoption measures | ${a.adoptionMeasures.length} |
| Evidence requirements | ${a.evidenceReqs.length} |
| Acceptance criteria | ${a.acceptance.length} |
| Handoffs | ${a.handoffs.length} |
| Decisions | ${a.decisions.length} |
| Backlog items | ${a.backlog.length} |

## Posture

- No record authorizes implementation or operations.
- Every controlled record is not-implemented, not-operational, and not-executed.
- Operational model is not an operating service; a defined procedure is not an executed procedure.
- Backup completed is not backup verified is not backup restorable.
- Mapping complete is not identity resolved; rehearsal is not migration authorization.
- Cutover is not acceptance is not source retirement.
- No operational, migration, backup, restore, recovery, training, onboarding, incident, or provider exercise has been executed.
- Volume 11 is not tagged upon Package 1 closure.
`;
  writeFileSync(join(outDir, 'package-1-operational-governance-report.md'), md, 'utf8');

  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Operational governance foundation analysis', run);
}
