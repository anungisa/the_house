// Control: Volume 6 Package 5 integrated final-closure analysis (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown closure report over the WHOLE
// Volume 6 corpus: identifier counts; asset authority and classification coverage;
// boundary, threat, and control traceability; identity, authorization, and privilege
// analysis; privacy, evidence, records, and disclosure analysis; compliance,
// accessibility, bilingual, and accommodation analysis; incident, vulnerability,
// notification, and communications analysis; resilience, backup, restore, recovery,
// and continuity analysis; provider trust, exit, return, and deletion analysis;
// metrics, exercises, operational-proof, and assurance analysis; House P0 protection
// coverage; downstream-handoff coverage; and the unresolved-readiness register.
// Non-authoritative: the source-controlled corpus and its recorded approvals remain
// the sole source of truth. These projections are rebuildable from the governed
// registers and authorize no implementation.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, loadContext } from './lib.mjs';

const DOWNSTREAM_VOLUMES = ['Volume 7', 'Volume 8', 'Volume 9', 'Volume 10', 'Volume 11', 'Volume 12'];

const IDENTITY_FAMILIES = [
  'IDENTITY',
  'AUTHENTICATION',
  'AUTHORIZATION',
  'DELEGATION',
  'PRIVILEGED_ACCESS',
  'SESSION_AND_CREDENTIAL',
  'RESOURCE_ISOLATION',
  'RESTRICTED_EVIDENCE'
];

const PRIVACY_FAMILIES = [
  'PRIVACY',
  'PRIVACY_PURPOSE',
  'MINIMIZATION',
  'NOTICE_AND_RIGHTS',
  'DISCLOSURE_AND_EXPORT',
  'DATA_PROTECTION',
  'RECORDS_MANAGEMENT',
  'RETENTION_AND_DISPOSITION',
  'LEGAL_HOLD'
];

const COMPLIANCE_FAMILIES = [
  'COMPLIANCE_APPLICABILITY',
  'FINANCIAL_CONTROL',
  'SEGREGATION_OF_DUTIES',
  'ACCESSIBILITY',
  'BILINGUAL_EQUIVALENCE',
  'ACCOMMODATION',
  'INCLUSIVE_SERVICE',
  'VERIFICATION_AND_REMEDIATION'
];

const INCIDENT_FAMILIES = [
  'SECURITY_OPERATIONS',
  'MONITORING_AND_DETECTION',
  'INCIDENT_RESPONSE',
  'VULNERABILITY_MANAGEMENT',
  'CONFIGURATION',
  'EXCEPTION_AND_RECOVERY'
];

const RESILIENCE_FAMILIES = ['RESILIENCE', 'CONTINUITY_AND_RECOVERY'];

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

