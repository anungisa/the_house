// Control: Volume 6 Package 3 compliance-accessibility analysis (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown report describing the Package 3
// compliance, records, accessibility, bilingual-equivalence, and inclusive-service
// control model: compliance applicability and obligation coverage; policy, control,
// evidence, exception, and assurance mapping; records, retention, legal-hold, and
// disposition dependencies; financial and segregation-of-duties coverage; accessibility
// user-need and workflow coverage; accessible content, document, and evidence coverage;
// bilingual semantic-equivalence coverage; inclusive-service and accommodation analysis;
// and verification, exception, and remediation evidence. Non-authoritative: the
// source-controlled corpus and its recorded approvals remain the sole source of truth.
// These projections are rebuildable from the governed registers and authorize no
// implementation.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, loadContext } from './lib.mjs';

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

const RECORDS_FAMILIES = ['RECORDS_MANAGEMENT', 'RETENTION_AND_DISPOSITION', 'LEGAL_HOLD'];
const FINANCIAL_FAMILIES = ['FINANCIAL_CONTROL', 'SEGREGATION_OF_DUTIES'];
const INCLUSIVE_FAMILIES = ['ACCOMMODATION', 'INCLUSIVE_SERVICE'];
const VERIFICATION_FAMILIES = ['VERIFICATION_AND_REMEDIATION'];

