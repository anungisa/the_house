// Control: Volume 12 Package 1 gate, release, and acceptance-evidence
// governance-foundation analysis (NON-AUTHORITATIVE).
//
// Derives deterministic, non-authoritative projections of the source-controlled
// Volume 12 corpus into generated/foundation/. The projections are analytical
// views only: they confer no ratification, assert no implementation, operation,
// evidence, acceptance, or release, and authorize nothing. The Markdown chapters,
// YAML registers, JSON schemas, and control scripts remain the authoritative
// record. run() reports coverage findings; generate() writes the ten Package 1
// foundation projections and the gate/release/acceptance-governance report.

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
    gates: byKind(ctx, 'REG-1201', 'GATE'),
    criteria: byKind(ctx, 'REG-1201', 'GATE_CRITERION'),
    evidenceClasses: byKind(ctx, 'REG-1201', 'EVIDENCE_CLASS'),
    acceptanceClasses: byKind(ctx, 'REG-1201', 'ACCEPTANCE_CLASS'),
    authorities: byKind(ctx, 'REG-1201', 'AUTHORITY'),
    releaseDecisions: byKind(ctx, 'REG-1201', 'RELEASE_DECISION'),
    evidenceReqs: byKind(ctx, 'REG-1202', 'EVIDENCE_REQUIREMENT'),
    evidenceObjects: byKind(ctx, 'REG-1202', 'EVIDENCE_OBJECT'),
    findings: byKind(ctx, 'REG-1202', 'FINDING'),
    conditions: byKind(ctx, 'REG-1202', 'CONDITION'),
    waivers: byKind(ctx, 'REG-1202', 'WAIVER'),
    commitments: byKind(ctx, 'REG-1202', 'MATERIAL_COMMITMENT'),
    dossiers: byKind(ctx, 'REG-1202', 'DOSSIER'),
    decisions: records(ctx, 'REG-1203'),
    backlog: records(ctx, 'REG-1204')
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  const checks = [
    ['GATE', a.gates.length],
    ['GATE_CRITERION', a.criteria.length],
    ['EVIDENCE_CLASS', a.evidenceClasses.length],
    ['ACCEPTANCE_CLASS', a.acceptanceClasses.length],
    ['AUTHORITY', a.authorities.length],
    ['RELEASE_DECISION', a.releaseDecisions.length],
    ['EVIDENCE_REQUIREMENT', a.evidenceReqs.length],
    ['EVIDENCE_OBJECT', a.evidenceObjects.length],
    ['CONDITION', a.conditions.length],
    ['WAIVER', a.waivers.length],
    ['MATERIAL_COMMITMENT', a.commitments.length],
    ['DOSSIER', a.dossiers.length],
    ['DECISION', a.decisions.length],
    ['BACKLOG', a.backlog.length]
  ];
  for (const [label, count] of checks) {
    if (count === 0) {
      findings.push(makeFinding(Severity.ERROR, 'FOUNDATION_COVERAGE_GAP', `No ${label} records present in the gate/release/acceptance-evidence governance foundation`, 'REG-1201/REG-1202/REG-1203/REG-1204'));
    }
  }
  // Every evidence class must state a permitted claim and a prohibited inference.
  for (const e of a.evidenceClasses) {
    if (!e.permitted_claim || !e.prohibited_inference) {
      findings.push(makeFinding(Severity.ERROR, 'EVIDENCE_CLASS_WITHOUT_CLAIM_BOUNDARY', `${e.id} is an evidence class without both a permitted claim and a prohibited inference`, e.id));
    }
  }
  // Every acceptance class must name a decision authority and an independence requirement.
  for (const c of a.acceptanceClasses) {
    if (!c.decision_authority || !c.independence_requirement) {
      findings.push(makeFinding(Severity.ERROR, 'ACCEPTANCE_CLASS_WITHOUT_AUTHORITY', `${c.id} is an acceptance class without a decision authority and an independence requirement`, c.id));
    }
  }
  findings.push(makeFinding(Severity.INFO, 'FOUNDATION_COVERAGE', `Foundation coverage: ${a.evidenceClasses.length} evidence classes, ${a.criteria.length} gate criteria, ${a.acceptanceClasses.length} acceptance classes, ${a.releaseDecisions.length} release decisions, ${a.evidenceReqs.length} evidence requirements, ${a.dossiers.length} dossiers, ${a.backlog.length} backlog items`, 'REG-1201'));
  return findings;
}

