// Control: Volume 6 Package 2 control-model analysis (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown control-model report
// describing the Package 2 identity, authorization, privacy, and data-protection
// control model: the control-family catalogue and evidence semantics; identity
// and authentication coverage; resource-aware authorization coverage; delegation
// and privileged-access analysis; data-protection and secret requirements;
// restricted-evidence control coverage; privacy processing and rights mapping;
// logging, monitoring, and detection coverage; and provider trust and
// contractual assurance. Non-authoritative: the source-controlled corpus and its
// recorded approvals remain the sole source of truth. These projections are
// rebuildable from the governed registers and authorize no implementation.

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

function hasInput(inputs, token) {
  return (inputs ?? []).some((i) => String(i).toLowerCase().includes(token));
}

const AUTHZ_INPUT_TOKENS = ['resource', 'organization', 'jurisdiction', 'assignment', 'action', 'lifecycle', 'sensitiv'];

function inputPresent(control, token) {
  if (token === 'lifecycle') {
    return hasInput(control.authorization_inputs, 'lifecycle') || hasInput(control.authorization_inputs, 'state');
  }
  return hasInput(control.authorization_inputs, token);
}

export function project(ctx) {
  const controls = records(ctx, 'REG-602');
  const protection = records(ctx, 'REG-601');
  const decisions = records(ctx, 'REG-603');
  const backlog = records(ctx, 'REG-604');

  const controlObjectives = controls.filter((c) => c.kind === 'CONTROL_OBJECTIVE');
  const obligations = controls.filter((c) => c.kind === 'OBLIGATION' || c.kind === 'COMPLIANCE_OBLIGATION');
  const assetIds = new Set(protection.filter((r) => r.kind === 'ASSET').map((r) => r.id));
  const rightIds = new Set(protection.filter((r) => r.kind === 'RIGHT').map((r) => r.id));

  const inFamilies = (families) =>
    controlObjectives.filter((c) => families.includes(c.control_family));

  const summarizeControls = (list) =>
    list.map((c) => ({
      id: c.id,
      control_family: c.control_family,
      protected_asset_or_right: c.protected_asset_or_right ?? null,
      implementation_evidence_class: c.implementation_evidence_class ?? null,
      future_blocking_gate: c.future_blocking_gate ?? null
    }));

  // 1. Control-family catalogue and evidence semantics.
  const controlFamilyCatalogue = {
    control_objectives: controlObjectives.length,
    by_control_family: countBy(controlObjectives, 'control_family'),
    controls_without_family: controlObjectives.filter((c) => !c.control_family).map((c) => c.id),
    by_evidence_class: countBy(controlObjectives, 'implementation_evidence_class'),
    controls_without_evidence_class: controlObjectives
      .filter((c) => !c.implementation_evidence_class)
      .map((c) => c.id),
    controls_without_owner: controlObjectives.filter((c) => !c.owner).map((c) => c.id),
    controls_without_required_evidence: controlObjectives.filter((c) => !c.required_evidence).map((c) => c.id),
    controls_without_gate: controlObjectives.filter((c) => !c.future_blocking_gate).map((c) => c.id),
    controls_with_unresolved_protected_ref: controlObjectives
      .filter((c) => c.protected_asset_or_right && !assetIds.has(c.protected_asset_or_right) && !rightIds.has(c.protected_asset_or_right))
      .map((c) => c.id)
  };

  // 2. Identity and authentication coverage.
  const identityControls = inFamilies(['IDENTITY', 'AUTHENTICATION', 'SESSION_AND_CREDENTIAL']);
  const identityAndAuthenticationCoverage = {
    total: identityControls.length,
    by_control_family: countBy(identityControls, 'control_family'),
    controls: summarizeControls(identityControls),
    controls_without_threat_ref: identityControls.filter((c) => !c.threat_or_abuse_ref).map((c) => c.id)
  };

  // 3. Resource-aware authorization coverage.
  const authzControls = inFamilies(['AUTHORIZATION']);
  const isolationControls = inFamilies(['RESOURCE_ISOLATION', 'SERVICE_TRUST']);
  const resourceAuthorizationCoverage = {
    authorization_controls: authzControls.length,
    isolation_and_service_controls: isolationControls.length,
    controls: summarizeControls([...authzControls, ...isolationControls]),
    input_presence: AUTHZ_INPUT_TOKENS.reduce((acc, tok) => {
      acc[tok] = authzControls.filter((c) => inputPresent(c, tok)).length;
      return acc;
    }, {}),
    controls_missing_inputs: authzControls
      .filter((c) => AUTHZ_INPUT_TOKENS.some((tok) => !inputPresent(c, tok)))
      .map((c) => c.id)
  };

  // 4. Delegation and privileged-access analysis.
  const privControls = inFamilies(['DELEGATION', 'PRIVILEGED_ACCESS', 'EXCEPTION_AND_RECOVERY']);
  const privControlIds = new Set(privControls.map((c) => c.id));
  const delegationAndPrivilegedAccessAnalysis = {
    total: privControls.length,
    by_control_family: countBy(privControls, 'control_family'),
    controls: summarizeControls(privControls),
    obligations_referencing: obligations.filter((o) => privControlIds.has(o.control_objective_ref)).map((o) => o.id)
  };

  // 5. Data-protection and secret requirements.
  const dataControls = inFamilies(['DATA_PROTECTION', 'CRYPTOGRAPHY', 'SECRETS_AND_KEYS', 'CONFIGURATION']);
  const dataProtectionAndSecretRequirements = {
    total: dataControls.length,
    by_control_family: countBy(dataControls, 'control_family'),
    controls: summarizeControls(dataControls),
    cryptography_defined_selection_pending: inFamilies(['CRYPTOGRAPHY']).map((c) => c.id)
  };

  // 6. Restricted-evidence control coverage.
  const evidenceControls = inFamilies(['RESTRICTED_EVIDENCE', 'DISCLOSURE_AND_EXPORT']);
  const evidenceControlIds = new Set(evidenceControls.map((c) => c.id));
  const restrictedEvidenceControlCoverage = {
    total: evidenceControls.length,
    by_control_family: countBy(evidenceControls, 'control_family'),
    controls: summarizeControls(evidenceControls),
    obligations_referencing: obligations.filter((o) => evidenceControlIds.has(o.control_objective_ref)).map((o) => o.id)
  };

  // 7. Privacy processing and rights mapping.
  const privacyControls = inFamilies(['PRIVACY_PURPOSE', 'MINIMIZATION', 'NOTICE_AND_RIGHTS']);
  const privacyProcessingAndRightsMapping = {
    total: privacyControls.length,
    by_control_family: countBy(privacyControls, 'control_family'),
    controls: summarizeControls(privacyControls),
    rights_mapped: privacyControls
      .filter((c) => c.protected_asset_or_right && rightIds.has(c.protected_asset_or_right))
      .map((c) => ({ id: c.id, right: c.protected_asset_or_right }))
  };

  // 8. Logging, monitoring, and detection coverage.
  const loggingControls = inFamilies(['LOGGING_AND_AUDIT', 'MONITORING_AND_DETECTION']);
  const loggingMonitoringAndDetectionCoverage = {
    total: loggingControls.length,
    by_control_family: countBy(loggingControls, 'control_family'),
    controls: summarizeControls(loggingControls)
  };

  // 9. Provider trust and contractual assurance.
  const providerControls = inFamilies(['SERVICE_TRUST', 'PROVIDER_ASSURANCE']);
  const providerTrustAndContractualAssurance = {
    total: providerControls.length,
    by_control_family: countBy(providerControls, 'control_family'),
    controls: summarizeControls(providerControls),
    independent_assurance_dependencies: providerControls
      .filter((c) => c.implementation_evidence_class === 'INDEPENDENT_ASSURANCE_REQUIRED')
      .map((c) => c.id)
  };

  const gaps =
    controlFamilyCatalogue.controls_without_family.length +
    controlFamilyCatalogue.controls_without_owner.length +
    controlFamilyCatalogue.controls_without_required_evidence.length +
    controlFamilyCatalogue.controls_without_gate.length +
    controlFamilyCatalogue.controls_with_unresolved_protected_ref.length +
    resourceAuthorizationCoverage.controls_missing_inputs.length;

  const authorizing = [...controls, ...protection, ...decisions, ...backlog]
    .filter((r) => r.authorizes_implementation === true)
    .map((r) => r.id);

  return {
    controlFamilyCatalogue,
    identityAndAuthenticationCoverage,
    resourceAuthorizationCoverage,
    delegationAndPrivilegedAccessAnalysis,
    dataProtectionAndSecretRequirements,
    restrictedEvidenceControlCoverage,
    privacyProcessingAndRightsMapping,
    loggingMonitoringAndDetectionCoverage,
    providerTrustAndContractualAssurance,
    gaps,
    authorizing
  };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'control-model');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'control-family-catalogue.json', p.controlFamilyCatalogue);
  writeJson(outDir, 'identity-and-authentication-coverage.json', p.identityAndAuthenticationCoverage);
  writeJson(outDir, 'resource-authorization-coverage.json', p.resourceAuthorizationCoverage);
  writeJson(outDir, 'delegation-and-privileged-access-analysis.json', p.delegationAndPrivilegedAccessAnalysis);
  writeJson(outDir, 'data-protection-and-secret-requirements.json', p.dataProtectionAndSecretRequirements);
  writeJson(outDir, 'restricted-evidence-control-coverage.json', p.restrictedEvidenceControlCoverage);
  writeJson(outDir, 'privacy-processing-and-rights-mapping.json', p.privacyProcessingAndRightsMapping);
  writeJson(outDir, 'logging-monitoring-and-detection-coverage.json', p.loggingMonitoringAndDetectionCoverage);
  writeJson(outDir, 'provider-trust-and-contractual-assurance.json', p.providerTrustAndContractualAssurance);

  const report = `# Volume 6 Package 2 Control-Model Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 6 corpus. Not a source of
> truth and not a basis for ratification. Volume 6 Package 2 defines the identity,
> authorization, privacy, and data-protection CONTROL MODEL only. It implements no
> control and claims no compliance, conformance, operational proof, or independent
> assurance. It authorizes no implementation.

## Control-family catalogue and evidence semantics

- Control objectives: ${p.controlFamilyCatalogue.control_objectives}
- Control families in use: ${Object.keys(p.controlFamilyCatalogue.by_control_family).length}
- Controls without a control family: ${p.controlFamilyCatalogue.controls_without_family.length}
- Controls without an implementation-evidence class: ${p.controlFamilyCatalogue.controls_without_evidence_class.length} (informational; the evidence class is a Package 2 attribute and is optional for Package 1 controls)
- Controls with an unresolved protected asset/right: ${p.controlFamilyCatalogue.controls_with_unresolved_protected_ref.length}

## Identity and authentication coverage

- Identity, authentication, and session controls: ${p.identityAndAuthenticationCoverage.controls.length}

## Resource-aware authorization coverage

- Authorization control objectives: ${p.resourceAuthorizationCoverage.authorization_controls}
- Isolation and service-trust controls: ${p.resourceAuthorizationCoverage.isolation_and_service_controls}
- Authorization controls missing a resource-aware input: ${p.resourceAuthorizationCoverage.controls_missing_inputs.length}

## Delegation and privileged-access analysis

- Delegation, privileged-access, and segregation controls: ${p.delegationAndPrivilegedAccessAnalysis.controls.length}
- Obligations referencing them: ${p.delegationAndPrivilegedAccessAnalysis.obligations_referencing.length}

## Data-protection and secret requirements

- Data-protection, cryptography, secrets, and configuration controls: ${p.dataProtectionAndSecretRequirements.controls.length}
- Cryptographic requirements defined with selection pending: ${p.dataProtectionAndSecretRequirements.cryptography_defined_selection_pending.length}

## Restricted-evidence control coverage

- Restricted-evidence and disclosure controls: ${p.restrictedEvidenceControlCoverage.controls.length}

## Privacy processing and rights mapping

- Privacy purpose, minimization, and rights controls: ${p.privacyProcessingAndRightsMapping.controls.length}
- Rights mapped to a control objective: ${p.privacyProcessingAndRightsMapping.rights_mapped.length}

## Logging, monitoring, and detection coverage

- Logging, monitoring, and detection controls: ${p.loggingMonitoringAndDetectionCoverage.controls.length}

## Provider trust and contractual assurance

- Service-trust and provider-assurance controls: ${p.providerTrustAndContractualAssurance.controls.length}
- Independent-assurance dependencies: ${p.providerTrustAndContractualAssurance.independent_assurance_dependencies.length}

## Control-model integrity

- Blocking control-model gaps: ${p.gaps} (must be 0)
- Records authorizing implementation: ${p.authorizing.length} (must be 0)
`;
  writeFileSync(join(outDir, 'package-2-control-model-report.md'), report, 'utf8');
  return { outDir, gaps: p.gaps, authorizing: p.authorizing.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { outDir, gaps, authorizing } = generate();
  console.log(`Volume 6 control-model projections written to ${outDir}`);
  console.log(`  Blocking control-model gaps: ${gaps}`);
  console.log(`  Records authorizing implementation: ${authorizing}`);
}
