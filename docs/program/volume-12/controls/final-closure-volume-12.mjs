// Control: Volume 12 Package 3 integrated final-evidence, gate, acceptance, and
// corpus-closure analysis (NON-AUTHORITATIVE).
//
// Derives deterministic, non-authoritative projections of the Package 3 consolidation
// corpus (REG-1201 Package 3 model kinds and REG-1202 Package 3 requirement kinds) into
// generated/final-closure/. The projections are analytical views only: they confer no
// ratification, assert no implementation, evidence availability, acceptance, or release,
// and authorize nothing. The Markdown chapters, YAML registers, JSON schemas, and
// control scripts remain the authoritative record. run() reports coverage findings;
// generate() writes the twelve Package 3 projections and the Volume 12 closure report.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}

// The twelve Package 3 consolidated model kinds (REG-1201).
export const COVERAGE_KINDS = Object.freeze([
  'INTEGRATED_FINAL_EVIDENCE_BASELINE',
  'WHOLE_PROGRAM_TRACEABILITY_COVERAGE',
  'PROGRAM_GATE_MATRIX',
  'EVIDENCE_STATUS_MODEL',
  'RELEASE_BLOCKER_MODEL',
  'FINAL_DOSSIER_MODEL',
  'AFFILIATION_ACCEPTANCE_SYNTHESIS',
  'INDEPENDENCE_AND_CHALLENGE_MODEL',
  'EXECUTIVE_DECISION_MODEL',
  'POST_RELEASE_OBLIGATION_MODEL',
  'IMPLEMENTATION_AUTHORIZATION_HANDOFF',
  'CORPUS_RELEASE_DECISION'
]);

// The thirteen Package 3 final-evidence and release requirement kinds (REG-1202).
export const REQUIREMENT_KINDS = Object.freeze([
  'FINAL_EVIDENCE_REQUIREMENT',
  'GATE_EVIDENCE_REQUIREMENT',
  'EVIDENCE_SUFFICIENCY_REQUIREMENT',
  'EVIDENCE_ACCEPTANCE_REQUIREMENT',
  'EVIDENCE_REVALIDATION_REQUIREMENT',
  'RELEASE_BLOCKER_REQUIREMENT',
  'MATERIAL_COMMITMENT_EVIDENCE_REQUIREMENT',
  'FINAL_DOSSIER_REQUIREMENT',
  'EXECUTIVE_DECISION_EVIDENCE_REQUIREMENT',
  'DEPLOYMENT_EVIDENCE_REQUIREMENT',
  'STABILIZATION_EVIDENCE_REQUIREMENT',
  'IMPLEMENTATION_AUTHORIZATION_INPUT_REQUIREMENT',
  'CORPUS_RELEASE_RECORD_REQUIREMENT'
]);

export function analyse(ctx) {
  const coverage = {};
  for (const k of COVERAGE_KINDS) coverage[k] = byKind(ctx, 'REG-1201', k);
  const requirements = {};
  for (const k of REQUIREMENT_KINDS) requirements[k] = byKind(ctx, 'REG-1202', k);
  return { coverage, requirements };
}

export function run(ctx) {
  const findings = [];
  const { coverage, requirements } = analyse(ctx);
  for (const k of COVERAGE_KINDS) {
    if (coverage[k].length === 0) {
      findings.push(makeFinding(Severity.ERROR, 'FINAL_CLOSURE_COVERAGE_GAP', `No ${k} model record present in the integrated final-evidence baseline`, 'REG-1201'));
    }
  }
  for (const k of REQUIREMENT_KINDS) {
    if (requirements[k].length === 0) {
      findings.push(makeFinding(Severity.ERROR, 'FINAL_CLOSURE_REQUIREMENT_GAP', `No ${k} requirement present in the final-evidence requirement set`, 'REG-1202'));
    }
  }
  const totalCoverage = Object.values(coverage).reduce((n, rows) => n + rows.length, 0);
  const totalRequirements = Object.values(requirements).reduce((n, rows) => n + rows.length, 0);
  findings.push(makeFinding(Severity.INFO, 'FINAL_CLOSURE_COVERAGE', `Package 3 consolidation: ${totalCoverage} model records across ${COVERAGE_KINDS.length} kinds, ${totalRequirements} requirements across ${REQUIREMENT_KINDS.length} kinds`, 'REG-1201/REG-1202'));
  return findings;
}

