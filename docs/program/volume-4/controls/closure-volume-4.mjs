// Control: Volume 4 architecture-foundation closure projection (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown closure report describing
// the readiness of the Volume 4 Package 1 architecture foundation: coverage of
// quality attributes, control-to-fitness coverage, decision verification status,
// and the open-assumption backlog. Non-authoritative: the corpus and its recorded
// approvals remain the source of truth.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, loadContext } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

function writeJson(dir, name, data) {
  writeFileSync(join(dir, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function project(ctx) {
  const architecture = records(ctx, 'REG-401');
  const decisions = records(ctx, 'REG-402');
  const fitness = records(ctx, 'REG-403');
  const assumptions = records(ctx, 'REG-404');

  const nfr = architecture.filter((e) => e.kind === 'NFR');
  const attributeCoverage = {};
  for (const n of nfr) {
    for (const qa of n.quality_attributes ?? []) {
      attributeCoverage[qa] = (attributeCoverage[qa] ?? 0) + 1;
    }
  }

  const architectureStatusCounts = {};
  for (const e of architecture) {
    architectureStatusCounts[e.architecture_status] =
      (architectureStatusCounts[e.architecture_status] ?? 0) + 1;
  }

  const decisionStatusCounts = {};
  for (const d of decisions) {
    const s = d.validation_status ?? 'UNSET';
    decisionStatusCounts[s] = (decisionStatusCounts[s] ?? 0) + 1;
  }

  const fitnessImplemented = fitness.filter((f) => f.implemented === true).length;
  const decisionsAuthorizing = decisions.filter((d) => d.authorizes_implementation === true).length;
  const elementsAuthorizing = architecture.filter((e) => e.authorizes_implementation === true).length;

  const openAssumptions = assumptions
    .filter((a) => a.kind === 'ASM')
    .map((a) => ({ id: a.id, title: a.title, owner: a.owner, resolution_gate: a.resolution_gate }));
  const openRisks = assumptions
    .filter((a) => a.kind === 'RISK')
    .map((a) => ({ id: a.id, title: a.title, owner: a.owner, resolution_gate: a.resolution_gate }));

  return {
    identifierCounts: {
      architecture_elements: architecture.length,
      nfr_elements: nfr.length,
      decisions: decisions.length,
      fitness_functions: fitness.length,
      assumptions_risks_exceptions: assumptions.length
    },
    attributeCoverage,
    architectureStatusCounts,
    decisionStatusCounts,
    authorizationInvariants: {
      elements_authorizing_implementation: elementsAuthorizing,
      decisions_authorizing_implementation: decisionsAuthorizing,
      fitness_functions_implemented: fitnessImplemented
    },
    openAssumptions,
    openRisks
  };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'closure');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'identifier-counts.json', p.identifierCounts);
  writeJson(outDir, 'quality-attribute-coverage.json', p.attributeCoverage);
  writeJson(outDir, 'architecture-status-coverage.json', p.architectureStatusCounts);
  writeJson(outDir, 'decision-verification-coverage.json', p.decisionStatusCounts);
  writeJson(outDir, 'authorization-invariants.json', p.authorizationInvariants);
  writeJson(outDir, 'assumption-backlog.json', { assumptions: p.openAssumptions, risks: p.openRisks });

  const report = `# Volume 4 Architecture-Foundation Closure Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 4 corpus. Not a source of
> truth and not a basis for ratification. Volume 4 Package 1 defines TARGET
> architecture only; it authorizes no implementation, procurement, provisioning,
> delivery sequencing, staffing, or cost.

## Identifier counts

| Category | Count |
| --- | --- |
| Architecture elements | ${p.identifierCounts.architecture_elements} |
| Quality-attribute (NFR) elements | ${p.identifierCounts.nfr_elements} |
| Architecture decisions | ${p.identifierCounts.decisions} |
| Fitness functions | ${p.identifierCounts.fitness_functions} |
| Assumptions / risks / exceptions | ${p.identifierCounts.assumptions_risks_exceptions} |

## Quality-attribute coverage

| Quality attribute | NFR elements |
| --- | --- |
${Object.entries(p.attributeCoverage).sort().map(([k, v]) => `| ${k} | ${v} |`).join('\n') || '| (none) | 0 |'}

## Architecture status

| Status | Count |
| --- | --- |
${Object.entries(p.architectureStatusCounts).sort().map(([k, v]) => `| ${k} | ${v} |`).join('\n') || '| (none) | 0 |'}

## Decision verification status

| Verification status | Count |
| --- | --- |
${Object.entries(p.decisionStatusCounts).sort().map(([k, v]) => `| ${k} | ${v} |`).join('\n') || '| (none) | 0 |'}

## Authorization invariants (all must be 0)

- Architecture elements authorizing implementation: ${p.authorizationInvariants.elements_authorizing_implementation}
- Decisions authorizing implementation: ${p.authorizationInvariants.decisions_authorizing_implementation}
- Fitness functions claimed implemented: ${p.authorizationInvariants.fitness_functions_implemented}

## Open assumptions (owner and resolution gate)

${p.openAssumptions.length === 0 ? '- (none)' : p.openAssumptions.map((a) => `- ${a.id} (${a.owner}, ${a.resolution_gate}): ${a.title}`).join('\n')}

## Open risks (owner and resolution gate)

${p.openRisks.length === 0 ? '- (none)' : p.openRisks.map((a) => `- ${a.id} (${a.owner}, ${a.resolution_gate}): ${a.title}`).join('\n')}
`;
  writeFileSync(join(outDir, 'volume-4-closure-report.md'), report, 'utf8');
  return outDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = generate();
  console.log(`Volume 4 closure projections written to ${outDir}`);
}