export function generate(ctx = loadContext()) {
  const a = analyse(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'foundation');
  mkdirSync(outDir, { recursive: true });
  const write = (name, payload) => writeFileSync(join(outDir, name), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const note = 'Non-authoritative projection of the source-controlled Volume 12 corpus. Confers no ratification and authorizes no implementation, operations, or release.';

  // 1. Inherited release and acceptance obligation map.
  write('inherited-release-and-acceptance-obligation-map.json', {
    note,
    inherited_release_tag: 'central-registration-volume-11-v1.0.0',
    acceptance_classes: a.acceptanceClasses.map((r) => ({ id: r.id, title: r.title, acceptance_class: r.acceptance_class, decision_authority: r.decision_authority, independence_requirement: r.independence_requirement, release_effect: r.release_effect })),
    release_decisions: a.releaseDecisions.map((r) => ({ id: r.id, title: r.title, decision_class: r.decision_class, decision_authority: r.decision_authority, downstream_gate: r.downstream_gate })),
    outstanding_acceptance_backlog: a.backlog.filter((b) => b.kind === 'ACCEPTANCE_BACKLOG').map((r) => ({ id: r.id, owner: r.owner, future_blocking_gate: r.future_blocking_gate }))
  });

  // 2. Evidence-class authority and claim-boundary model.
  write('evidence-class-authority-and-claim-boundary-model.json', {
    note,
    evidence_classes: a.evidenceClasses.map((r) => ({
      id: r.id, title: r.title, evidence_class: r.evidence_class,
      authoritative_requirement: r.authoritative_requirement, permitted_claim: r.permitted_claim, prohibited_inference: r.prohibited_inference,
      minimum_provenance: r.minimum_provenance, independence_requirement: r.independence_requirement,
      review_authority: r.review_authority, acceptance_authority: r.acceptance_authority, expiry_or_revalidation_dependency: r.expiry_or_revalidation_dependency
    }))
  });

  // 3. Gate-criteria, decision-rights, and segregation map.
  write('gate-criteria-decision-rights-and-segregation-map.json', {
    note,
    gates: a.gates.map((r) => ({ id: r.id, title: r.title, gate_disposition_target: r.gate_disposition_target, decision_authority: r.decision_authority, escalation_path: r.escalation_path })),
    criteria: a.criteria.map((r) => ({ id: r.id, title: r.title, decision_class: r.decision_class, decision_authority: r.decision_authority, required_independence: r.required_independence, permitted_disposition: r.permitted_disposition, prohibited_inference: r.prohibited_inference, escalation_path: r.escalation_path, downstream_gate: r.downstream_gate })),
    authorities: a.authorities.map((r) => ({ id: r.id, title: r.title, authority_scope: r.authority_scope, required_competence: r.required_competence, required_independence: r.required_independence, conflict_of_interest_treatment: r.conflict_of_interest_treatment, delegation_rule: r.delegation_rule, segregation_boundary: r.segregation_boundary }))
  });

  // 4. Evidence-object provenance, integrity, and retention model.
  write('evidence-object-provenance-integrity-and-retention-model.json', {
    note,
    evidence_objects: a.evidenceObjects.map((r) => ({
      id: r.id, title: r.title,
      binds: {
        requirement: r.evidence_binds_requirement, version: r.evidence_binds_version, commit: r.evidence_binds_commit, configuration: r.evidence_binds_configuration,
        environment: r.evidence_binds_environment, identity: r.evidence_binds_identity, organization: r.evidence_binds_organization, jurisdiction: r.evidence_binds_jurisdiction,
        data: r.evidence_binds_data, provider_state: r.evidence_binds_provider_state, time: r.evidence_binds_time
      },
      integrity_mechanism: r.integrity_mechanism, reproducibility: r.reproducibility, retention_dependency: r.retention_dependency, expiry_or_revalidation_date: r.expiry_or_revalidation_date,
      executor: r.executor, reviewer: r.reviewer, independence_level: r.independence_level, acceptance_disposition: r.acceptance_disposition
    }))
  });

  // 5. Material-commitment, defect, waiver, condition, and expiry analysis.
  write('material-commitment-defect-waiver-condition-and-expiry-analysis.json', {
    note,
    findings: a.findings.map((r) => ({ id: r.id, owner: r.owner, affected_requirement: r.affected_requirement, retest_or_reexercise_requirement: r.retest_or_reexercise_requirement, release_effect: r.release_effect })),
    conditions: a.conditions.map((r) => ({ id: r.id, owner: r.owner, approving_authority: r.approving_authority, expiry: r.expiry, revalidation_condition: r.revalidation_condition, release_effect: r.release_effect })),
    waivers: a.waivers.map((r) => ({ id: r.id, owner: r.owner, approving_authority: r.approving_authority, effective_period: r.effective_period, expiry: r.expiry, compensating_control_dependency: r.compensating_control_dependency, release_effect: r.release_effect })),
    material_commitments: a.commitments.map((r) => ({ id: r.id, owner: r.owner, required_remediation: r.required_remediation, required_evidence: r.required_evidence, expiry: r.expiry, release_effect: r.release_effect }))
  });

  // 6. Cross-domain evidence-intake and sufficiency model.
  write('cross-domain-evidence-intake-and-sufficiency-model.json', {
    note,
    evidence_requirements: a.evidenceReqs.map((r) => ({
      id: r.id, title: r.title, domain: r.domain, required_evidence_classes: r.required_evidence_classes, minimum_provenance: r.minimum_provenance,
      environment_requirement: r.environment_requirement, configuration_requirement: r.configuration_requirement, data_requirement: r.data_requirement,
      independence_requirement: r.independence_requirement, acceptance_authority: r.acceptance_authority, known_evidentiary_limitations: r.known_evidentiary_limitations,
      prohibited_substitution: r.prohibited_substitution, expiry_or_revalidation_dependency: r.expiry_or_revalidation_dependency, final_dossier_destination: r.final_dossier_destination
    }))
  });

  // 7. Implementation, environment, configuration, and release-candidate evidence map.
  write('implementation-environment-configuration-and-release-candidate-evidence-map.json', {
    note,
    evidence_requirements: a.evidenceReqs.filter((r) => /IMPLEMENTATION|ENVIRONMENT|CONFIGURATION|RELEASE_CANDIDATE|DATABASE|DEPLOYMENT/i.test(`${r.domain} ${r.title}`)).map((r) => ({ id: r.id, title: r.title, domain: r.domain, environment_requirement: r.environment_requirement, configuration_requirement: r.configuration_requirement, prohibited_inference: r.prohibited_inference })),
    all_evidence_requirement_domains: a.evidenceReqs.map((r) => r.domain).filter(Boolean)
  });

  // 8. Business, operational, executive acceptance, and release-authorization map.
  write('business-operational-executive-acceptance-and-release-authorization-map.json', {
    note,
    acceptance_classes: a.acceptanceClasses.map((r) => ({ id: r.id, title: r.title, acceptance_class: r.acceptance_class, decision_authority: r.decision_authority, reviewer_qualification: r.reviewer_qualification, independence_requirement: r.independence_requirement, permitted_disposition: r.permitted_disposition, dissent_treatment: r.dissent_treatment, release_effect: r.release_effect })),
    release_decisions: a.releaseDecisions.map((r) => ({ id: r.id, title: r.title, decision_class: r.decision_class, decision_authority: r.decision_authority, required_evidence: r.required_evidence, prohibited_inference: r.prohibited_inference, downstream_gate: r.downstream_gate }))
  });

  // 9. Evidence-deficiency, challenge, revalidation, and revocation analysis.
  write('evidence-deficiency-challenge-revalidation-and-revocation-analysis.json', {
    note,
    findings: a.findings.map((r) => ({ id: r.id, title: r.title, owner: r.owner, affected_decision: r.affected_release_gate, required_evidence: r.required_evidence })),
    conditions: a.conditions.map((r) => ({ id: r.id, title: r.title, expiry: r.expiry, revalidation_condition: r.revalidation_condition })),
    release_blockers: a.backlog.filter((b) => b.kind === 'RELEASE_BLOCKER').map((r) => ({ id: r.id, owner: r.owner, future_blocking_gate: r.future_blocking_gate, required_action_or_evidence: r.required_action_or_evidence }))
  });

  // 10. Final-dossier, decision-brief, and handoff model.
  write('final-dossier-decision-brief-and-handoff-model.json', {
    note,
    dossiers: a.dossiers.map((r) => ({ id: r.id, title: r.title, dossier_kind: r.dossier_kind, contained_sections: r.contained_sections, authoritative_source: r.authoritative_source, projection_boundary: r.projection_boundary }))
  });

  // Package 1 gate, release, and acceptance-governance report (Markdown).
  const now = new Date().toISOString();
  const md = `# Volume 12 Package 1 Gate, Release, and Acceptance-Governance Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 12 corpus. It confers no ratification and authorizes no implementation,
> operations, evidence acceptance, or release.

## Coverage

| Category | Count |
| --- | --- |
| Gates | ${a.gates.length} |
| Gate criteria | ${a.criteria.length} |
| Evidence classes | ${a.evidenceClasses.length} |
| Acceptance classes | ${a.acceptanceClasses.length} |
| Authorities | ${a.authorities.length} |
| Release decisions | ${a.releaseDecisions.length} |
| Evidence requirements | ${a.evidenceReqs.length} |
| Evidence objects | ${a.evidenceObjects.length} |
| Findings | ${a.findings.length} |
| Conditions | ${a.conditions.length} |
| Waivers | ${a.waivers.length} |
| Material commitments | ${a.commitments.length} |
| Dossiers | ${a.dossiers.length} |
| Decisions | ${a.decisions.length} |
| Backlog items | ${a.backlog.length} |

## Boundary

Volume 12 Package 1 defines the evidence, gate, acceptance, and release-decision
governance system. It does not manufacture evidence, run tests, accept evidence,
pass a final gate, or authorize a release.
`;
  writeFileSync(join(outDir, 'package-1-gate-release-and-acceptance-governance-report.md'), md, 'utf8');

  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate, evidence & acceptance-foundation coverage', run);
}
