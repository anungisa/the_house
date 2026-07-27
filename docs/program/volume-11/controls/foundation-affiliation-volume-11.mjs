// Control: Volume 11 Package 2 affiliation operating-model, migration, continuity,
// adoption, provider-operations, and operational-evidence analysis (NON-AUTHORITATIVE).
//
// Derives deterministic, non-authoritative projections of the Package 2 affiliation
// corpus (REG-1101 affiliation kinds and REG-1102 runbook/procedure kinds) into
// generated/affiliation-operating-model/. The projections are analytical views only:
// they confer no ratification, assert no implementation or operation, and authorize
// nothing. The Markdown chapters, YAML registers, JSON schemas, and control scripts
// remain the authoritative record. run() reports coverage findings; generate() writes
// the twelve Package 2 projections and the affiliation operating-model report.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}

// The twelve owner-assignment dimensions that must be represented across the
// affiliation vertical.
export const OWNERSHIP_DIMENSIONS = Object.freeze([
  'INSTITUTIONAL',
  'SERVICE',
  'PRODUCT',
  'DOMAIN',
  'TECHNICAL',
  'DATA',
  'SECURITY',
  'PRIVACY',
  'ACCESSIBILITY',
  'BILINGUAL',
  'SUPPORT',
  'PROVIDER'
]);

