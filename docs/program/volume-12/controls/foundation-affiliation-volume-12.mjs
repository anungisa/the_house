// Control: Volume 12 Package 2 affiliation evidence-requirement and
// acceptance-dossier-definition analysis (NON-AUTHORITATIVE).
//
// Derives deterministic, non-authoritative projections of the Package 2
// affiliation evidence corpus into generated/affiliation-evidence-definition/.
// The projections are analytical views only: they confer no ratification, assert
// no implementation, operation, evidence, acceptance, or release, and authorize
// nothing. The Markdown chapters, YAML registers, JSON schemas, and control
// scripts remain the authoritative record. run() reports coverage findings;
// generate() writes the twelve Package 2 affiliation projections and report.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}
function byKinds(ctx, regId, kinds) {
  const set = new Set(kinds);
  return records(ctx, regId).filter((r) => set.has(r.kind));
}

export const P2_EVIDENCE_KINDS = Object.freeze([
  'IMPLEMENTATION_EVIDENCE_REQUIREMENT',
  'BUILD_PROVENANCE_EVIDENCE_REQUIREMENT',
  'DATABASE_BEHAVIOUR_EVIDENCE_REQUIREMENT',
  'ENVIRONMENT_QUALIFICATION_EVIDENCE_REQUIREMENT',
  'DEPLOYMENT_PATH_EVIDENCE_REQUIREMENT',
  'AUTHORIZATION_EVIDENCE_REQUIREMENT',
  'SECURITY_EVIDENCE_REQUIREMENT',
  'PRIVACY_RECORDS_EVIDENCE_REQUIREMENT',
  'FUNCTIONAL_EVIDENCE_REQUIREMENT',
  'CONTRACT_EVIDENCE_REQUIREMENT',
  'INTEGRATION_EVIDENCE_REQUIREMENT',
  'EVENT_WEBHOOK_EVIDENCE_REQUIREMENT',
  'PROVIDER_EVIDENCE_REQUIREMENT',
  'DATA_INTEGRITY_EVIDENCE_REQUIREMENT',
  'FINANCIAL_RECONCILIATION_EVIDENCE_REQUIREMENT',
  'MIGRATION_EVIDENCE_REQUIREMENT',
  'ACTIVATION_STANDING_EVIDENCE_REQUIREMENT',
  'ACCESSIBILITY_EVIDENCE_REQUIREMENT',
  'BILINGUAL_SEMANTIC_EVIDENCE_REQUIREMENT',
  'OPERATIONAL_EVIDENCE_REQUIREMENT',
  'RECOVERY_EVIDENCE_REQUIREMENT',
  'TRAINING_COMPETENCE_EVIDENCE_REQUIREMENT',
  'ADOPTION_EVIDENCE_REQUIREMENT'
]);

export const P2_ACCEPTANCE_KINDS = Object.freeze([
  'IMPLEMENTATION_ACCEPTANCE_CLASS',
  'TECHNICAL_ACCEPTANCE_CLASS',
  'DOMAIN_ACCEPTANCE_CLASS',
  'SECURITY_PRIVACY_ACCEPTANCE_CLASS',
  'ACCESSIBILITY_BILINGUAL_ACCEPTANCE_CLASS',
  'DATA_FINANCIAL_ACCEPTANCE_CLASS',
  'MIGRATION_ACCEPTANCE_CLASS',
  'OPERATIONAL_ACCEPTANCE_CLASS',
  'PROVIDER_ACCEPTANCE_CLASS',
  'TRAINING_ADOPTION_ACCEPTANCE_CLASS',
  'BUSINESS_ACCEPTANCE_CLASS'
]);

function inKinds(list, kinds) {
  const set = new Set(kinds);
  return list.filter((r) => set.has(r.kind));
}

