// Control: Volume 6 Package 4 incident-resilience-assurance analysis (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown report describing the Package 4
// security-operations, incident, breach, vulnerability, resilience, recovery,
// provider-assurance, and control-assurance CONTROL MODEL: operational-control and
// owner coverage; event detection, triage, and investigation; incident classification,
// command, and closure; breach-notification and communications dependencies;
// vulnerability, configuration, and exception coverage; resilience, dependency-failure,
// and degraded-mode analysis; backup, restore, recovery, and business-acceptance
// evidence; provider continuity, exit, return, and deletion; and control metrics,
// exercises, and assurance evidence. Non-authoritative: the source-controlled corpus
// and its recorded approvals remain the sole source of truth. These projections are
// rebuildable from the governed registers and authorize no implementation.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, loadContext } from './lib.mjs';

const P4_CHAPTERS = new Set([
  'V6-31',
  'V6-32',
  'V6-33',
  'V6-34',
  'V6-35',
  'V6-36',
  'V6-37',
  'V6-38',
  'V6-39',
  'V6-40'
]);

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

function countBy(items, key) {
  const out = {};
  for (const it of items) {
    const v = it[key] ?? 'UNSET';
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

function writeJson(dir, name, data) {
  writeFileSync(join(dir, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

const OPERATIONAL_FAMILIES = [
  'SECURITY_OPERATIONS',
  'MONITORING_AND_DETECTION',
  'INCIDENT_RESPONSE',
  'VULNERABILITY_MANAGEMENT',
  'CONFIGURATION',
  'EXCEPTION_AND_RECOVERY',
  'RESILIENCE',
  'CONTINUITY_AND_RECOVERY',
  'PROVIDER_ASSURANCE',
  'CONTROL_ASSURANCE'
];

export function project(ctx) {
  const controls = records(ctx, 'REG-602');
  const protection = records(ctx, 'REG-601');
  const decisions = records(ctx, 'REG-603');
  const backlog = records(ctx, 'REG-604');

  // Resolve references against the full corpus, but scope Package 4 analysis to Package 4 chapters.
  const controlObjectiveIds = new Set(controls.filter((c) => c.kind === 'CONTROL_OBJECTIVE').map((c) => c.id));
  const assetIds = new Set(protection.filter((r) => r.kind === 'ASSET').map((r) => r.id));
  const rightIds = new Set(protection.filter((r) => r.kind === 'RIGHT').map((r) => r.id));

  const p4 = (r) => P4_CHAPTERS.has(r.chapter_ref);

  const controlObjectives = controls.filter((c) => c.kind === 'CONTROL_OBJECTIVE' && p4(c));
  const incidentFamilies = controls.filter((c) => c.kind === 'INCIDENT_FAMILY' && p4(c));
  const assuranceRequirements = controls.filter((c) => c.kind === 'ASSURANCE_REQUIREMENT' && p4(c));
  const obligations = controls.filter(
    (c) => (c.kind === 'OBLIGATION' || c.kind === 'COMPLIANCE_OBLIGATION') && p4(c)
  );
  const threats = protection.filter((r) => (r.kind === 'THREAT' || r.kind === 'ABUSE_CASE') && p4(r));
  const assets = protection.filter((r) => r.kind === 'ASSET' && p4(r));

  const resolvesProtected = (c) =>
    !c.protected_asset_or_right ||
    assetIds.has(c.protected_asset_or_right) ||
    rightIds.has(c.protected_asset_or_right);

  const inFamilies = (families) => controlObjectives.filter((c) => families.includes(c.control_family));

  const summarizeControls = (list) =>
    list.map((c) => ({
      id: c.id,
      control_family: c.control_family ?? null,
      owner: c.owner ?? null,
      failure_posture: c.failure_posture ?? null,
      protected_asset_or_right: c.protected_asset_or_right ?? null,
      future_blocking_gate: c.future_blocking_gate ?? null
    }));

  // 1. Operational-control and owner coverage.
  const operationalControls = inFamilies(OPERATIONAL_FAMILIES);
  const operationalControlAndOwnerCoverage = {
    total: operationalControls.length,
    by_control_family: countBy(operationalControls, 'control_family'),
    by_failure_posture: countBy(operationalControls, 'failure_posture'),
    controls: summarizeControls(operationalControls),
    controls_without_owner: operationalControls.filter((c) => !c.owner).map((c) => c.id),
    controls_without_required_evidence: operationalControls.filter((c) => !c.required_evidence).map((c) => c.id),
    controls_without_gate: operationalControls.filter((c) => !c.future_blocking_gate).map((c) => c.id),
    controls_with_unresolved_protected_ref: operationalControls.filter((c) => !resolvesProtected(c)).map((c) => c.id)
  };

  // 2. Event detection, triage, and investigation.
  const detectionControls = inFamilies(['MONITORING_AND_DETECTION']);
  const eventDetectionTriageAndInvestigation = {
    total: detectionControls.length,
    controls: detectionControls.map((c) => ({
      id: c.id,
      detection_objective: c.detection_objective ?? null,
      triage_authority: c.triage_authority ?? null,
      investigation_authority: c.investigation_authority ?? null,
      false_positive_posture: c.false_positive_posture ?? null,
      escalation_condition: c.escalation_condition ?? null,
      privacy_constraint: c.privacy_constraint ?? null
    })),
    controls_without_owner: detectionControls.filter((c) => !c.owner).map((c) => c.id),
    controls_with_unresolved_protected_ref: detectionControls.filter((c) => !resolvesProtected(c)).map((c) => c.id)
  };

  // 3. Incident classification, command, and closure.
  const incidentControls = inFamilies(['INCIDENT_RESPONSE']);
  const incidentClassificationCommandAndClosure = {
    control_objectives: incidentControls.length,
    incident_families: incidentFamilies.length,
    controls: summarizeControls(incidentControls),
    families: incidentFamilies.map((f) => ({
      id: f.id,
      evidence_preservation: f.evidence_preservation ?? null,
      decision_authority: f.decision_authority ?? null,
      containment_objective: f.containment_objective ?? null,
      recovery_objective: f.recovery_objective ?? null
    })),
    families_without_evidence_preservation: incidentFamilies.filter((f) => !f.evidence_preservation).map((f) => f.id),
    controls_without_owner: incidentControls.filter((c) => !c.owner).map((c) => c.id),
    controls_with_unresolved_protected_ref: incidentControls.filter((c) => !resolvesProtected(c)).map((c) => c.id)
  };

  // 4. Breach-notification and communications dependencies.
  const notificationControls = incidentControls.filter(
    (c) => c.affected_party || c.minimum_necessary_disclosure || c.potential_notification_obligation
  );
  const breachNotificationAndCommunicationsDependencies = {
    total: notificationControls.length,
    controls: notificationControls.map((c) => ({
      id: c.id,
      affected_party: c.affected_party ?? null,
      potential_notification_obligation: c.potential_notification_obligation ?? null,
      legal_validation_dependency: c.legal_validation_dependency ?? null,
      contractual_dependency: c.contractual_dependency ?? null,
      minimum_necessary_disclosure: c.minimum_necessary_disclosure ?? null,
      communication_authority: c.communication_authority ?? null,
      language_and_accessibility_requirement: c.language_and_accessibility_requirement ?? null
    })),
    controls_with_unresolved_protected_ref: notificationControls.filter((c) => !resolvesProtected(c)).map((c) => c.id)
  };

  // 5. Vulnerability, configuration, and exception coverage.
  const vulnerabilityControls = inFamilies(['VULNERABILITY_MANAGEMENT', 'CONFIGURATION', 'EXCEPTION_AND_RECOVERY']);
  const vulnerabilityConfigurationAndExceptionCoverage = {
    total: vulnerabilityControls.length,
    by_control_family: countBy(vulnerabilityControls, 'control_family'),
    controls: summarizeControls(vulnerabilityControls),
    exception_controls_without_expiry: vulnerabilityControls
      .filter((c) => c.control_family === 'EXCEPTION_AND_RECOVERY' && !c.expiry_requirement)
      .map((c) => c.id),
    remediation_controls_without_retest: vulnerabilityControls
      .filter((c) => c.control_family === 'VULNERABILITY_MANAGEMENT' && !c.retest_requirement)
      .map((c) => c.id),
    controls_with_unresolved_protected_ref: vulnerabilityControls.filter((c) => !resolvesProtected(c)).map((c) => c.id)
  };

  // 6. Resilience, dependency-failure, and degraded-mode analysis.
  const resilienceControls = inFamilies(['RESILIENCE']);
  const resilienceDependencyAndDegradedModeAnalysis = {
    total: resilienceControls.length,
    controls: resilienceControls.map((c) => ({
      id: c.id,
      failure_detection_requirement: c.failure_detection_requirement ?? null,
      authority_retained: c.authority_retained ?? null,
      failure_posture: c.failure_posture ?? null,
      reconciliation_requirement: c.reconciliation_requirement ?? null
    })),
    controls_not_failing_closed: resilienceControls.filter((c) => c.failure_posture !== 'FAIL_CLOSED').map((c) => c.id),
    controls_with_unresolved_protected_ref: resilienceControls.filter((c) => !resolvesProtected(c)).map((c) => c.id)
  };

  // 7. Backup, restore, recovery, and business-acceptance evidence.
  const recoveryControls = inFamilies(['CONTINUITY_AND_RECOVERY']);
  const backupRestoreRecoveryAndBusinessAcceptance = {
    total: recoveryControls.length,
    controls: recoveryControls.map((c) => ({
      id: c.id,
      backup_dependency: c.backup_dependency ?? null,
      restore_dependency: c.restore_dependency ?? null,
      integrity_verification_requirement: c.integrity_verification_requirement ?? null,
      business_acceptance_authority: c.business_acceptance_authority ?? null,
      reconciliation_requirement: c.reconciliation_requirement ?? null
    })),
    controls_without_owner: recoveryControls.filter((c) => !c.owner).map((c) => c.id),
    controls_with_unresolved_protected_ref: recoveryControls.filter((c) => !resolvesProtected(c)).map((c) => c.id)
  };

  // 8. Provider continuity, exit, return, and deletion.
  const providerControls = inFamilies(['PROVIDER_ASSURANCE']);
  const providerContinuityExitReturnAndDeletion = {
    total: providerControls.length,
    controls: providerControls.map((c) => ({
      id: c.id,
      institutional_authority_retained: c.institutional_authority_retained ?? null,
      continuity_dependency: c.continuity_dependency ?? null,
      exit_trigger: c.exit_trigger ?? null,
      data_return_requirement: c.data_return_requirement ?? null,
      deletion_evidence_requirement: c.deletion_evidence_requirement ?? null,
      residual_copy_posture: c.residual_copy_posture ?? null,
      independent_assurance_dependency: c.independent_assurance_dependency ?? null
    })),
    controls_without_owner: providerControls.filter((c) => !c.owner).map((c) => c.id),
    controls_with_unresolved_protected_ref: providerControls.filter((c) => !resolvesProtected(c)).map((c) => c.id)
  };

  // 9. Control metrics, exercises, and assurance evidence.
  const assuranceControls = inFamilies(['CONTROL_ASSURANCE']);
  const controlMetricsExercisesAndAssuranceEvidence = {
    control_objectives: assuranceControls.length,
    assurance_requirements: assuranceRequirements.length,
    by_assurance_classification: countBy(assuranceRequirements, 'assurance_classification'),
    controls: summarizeControls(assuranceControls),
    requirements: assuranceRequirements.map((a) => ({
      id: a.id,
      owner: a.owner ?? a.control_owner ?? null,
      assurance_classification: a.assurance_classification ?? null,
      future_blocking_gate: a.future_blocking_gate ?? null
    })),
    assurance_without_owner: assuranceRequirements.filter((a) => !a.owner && !a.control_owner).map((a) => a.id),
    assurance_without_required_evidence: assuranceRequirements.filter((a) => !a.required_evidence).map((a) => a.id),
    assurance_without_classification: assuranceRequirements.filter((a) => !a.assurance_classification).map((a) => a.id),
    assurance_without_gate: assuranceRequirements.filter((a) => !a.future_blocking_gate).map((a) => a.id)
  };

  // Cross-cutting: obligation and threat integrity.
  const obligationsWithUnresolvedControlRef = obligations
    .filter((o) => !controlObjectiveIds.has(o.control_objective_ref))
    .map((o) => o.id);
  const obligationsWithoutAuthorityOwner = obligations.filter((o) => !o.authority_owner).map((o) => o.id);
  const obligationsWithoutApplicability = obligations.filter((o) => !o.applicability_status).map((o) => o.id);
  const obligationsWithoutGate = obligations.filter((o) => !o.future_blocking_gate).map((o) => o.id);
  const threatsWithoutTarget = threats
    .filter((t) => !t.affected_asset && !t.affected_right)
    .map((t) => t.id);
  const threatsWithoutOwner = threats.filter((t) => !t.owner).map((t) => t.id);
  const assetsWithoutAuthorityOwner = assets.filter((a) => !a.authority_owner).map((a) => a.id);
  const assetsWithoutClassification = assets.filter((a) => !a.classification).map((a) => a.id);

  const gaps =
    operationalControlAndOwnerCoverage.controls_without_owner.length +
    operationalControlAndOwnerCoverage.controls_without_required_evidence.length +
    operationalControlAndOwnerCoverage.controls_without_gate.length +
    operationalControlAndOwnerCoverage.controls_with_unresolved_protected_ref.length +
    eventDetectionTriageAndInvestigation.controls_without_owner.length +
    eventDetectionTriageAndInvestigation.controls_with_unresolved_protected_ref.length +
    incidentClassificationCommandAndClosure.families_without_evidence_preservation.length +
    incidentClassificationCommandAndClosure.controls_without_owner.length +
    incidentClassificationCommandAndClosure.controls_with_unresolved_protected_ref.length +
    breachNotificationAndCommunicationsDependencies.controls_with_unresolved_protected_ref.length +
    vulnerabilityConfigurationAndExceptionCoverage.exception_controls_without_expiry.length +
    vulnerabilityConfigurationAndExceptionCoverage.remediation_controls_without_retest.length +
    vulnerabilityConfigurationAndExceptionCoverage.controls_with_unresolved_protected_ref.length +
    resilienceDependencyAndDegradedModeAnalysis.controls_not_failing_closed.length +
    resilienceDependencyAndDegradedModeAnalysis.controls_with_unresolved_protected_ref.length +
    backupRestoreRecoveryAndBusinessAcceptance.controls_without_owner.length +
    backupRestoreRecoveryAndBusinessAcceptance.controls_with_unresolved_protected_ref.length +
    providerContinuityExitReturnAndDeletion.controls_without_owner.length +
    providerContinuityExitReturnAndDeletion.controls_with_unresolved_protected_ref.length +
    controlMetricsExercisesAndAssuranceEvidence.assurance_without_owner.length +
    controlMetricsExercisesAndAssuranceEvidence.assurance_without_required_evidence.length +
    controlMetricsExercisesAndAssuranceEvidence.assurance_without_classification.length +
    controlMetricsExercisesAndAssuranceEvidence.assurance_without_gate.length +
    obligationsWithUnresolvedControlRef.length +
    obligationsWithoutAuthorityOwner.length +
    obligationsWithoutApplicability.length +
    obligationsWithoutGate.length +
    threatsWithoutTarget.length +
    threatsWithoutOwner.length +
    assetsWithoutAuthorityOwner.length +
    assetsWithoutClassification.length;

  const authorizing = [...controls, ...protection, ...decisions, ...backlog]
    .filter((r) => p4(r) && r.authorizes_implementation === true)
    .map((r) => r.id);

  return {
    operationalControlAndOwnerCoverage,
    eventDetectionTriageAndInvestigation,
    incidentClassificationCommandAndClosure,
    breachNotificationAndCommunicationsDependencies,
    vulnerabilityConfigurationAndExceptionCoverage,
    resilienceDependencyAndDegradedModeAnalysis,
    backupRestoreRecoveryAndBusinessAcceptance,
    providerContinuityExitReturnAndDeletion,
    controlMetricsExercisesAndAssuranceEvidence,
    crossCutting: {
      obligations: obligations.length,
      obligations_with_unresolved_control_ref: obligationsWithUnresolvedControlRef,
      obligations_without_authority_owner: obligationsWithoutAuthorityOwner,
      obligations_without_applicability: obligationsWithoutApplicability,
      obligations_without_gate: obligationsWithoutGate,
      threats: threats.length,
      threats_without_target: threatsWithoutTarget,
      threats_without_owner: threatsWithoutOwner,
      assets: assets.length,
      assets_without_authority_owner: assetsWithoutAuthorityOwner,
      assets_without_classification: assetsWithoutClassification
    },
    gaps,
    authorizing
  };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'incident-resilience-assurance');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'operational-control-and-owner-coverage.json', p.operationalControlAndOwnerCoverage);
  writeJson(outDir, 'event-detection-triage-and-investigation.json', p.eventDetectionTriageAndInvestigation);
  writeJson(outDir, 'incident-classification-command-and-closure.json', p.incidentClassificationCommandAndClosure);
  writeJson(
    outDir,
    'breach-notification-and-communications-dependencies.json',
    p.breachNotificationAndCommunicationsDependencies
  );
  writeJson(
    outDir,
    'vulnerability-configuration-and-exception-coverage.json',
    p.vulnerabilityConfigurationAndExceptionCoverage
  );
  writeJson(
    outDir,
    'resilience-dependency-and-degraded-mode-analysis.json',
    p.resilienceDependencyAndDegradedModeAnalysis
  );
  writeJson(outDir, 'backup-restore-recovery-and-business-acceptance.json', p.backupRestoreRecoveryAndBusinessAcceptance);
  writeJson(outDir, 'provider-continuity-exit-return-and-deletion.json', p.providerContinuityExitReturnAndDeletion);
  writeJson(
    outDir,
    'control-metrics-exercises-and-assurance-evidence.json',
    p.controlMetricsExercisesAndAssuranceEvidence
  );

  const report = `# Volume 6 Package 4 Incident, Resilience, Recovery, and Assurance Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 6 corpus. Not a source of
> truth and not a basis for ratification. Volume 6 Package 4 defines the
> security-operations, incident, breach, vulnerability, resilience, recovery,
> provider-assurance, and control-assurance CONTROL MODEL only. It writes no runbook,
> monitoring rule, or incident procedure; runs no scan and applies no patch;
> configures no backup and performs no restore; selects no provider; sets no
> recovery-time, recovery-point, availability, response-time, staffing, or cost
> target; and claims no operational readiness, control effectiveness, or independent
> assurance. It authorizes no implementation.

## Operational-control and owner coverage

- Operational control objectives: ${p.operationalControlAndOwnerCoverage.total}
- Control families in use: ${Object.keys(p.operationalControlAndOwnerCoverage.by_control_family).length}
- Controls without an owner: ${p.operationalControlAndOwnerCoverage.controls_without_owner.length}

## Event detection, triage, and investigation

- Detection and investigation control objectives: ${p.eventDetectionTriageAndInvestigation.total}

## Incident classification, command, and closure

- Incident control objectives: ${p.incidentClassificationCommandAndClosure.control_objectives}
- Incident families: ${p.incidentClassificationCommandAndClosure.incident_families}
- Families without evidence preservation: ${p.incidentClassificationCommandAndClosure.families_without_evidence_preservation.length}

## Breach-notification and communications dependencies

- Notification and communications controls: ${p.breachNotificationAndCommunicationsDependencies.total}

## Vulnerability, configuration, and exception coverage

- Vulnerability, configuration, and exception controls: ${p.vulnerabilityConfigurationAndExceptionCoverage.total}
- Exception controls without an expiry: ${p.vulnerabilityConfigurationAndExceptionCoverage.exception_controls_without_expiry.length}

## Resilience, dependency-failure, and degraded-mode analysis

- Resilience controls: ${p.resilienceDependencyAndDegradedModeAnalysis.total}
- Resilience controls not failing closed: ${p.resilienceDependencyAndDegradedModeAnalysis.controls_not_failing_closed.length}

## Backup, restore, recovery, and business-acceptance evidence

- Recovery control objectives: ${p.backupRestoreRecoveryAndBusinessAcceptance.total}

## Provider continuity, exit, return, and deletion

- Provider-assurance control objectives: ${p.providerContinuityExitReturnAndDeletion.total}

## Control metrics, exercises, and assurance evidence

- Control-assurance control objectives: ${p.controlMetricsExercisesAndAssuranceEvidence.control_objectives}
- Assurance requirements: ${p.controlMetricsExercisesAndAssuranceEvidence.assurance_requirements}

## Cross-cutting integrity

- Package 4 obligations: ${p.crossCutting.obligations}
- Package 4 threats and abuse cases: ${p.crossCutting.threats}
- Package 4 context assets: ${p.crossCutting.assets}

## Incident-resilience-assurance model integrity

- Blocking incident-resilience-assurance gaps: ${p.gaps} (must be 0)
- Records authorizing implementation: ${p.authorizing.length} (must be 0)
`;
  writeFileSync(join(outDir, 'package-4-incident-resilience-assurance-report.md'), report, 'utf8');
  return { outDir, gaps: p.gaps, authorizing: p.authorizing.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { outDir, gaps, authorizing } = generate();
  console.log(`Volume 6 incident-resilience-assurance projections written to ${outDir}`);
  console.log(`  Blocking incident-resilience-assurance gaps: ${gaps}`);
  console.log(`  Records authorizing implementation: ${authorizing}`);
}