export function project(ctx) {
  const controls = records(ctx, 'REG-602');
  const protection = records(ctx, 'REG-601');
  const decisions = records(ctx, 'REG-603');
  const backlog = records(ctx, 'REG-604');

  const controlObjectives = controls.filter((c) => c.kind === 'CONTROL_OBJECTIVE');
  const obligations = controls.filter((c) => c.kind === 'OBLIGATION');
  const complianceObligations = controls.filter((c) => c.kind === 'COMPLIANCE_OBLIGATION');
  const accessibilityObligations = controls.filter((c) => c.kind === 'ACCESSIBILITY_OBLIGATION');
  const bilingualObligations = controls.filter((c) => c.kind === 'BILINGUAL_OBLIGATION');
  const assuranceRequirements = controls.filter((c) => c.kind === 'ASSURANCE_REQUIREMENT');

  const controlObjectiveIds = new Set(controlObjectives.map((c) => c.id));
  const assetIds = new Set(protection.filter((r) => r.kind === 'ASSET').map((r) => r.id));
  const rightIds = new Set(protection.filter((r) => r.kind === 'RIGHT').map((r) => r.id));

  const inFamilies = (families) =>
    controlObjectives.filter((c) => families.includes(c.control_family));

  const summarizeControls = (list) =>
    list.map((c) => ({
      id: c.id,
      control_family: c.control_family ?? null,
      protected_asset_or_right: c.protected_asset_or_right ?? null,
      future_blocking_gate: c.future_blocking_gate ?? null
    }));

  const resolvesProtected = (c) =>
    !c.protected_asset_or_right ||
    assetIds.has(c.protected_asset_or_right) ||
    rightIds.has(c.protected_asset_or_right);

  // 1. Compliance applicability and obligation coverage.
  const applicabilityAndObligationCoverage = {
    compliance_obligations: complianceObligations.length,
    by_source_type: countBy(complianceObligations, 'source_type'),
    by_applicability_status: countBy(complianceObligations, 'applicability_status'),
    obligations_without_authority_owner: complianceObligations.filter((o) => !o.authority_owner).map((o) => o.id),
    obligations_without_applicability: complianceObligations.filter((o) => !o.applicability_status).map((o) => o.id),
    obligations_with_unresolved_control_ref: complianceObligations
      .filter((o) => !controlObjectiveIds.has(o.control_objective_ref))
      .map((o) => o.id),
    obligations_without_required_evidence: complianceObligations.filter((o) => !o.required_evidence).map((o) => o.id),
    obligations_without_gate: complianceObligations.filter((o) => !o.future_blocking_gate).map((o) => o.id)
  };

  // 2. Policy, control, evidence, exception, and assurance mapping.
  const allObligations = [...obligations, ...complianceObligations];
  const policyControlEvidenceMapping = {
    obligations: allObligations.length,
    obligations_with_unresolved_control_ref: allObligations
      .filter((o) => !controlObjectiveIds.has(o.control_objective_ref))
      .map((o) => o.id),
    control_objectives: controlObjectives.length,
    control_objectives_without_owner: controlObjectives.filter((c) => !c.owner).map((c) => c.id),
    control_objectives_without_required_evidence: controlObjectives.filter((c) => !c.required_evidence).map((c) => c.id),
    control_objectives_without_gate: controlObjectives.filter((c) => !c.future_blocking_gate).map((c) => c.id),
    control_objectives_with_unresolved_protected_ref: controlObjectives.filter((c) => !resolvesProtected(c)).map((c) => c.id),
    assurance_requirements: assuranceRequirements.length,
    by_assurance_classification: countBy(assuranceRequirements, 'assurance_classification')
  };

  // 3. Records, retention, legal-hold, and disposition dependencies.
  const recordsControls = inFamilies(RECORDS_FAMILIES);
  const recordsContextAssets = protection.filter((r) => r.record_subtype === 'RECORDS_CONTEXT').map((r) => r.id);
  const recordsRetentionAndDispositionDependencies = {
    total: recordsControls.length,
    by_control_family: countBy(recordsControls, 'control_family'),
    controls: summarizeControls(recordsControls),
    records_context_assets: recordsContextAssets,
    controls_with_unresolved_protected_ref: recordsControls.filter((c) => !resolvesProtected(c)).map((c) => c.id)
  };

  // 4. Financial and segregation-of-duties coverage.
  const financialControls = inFamilies(FINANCIAL_FAMILIES);
  const segregationAndFinancialControlCoverage = {
    total: financialControls.length,
    by_control_family: countBy(financialControls, 'control_family'),
    controls: summarizeControls(financialControls),
    segregation_controls_without_rule: financialControls
      .filter((c) => c.control_family === 'SEGREGATION_OF_DUTIES' && !c.segregation_rule)
      .map((c) => c.id),
    controls_with_unresolved_protected_ref: financialControls.filter((c) => !resolvesProtected(c)).map((c) => c.id)
  };

  // 5. Accessibility user-need and workflow coverage.
  const accessibilityUserNeedAndWorkflowCoverage = {
    total: accessibilityObligations.length,
    controls: accessibilityObligations.map((a) => ({
      id: a.id,
      user_need: a.user_need ?? null,
      affected_workflow: a.affected_workflow ?? null,
      protected_asset_or_right: a.protected_asset_or_right ?? null
    })),
    without_verification_method: accessibilityObligations.filter((a) => !a.verification_method).map((a) => a.id),
    without_user_need: accessibilityObligations.filter((a) => !a.user_need).map((a) => a.id),
    without_affected_workflow: accessibilityObligations.filter((a) => !a.affected_workflow).map((a) => a.id),
    with_unresolved_protected_ref: accessibilityObligations.filter((a) => !resolvesProtected(a)).map((a) => a.id)
  };

  // 6. Accessible content, document, and evidence coverage.
  const contentControls = accessibilityObligations.filter((a) => a.affected_content);
  const accessibleContentDocumentAndEvidenceCoverage = {
    total: contentControls.length,
    controls: contentControls.map((a) => ({
      id: a.id,
      affected_content: a.affected_content ?? null,
      alternative_representation: a.alternative_representation ?? null,
      document_accessibility_dependency: a.document_accessibility_dependency ?? null
    })),
    without_verification_method: contentControls.filter((a) => !a.verification_method).map((a) => a.id)
  };

  // 7. Bilingual semantic-equivalence coverage.
  const bilingualSemanticEquivalenceCoverage = {
    total: bilingualObligations.length,
    controls: bilingualObligations.map((b) => ({
      id: b.id,
      equivalent_concept: b.equivalent_concept ?? null,
      semantic_equivalence: b.semantic_equivalence ?? null,
      canonical_concept_id: b.canonical_concept_id ?? null,
      language_neutral_identifier: b.language_neutral_identifier ?? null
    })),
    without_equivalence: bilingualObligations
      .filter((b) => !b.equivalent_concept && !b.semantic_equivalence)
      .map((b) => b.id),
    without_verification_method: bilingualObligations.filter((b) => !b.verification_method).map((b) => b.id)
  };

  // 8. Inclusive-service and accommodation analysis.
  const inclusiveControls = inFamilies(INCLUSIVE_FAMILIES);
  const inclusiveServiceAndAccommodationAnalysis = {
    total: inclusiveControls.length,
    by_control_family: countBy(inclusiveControls, 'control_family'),
    controls: summarizeControls(inclusiveControls),
    accommodation_controls_without_equivalent_outcome: inclusiveControls
      .filter((c) => c.control_family === 'ACCOMMODATION' && !c.equivalent_outcome_requirement)
      .map((c) => c.id),
    controls_with_unresolved_protected_ref: inclusiveControls.filter((c) => !resolvesProtected(c)).map((c) => c.id)
  };

  // 9. Verification, exception, and remediation evidence.
  const verificationControls = inFamilies(VERIFICATION_FAMILIES);
  const verificationExceptionAndRemediationEvidence = {
    verification_controls: verificationControls.length,
    controls: summarizeControls(verificationControls),
    verification_controls_without_retest: verificationControls.filter((c) => !c.retest_requirement).map((c) => c.id),
    assurance_requirements: assuranceRequirements.length,
    by_assurance_classification: countBy(assuranceRequirements, 'assurance_classification'),
    assurance_without_required_evidence: assuranceRequirements.filter((a) => !a.required_evidence).map((a) => a.id)
  };

  const gaps =
    applicabilityAndObligationCoverage.obligations_without_authority_owner.length +
    applicabilityAndObligationCoverage.obligations_without_applicability.length +
    applicabilityAndObligationCoverage.obligations_with_unresolved_control_ref.length +
    applicabilityAndObligationCoverage.obligations_without_required_evidence.length +
    applicabilityAndObligationCoverage.obligations_without_gate.length +
    policyControlEvidenceMapping.obligations_with_unresolved_control_ref.length +
    policyControlEvidenceMapping.control_objectives_without_owner.length +
    policyControlEvidenceMapping.control_objectives_without_required_evidence.length +
    policyControlEvidenceMapping.control_objectives_without_gate.length +
    policyControlEvidenceMapping.control_objectives_with_unresolved_protected_ref.length +
    recordsRetentionAndDispositionDependencies.controls_with_unresolved_protected_ref.length +
    segregationAndFinancialControlCoverage.segregation_controls_without_rule.length +
    segregationAndFinancialControlCoverage.controls_with_unresolved_protected_ref.length +
    accessibilityUserNeedAndWorkflowCoverage.without_verification_method.length +
    accessibilityUserNeedAndWorkflowCoverage.without_user_need.length +
    accessibilityUserNeedAndWorkflowCoverage.without_affected_workflow.length +
    accessibilityUserNeedAndWorkflowCoverage.with_unresolved_protected_ref.length +
    accessibleContentDocumentAndEvidenceCoverage.without_verification_method.length +
    bilingualSemanticEquivalenceCoverage.without_equivalence.length +
    bilingualSemanticEquivalenceCoverage.without_verification_method.length +
    inclusiveServiceAndAccommodationAnalysis.accommodation_controls_without_equivalent_outcome.length +
    inclusiveServiceAndAccommodationAnalysis.controls_with_unresolved_protected_ref.length +
    verificationExceptionAndRemediationEvidence.verification_controls_without_retest.length +
    verificationExceptionAndRemediationEvidence.assurance_without_required_evidence.length;

  const authorizing = [...controls, ...protection, ...decisions, ...backlog]
    .filter((r) => r.authorizes_implementation === true)
    .map((r) => r.id);

  return {
    applicabilityAndObligationCoverage,
    policyControlEvidenceMapping,
    recordsRetentionAndDispositionDependencies,
    segregationAndFinancialControlCoverage,
    accessibilityUserNeedAndWorkflowCoverage,
    accessibleContentDocumentAndEvidenceCoverage,
    bilingualSemanticEquivalenceCoverage,
    inclusiveServiceAndAccommodationAnalysis,
    verificationExceptionAndRemediationEvidence,
    gaps,
    authorizing
  };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'compliance-accessibility');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'applicability-and-obligation-coverage.json', p.applicabilityAndObligationCoverage);
  writeJson(outDir, 'policy-control-evidence-mapping.json', p.policyControlEvidenceMapping);
  writeJson(outDir, 'records-retention-and-disposition-dependencies.json', p.recordsRetentionAndDispositionDependencies);
  writeJson(outDir, 'segregation-and-financial-control-coverage.json', p.segregationAndFinancialControlCoverage);
  writeJson(outDir, 'accessibility-user-need-and-workflow-coverage.json', p.accessibilityUserNeedAndWorkflowCoverage);
  writeJson(outDir, 'accessible-content-document-and-evidence-coverage.json', p.accessibleContentDocumentAndEvidenceCoverage);
  writeJson(outDir, 'bilingual-semantic-equivalence-coverage.json', p.bilingualSemanticEquivalenceCoverage);
  writeJson(outDir, 'inclusive-service-and-accommodation-analysis.json', p.inclusiveServiceAndAccommodationAnalysis);
  writeJson(outDir, 'verification-exception-and-remediation-evidence.json', p.verificationExceptionAndRemediationEvidence);

  const report = `# Volume 6 Package 3 Compliance and Inclusive-Service Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 6 corpus. Not a source of
> truth and not a basis for ratification. Volume 6 Package 3 defines the compliance,
> records, accessibility, bilingual-equivalence, and inclusive-service CONTROL MODEL
> only. It reaches no legal conclusion, sets no retention period, authors no content
> or translation, grants no accommodation, and claims no compliance, conformance,
> operational proof, or independent assurance. It authorizes no implementation.

## Compliance applicability and obligation coverage

- Compliance obligations: ${p.applicabilityAndObligationCoverage.compliance_obligations}
- Source families in use: ${Object.keys(p.applicabilityAndObligationCoverage.by_source_type).length}
- Obligations with an unresolved control-objective reference: ${p.applicabilityAndObligationCoverage.obligations_with_unresolved_control_ref.length}

## Policy, control, evidence, exception, and assurance mapping

- Obligations mapped: ${p.policyControlEvidenceMapping.obligations}
- Control objectives: ${p.policyControlEvidenceMapping.control_objectives}
- Control objectives with an unresolved protected asset/right: ${p.policyControlEvidenceMapping.control_objectives_with_unresolved_protected_ref.length}
- Assurance requirements: ${p.policyControlEvidenceMapping.assurance_requirements}

## Records, retention, legal-hold, and disposition dependencies

- Records-management, retention, and legal-hold controls: ${p.recordsRetentionAndDispositionDependencies.total}
- Records-context assets: ${p.recordsRetentionAndDispositionDependencies.records_context_assets.length}

## Financial and segregation-of-duties coverage

- Financial-control and segregation-of-duties controls: ${p.segregationAndFinancialControlCoverage.total}
- Segregation controls without a segregation rule: ${p.segregationAndFinancialControlCoverage.segregation_controls_without_rule.length}

## Accessibility user-need and workflow coverage

- Accessibility obligations: ${p.accessibilityUserNeedAndWorkflowCoverage.total}
- Obligations without a verification method: ${p.accessibilityUserNeedAndWorkflowCoverage.without_verification_method.length}

## Accessible content, document, and evidence coverage

- Content-bearing accessibility obligations: ${p.accessibleContentDocumentAndEvidenceCoverage.total}

## Bilingual semantic-equivalence coverage

- Bilingual obligations: ${p.bilingualSemanticEquivalenceCoverage.total}
- Obligations without recorded equivalence: ${p.bilingualSemanticEquivalenceCoverage.without_equivalence.length}

## Inclusive-service and accommodation analysis

- Accommodation and inclusive-service controls: ${p.inclusiveServiceAndAccommodationAnalysis.total}
- Accommodation controls without an equivalent-outcome requirement: ${p.inclusiveServiceAndAccommodationAnalysis.accommodation_controls_without_equivalent_outcome.length}

## Verification, exception, and remediation evidence

- Verification-and-remediation controls: ${p.verificationExceptionAndRemediationEvidence.verification_controls}
- Verification controls without a retest requirement: ${p.verificationExceptionAndRemediationEvidence.verification_controls_without_retest.length}
- Assurance requirements: ${p.verificationExceptionAndRemediationEvidence.assurance_requirements}

## Compliance-accessibility model integrity

- Blocking compliance-accessibility gaps: ${p.gaps} (must be 0)
- Records authorizing implementation: ${p.authorizing.length} (must be 0)
`;
  writeFileSync(join(outDir, 'package-3-compliance-accessibility-report.md'), report, 'utf8');
  return { outDir, gaps: p.gaps, authorizing: p.authorizing.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { outDir, gaps, authorizing } = generate();
  console.log(`Volume 6 compliance-accessibility projections written to ${outDir}`);
  console.log(`  Blocking compliance-accessibility gaps: ${gaps}`);
  console.log(`  Records authorizing implementation: ${authorizing}`);
}
