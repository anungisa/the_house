// Control: Volume 6 Package 1 trust-foundation assessment (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown foundation report describing
// the integrity of the Package 1 protection foundation: asset and boundary
// coverage; threat and abuse coverage; authorization-input coverage; privacy
// purpose-to-domain mapping; compliance-obligation coverage; accessibility and
// bilingual coverage; incident and evidence coverage; and the control and
// assurance backlog. Non-authoritative: the source-controlled corpus and its
// recorded approvals remain the sole source of truth. These projections are
// rebuildable from the governed registers and authorize no implementation.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, isInheritedRef, loadContext } from './lib.mjs';

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

function hasInput(inputs, token) {
  return (inputs ?? []).some((i) => String(i).toLowerCase().includes(token));
}

export function project(ctx) {
  const protection = records(ctx, 'REG-601');
  const controls = records(ctx, 'REG-602');
  const backlog = records(ctx, 'REG-604');

  const of = (kind) => protection.filter((r) => r.kind === kind);
  const cof = (kind) => controls.filter((r) => r.kind === kind);

  const assets = of('ASSET');
  const actors = of('ACTOR');
  const boundaries = of('TRUST_BOUNDARY');
  const threats = of('THREAT');
  const abuseCases = of('ABUSE_CASE');
  const rights = of('RIGHT');

  // 1. Asset and boundary catalogue.
  const assetAndBoundaryCatalogue = {
    assets: assets.length,
    actors: actors.length,
    trust_boundaries: boundaries.length,
    rights: rights.length,
    assets_without_authority: assets.filter((a) => !a.authority_owner).map((a) => a.id),
    assets_without_classification: assets.filter((a) => !a.classification).map((a) => a.id),
    assets_by_classification: countBy(assets, 'classification'),
    boundaries_by_failure_posture: countBy(boundaries, 'failure_posture')
  };

  // 2. Threat and abuse coverage.
  const threatBoundaries = new Set(
    [...threats, ...abuseCases].map((t) => t.trust_boundary).filter(Boolean)
  );
  const threatAndAbuseCoverage = {
    threats: threats.length,
    abuse_cases: abuseCases.length,
    boundaries_without_threat: boundaries.filter((b) => !threatBoundaries.has(b.id)).map((b) => b.id),
    threats_without_preventive: threats.filter((t) => !t.preventive_objective).map((t) => t.id),
    threats_without_detective: threats.filter((t) => !t.detective_objective).map((t) => t.id),
    threats_without_corrective: threats.filter((t) => !t.corrective_objective).map((t) => t.id)
  };

  // 3. Authorization-input coverage.
  const authzControls = cof('CONTROL_OBJECTIVE').filter((c) => c.control_family === 'AUTHORIZATION');
  const requiredInputs = ['resource', 'organization', 'jurisdiction', 'assignment', 'action', 'lifecycle', 'sensitiv'];
  const authorizationInputCoverage = {
    authorization_controls: authzControls.length,
    controls_missing_inputs: authzControls
      .filter((c) => requiredInputs.some((tok) => !hasInput(c.authorization_inputs, tok) && !(tok === 'lifecycle' && hasInput(c.authorization_inputs, 'state'))))
      .map((c) => c.id),
    input_presence: requiredInputs.reduce((acc, tok) => {
      acc[tok] = authzControls.filter((c) => hasInput(c.authorization_inputs, tok) || (tok === 'lifecycle' && hasInput(c.authorization_inputs, 'state'))).length;
      return acc;
    }, {})
  };

  // 4. Privacy purpose and domain mapping.
  const purposes = cof('PROCESSING_PURPOSE');
  const privacyPurposeAndDomainMapping = {
    processing_purposes: purposes.length,
    purposes_without_domain: purposes.filter((p) => !(p.information_domains && p.information_domains.length)).map((p) => p.id),
    purposes_without_disclosure_authority: purposes.filter((p) => !p.disclosure_authority).map((p) => p.id),
    retention_without_records_authority: purposes.filter((p) => p.retention_dependency && !p.records_dependency).map((p) => p.id),
    domain_mappings: purposes.map((p) => ({
      id: p.id,
      information_domains: (p.information_domains ?? []).filter((d) => isInheritedRef(d))
    }))
  };

  // 5. Compliance-obligation coverage.
  const obligations = controls.filter((c) => c.kind === 'OBLIGATION' || c.kind === 'COMPLIANCE_OBLIGATION');
  const complianceObligationCoverage = {
    obligations: obligations.length,
    by_applicability_status: countBy(obligations, 'applicability_status'),
    obligations_without_applicability: obligations.filter((o) => !o.applicability_status).map((o) => o.id),
    obligations_without_control: obligations.filter((o) => !o.control_objective_ref).map((o) => o.id),
    obligations_without_evidence: obligations.filter((o) => !o.required_evidence).map((o) => o.id),
    obligations_without_gate: obligations.filter((o) => !o.future_blocking_gate).map((o) => o.id)
  };

  // 6. Accessibility and bilingual coverage.
  const a11y = cof('ACCESSIBILITY_OBLIGATION');
  const bilingual = cof('BILINGUAL_OBLIGATION');
  const accessibilityAndBilingualCoverage = {
    accessibility_obligations: a11y.length,
    accessibility_without_verification: a11y.filter((a) => !a.verification_method).map((a) => a.id),
    bilingual_obligations: bilingual.length,
    bilingual_without_equivalence: bilingual.filter((b) => !b.equivalent_concept && !b.semantic_equivalence).map((b) => b.id)
  };

  // 7. Incident and evidence coverage.
  const incidents = cof('INCIDENT_FAMILY');
  const incidentAndEvidenceCoverage = {
    incident_families: incidents.length,
    incidents_without_evidence_preservation: incidents.filter((i) => !i.evidence_preservation).map((i) => i.id),
    incidents_without_containment: incidents.filter((i) => !i.containment_objective).map((i) => i.id),
    incidents_without_recovery: incidents.filter((i) => !i.recovery_objective).map((i) => i.id)
  };

  // 8. Control and assurance backlog.
  const controlObjectives = cof('CONTROL_OBJECTIVE');
  const assuranceRequirements = cof('ASSURANCE_REQUIREMENT');
  const controlAndAssuranceBacklog = {
    control_objectives: controlObjectives.length,
    assurance_requirements: assuranceRequirements.length,
    validation_backlog: backlog.filter((b) => b.kind === 'TEST').length,
    assurance_by_classification: countBy(assuranceRequirements, 'assurance_classification'),
    backlog_by_kind: countBy(backlog, 'kind'),
    controls_without_owner: controlObjectives.filter((c) => !c.owner).map((c) => c.id),
    controls_without_evidence: controlObjectives.filter((c) => !c.required_evidence).map((c) => c.id),
    controls_without_gate: controlObjectives.filter((c) => !c.future_blocking_gate).map((c) => c.id)
  };

  // Authorization posture.
  const authorizing = [...protection, ...controls, ...records(ctx, 'REG-603'), ...backlog].filter(
    (r) => r.authorizes_implementation === true
  ).map((r) => r.id);

  return {
    assetAndBoundaryCatalogue,
    threatAndAbuseCoverage,
    authorizationInputCoverage,
    privacyPurposeAndDomainMapping,
    complianceObligationCoverage,
    accessibilityAndBilingualCoverage,
    incidentAndEvidenceCoverage,
    controlAndAssuranceBacklog,
    authorizing
  };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'foundation');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'asset-and-boundary-catalogue.json', p.assetAndBoundaryCatalogue);
  writeJson(outDir, 'threat-and-abuse-coverage.json', p.threatAndAbuseCoverage);
  writeJson(outDir, 'authorization-input-coverage.json', p.authorizationInputCoverage);
  writeJson(outDir, 'privacy-purpose-and-domain-mapping.json', p.privacyPurposeAndDomainMapping);
  writeJson(outDir, 'compliance-obligation-coverage.json', p.complianceObligationCoverage);
  writeJson(outDir, 'accessibility-and-bilingual-coverage.json', p.accessibilityAndBilingualCoverage);
  writeJson(outDir, 'incident-and-evidence-coverage.json', p.incidentAndEvidenceCoverage);
  writeJson(outDir, 'control-and-assurance-backlog.json', p.controlAndAssuranceBacklog);

  const gaps =
    p.assetAndBoundaryCatalogue.assets_without_authority.length +
    p.assetAndBoundaryCatalogue.assets_without_classification.length +
    p.threatAndAbuseCoverage.boundaries_without_threat.length +
    p.threatAndAbuseCoverage.threats_without_preventive.length +
    p.threatAndAbuseCoverage.threats_without_detective.length +
    p.threatAndAbuseCoverage.threats_without_corrective.length +
    p.authorizationInputCoverage.controls_missing_inputs.length +
    p.privacyPurposeAndDomainMapping.purposes_without_domain.length +
    p.privacyPurposeAndDomainMapping.purposes_without_disclosure_authority.length +
    p.privacyPurposeAndDomainMapping.retention_without_records_authority.length +
    p.complianceObligationCoverage.obligations_without_applicability.length +
    p.complianceObligationCoverage.obligations_without_control.length +
    p.complianceObligationCoverage.obligations_without_evidence.length +
    p.complianceObligationCoverage.obligations_without_gate.length +
    p.accessibilityAndBilingualCoverage.accessibility_without_verification.length +
    p.accessibilityAndBilingualCoverage.bilingual_without_equivalence.length +
    p.incidentAndEvidenceCoverage.incidents_without_evidence_preservation.length +
    p.controlAndAssuranceBacklog.controls_without_owner.length +
    p.controlAndAssuranceBacklog.controls_without_evidence.length +
    p.controlAndAssuranceBacklog.controls_without_gate.length;

  const report = `# Volume 6 Package 1 Trust-Foundation Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 6 corpus. Not a source of
> truth and not a basis for ratification. Volume 6 Package 1 defines the security,
> privacy, compliance, accessibility, and trust FOUNDATION only. It implements no
> control and claims no compliance, conformance, operational proof, or independent
> assurance. It authorizes no implementation.

## Asset and boundary catalogue

- Assets: ${p.assetAndBoundaryCatalogue.assets}
- Actors: ${p.assetAndBoundaryCatalogue.actors}
- Trust boundaries: ${p.assetAndBoundaryCatalogue.trust_boundaries}
- Rights: ${p.assetAndBoundaryCatalogue.rights}
- Assets without authority: ${p.assetAndBoundaryCatalogue.assets_without_authority.length}
- Assets without classification: ${p.assetAndBoundaryCatalogue.assets_without_classification.length}

## Threat and abuse coverage

- Threats: ${p.threatAndAbuseCoverage.threats}
- Abuse cases: ${p.threatAndAbuseCoverage.abuse_cases}
- Boundaries without a threat scenario: ${p.threatAndAbuseCoverage.boundaries_without_threat.length}
- Threats missing a preventive/detective/corrective objective: ${p.threatAndAbuseCoverage.threats_without_preventive.length} / ${p.threatAndAbuseCoverage.threats_without_detective.length} / ${p.threatAndAbuseCoverage.threats_without_corrective.length}

## Authorization-input coverage

- Authorization control objectives: ${p.authorizationInputCoverage.authorization_controls}
- Authorization controls missing a resource-aware input: ${p.authorizationInputCoverage.controls_missing_inputs.length}

## Privacy purpose and domain mapping

- Processing purposes: ${p.privacyPurposeAndDomainMapping.processing_purposes}
- Purposes without an information-domain mapping: ${p.privacyPurposeAndDomainMapping.purposes_without_domain.length}
- Purposes without disclosure authority: ${p.privacyPurposeAndDomainMapping.purposes_without_disclosure_authority.length}
- Retention claims without records authority: ${p.privacyPurposeAndDomainMapping.retention_without_records_authority.length}

## Compliance-obligation coverage

- Obligations: ${p.complianceObligationCoverage.obligations}
- Without applicability status: ${p.complianceObligationCoverage.obligations_without_applicability.length}
- Without control objective: ${p.complianceObligationCoverage.obligations_without_control.length}
- Without required evidence: ${p.complianceObligationCoverage.obligations_without_evidence.length}
- Without future gate: ${p.complianceObligationCoverage.obligations_without_gate.length}

## Accessibility and bilingual coverage

- Accessibility obligations: ${p.accessibilityAndBilingualCoverage.accessibility_obligations}
- Without verification method: ${p.accessibilityAndBilingualCoverage.accessibility_without_verification.length}
- Bilingual obligations: ${p.accessibilityAndBilingualCoverage.bilingual_obligations}
- Without semantic-equivalence requirement: ${p.accessibilityAndBilingualCoverage.bilingual_without_equivalence.length}

## Incident and evidence coverage

- Incident families: ${p.incidentAndEvidenceCoverage.incident_families}
- Without evidence-preservation posture: ${p.incidentAndEvidenceCoverage.incidents_without_evidence_preservation.length}

## Control and assurance backlog

- Control objectives: ${p.controlAndAssuranceBacklog.control_objectives}
- Assurance requirements: ${p.controlAndAssuranceBacklog.assurance_requirements}
- Validation backlog items: ${p.controlAndAssuranceBacklog.validation_backlog}

## Foundation integrity

- Blocking foundation gaps: ${gaps} (must be 0)
- Records authorizing implementation: ${p.authorizing.length} (must be 0)
`;
  writeFileSync(join(outDir, 'package-1-trust-foundation-report.md'), report, 'utf8');
  return { outDir, gaps, authorizing: p.authorizing.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { outDir, gaps, authorizing } = generate();
  console.log(`Volume 6 foundation projections written to ${outDir}`);
  console.log(`  Blocking foundation gaps: ${gaps}`);
  console.log(`  Records authorizing implementation: ${authorizing}`);
}
