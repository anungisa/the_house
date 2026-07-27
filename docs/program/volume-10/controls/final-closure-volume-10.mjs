// Control: Volume 10 final-closure projection corpus (deterministic, NON-AUTHORITATIVE).
//
// Projects the complete source-controlled Volume 10 corpus (Packages 1-3) into the
// thirteen final-closure projections under generated/final-closure/. These
// projections confer no ratification and authorize no implementation, expenditure,
// procurement, release, or deployment. The authoritative record remains the
// source-controlled chapters and registers.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}

const NOTE =
  'Non-authoritative projection of the source-controlled Volume 10 corpus (Packages 1-3). ' +
  'Confers no ratification and authorizes no implementation, expenditure, procurement, release, or deployment. ' +
  'Documentary and implementation-neutral.';

function analyse(ctx) {
  const backlog = records(ctx, 'REG-1004');
  return {
    masterPlan: byKind(ctx, 'REG-1001', 'MASTER_PLAN_OBJECTIVE'),
    edges: byKind(ctx, 'REG-1001', 'DEPENDENCY_EDGE'),
    capabilityDemands: byKind(ctx, 'REG-1001', 'CAPABILITY_DEMAND'),
    operationalCapabilities: byKind(ctx, 'REG-1001', 'OPERATIONAL_CAPABILITY'),
    p0Destinations: byKind(ctx, 'REG-1001', 'HOUSE_P0_DELIVERY_DESTINATION'),
    waves: byKind(ctx, 'REG-1002', 'IMPLEMENTATION_WAVE'),
    environmentReqs: byKind(ctx, 'REG-1002', 'ENVIRONMENT_ENABLEMENT_REQUIREMENT'),
    testEnablementReqs: byKind(ctx, 'REG-1002', 'TEST_ENABLEMENT_REQUIREMENT'),
    migrationReqs: byKind(ctx, 'REG-1002', 'MIGRATION_READINESS_REQUIREMENT'),
    decisions: records(ctx, 'REG-1003'),
    backlog,
    costEstimates: backlog.filter((b) => b.kind === 'COST_ESTIMATE'),
    funding: backlog.filter((b) => b.kind === 'FUNDING'),
    procurement: backlog.filter((b) => b.kind === 'PROCUREMENT'),
    risks: backlog.filter((b) => b.kind === 'RISK'),
    commitments: backlog.filter((b) => b.kind === 'COMMITMENT')
  };
}

export function run(ctx) {
  const a = analyse(ctx);
  return [makeFinding(
    Severity.INFO,
    'FINAL_CLOSURE_COVERAGE',
    `Final-closure coverage: ${a.masterPlan.length} master-plan objectives, ${a.edges.length} dependency edges, ${a.waves.length} implementation waves, ${a.capabilityDemands.length} capability demands, ${a.costEstimates.length} cost estimates, ${a.procurement.length} procurement contexts, ${a.operationalCapabilities.length} operational capabilities, ${a.p0Destinations.length} House P0 destinations`,
    'REG-1001'
  )];
}

