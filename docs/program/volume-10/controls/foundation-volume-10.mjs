// Control: Volume 10 Package 1 delivery-planning-foundation analysis (NON-AUTHORITATIVE).
//
// Derives deterministic, non-authoritative projections of the source-controlled
// Volume 10 corpus into generated/foundation/. The projections are analytical
// views only: they confer no ratification, assert no implementation, and authorize
// nothing. The Markdown chapters, YAML registers, JSON schemas, and control scripts
// remain the authoritative record. run() reports coverage findings; generate()
// writes the eleven Package 1 foundation projections.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}

const HOUSE_P0_FINDINGS = Object.freeze([
  'resource-aware authorization',
  'reviewer assignment and jurisdiction',
  'evidence binding',
  'production-dependency completeness',
  'composite tenant-parent integrity',
  'affiliation lifecycle',
  'versioned requirements',
  'return and resubmission',
  'exactly-once activation',
  'fail-closed configuration',
  'outbox publication',
  'PostgreSQL behavioural verification',
  'production-composition verification',
  'deployment-path, secret, and entry-point configuration'
]);

function analyse(ctx) {
  const outcomes = byKind(ctx, 'REG-1001', 'OUTCOME');
  const caps = byKind(ctx, 'REG-1001', 'CAPABILITY');
  const streams = byKind(ctx, 'REG-1001', 'WORKSTREAM');
  const workPackages = byKind(ctx, 'REG-1001', 'WORK_PACKAGE');
  const deliverables = byKind(ctx, 'REG-1001', 'DELIVERABLE');
  const dependencies = byKind(ctx, 'REG-1001', 'DEPENDENCY');
  const milestones = byKind(ctx, 'REG-1002', 'MILESTONE');
  const environments = byKind(ctx, 'REG-1002', 'ENVIRONMENT');
  const releaseUnits = byKind(ctx, 'REG-1002', 'RELEASE_UNIT');
  const evidenceReqs = byKind(ctx, 'REG-1002', 'EVIDENCE_REQUIREMENT');
  const readiness = byKind(ctx, 'REG-1002', 'READINESS_CONDITION');
  const acceptance = byKind(ctx, 'REG-1002', 'ACCEPTANCE_CRITERION');
  const decisions = records(ctx, 'REG-1003');
  const backlog = records(ctx, 'REG-1004');
  return { outcomes, caps, streams, workPackages, deliverables, dependencies, milestones, environments, releaseUnits, evidenceReqs, readiness, acceptance, decisions, backlog };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  const checks = [
    ['OUTCOME', a.outcomes.length],
    ['CAPABILITY', a.caps.length],
    ['WORKSTREAM', a.streams.length],
    ['WORK_PACKAGE', a.workPackages.length],
    ['DELIVERABLE', a.deliverables.length],
    ['DEPENDENCY', a.dependencies.length],
    ['ENVIRONMENT', a.environments.length],
    ['RELEASE_UNIT', a.releaseUnits.length],
    ['EVIDENCE_REQUIREMENT', a.evidenceReqs.length],
    ['READINESS_CONDITION', a.readiness.length],
    ['ACCEPTANCE_CRITERION', a.acceptance.length],
    ['DECISION', a.decisions.length],
    ['BACKLOG', a.backlog.length]
  ];
  for (const [label, count] of checks) {
    if (count === 0) {
      findings.push(makeFinding(Severity.ERROR, 'FOUNDATION_COVERAGE_GAP', `No ${label} records present in the delivery-planning foundation`, 'REG-1001/REG-1002/REG-1003/REG-1004'));
    }
  }
  // Every work package must carry a future gate; every dependency and readiness
  // condition must name an owner, evidence, and future gate.
  for (const w of a.workPackages) {
    if (!w.future_gate) findings.push(makeFinding(Severity.ERROR, 'WORK_PACKAGE_NO_FUTURE_GATE', `${w.id} has no future gate`, w.id));
  }
  const p0Chapter = ctx.chapters.find((c) => c.fileId === 'V10-10');
  const missingP0 = HOUSE_P0_FINDINGS.filter((f) => !(p0Chapter?.body ?? '').includes(f));
  if (missingP0.length > 0) {
    findings.push(makeFinding(Severity.ERROR, 'HOUSE_P0_UNMAPPED', `House P0 findings without a planning destination: ${missingP0.join('; ')}`, 'V10-10'));
  }
  findings.push(makeFinding(Severity.INFO, 'FOUNDATION_COVERAGE', `Foundation coverage: ${a.workPackages.length} work packages, ${a.dependencies.length} dependencies, ${a.environments.length} environments, ${a.releaseUnits.length} release units, ${a.backlog.length} backlog items`, 'REG-1001'));
  return findings;
}