export function analyse(ctx) {
  return {
    affiliationServices: byKind(ctx, 'REG-1101', 'AFFILIATION_SERVICE'),
    affiliationCapabilities: byKind(ctx, 'REG-1101', 'AFFILIATION_OPERATIONAL_CAPABILITY'),
    ownerAssignments: byKind(ctx, 'REG-1101', 'AFFILIATION_OWNER_ASSIGNMENT_REQUIREMENT'),
    operatingStates: byKind(ctx, 'REG-1101', 'AFFILIATION_OPERATING_STATE'),
    supportClasses: byKind(ctx, 'REG-1101', 'AFFILIATION_SUPPORT_CLASS'),
    signals: byKind(ctx, 'REG-1101', 'AFFILIATION_SIGNAL'),
    providerContexts: byKind(ctx, 'REG-1101', 'AFFILIATION_PROVIDER_CONTEXT'),
    dataQualityOps: byKind(ctx, 'REG-1101', 'DATA_QUALITY_OPERATION'),
    reconciliationOps: byKind(ctx, 'REG-1101', 'RECONCILIATION_OPERATION'),
    adoptionAudiences: byKind(ctx, 'REG-1101', 'ADOPTION_AUDIENCE'),
    operatingProcedures: byKind(ctx, 'REG-1102', 'AFFILIATION_OPERATING_PROCEDURE'),
    supportRunbooks: byKind(ctx, 'REG-1102', 'SUPPORT_RUNBOOK'),
    incidentRunbooks: byKind(ctx, 'REG-1102', 'INCIDENT_RUNBOOK'),
    problemRunbooks: byKind(ctx, 'REG-1102', 'PROBLEM_RUNBOOK'),
    continuityProcedures: byKind(ctx, 'REG-1102', 'CONTINUITY_PROCEDURE'),
    backupVerifications: byKind(ctx, 'REG-1102', 'BACKUP_VERIFICATION_PROCEDURE'),
    restoreProcedures: byKind(ctx, 'REG-1102', 'RESTORE_PROCEDURE'),
    recoveryProcedures: byKind(ctx, 'REG-1102', 'RECOVERY_PROCEDURE'),
    migrationRunbooks: byKind(ctx, 'REG-1102', 'MIGRATION_RUNBOOK'),
    rehearsalRequirements: byKind(ctx, 'REG-1102', 'REHEARSAL_REQUIREMENT'),
    cutoverRequirements: byKind(ctx, 'REG-1102', 'CUTOVER_REQUIREMENT'),
    rollbackRequirements: byKind(ctx, 'REG-1102', 'ROLLBACK_REQUIREMENT'),
    sourceRetirementRequirements: byKind(ctx, 'REG-1102', 'SOURCE_RETIREMENT_REQUIREMENT'),
    quarantineProcedures: byKind(ctx, 'REG-1102', 'QUARANTINE_PROCEDURE'),
    reconciliationProcedures: byKind(ctx, 'REG-1102', 'RECONCILIATION_PROCEDURE'),
    trainingRequirements: byKind(ctx, 'REG-1102', 'TRAINING_REQUIREMENT'),
    onboardingRequirements: byKind(ctx, 'REG-1102', 'ONBOARDING_REQUIREMENT'),
    adoptionRequirements: byKind(ctx, 'REG-1102', 'ADOPTION_REQUIREMENT'),
    providerRequirements: byKind(ctx, 'REG-1102', 'PROVIDER_OPERATIONAL_REQUIREMENT'),
    evidenceRequirements: byKind(ctx, 'REG-1102', 'OPERATIONAL_EVIDENCE_REQUIREMENT')
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  const checks = [
    ['AFFILIATION_SERVICE', a.affiliationServices.length],
    ['AFFILIATION_OWNER_ASSIGNMENT_REQUIREMENT', a.ownerAssignments.length],
    ['AFFILIATION_OPERATING_STATE', a.operatingStates.length],
    ['AFFILIATION_SUPPORT_CLASS', a.supportClasses.length],
    ['AFFILIATION_SIGNAL', a.signals.length],
    ['AFFILIATION_PROVIDER_CONTEXT', a.providerContexts.length],
    ['DATA_QUALITY_OPERATION', a.dataQualityOps.length],
    ['RECONCILIATION_OPERATION', a.reconciliationOps.length],
    ['ADOPTION_AUDIENCE', a.adoptionAudiences.length],
    ['AFFILIATION_OPERATING_PROCEDURE', a.operatingProcedures.length],
    ['SUPPORT_RUNBOOK', a.supportRunbooks.length],
    ['INCIDENT_RUNBOOK', a.incidentRunbooks.length],
    ['PROBLEM_RUNBOOK', a.problemRunbooks.length],
    ['CONTINUITY_PROCEDURE', a.continuityProcedures.length],
    ['BACKUP_VERIFICATION_PROCEDURE', a.backupVerifications.length],
    ['RESTORE_PROCEDURE', a.restoreProcedures.length],
    ['RECOVERY_PROCEDURE', a.recoveryProcedures.length],
    ['MIGRATION_RUNBOOK', a.migrationRunbooks.length],
    ['REHEARSAL_REQUIREMENT', a.rehearsalRequirements.length],
    ['CUTOVER_REQUIREMENT', a.cutoverRequirements.length],
    ['ROLLBACK_REQUIREMENT', a.rollbackRequirements.length],
    ['SOURCE_RETIREMENT_REQUIREMENT', a.sourceRetirementRequirements.length],
    ['QUARANTINE_PROCEDURE', a.quarantineProcedures.length],
    ['RECONCILIATION_PROCEDURE', a.reconciliationProcedures.length],
    ['TRAINING_REQUIREMENT', a.trainingRequirements.length],
    ['ONBOARDING_REQUIREMENT', a.onboardingRequirements.length],
    ['ADOPTION_REQUIREMENT', a.adoptionRequirements.length],
    ['PROVIDER_OPERATIONAL_REQUIREMENT', a.providerRequirements.length],
    ['OPERATIONAL_EVIDENCE_REQUIREMENT', a.evidenceRequirements.length]
  ];
  for (const [label, count] of checks) {
    if (count === 0) {
      findings.push(makeFinding(Severity.ERROR, 'AFFILIATION_COVERAGE_GAP', `No ${label} records present in the affiliation operating model`, 'REG-1101/REG-1102'));
    }
  }
  // Every material affiliation service must name an operational owner or a governed
  // ownership gap.
  for (const s of a.affiliationServices) {
    if (s.material_service_capability === true && !s.operational_owner && !s.governed_ownership_gap) {
      findings.push(makeFinding(Severity.ERROR, 'AFFILIATION_SERVICE_UNOWNED', `${s.id} is a material affiliation service with neither an operational owner nor a governed ownership gap`, s.id));
    }
  }
  // The twelve owner-assignment dimensions must all be represented.
  const dims = new Set(a.ownerAssignments.map((r) => r.ownership_dimension));
  for (const d of OWNERSHIP_DIMENSIONS) {
    if (!dims.has(d)) {
      findings.push(makeFinding(Severity.ERROR, 'OWNERSHIP_DIMENSION_MISSING', `Owner-assignment dimension ${d} is not represented`, 'REG-1101'));
    }
  }
  findings.push(makeFinding(Severity.INFO, 'AFFILIATION_COVERAGE', `Affiliation coverage: ${a.affiliationServices.length} services, ${a.operatingStates.length} operating states, ${a.migrationRunbooks.length} migration runbooks, ${a.providerRequirements.length} provider requirements, ${a.evidenceRequirements.length} evidence requirements`, 'REG-1101'));
  return findings;
}

export function generate(ctx = loadContext()) {
  const a = analyse(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'affiliation-operating-model');
  mkdirSync(outDir, { recursive: true });
  const write = (name, payload) => writeFileSync(join(outDir, name), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const note = 'Non-authoritative projection of the source-controlled Volume 11 Package 2 corpus. Confers no ratification and authorizes no implementation or operations.';

  // 1. Affiliation service catalogue and owner map.
  write('affiliation-service-catalogue-and-owner-map.json', {
    note,
    services: a.affiliationServices.map((r) => ({ id: r.id, title: r.title, institutional_authority: r.institutional_authority, operational_owner: r.operational_owner, product_owner: r.product_owner, domain_owner: r.domain_owner, technical_owner: r.technical_owner, data_owner: r.data_owner, security_owner: r.security_owner, privacy_owner: r.privacy_owner, accessibility_bilingual_owner: r.accessibility_bilingual_owner, support_owner: r.support_owner, provider_owner: r.provider_owner, operational_boundary: r.operational_boundary, upstream: r.upstream_dependencies ?? [], downstream: r.downstream_dependencies ?? [], evidence_responsibility: r.evidence_responsibility, escalation_authority: r.escalation_authority, operational_acceptance_authority: r.operational_acceptance_authority, material: Boolean(r.material_service_capability), governed_ownership_gap: r.governed_ownership_gap ?? null })),
    capabilities: a.affiliationCapabilities.map((r) => ({ id: r.id, title: r.title, operational_owner: r.operational_owner })),
    owner_assignments: a.ownerAssignments.map((r) => ({ id: r.id, dimension: r.ownership_dimension, assigned_role: r.assigned_role, distinction: r.ownership_distinction }))
  });

  // 2. Operating-state transition and stabilization model.
  write('operating-state-transition-and-stabilization-model.json', {
    note,
    operating_states: a.operatingStates.map((r) => ({ id: r.id, title: r.title, operating_state: r.operating_state, scenario: r.state_scenario, entry: r.state_entry_condition, exit: r.exit_criteria, permitted_operations: r.permitted_operations, prohibited_operations: r.prohibited_operations, required_operational_evidence: r.required_operational_evidence, rollback_or_suspension: r.rollback_or_suspension_dependency, outstanding_obligations: r.outstanding_obligations, decision_authority: r.decision_authority, distinction: r.state_distinction, future_gate: r.future_gate }))
  });

  // 3. Support, service-request, escalation, incident, and problem runbooks.
  write('support-service-request-escalation-incident-and-problem-runbooks.json', {
    note,
    support_classes: a.supportClasses.map((r) => ({ id: r.id, title: r.title, support_class_kind: r.support_class_kind, requester: r.requester, receiving_role: r.receiving_role, authority_boundary: r.authority_boundary, sensitivity: r.sensitivity, escalation_route: r.escalation_route, communication_obligation: r.communication_obligation, resolution_authority: r.resolution_authority, closure_evidence: r.closure_evidence })),
    support_runbooks: a.supportRunbooks.map((r) => ({ id: r.id, title: r.title, permitted_requester: r.permitted_requester, receiving_role: r.receiving_role, triage_criteria: r.triage_criteria, authority_boundary: r.authority_boundary, escalation_path: r.escalation_path, closure_evidence: r.closure_evidence, reopening_criteria: r.reopening_criteria })),
    incident_runbooks: a.incidentRunbooks.map((r) => ({ id: r.id, title: r.title, signal_source: r.signal_source, triage_criteria: r.triage_criteria, containment: r.containment_action_class, recovery_dependency: r.recovery_dependency, reconciliation_requirement: r.reconciliation_requirement, escalation_authority: r.escalation_authority, evidence_required: r.evidence_required })),
    problem_runbooks: a.problemRunbooks.map((r) => ({ id: r.id, title: r.title, problem_management_dependency: r.problem_management_dependency, evidence_required: r.evidence_required }))
  });

  // 4. Observability, incident-response, problem, and reconciliation runbooks.
  write('observability-incident-response-problem-and-reconciliation-runbooks.json', {
    note,
    signals: a.signals.map((r) => ({ id: r.id, title: r.title, signal_source: r.signal_source, correlation_context: r.required_correlation_context, sensitivity: r.sensitivity, alert_destination: r.alert_destination, owner: r.operational_owner, escalation_authority: r.escalation_authority, containment: r.containment_action_class, recovery_dependency: r.recovery_dependency, reconciliation_requirement: r.reconciliation_requirement, evidence_required: r.evidence_required })),
    reconciliation_procedures: a.reconciliationProcedures.map((r) => ({ id: r.id, title: r.title, reconciliation_method: r.reconciliation_method, evidence_required: r.evidence_required }))
  });

  // 5. Continuity, backup, restore, recovery, and degraded-operation procedures.
  write('continuity-backup-restore-recovery-and-degraded-operation-procedures.json', {
    note,
    continuity_procedures: a.continuityProcedures.map((r) => ({ id: r.id, title: r.title, failure_stimulus: r.failure_stimulus, affected_service: r.affected_service, authoritative_state_at_risk: r.authoritative_state_at_risk, preserved_work: r.preserved_work, prohibited_action: r.prohibited_action, degraded_mode: r.degraded_mode, fallback: r.fallback_procedure, recovery: r.recovery_procedure, evidence_required: r.evidence_required })),
    backup_verifications: a.backupVerifications.map((r) => ({ id: r.id, completion: r.backup_completion_definition, verification: r.backup_verification_definition })),
    restore_procedures: a.restoreProcedures.map((r) => ({ id: r.id, restoration: r.restoration_definition })),
    recovery_procedures: a.recoveryProcedures.map((r) => ({ id: r.id, recovery: r.recovery_definition, reconciliation: r.reconciliation_definition }))
  });

  // 6. Migration qualification, rehearsal, cutover, rollback, and retirement runbooks.
  write('migration-qualification-rehearsal-cutover-rollback-and-retirement-runbooks.json', {
    note,
    migration_runbooks: a.migrationRunbooks.map((r) => ({ id: r.id, title: r.title, source: r.source, source_authority: r.source_authority, target_service: r.target_service, entry_criteria: r.entry_criteria, provenance: r.provenance_capture, mapping: r.mapping_dependency, uncertainty: r.uncertainty_treatment, identity_candidate: r.identity_candidate_treatment, quarantine: r.quarantine_posture, rehearsal: r.rehearsal_requirement, acceptance: r.acceptance_criteria, reconciliation: r.reconciliation_method, rollback: r.rollback_dependency, cutover_boundary: r.cutover_boundary, source_retirement: r.source_retirement_boundary, evidence_required: r.evidence_required, decision_authority: r.decision_authority })),
    rehearsals: a.rehearsalRequirements.map((r) => ({ id: r.id, title: r.title })),
    cutovers: a.cutoverRequirements.map((r) => ({ id: r.id, title: r.title })),
    rollbacks: a.rollbackRequirements.map((r) => ({ id: r.id, title: r.title })),
    source_retirements: a.sourceRetirementRequirements.map((r) => ({ id: r.id, title: r.title }))
  });

  // 7. Data-quality, quarantine, reconciliation, and obligation operations.
  write('data-quality-quarantine-reconciliation-and-obligation-operations.json', {
    note,
    data_quality_operations: a.dataQualityOps.map((r) => ({ id: r.id, title: r.title, authoritative_source: r.authoritative_source, detection_dependency: r.detection_dependency, operational_owner: r.operational_owner, institutional_decision_owner: r.institutional_decision_owner, quarantine_status: r.quarantine_status, permitted_actions: r.permitted_actions, prohibited_actions: r.prohibited_actions, correction_method_dependency: r.correction_method_dependency, reconciliation_method: r.reconciliation_method, escalation_route: r.escalation_route, closure_authority: r.closure_authority, residual_risk_posture: r.residual_risk_posture })),
    reconciliation_operations: a.reconciliationOps.map((r) => ({ id: r.id, title: r.title, authoritative_source: r.authoritative_source, reconciliation_method: r.reconciliation_method, closure_authority: r.closure_authority })),
    quarantine_procedures: a.quarantineProcedures.map((r) => ({ id: r.id, title: r.title, quarantine_status: r.quarantine_status, permitted_actions: r.permitted_actions, prohibited_actions: r.prohibited_actions }))
  });

  // 8. Training, onboarding, communications, accessibility, bilingual, and adoption plan.
  write('training-onboarding-communications-accessibility-bilingual-and-adoption-plan.json', {
    note,
    audiences: a.adoptionAudiences.map((r) => ({ id: r.id, title: r.title, role_and_authority: r.role_and_authority, required_knowledge: r.required_knowledge, required_task_competence: r.required_task_competence, adoption_measure: r.adoption_measure, readiness_criterion: r.readiness_criterion, reinforcement_requirement: r.reinforcement_requirement })),
    training_requirements: a.trainingRequirements.map((r) => ({ id: r.id, title: r.title, content: r.training_content, delivery: r.delivery_method_dependency, competence: r.competence_definition, english_french: r.english_french_requirement, accessibility: r.accessibility_requirement, assessment: r.assessment_method })),
    onboarding_requirements: a.onboardingRequirements.map((r) => ({ id: r.id, title: r.title, onboarding_evidence: r.onboarding_evidence })),
    adoption_requirements: a.adoptionRequirements.map((r) => ({ id: r.id, title: r.title, adoption_measure: r.adoption_measure, reinforcement_requirement: r.reinforcement_requirement }))
  });

  // 9. Provider operations, continuity, return, deletion, substitution, and exit runbooks.
  write('provider-operations-continuity-return-deletion-substitution-and-exit-runbooks.json', {
    note,
    provider_contexts: a.providerContexts.map((r) => ({ id: r.id, title: r.title, institutional_owner: r.institutional_owner, contract_owner: r.contract_owner, operational_owner: r.operational_owner, data_custody: r.data_custody, authority_retained: r.authority_retained })),
    provider_requirements: a.providerRequirements.map((r) => ({ id: r.id, title: r.title, incident_obligation: r.incident_obligation, continuity_obligation: r.continuity_obligation, subcontractor_dependency: r.subcontractor_dependency, return_requirement: r.return_requirement, deletion_evidence_requirement: r.deletion_evidence_requirement, residual_copy_posture: r.residual_copy_posture, backup_posture: r.backup_posture, substitution_dependency: r.substitution_dependency, reconciliation_requirement: r.reconciliation_requirement, exit_procedure: r.exit_procedure, certification_boundary: r.provider_certification_boundary, end_to_end_assurance_boundary: r.end_to_end_assurance_boundary }))
  });

  // 10. Operational-evidence and Volume 12 destination map.
  write('operational-evidence-and-volume-12-destination-map.json', {
    note,
    evidence_requirements: a.evidenceRequirements.map((r) => ({ id: r.id, title: r.title, binds_environment: r.evidence_binds_environment, binds_config: r.evidence_binds_config, binds_version: r.evidence_binds_version, binds_identity: r.evidence_binds_identity, binds_org: r.evidence_binds_org, binds_jurisdiction: r.evidence_binds_jurisdiction, binds_data_classification: r.evidence_binds_data_classification, binds_provider_state: r.evidence_binds_provider_state, binds_time: r.evidence_binds_time, evidence_destination: r.evidence_destination, volume_12_destination: r.volume_12_destination, future_gate: r.future_gate }))
  });

  // 11. House P0 operational-assurance destination map.
  write('house-p0-operational-assurance-destination-map.json', {
    note,
    house_p0_destinations: a.evidenceRequirements.filter((r) => r.house_p0_destination).map((r) => ({ id: r.id, title: r.title, house_p0_destination: r.house_p0_destination, volume_12_destination: r.volume_12_destination }))
  });

  // 12. Package 2 affiliation operating-model report (Markdown).
  const now = new Date().toISOString();
  const md = `# Volume 11 Package 2 Affiliation Operating-Model Report (NON-AUTHORITATIVE)

Generated: ${now}

> ${note}

## Coverage

| Element | Count |
| --- | --- |
| Affiliation services | ${a.affiliationServices.length} |
| Affiliation capabilities | ${a.affiliationCapabilities.length} |
| Owner assignments | ${a.ownerAssignments.length} |
| Operating states | ${a.operatingStates.length} |
| Support classes | ${a.supportClasses.length} |
| Affiliation signals | ${a.signals.length} |
| Provider contexts | ${a.providerContexts.length} |
| Data-quality operations | ${a.dataQualityOps.length} |
| Reconciliation operations | ${a.reconciliationOps.length} |
| Adoption audiences | ${a.adoptionAudiences.length} |
| Operating procedures | ${a.operatingProcedures.length} |
| Support runbooks | ${a.supportRunbooks.length} |
| Incident runbooks | ${a.incidentRunbooks.length} |
| Problem runbooks | ${a.problemRunbooks.length} |
| Continuity procedures | ${a.continuityProcedures.length} |
| Backup verifications | ${a.backupVerifications.length} |
| Restore procedures | ${a.restoreProcedures.length} |
| Recovery procedures | ${a.recoveryProcedures.length} |
| Migration runbooks | ${a.migrationRunbooks.length} |
| Rehearsal requirements | ${a.rehearsalRequirements.length} |
| Cutover requirements | ${a.cutoverRequirements.length} |
| Rollback requirements | ${a.rollbackRequirements.length} |
| Source-retirement requirements | ${a.sourceRetirementRequirements.length} |
| Quarantine procedures | ${a.quarantineProcedures.length} |
| Reconciliation procedures | ${a.reconciliationProcedures.length} |
| Training requirements | ${a.trainingRequirements.length} |
| Onboarding requirements | ${a.onboardingRequirements.length} |
| Adoption requirements | ${a.adoptionRequirements.length} |
| Provider requirements | ${a.providerRequirements.length} |
| Operational-evidence requirements | ${a.evidenceRequirements.length} |

## Posture

- No record authorizes implementation or operations.
- Every controlled record is not-implemented, not-operational, and not-executed.
- Operating model is not an operating service; a defined runbook is not an executed runbook.
- Backup generated is not backup verified is not backup restorable.
- Mapping complete is not identity resolved; rehearsal completed is not migration authorized.
- Cutover completed is not business accepted; business accepted is not source retired.
- Training delivered is not competence demonstrated; onboarding completed is not sustained adoption.
- Provider certification is not operational assurance.
- No affiliation service operation or operational exercise has been executed.
- Volume 11 is not tagged upon Package 2 closure.
`;
  writeFileSync(join(outDir, 'package-2-affiliation-operating-model-report.md'), md, 'utf8');

  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Affiliation operating-model analysis', run);
}