export function generate(ctx = loadContext()) {
  const a = analyse(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'final-closure');
  mkdirSync(outDir, { recursive: true });
  const write = (name, payload) => writeFileSync(join(outDir, name), JSON.stringify(payload, null, 2) + '\n', 'utf8');

  write('integrated-master-development-plan.json', {
    note: NOTE, generated_from: 'REG-1001', objectives: a.masterPlan
  });
  write('work-package-sequence-and-dependency-graph.json', {
    note: NOTE, generated_from: 'REG-1001', dependency_edges: a.edges
  });
  write('critical-path-and-gate-analysis.json', {
    note: NOTE, generated_from: 'REG-1001',
    critical_path: a.edges.filter((e) => e.critical_path_status === 'ON_CRITICAL_PATH'),
    near_critical_path: a.edges.filter((e) => e.critical_path_status === 'NEAR_CRITICAL_PATH')
  });
  write('implementation-wave-and-release-roadmap.json', {
    note: NOTE, generated_from: 'REG-1002', waves: a.waves
  });
  write('capability-capacity-and-responsibility-model.json', {
    note: NOTE, generated_from: 'REG-1001', capability_demands: a.capabilityDemands
  });
  write('estimate-cost-contingency-and-funding-model.json', {
    note: NOTE, generated_from: 'REG-1004', estimates: a.costEstimates, funding: a.funding
  });
  write('procurement-readiness-and-commercial-decision-map.json', {
    note: NOTE, generated_from: 'REG-1004', procurement: a.procurement, funding: a.funding
  });
  write('environment-test-enablement-infrastructure-and-assurance-roadmap.json', {
    note: NOTE, generated_from: 'REG-1002',
    environment_requirements: a.environmentReqs, test_enablement_requirements: a.testEnablementReqs
  });
  write('migration-coexistence-cutover-and-rollback-roadmap.json', {
    note: NOTE, generated_from: 'REG-1002', migration_requirements: a.migrationReqs
  });
  write('operations-support-adoption-and-transition-roadmap.json', {
    note: NOTE, generated_from: 'REG-1001', operational_capabilities: a.operationalCapabilities
  });
  write('risk-decision-material-commitment-and-readiness-register.json', {
    note: NOTE, generated_from: 'REG-1003, REG-1004',
    decisions: a.decisions, risks: a.risks, material_commitments: a.commitments, backlog: a.backlog
  });

  const md = (name, text) => writeFileSync(join(outDir, name), text, 'utf8');
  md('executive-master-development-plan-brief.md',
    `# Volume 10 — Executive Master-Development-Plan Brief (projection)\n\n` +
    `> ${NOTE}\n\n` +
    `This projection mirrors chapter V10-31. It requests approval of the planning baseline only ` +
    `and requests no runtime implementation or release authorization.\n\n` +
    `- Master-plan objectives: ${a.masterPlan.length}\n` +
    `- Implementation waves (indicative): ${a.waves.length}\n` +
    `- Dependency edges: ${a.edges.length} (critical path: ${a.edges.filter((e) => e.critical_path_status === 'ON_CRITICAL_PATH').length})\n` +
    `- Capability demands: ${a.capabilityDemands.length}\n` +
    `- Planning cost estimates: ${a.costEstimates.length} (all PLANNING_ESTIMATE, NOT_APPROVED)\n` +
    `- Funding scenarios: ${a.funding.length}; procurement-readiness contexts: ${a.procurement.length} (all NOT_COMMITTED)\n` +
    `- Operational capabilities with Volume 11 destinations: ${a.operationalCapabilities.length}\n` +
    `- House P0 delivery destinations: ${a.p0Destinations.length}\n`);

  md('volume-10-closure-report.md',
    `# Volume 10 — Closure Report (projection)\n\n` +
    `> ${NOTE}\n\n` +
    `Volume 10 consolidates the delivery-planning corpus for the club-affiliation vertical across ` +
    `Packages 1, 2, and 3. This projection summarizes the final-closure state.\n\n` +
    `- Master-plan objectives: ${a.masterPlan.length}\n` +
    `- Dependency edges: ${a.edges.length}\n` +
    `- Implementation waves: ${a.waves.length}\n` +
    `- Capability demands: ${a.capabilityDemands.length}\n` +
    `- Cost estimates: ${a.costEstimates.length}\n` +
    `- Procurement-readiness contexts: ${a.procurement.length}\n` +
    `- Operational capabilities: ${a.operationalCapabilities.length}\n` +
    `- House P0 delivery destinations: ${a.p0Destinations.length}\n\n` +
    `No record authorizes implementation, expenditure, procurement, release, or deployment. ` +
    `Documentary completeness is distinct from implementation, operational, and commitment effectiveness.\n`);

  return { outputs: 13 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Volume 10 final-closure projection', run);
}