export function generate(ctx = loadContext()) {
  const { coverage, requirements } = analyse(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'final-closure');
  mkdirSync(outDir, { recursive: true });
  const write = (name, payload) => writeFileSync(join(outDir, name), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const note = 'Non-authoritative projection of the source-controlled Volume 12 Package 3 corpus. Confers no ratification and authorizes no implementation, evidence acceptance, system release, or production.';

  const cov = (k) => coverage[k].map((r) => ({ id: r.id, kind: r.kind, title: r.title, statement: r.statement, prohibited_inference: r.prohibited_inference, downstream_gate: r.downstream_gate, chapter_ref: r.chapter_ref, future_gate: r.future_gate, validation_status: r.validation_status }));
  const req = (k) => requirements[k].map((r) => ({ id: r.id, kind: r.kind, title: r.title, statement: r.statement, prohibited_inference: r.prohibited_inference, chapter_ref: r.chapter_ref, future_gate: r.future_gate, validation_status: r.validation_status }));

  // 1. Integrated final-evidence, gate, acceptance, and release-definition baseline.
  write('integrated-final-evidence-gate-acceptance-and-release-baseline.json', {
    note,
    integrated_final_evidence_baseline: cov('INTEGRATED_FINAL_EVIDENCE_BASELINE'),
    final_evidence_requirements: req('FINAL_EVIDENCE_REQUIREMENT')
  });

  // 2. Whole-program requirement-to-evidence-to-acceptance traceability coverage.
  write('whole-program-requirement-evidence-acceptance-traceability.json', {
    note,
    whole_program_traceability_coverage: cov('WHOLE_PROGRAM_TRACEABILITY_COVERAGE')
  });

  // 3. Integrated program-gate matrix, criteria, authority, and escalation.
  write('integrated-program-gate-matrix-criteria-authority-and-escalation.json', {
    note,
    program_gate_matrix: cov('PROGRAM_GATE_MATRIX'),
    gate_evidence_requirements: req('GATE_EVIDENCE_REQUIREMENT')
  });

  // 4. Evidence status, sufficiency, acceptance, expiry, and revalidation ledger.
  write('evidence-status-sufficiency-acceptance-expiry-and-revalidation-ledger.json', {
    note,
    evidence_status_model: cov('EVIDENCE_STATUS_MODEL'),
    evidence_sufficiency_requirements: req('EVIDENCE_SUFFICIENCY_REQUIREMENT'),
    evidence_acceptance_requirements: req('EVIDENCE_ACCEPTANCE_REQUIREMENT'),
    evidence_revalidation_requirements: req('EVIDENCE_REVALIDATION_REQUIREMENT')
  });

  // 5. Findings, waivers, conditions, commitments, and release-blocker disposition.
  write('findings-waivers-conditions-commitments-and-release-blocker-disposition.json', {
    note,
    release_blocker_model: cov('RELEASE_BLOCKER_MODEL'),
    release_blocker_requirements: req('RELEASE_BLOCKER_REQUIREMENT'),
    material_commitment_evidence_requirements: req('MATERIAL_COMMITMENT_EVIDENCE_REQUIREMENT')
  });

  // 6. Cross-domain final-dossier composition and authoritative-source map.
  write('cross-domain-final-dossier-composition-and-authoritative-source-map.json', {
    note,
    final_dossier_model: cov('FINAL_DOSSIER_MODEL'),
    final_dossier_requirements: req('FINAL_DOSSIER_REQUIREMENT')
  });

  // 7. Affiliation release-candidate, acceptance, and release-decision synthesis.
  write('affiliation-release-candidate-acceptance-and-release-synthesis.json', {
    note,
    affiliation_acceptance_synthesis: cov('AFFILIATION_ACCEPTANCE_SYNTHESIS')
  });

  // 8. Independence, segregation, challenge, dissent, revocation, and reopening.
  write('independence-segregation-challenge-dissent-revocation-and-reopening.json', {
    note,
    independence_and_challenge_model: cov('INDEPENDENCE_AND_CHALLENGE_MODEL')
  });

  // 9. Executive decision brief and release-authorization record model.
  write('executive-decision-brief-and-release-authorization-record-model.json', {
    note,
    executive_decision_model: cov('EXECUTIVE_DECISION_MODEL'),
    executive_decision_evidence_requirements: req('EXECUTIVE_DECISION_EVIDENCE_REQUIREMENT')
  });

  // 10. Deployment, stabilization, rollback, and post-release obligation model.
  write('deployment-stabilization-rollback-and-post-release-obligation-model.json', {
    note,
    post_release_obligation_model: cov('POST_RELEASE_OBLIGATION_MODEL'),
    deployment_evidence_requirements: req('DEPLOYMENT_EVIDENCE_REQUIREMENT'),
    stabilization_evidence_requirements: req('STABILIZATION_EVIDENCE_REQUIREMENT')
  });

  // 11. Program-corpus closure and implementation-authorization handoff.
  write('program-corpus-closure-and-implementation-authorization-handoff.json', {
    note,
    implementation_authorization_handoff: cov('IMPLEMENTATION_AUTHORIZATION_HANDOFF'),
    corpus_release_decision: cov('CORPUS_RELEASE_DECISION'),
    implementation_authorization_input_requirements: req('IMPLEMENTATION_AUTHORIZATION_INPUT_REQUIREMENT'),
    corpus_release_record_requirements: req('CORPUS_RELEASE_RECORD_REQUIREMENT')
  });

  // 12. Whole-corpus unresolved disposition (Package 3 backlog).
  const backlog = records(ctx, 'REG-1204').filter((b) => /-V12-00[34]$/.test(b.id) && (b.traces_to ?? []).some((t) => /^V12-(2[2-9]|3[0-2])$/.test(t)));
  write('whole-corpus-unresolved-disposition.json', {
    note,
    unresolved: backlog.map((b) => ({ id: b.id, kind: b.kind, title: b.title, source: b.source, owner: b.owner, required_action_or_evidence: b.required_action_or_evidence, future_blocking_gate: b.future_blocking_gate, validation_status: b.validation_status }))
  });

  // 13. Volume 12 closure report (Markdown).
  const totalCoverage = Object.values(coverage).reduce((n, rows) => n + rows.length, 0);
  const totalRequirements = Object.values(requirements).reduce((n, rows) => n + rows.length, 0);
  const lines = [];
  lines.push('# Volume 12 Closure Report (non-authoritative projection)');
  lines.push('');
  lines.push(note);
  lines.push('');
  lines.push('## Consolidated Package 3 models');
  lines.push('');
  for (const k of COVERAGE_KINDS) lines.push(`- ${k}: ${coverage[k].length} record(s)`);
  lines.push('');
  lines.push('## Final-evidence and release requirements');
  lines.push('');
  for (const k of REQUIREMENT_KINDS) lines.push(`- ${k}: ${requirements[k].length} record(s)`);
  lines.push('');
  lines.push(`Total: ${totalCoverage} model record(s) and ${totalRequirements} requirement(s).`);
  lines.push('');
  lines.push('## Posture');
  lines.push('');
  lines.push('Definition completeness is not evidence availability. Documentary corpus release is');
  lines.push('not software release. Corpus closure is not implementation authorization, evidence');
  lines.push('acceptance, or production authority. No record in Volume 12 asserts that any evidence');
  lines.push('has been produced or accepted, that any acceptance or release gate beyond the Volume 12');
  lines.push('definition gates has passed, or that any system has been released.');
  lines.push('');
  writeFileSync(join(outDir, 'volume-12-closure-report.md'), lines.join('\n'), 'utf8');

  return { coverage: totalCoverage, requirements: totalRequirements };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Volume 12 Package 3 final-closure analysis', run);
}