export function project(ctx) {
  const protection = records(ctx, 'REG-601');
  const controls = records(ctx, 'REG-602');
  const decisions = records(ctx, 'REG-603');
  const backlog = records(ctx, 'REG-604');
  const corpus = records(ctx, 'REG-600');
  const approvals = records(ctx, 'REG-605');

  const assetIds = new Set(protection.filter((r) => r.kind === 'ASSET').map((r) => r.id));
  const rightIds = new Set(protection.filter((r) => r.kind === 'RIGHT').map((r) => r.id));
  const resolvesProtectedRef = (ref) => !ref || assetIds.has(ref) || rightIds.has(ref);

  const controlObjectives = controls.filter((c) => c.kind === 'CONTROL_OBJECTIVE');
  const inFamilies = (families) => controlObjectives.filter((c) => families.includes(c.control_family));

  // 1. Identifier counts.
  const identifierCounts = {
    'REG-600': { total: corpus.length },
    'REG-601': { total: protection.length, by_kind: countBy(protection, 'kind') },
    'REG-602': { total: controls.length, by_kind: countBy(controls, 'kind') },
    'REG-603': { total: decisions.length },
    'REG-604': { total: backlog.length, by_kind: countBy(backlog, 'kind') },
    'REG-605': { total: approvals.length }
  };

  // 2. Asset authority and classification coverage.
  const assets = protection.filter((r) => r.kind === 'ASSET');
  const assetAuthorityAndClassificationCoverage = {
    total: assets.length,
    by_authority_owner: countBy(assets, 'authority_owner'),
    by_classification: countBy(assets, 'classification'),
    assets_without_authority_owner: assets.filter((a) => !a.authority_owner).map((a) => a.id),
    assets_without_classification: assets.filter((a) => !a.classification).map((a) => a.id)
  };

  // 3. Boundary, threat, and control traceability.
  const boundaries = protection.filter((r) => r.kind === 'TRUST_BOUNDARY');
  const threats = protection.filter((r) => r.kind === 'THREAT' || r.kind === 'ABUSE_CASE');
  const namedBoundaries = new Set(threats.map((t) => t.trust_boundary).filter(Boolean));
  const boundaryThreatAndControlTraceability = {
    boundaries: boundaries.length,
    threats: threats.length,
    control_objectives: controlObjectives.length,
    boundaries_without_naming_threat: boundaries.filter((b) => !namedBoundaries.has(b.id)).map((b) => b.id),
    threats_without_target: threats.filter((t) => !t.affected_asset && !t.affected_right).map((t) => t.id),
    threats_without_owner: threats.filter((t) => !t.owner).map((t) => t.id),
    control_objectives_without_owner: controlObjectives.filter((c) => !c.owner).map((c) => c.id),
    control_objectives_without_gate: controlObjectives.filter((c) => !c.future_blocking_gate).map((c) => c.id)
  };

  // 4. Identity, authorization, and privilege analysis.
  const identityControls = inFamilies(IDENTITY_FAMILIES);
  const identityAuthorizationAndPrivilegeAnalysis = {
    total: identityControls.length,
    by_control_family: countBy(identityControls, 'control_family'),
    by_failure_posture: countBy(identityControls, 'failure_posture'),
    controls_without_owner: identityControls.filter((c) => !c.owner).map((c) => c.id),
    controls_without_gate: identityControls.filter((c) => !c.future_blocking_gate).map((c) => c.id),
    controls_with_unresolved_protected_ref: identityControls
      .filter((c) => !resolvesProtectedRef(c.protected_asset_or_right))
      .map((c) => c.id)
  };

  // 5. Privacy, evidence, records, and disclosure analysis.
  const purposes = controls.filter((c) => c.kind === 'PROCESSING_PURPOSE');
  const privacyControls = inFamilies(PRIVACY_FAMILIES);
  const privacyEvidenceRecordsAndDisclosureAnalysis = {
    processing_purposes: purposes.length,
    privacy_control_objectives: privacyControls.length,
    purposes_without_information_domains: purposes.filter((p) => !(p.information_domains ?? []).length).map((p) => p.id),
    purposes_without_disclosure_authority: purposes.filter((p) => !p.disclosure_authority).map((p) => p.id),
    controls_with_unresolved_protected_ref: privacyControls
      .filter((c) => !resolvesProtectedRef(c.protected_asset_or_right))
      .map((c) => c.id)
  };

  // 6. Compliance, accessibility, bilingual, and accommodation analysis.
  const obligations = controls.filter((c) => c.kind === 'OBLIGATION' || c.kind === 'COMPLIANCE_OBLIGATION');
  const accessibility = controls.filter((c) => c.kind === 'ACCESSIBILITY_OBLIGATION');
  const bilingual = controls.filter((c) => c.kind === 'BILINGUAL_OBLIGATION');
  const complianceControls = inFamilies(COMPLIANCE_FAMILIES);
  const complianceAccessibilityBilingualAndAccommodationAnalysis = {
    obligations: obligations.length,
    accessibility_obligations: accessibility.length,
    bilingual_obligations: bilingual.length,
    compliance_control_objectives: complianceControls.length,
    obligations_without_applicability: obligations.filter((o) => !o.applicability_status).map((o) => o.id),
    obligations_without_authority_owner: obligations.filter((o) => !o.authority_owner).map((o) => o.id),
    obligations_without_gate: obligations.filter((o) => !o.future_blocking_gate).map((o) => o.id),
    accessibility_without_verification_method: accessibility.filter((a) => !a.verification_method).map((a) => a.id),
    bilingual_without_equivalence: bilingual
      .filter((b) => !b.equivalent_concept && !b.semantic_equivalence)
      .map((b) => b.id)
  };

  // 7. Incident, vulnerability, notification, and communications analysis.
  const incidentFamilies = controls.filter((c) => c.kind === 'INCIDENT_FAMILY');
  const incidentControls = inFamilies(INCIDENT_FAMILIES);
  const incidentVulnerabilityNotificationAndCommunicationsAnalysis = {
    incident_families: incidentFamilies.length,
    incident_control_objectives: incidentControls.length,
    by_control_family: countBy(incidentControls, 'control_family'),
    families_without_evidence_preservation: incidentFamilies.filter((f) => !f.evidence_preservation).map((f) => f.id),
    controls_without_owner: incidentControls.filter((c) => !c.owner).map((c) => c.id),
    controls_without_gate: incidentControls.filter((c) => !c.future_blocking_gate).map((c) => c.id)
  };

  // 8. Resilience, backup, restore, recovery, and continuity analysis.
  const resilienceControls = inFamilies(RESILIENCE_FAMILIES);
  const resilienceBackupRestoreRecoveryAndContinuityAnalysis = {
    total: resilienceControls.length,
    by_control_family: countBy(resilienceControls, 'control_family'),
    controls_without_owner: resilienceControls.filter((c) => !c.owner).map((c) => c.id),
    controls_without_gate: resilienceControls.filter((c) => !c.future_blocking_gate).map((c) => c.id)
  };

  // 9. Provider trust, exit, return, and deletion analysis.
  const providerControls = inFamilies(['SERVICE_TRUST', 'PROVIDER_ASSURANCE']);
  const providerTrustExitReturnAndDeletionAnalysis = {
    total: providerControls.length,
    controls_without_owner: providerControls.filter((c) => !c.owner).map((c) => c.id),
    controls_without_gate: providerControls.filter((c) => !c.future_blocking_gate).map((c) => c.id)
  };

  // 10. Metrics, exercises, operational-proof, and assurance analysis.
  const assuranceRequirements = controls.filter((c) => c.kind === 'ASSURANCE_REQUIREMENT');
  const metricsExercisesOperationalProofAndAssuranceAnalysis = {
    assurance_requirements: assuranceRequirements.length,
    by_assurance_classification: countBy(assuranceRequirements, 'assurance_classification'),
    assurance_without_owner: assuranceRequirements.filter((a) => !a.owner && !a.control_owner).map((a) => a.id),
    assurance_without_required_evidence: assuranceRequirements.filter((a) => !a.required_evidence).map((a) => a.id),
    assurance_without_classification: assuranceRequirements.filter((a) => !a.assurance_classification).map((a) => a.id),
    assurance_without_gate: assuranceRequirements.filter((a) => !a.future_blocking_gate).map((a) => a.id)
  };

  // 11. House P0 protection coverage.
  const p0 = backlog.filter((b) => b.p0_finding);
  const houseP0ProtectionCoverage = {
    total: p0.length,
    expected: 14,
    by_readiness_disposition: countBy(p0, 'readiness_disposition'),
    findings: p0.map((f) => ({
      id: f.id,
      p0_finding: f.p0_finding ?? null,
      protected_asset_or_right: f.protected_asset_or_right ?? null,
      future_test_class: f.future_test_class ?? null,
      required_environment: f.required_environment ?? null,
      future_blocking_gate: f.future_blocking_gate ?? null,
      definition_status: f.definition_status ?? null,
      implementation_status: f.implementation_status ?? null
    })),
    findings_without_protected_ref: p0.filter((f) => !resolvesProtectedRef(f.protected_asset_or_right)).map((f) => f.id),
    findings_without_test_class: p0.filter((f) => !f.future_test_class).map((f) => f.id),
    findings_without_required_evidence: p0.filter((f) => !f.required_evidence).map((f) => f.id),
    findings_without_gate: p0.filter((f) => !f.future_blocking_gate).map((f) => f.id),
    findings_not_defined: p0.filter((f) => f.definition_status !== 'DEFINED').map((f) => f.id),
    count_mismatch: p0.length === 14 ? [] : ['house-p0-count']
  };

  // 12. Downstream-handoff coverage.
  const readinessItems = backlog.filter((b) => b.readiness_disposition);
  const byVolume = {};
  for (const v of DOWNSTREAM_VOLUMES) byVolume[v] = [];
  for (const it of readinessItems) {
    const v = it.downstream_volume;
    if (v && byVolume[v]) byVolume[v].push(it.id);
  }
  const downstreamHandoffCoverage = {
    volumes: DOWNSTREAM_VOLUMES,
    coverage: byVolume,
    volumes_without_handoff: DOWNSTREAM_VOLUMES.filter((v) => byVolume[v].length === 0)
  };

  // 13. Unresolved-readiness register.
  const unresolved = readinessItems.filter((r) => r.readiness_disposition !== 'CLOSED_WITH_EVIDENCE');
  const unresolvedReadinessRegister = {
    total: readinessItems.length,
    unresolved: unresolved.length,
    by_readiness_disposition: countBy(readinessItems, 'readiness_disposition'),
    items: readinessItems.map((r) => ({
      id: r.id,
      readiness_disposition: r.readiness_disposition ?? null,
      owner: r.owner ?? null,
      downstream_volume: r.downstream_volume ?? null,
      future_blocking_gate: r.future_blocking_gate ?? null
    })),
    unresolved_without_owner: unresolved.filter((r) => !r.owner).map((r) => r.id),
    unresolved_without_evidence: unresolved.filter((r) => !r.required_evidence).map((r) => r.id),
    unresolved_without_destination: unresolved
      .filter((r) => !r.future_blocking_gate && !r.downstream_volume)
      .map((r) => r.id)
  };

  const gaps =
    assetAuthorityAndClassificationCoverage.assets_without_authority_owner.length +
    assetAuthorityAndClassificationCoverage.assets_without_classification.length +
    boundaryThreatAndControlTraceability.boundaries_without_naming_threat.length +
    boundaryThreatAndControlTraceability.threats_without_target.length +
    boundaryThreatAndControlTraceability.threats_without_owner.length +
    boundaryThreatAndControlTraceability.control_objectives_without_owner.length +
    boundaryThreatAndControlTraceability.control_objectives_without_gate.length +
    identityAuthorizationAndPrivilegeAnalysis.controls_without_owner.length +
    identityAuthorizationAndPrivilegeAnalysis.controls_without_gate.length +
    identityAuthorizationAndPrivilegeAnalysis.controls_with_unresolved_protected_ref.length +
    privacyEvidenceRecordsAndDisclosureAnalysis.purposes_without_information_domains.length +
    privacyEvidenceRecordsAndDisclosureAnalysis.purposes_without_disclosure_authority.length +
    privacyEvidenceRecordsAndDisclosureAnalysis.controls_with_unresolved_protected_ref.length +
    complianceAccessibilityBilingualAndAccommodationAnalysis.obligations_without_applicability.length +
    complianceAccessibilityBilingualAndAccommodationAnalysis.obligations_without_authority_owner.length +
    complianceAccessibilityBilingualAndAccommodationAnalysis.obligations_without_gate.length +
    complianceAccessibilityBilingualAndAccommodationAnalysis.accessibility_without_verification_method.length +
    complianceAccessibilityBilingualAndAccommodationAnalysis.bilingual_without_equivalence.length +
    incidentVulnerabilityNotificationAndCommunicationsAnalysis.families_without_evidence_preservation.length +
    incidentVulnerabilityNotificationAndCommunicationsAnalysis.controls_without_owner.length +
    incidentVulnerabilityNotificationAndCommunicationsAnalysis.controls_without_gate.length +
    resilienceBackupRestoreRecoveryAndContinuityAnalysis.controls_without_owner.length +
    resilienceBackupRestoreRecoveryAndContinuityAnalysis.controls_without_gate.length +
    providerTrustExitReturnAndDeletionAnalysis.controls_without_owner.length +
    providerTrustExitReturnAndDeletionAnalysis.controls_without_gate.length +
    metricsExercisesOperationalProofAndAssuranceAnalysis.assurance_without_owner.length +
    metricsExercisesOperationalProofAndAssuranceAnalysis.assurance_without_required_evidence.length +
    metricsExercisesOperationalProofAndAssuranceAnalysis.assurance_without_classification.length +
    metricsExercisesOperationalProofAndAssuranceAnalysis.assurance_without_gate.length +
    houseP0ProtectionCoverage.findings_without_protected_ref.length +
    houseP0ProtectionCoverage.findings_without_test_class.length +
    houseP0ProtectionCoverage.findings_without_required_evidence.length +
    houseP0ProtectionCoverage.findings_without_gate.length +
    houseP0ProtectionCoverage.findings_not_defined.length +
    houseP0ProtectionCoverage.count_mismatch.length +
    downstreamHandoffCoverage.volumes_without_handoff.length +
    unresolvedReadinessRegister.unresolved_without_owner.length +
    unresolvedReadinessRegister.unresolved_without_evidence.length +
    unresolvedReadinessRegister.unresolved_without_destination.length;

  const authorizing = [...protection, ...controls, ...decisions, ...backlog]
    .filter((r) => r.authorizes_implementation === true)
    .map((r) => r.id);

  return {
    identifierCounts,
    assetAuthorityAndClassificationCoverage,
    boundaryThreatAndControlTraceability,
    identityAuthorizationAndPrivilegeAnalysis,
    privacyEvidenceRecordsAndDisclosureAnalysis,
    complianceAccessibilityBilingualAndAccommodationAnalysis,
    incidentVulnerabilityNotificationAndCommunicationsAnalysis,
    resilienceBackupRestoreRecoveryAndContinuityAnalysis,
    providerTrustExitReturnAndDeletionAnalysis,
    metricsExercisesOperationalProofAndAssuranceAnalysis,
    houseP0ProtectionCoverage,
    downstreamHandoffCoverage,
    unresolvedReadinessRegister,
    gaps,
    authorizing
  };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'final-closure');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'identifier-counts.json', p.identifierCounts);
  writeJson(outDir, 'asset-authority-and-classification-coverage.json', p.assetAuthorityAndClassificationCoverage);
  writeJson(outDir, 'boundary-threat-and-control-traceability.json', p.boundaryThreatAndControlTraceability);
  writeJson(outDir, 'identity-authorization-and-privilege-analysis.json', p.identityAuthorizationAndPrivilegeAnalysis);
  writeJson(
    outDir,
    'privacy-evidence-records-and-disclosure-analysis.json',
    p.privacyEvidenceRecordsAndDisclosureAnalysis
  );
  writeJson(
    outDir,
    'compliance-accessibility-bilingual-and-accommodation-analysis.json',
    p.complianceAccessibilityBilingualAndAccommodationAnalysis
  );
  writeJson(
    outDir,
    'incident-vulnerability-notification-and-communications-analysis.json',
    p.incidentVulnerabilityNotificationAndCommunicationsAnalysis
  );
  writeJson(
    outDir,
    'resilience-backup-restore-recovery-and-continuity-analysis.json',
    p.resilienceBackupRestoreRecoveryAndContinuityAnalysis
  );
  writeJson(outDir, 'provider-trust-exit-return-and-deletion-analysis.json', p.providerTrustExitReturnAndDeletionAnalysis);
  writeJson(
    outDir,
    'metrics-exercises-operational-proof-and-assurance-analysis.json',
    p.metricsExercisesOperationalProofAndAssuranceAnalysis
  );
  writeJson(outDir, 'house-p0-protection-coverage.json', p.houseP0ProtectionCoverage);
  writeJson(outDir, 'downstream-handoff-coverage.json', p.downstreamHandoffCoverage);
  writeJson(outDir, 'unresolved-readiness-register.json', p.unresolvedReadinessRegister);

  const report = `# Volume 6 Integrated Final-Closure Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 6 corpus. Not a source of
> truth and not a basis for ratification. Volume 6 Package 5 consolidates Packages
> 1 through 4 and closes Volume 6. It introduces no new protection capability,
> control, or obligation; makes no compliance, conformance, accessibility,
> bilingual-validation, operational-readiness, restore-proof, provider-assurance, or
> independent-assurance claim; selects no provider, vendor, technology, or assurance
> body; and authorizes no implementation.

## Identifier counts

- REG-601 records: ${p.identifierCounts['REG-601'].total}
- REG-602 records: ${p.identifierCounts['REG-602'].total}
- REG-603 records: ${p.identifierCounts['REG-603'].total}
- REG-604 records: ${p.identifierCounts['REG-604'].total}
- REG-605 records: ${p.identifierCounts['REG-605'].total}

## Asset authority and classification coverage

- Assets: ${p.assetAuthorityAndClassificationCoverage.total}
- Assets without authority owner: ${p.assetAuthorityAndClassificationCoverage.assets_without_authority_owner.length}
- Assets without classification: ${p.assetAuthorityAndClassificationCoverage.assets_without_classification.length}

## Boundary, threat, and control traceability

- Trust boundaries: ${p.boundaryThreatAndControlTraceability.boundaries}
- Threats and abuse cases: ${p.boundaryThreatAndControlTraceability.threats}
- Control objectives: ${p.boundaryThreatAndControlTraceability.control_objectives}

## Identity, authorization, and privilege analysis

- Identity and access control objectives: ${p.identityAuthorizationAndPrivilegeAnalysis.total}

## Privacy, evidence, records, and disclosure analysis

- Processing purposes: ${p.privacyEvidenceRecordsAndDisclosureAnalysis.processing_purposes}
- Privacy control objectives: ${p.privacyEvidenceRecordsAndDisclosureAnalysis.privacy_control_objectives}

## Compliance, accessibility, bilingual, and accommodation analysis

- Obligations: ${p.complianceAccessibilityBilingualAndAccommodationAnalysis.obligations}
- Accessibility obligations: ${p.complianceAccessibilityBilingualAndAccommodationAnalysis.accessibility_obligations}
- Bilingual obligations: ${p.complianceAccessibilityBilingualAndAccommodationAnalysis.bilingual_obligations}

## Incident, vulnerability, notification, and communications analysis

- Incident families: ${p.incidentVulnerabilityNotificationAndCommunicationsAnalysis.incident_families}
- Incident control objectives: ${p.incidentVulnerabilityNotificationAndCommunicationsAnalysis.incident_control_objectives}

## Resilience, backup, restore, recovery, and continuity analysis

- Resilience and continuity control objectives: ${p.resilienceBackupRestoreRecoveryAndContinuityAnalysis.total}

## Provider trust, exit, return, and deletion analysis

- Service-trust and provider-assurance control objectives: ${p.providerTrustExitReturnAndDeletionAnalysis.total}

## Metrics, exercises, operational-proof, and assurance analysis

- Assurance requirements: ${p.metricsExercisesOperationalProofAndAssuranceAnalysis.assurance_requirements}

## House P0 protection coverage

- P0 findings: ${p.houseP0ProtectionCoverage.total} (expected ${p.houseP0ProtectionCoverage.expected})

## Downstream-handoff coverage

- Downstream volumes without a handoff: ${p.downstreamHandoffCoverage.volumes_without_handoff.length} (must be 0)

## Unresolved-readiness register

- Readiness items: ${p.unresolvedReadinessRegister.total}
- Unresolved items: ${p.unresolvedReadinessRegister.unresolved}

## Integrated final-closure integrity

- Blocking final-closure gaps: ${p.gaps} (must be 0)
- Records authorizing implementation: ${p.authorizing.length} (must be 0)
`;
  writeFileSync(join(outDir, 'volume-6-closure-report.md'), report, 'utf8');
  return { outDir, gaps: p.gaps, authorizing: p.authorizing.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { outDir, gaps, authorizing } = generate();
  console.log(`Volume 6 final-closure projections written to ${outDir}`);
  console.log(`  Blocking gaps: ${gaps} (must be 0)`);
  console.log(`  Records authorizing implementation: ${authorizing} (must be 0)`);
  process.exitCode = gaps > 0 || authorizing > 0 ? 1 : 0;
}