export function analyse(ctx) {
  const evidenceReqs = byKinds(ctx, 'REG-1202', P2_EVIDENCE_KINDS);
  return {
    domains: byKind(ctx, 'REG-1201', 'AFFILIATION_EVIDENCE_DOMAIN'),
    criteria: byKind(ctx, 'REG-1201', 'AFFILIATION_GATE_CRITERION'),
    acceptanceClasses: byKinds(ctx, 'REG-1201', P2_ACCEPTANCE_KINDS),
    releaseDecisions: byKind(ctx, 'REG-1201', 'EXECUTIVE_RELEASE_DECISION'),
    evidenceReqs,
    dossiers: byKind(ctx, 'REG-1202', 'ACCEPTANCE_DOSSIER_REQUIREMENT'),
    findings: byKind(ctx, 'REG-1202', 'FINDING'),
    conditions: byKind(ctx, 'REG-1202', 'CONDITION'),
    waivers: byKind(ctx, 'REG-1202', 'WAIVER'),
    commitments: byKind(ctx, 'REG-1202', 'MATERIAL_COMMITMENT'),
    decisions: records(ctx, 'REG-1203').filter((r) => /-V12-0(0[5-9]|1[0-7])$/.test(r.id)),
    backlog: records(ctx, 'REG-1204'),
    inKinds
  };
}

function coverageByDomain(evidenceReqs, needles) {
  return evidenceReqs.filter((r) => needles.some((k) => `${r.domain} ${r.title} ${r.kind}`.toLowerCase().includes(k)));
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);

  // Every Package 2 gate-model kind must have at least one record.
  const p2GateKinds = ['AFFILIATION_EVIDENCE_DOMAIN', 'AFFILIATION_GATE_CRITERION', 'EXECUTIVE_RELEASE_DECISION', ...P2_ACCEPTANCE_KINDS];
  for (const kind of p2GateKinds) {
    if (byKind(ctx, 'REG-1201', kind).length === 0) {
      findings.push(makeFinding(Severity.ERROR, 'AFFILIATION_COVERAGE_GAP', `No ${kind} records present in the affiliation evidence gate model`, 'REG-1201'));
    }
  }

  // Every Package 2 evidence-requirement kind must have at least one record.
  for (const kind of P2_EVIDENCE_KINDS) {
    if (byKind(ctx, 'REG-1202', kind).length === 0) {
      findings.push(makeFinding(Severity.ERROR, 'AFFILIATION_COVERAGE_GAP', `No ${kind} records present in the affiliation evidence model`, 'REG-1202'));
    }
  }
  if (a.dossiers.length === 0) {
    findings.push(makeFinding(Severity.ERROR, 'AFFILIATION_COVERAGE_GAP', 'No ACCEPTANCE_DOSSIER_REQUIREMENT records present', 'REG-1202'));
  }

  // Every affiliation evidence domain must state an authoritative requirement,
  // institutional invariant, acceptance authority, and a documentary disposition.
  for (const d of a.domains) {
    if (!d.authoritative_requirement || !d.institutional_invariant || !d.acceptance_authority || !(d.dossier_destination || d.governed_documentary_disposition)) {
      findings.push(makeFinding(Severity.ERROR, 'AFFILIATION_DOMAIN_UNDERSPECIFIED', `${d.id} is an affiliation evidence domain missing an authoritative requirement, institutional invariant, acceptance authority, or documentary disposition`, d.id));
    }
  }

  // Every affiliation evidence requirement must bind a domain, evidence classes,
  // provenance, acceptance authority, dossier destination, and authoritative source.
  for (const r of a.evidenceReqs) {
    if (!r.domain || !r.required_evidence_classes || !r.minimum_provenance || !r.acceptance_authority || !r.final_dossier_destination || !r.affected_requirement) {
      findings.push(makeFinding(Severity.ERROR, 'AFFILIATION_EVIDENCE_REQUIREMENT_UNDERSPECIFIED', `${r.id} is an affiliation evidence requirement missing a domain, evidence classes, provenance, acceptance authority, dossier destination, or authoritative source`, r.id));
    }
  }

  // Every acceptance class must name a decision authority and independence.
  for (const c of a.acceptanceClasses) {
    if (!c.decision_authority || !c.independence_requirement) {
      findings.push(makeFinding(Severity.ERROR, 'AFFILIATION_ACCEPTANCE_CLASS_WITHOUT_AUTHORITY', `${c.id} is an affiliation acceptance class without a decision authority and an independence requirement`, c.id));
    }
  }

  findings.push(makeFinding(Severity.INFO, 'AFFILIATION_COVERAGE', `Affiliation evidence coverage: ${a.domains.length} evidence domains, ${a.criteria.length} gate criteria, ${a.acceptanceClasses.length} acceptance classes, ${a.releaseDecisions.length} executive release decisions, ${a.evidenceReqs.length} evidence requirements, ${a.dossiers.length} acceptance dossiers`, 'REG-1201/REG-1202'));
  return findings;
}