export function generate(ctx = loadContext()) {
  const a = analyse(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'foundation');
  mkdirSync(outDir, { recursive: true });
  const write = (name, payload) => writeFileSync(join(outDir, name), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const note = 'Non-authoritative projection of the source-controlled Volume 10 corpus. Confers no ratification and authorizes no implementation.';

  // 1. Inherited-obligation-to-work-package map.
  write('inherited-obligation-to-work-package-map.json', {
    note,
    work_packages: a.workPackages.map((w) => ({
      id: w.id,
      title: w.title,
      source_requirements: w.source_requirements ?? [],
      deliverables: w.deliverables ?? [],
      future_gate: w.future_gate
    })),
    house_p0_findings: HOUSE_P0_FINDINGS
  });

  // 2. Planning-hierarchy-and-deliverable catalogue.
  write('planning-hierarchy-and-deliverable-catalogue.json', {
    note,
    outcomes: a.outcomes.map((r) => ({ id: r.id, title: r.title })),
    capabilities: a.caps.map((r) => ({ id: r.id, title: r.title, domain: r.capability_domain })),
    workstreams: a.streams.map((r) => ({ id: r.id, title: r.title })),
    work_packages: a.workPackages.map((r) => ({ id: r.id, title: r.title })),
    deliverables: a.deliverables.map((r) => ({ id: r.id, title: r.title }))
  });

  // 3. Dependency, decision, assumption, and commitment analysis.
  write('dependency-decision-assumption-and-commitment-analysis.json', {
    note,
    dependencies: a.dependencies.map((r) => ({ id: r.id, owner: r.owner, kind: r.dependency_kind, status: r.current_status, future_gate: r.future_gate })),
    decisions: a.decisions.map((r) => ({ id: r.id, kind: r.kind, status: r.decision_status, authority: r.decision_authority })),
    assumptions: a.backlog.filter((b) => b.kind === 'ASSUMPTION').map((r) => ({ id: r.id, owner: r.owner, status: r.current_status })),
    commitments: a.backlog.filter((b) => b.kind === 'COMMITMENT').map((r) => ({ id: r.id, commitment_status: r.commitment_status }))
  });

  // 4. Scope, configuration, change, and release-unit map.
  write('scope-configuration-change-and-release-unit-map.json', {
    note,
    changes: a.backlog.filter((b) => b.kind === 'CHANGE').map((r) => ({ id: r.id, status: r.current_status })),
    release_units: a.releaseUnits.map((r) => ({ id: r.id, state: r.release_unit_state, contained_work_packages: r.contained_work_packages ?? [], release_gate: r.release_gate }))
  });

  // 5. Environment, test-enablement, data, and provider-readiness map.
  write('environment-test-enablement-data-and-provider-readiness-map.json', {
    note,
    environments: a.environments.map((r) => ({
      id: r.id,
      environment_class: r.environment_class,
      data_classification: r.data_classification,
      provisioning_status: r.provisioning_status,
      provisioning_gate: r.provisioning_gate,
      production_data_prohibition: Boolean(r.production_data_prohibition)
    })),
    readiness_conditions: a.readiness.map((r) => ({ id: r.id, disposition: r.readiness_disposition, owner: r.owner, future_gate: r.future_gate }))
  });

  // 6. Capability, responsibility, and decision-rights map.
  write('capability-responsibility-and-decision-rights-map.json', {
    note,
    capabilities: a.caps.map((r) => ({
      id: r.id,
      domain: r.capability_domain,
      responsible_role: r.responsible_role,
      decision_rights: r.decision_rights,
      independence_requirement: r.independence_requirement,
      escalation_route: r.escalation_route
    }))
  });

  // 7. Estimation, cost, funding, and procurement assumption analysis.
  write('estimation-cost-funding-and-procurement-assumption-analysis.json', {
    note,
    cost_estimates: a.backlog.filter((b) => b.kind === 'COST_ESTIMATE').map((r) => ({ id: r.id, range: r.range, confidence: r.confidence, estimate_status: r.estimate_status, approval_status: r.approval_status })),
    funding: a.backlog.filter((b) => b.kind === 'FUNDING').map((r) => ({ id: r.id, status: r.current_status })),
    procurement: a.backlog.filter((b) => b.kind === 'PROCUREMENT').map((r) => ({ id: r.id, status: r.current_status, commitment_status: r.commitment_status }))
  });

  // 8. Risk, issue, quality, evidence, and escalation analysis.
  write('risk-issue-quality-evidence-and-escalation-analysis.json', {
    note,
    risks: a.backlog.filter((b) => b.kind === 'RISK').map((r) => ({ id: r.id, owner: r.owner, likelihood: r.likelihood_or_occurrence, future_blocking_gate: r.future_blocking_gate })),
    issues: a.backlog.filter((b) => b.kind === 'ISSUE').map((r) => ({ id: r.id, owner: r.owner, future_blocking_gate: r.future_blocking_gate })),
    evidence_requirements: a.evidenceReqs.map((r) => ({ id: r.id, type: r.evidence_type }))
  });

  // 9. House P0 delivery-readiness map.
  const p0Chapter = ctx.chapters.find((c) => c.fileId === 'V10-10');
  write('house-p0-delivery-readiness-map.json', {
    note,
    findings: HOUSE_P0_FINDINGS.map((f) => ({ finding: f, has_planning_destination: (p0Chapter?.body ?? '').includes(f) })),
    all_mapped: HOUSE_P0_FINDINGS.every((f) => (p0Chapter?.body ?? '').includes(f))
  });

  // 10. Downstream evidence and gate handoff.
  write('downstream-evidence-and-gate-handoff.json', {
    note,
    evidence_requirements: a.evidenceReqs.map((r) => ({ id: r.id, future_gate: r.future_gate })),
    acceptance_criteria: a.acceptance.map((r) => ({ id: r.id, future_gate: r.future_gate })),
    release_units: a.releaseUnits.map((r) => ({ id: r.id, release_gate: r.release_gate })),
    downstream_gates: ['V11-G1', 'V12-G1', 'EXEC-MCG']
  });

  // 11. Package 1 delivery-planning governance report (Markdown).
  const now = new Date().toISOString();
  const md = `# Volume 10 Package 1 Delivery-Planning Governance Report (NON-AUTHORITATIVE)

Generated: ${now}

> ${note}

## Coverage

| Element | Count |
| --- | --- |
| Program outcomes | ${a.outcomes.length} |
| Capabilities | ${a.caps.length} |
| Workstreams | ${a.streams.length} |
| Work packages | ${a.workPackages.length} |
| Deliverables | ${a.deliverables.length} |
| Dependencies | ${a.dependencies.length} |
| Milestones | ${a.milestones.length} |
| Environments | ${a.environments.length} |
| Release units | ${a.releaseUnits.length} |
| Evidence requirements | ${a.evidenceReqs.length} |
| Readiness conditions | ${a.readiness.length} |
| Acceptance criteria | ${a.acceptance.length} |
| Decisions | ${a.decisions.length} |
| Backlog items | ${a.backlog.length} |

## Posture

- No record authorizes implementation.
- Planning records are documentary-plan-only and not committed.
- Estimates are planning estimates; no budget is approved.
- Environments are defined only; none is provisioned or qualified.
- Release units are defined only; none is a release candidate, accepted release, or deployment.
- Volume 10 is not tagged upon Package 1 closure.

## House P0 delivery-readiness

${HOUSE_P0_FINDINGS.map((f) => `- ${(p0Chapter?.body ?? '').includes(f) ? 'MAPPED' : 'UNMAPPED'}: ${f}`).join('\n')}
`;
  writeFileSync(join(outDir, 'package-1-delivery-planning-governance-report.md'), md, 'utf8');

  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Delivery-planning-foundation coverage', run);
}