export function generate(ctx = loadContext()) {
  const a = analyse(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'affiliation-evidence-definition');
  mkdirSync(outDir, { recursive: true });
  const write = (name, payload) => writeFileSync(join(outDir, name), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const note = 'Non-authoritative projection of the source-controlled Volume 12 Package 2 affiliation evidence corpus. Confers no ratification and authorizes no implementation, operations, evidence, acceptance, or release.';
  const evReq = (r) => ({ id: r.id, kind: r.kind, title: r.title, domain: r.domain, required_evidence_classes: r.required_evidence_classes, minimum_provenance: r.minimum_provenance, acceptance_authority: r.acceptance_authority, affected_requirement: r.affected_requirement, prohibited_inference: r.prohibited_inference, final_dossier_destination: r.final_dossier_destination, chapter_ref: r.chapter_ref });

  // 1. Affiliation evidence-domain and dossier map.
  write('affiliation-evidence-domain-and-dossier-map.json', {
    note,
    domains: a.domains.map((r) => ({ id: r.id, title: r.title, authoritative_requirement: r.authoritative_requirement, institutional_invariant: r.institutional_invariant, affected_actors: r.affected_actors, house_responsibility: r.house_responsibility, button_responsibility: r.button_responsibility, external_system_responsibility: r.external_system_responsibility, required_evidence_classes: r.required_evidence_classes, acceptance_authority: r.acceptance_authority, prohibited_inference: r.prohibited_inference, dossier_destination: r.dossier_destination, governed_documentary_disposition: r.governed_documentary_disposition }))
  });

  // 2. Implementation, source, build, database, environment, and deployment evidence.
  write('implementation-source-build-database-environment-and-deployment-evidence.json', {
    note,
    evidence_requirements: coverageByDomain(a.evidenceReqs, ['implementation', 'build', 'database', 'environment', 'deployment']).map(evReq)
  });

  // 3. Identity, authority, security, privacy, records, and audit evidence.
  write('identity-authority-security-privacy-records-and-audit-evidence.json', {
    note,
    evidence_requirements: coverageByDomain(a.evidenceReqs, ['authorization', 'security', 'privacy']).map(evReq)
  });

  // 4. Functional, workflow, contract, integration, event, and provider evidence.
  write('functional-workflow-contract-integration-event-and-provider-evidence.json', {
    note,
    evidence_requirements: coverageByDomain(a.evidenceReqs, ['functional', 'contract', 'integration', 'event', 'provider']).map(evReq)
  });

  // 5. Data, migration, financial-reconciliation, activation, and standing evidence.
  write('data-migration-financial-reconciliation-activation-and-standing-evidence.json', {
    note,
    evidence_requirements: coverageByDomain(a.evidenceReqs, ['data', 'migration', 'financial', 'activation', 'standing']).map(evReq)
  });

  // 6. Accessibility, bilingual, usability, content, and document evidence.
  write('accessibility-bilingual-usability-content-and-document-evidence.json', {
    note,
    evidence_requirements: coverageByDomain(a.evidenceReqs, ['accessibility', 'bilingual']).map(evReq)
  });

  // 7. Operational, continuity, recovery, provider, training, and adoption evidence.
  write('operational-continuity-recovery-provider-training-and-adoption-evidence.json', {
    note,
    evidence_requirements: coverageByDomain(a.evidenceReqs, ['operations', 'recovery', 'training', 'adoption', 'provider']).map(evReq)
  });

  // 8. Finding, defect, waiver, condition, commitment, and challenge analysis.
  write('finding-defect-waiver-condition-commitment-and-challenge-analysis.json', {
    note,
    findings: a.findings.map((r) => ({ id: r.id, title: r.title, owner: r.owner, affected_requirement: r.affected_requirement, retest_or_reexercise_requirement: r.retest_or_reexercise_requirement, release_effect: r.release_effect })),
    conditions: a.conditions.map((r) => ({ id: r.id, title: r.title, owner: r.owner, expiry: r.expiry, revalidation_condition: r.revalidation_condition, release_effect: r.release_effect })),
    waivers: a.waivers.map((r) => ({ id: r.id, title: r.title, owner: r.owner, expiry: r.expiry, compensating_control_dependency: r.compensating_control_dependency, release_effect: r.release_effect })),
    material_commitments: a.commitments.map((r) => ({ id: r.id, title: r.title, owner: r.owner, required_evidence: r.required_evidence, expiry: r.expiry, release_effect: r.release_effect })),
    decision_boundaries: a.decisions.map((r) => ({ id: r.id, title: r.title, decision_authority: r.decision_authority, prohibited_inference: r.prohibited_inference }))
  });

  // 9. Affiliation acceptance-class and decision-authority matrix.
  write('affiliation-acceptance-class-and-decision-authority-matrix.json', {
    note,
    acceptance_classes: a.acceptanceClasses.map((r) => ({ id: r.id, kind: r.kind, title: r.title, decision_authority: r.decision_authority, reviewer_qualification: r.reviewer_qualification, independence_requirement: r.independence_requirement, permitted_disposition: r.permitted_disposition, conditions_permitted: r.conditions_permitted, required_evidence: r.required_evidence, dissent_treatment: r.dissent_treatment, release_effect: r.release_effect })),
    executive_release_decisions: a.releaseDecisions.map((r) => ({ id: r.id, title: r.title, decision_authority: r.decision_authority, required_evidence: r.required_evidence, prohibited_inference: r.prohibited_inference }))
  });

  // 10. Affiliation evidence-dossier catalogue.
  write('affiliation-evidence-dossier-catalogue.json', {
    note,
    dossiers: a.dossiers.map((r) => ({ id: r.id, title: r.title, dossier_kind: r.dossier_kind, contained_sections: r.contained_sections, authoritative_source: r.authoritative_source, final_dossier_destination: r.final_dossier_destination }))
  });

  // 11. House P0 evidence and release-destination map.
  write('house-p0-evidence-and-release-destination-map.json', {
    note,
    house_p0_dossier: a.dossiers.filter((r) => /P0/i.test(`${r.title} ${r.dossier_kind}`)).map((r) => ({ id: r.id, title: r.title, contained_sections: r.contained_sections, authoritative_source: r.authoritative_source })),
    release_blockers: a.backlog.filter((b) => b.kind === 'RELEASE_BLOCKER').map((r) => ({ id: r.id, owner: r.owner, future_blocking_gate: r.future_blocking_gate, required_action_or_evidence: r.required_action_or_evidence })),
    evidence_gaps: a.backlog.filter((b) => b.kind === 'EVIDENCE_GAP').map((r) => ({ id: r.id, owner: r.owner, required_action_or_evidence: r.required_action_or_evidence, release_impact: r.release_impact }))
  });

  // Package 2 affiliation evidence-definition report (Markdown).
  const now = new Date().toISOString();
  const md = `# Volume 12 Package 2 Affiliation Evidence-Definition Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 12 Package 2 affiliation evidence corpus. It confers no ratification and
> authorizes no implementation, operations, evidence, acceptance, or release. No
> evidence is created, submitted, validated, accepted, or approved by this report.

## Coverage

| Category | Count |
| --- | --- |
| Affiliation evidence domains | ${a.domains.length} |
| Affiliation gate criteria | ${a.criteria.length} |
| Affiliation acceptance classes | ${a.acceptanceClasses.length} |
| Executive release decisions | ${a.releaseDecisions.length} |
| Affiliation evidence requirements | ${a.evidenceReqs.length} |
| Acceptance dossiers | ${a.dossiers.length} |
| Decision boundaries | ${a.decisions.length} |

## Boundary

Volume 12 Package 2 defines the affiliation evidence requirements and acceptance
dossiers for the club-affiliation vertical. It does not manufacture evidence, run
tests, engage providers, accept evidence, pass a gate, or authorize a release. Club
affiliation is the first evidence-definition vertical; its definition binds only the
affiliation vertical.
`;
  writeFileSync(join(outDir, 'package-2-affiliation-evidence-definition-report.md'), md, 'utf8');

  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Affiliation evidence & acceptance-dossier coverage', run);
}
