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

  // ---- Package 5: integrated architecture coverage projections (non-authoritative) ----
  const countBy = (items, key) => {
    const out = {};
    for (const it of items) {
      const v = it[key] ?? 'UNSET';
      out[v] = (out[v] ?? 0) + 1;
    }
    return out;
  };

  const architectureElementCoverage = {
    by_kind: countBy(architecture, 'kind'),
    by_architecture_status: countBy(architecture, 'architecture_status'),
    by_authority: countBy(architecture, 'authority'),
    by_verification_status: countBy(architecture, 'verification_status')
  };

  const flowEls = architecture.filter((e) => e.kind === 'MOD' || e.kind === 'SVC');
  const elementIds = new Set(architecture.map((e) => e.id));
  const moduleAndDependencyAnalysis = {
    module_count: architecture.filter((e) => e.kind === 'MOD').length,
    service_count: architecture.filter((e) => e.kind === 'SVC').length,
    dependencies: computeDependencies(flowEls, elementIds)
  };

  const authorityBoundaryAnalysis = {
    by_authority: countBy(architecture, 'authority'),
    elements_without_authority: architecture
      .filter((e) => !e.authority)
      .map((e) => e.id)
  };

  const adrCoverage = {
    by_class: countBy(decisions, 'class'),
    by_validation_status: countBy(decisions, 'validation_status'),
    authorizing_implementation: decisions
      .filter((d) => d.authorizes_implementation === true)
      .map((d) => d.id),
    without_evidence: decisions
      .filter((d) => !(d.evidence_refs?.length))
      .map((d) => d.id)
  };

  const fitnessFunctionCoverage = {
    by_verification_class: countBy(fitness, 'verification_class'),
    implemented: fitness.filter((f) => f.implemented === true).map((f) => f.id),
    authorizing_implementation: fitness
      .filter((f) => f.authorizes_implementation === true)
      .map((f) => f.id),
    with_house_p0_ref: fitness.filter((f) => f.house_p0_ref).map((f) => f.id)
  };

  const qualityAndControlCoverage = {
    nfr_quality_attributes: attributeCoverage,
    control_elements: architecture
      .filter((e) => e.kind === 'CTRL')
      .map((e) => ({ id: e.id, verification_status: e.verification_status ?? 'UNSET' }))
  };

  const gapEntry = (a) => ({
    id: a.id,
    kind: a.kind,
    title: a.title,
    owner: a.owner,
    resolution_gate: a.resolution_gate
  });
  const assumptionRiskGapRegister = {
    assumptions: assumptions.filter((a) => a.kind === 'ASM').map(gapEntry),
    risks: assumptions.filter((a) => a.kind === 'RISK').map(gapEntry),
    exceptions: assumptions.filter((a) => a.kind === 'EXC').map(gapEntry)
  };

  const houseP0Groups = {};
  for (const f of fitness) {
    if (!f.house_p0_ref) continue;
    (houseP0Groups[f.house_p0_ref] ??= []).push(f.id);
  }
  const houseP0Coverage = { by_house_p0_ref: houseP0Groups };

  const downstreamHandoffCoverage = {
    downstream_elements: architecture
      .filter((e) => e.chapter_ref === 'V4-47')
      .map((e) => ({ id: e.id, kind: e.kind, authority: e.authority }))
  };

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
    openRisks,
    architectureElementCoverage,
    moduleAndDependencyAnalysis,
    authorityBoundaryAnalysis,
    adrCoverage,
    fitnessFunctionCoverage,
    qualityAndControlCoverage,
    assumptionRiskGapRegister,
    houseP0Coverage,
    downstreamHandoffCoverage
  };
}

function computeDependencies(flowEls, elementIds) {
  const deps = [];
  for (const e of flowEls) {
    for (const target of e.traces_to ?? []) {
      if (elementIds.has(target)) {
        deps.push({ from: e.id, to: target });
      }
    }
  }
  return deps;
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
  writeJson(outDir, 'architecture-element-coverage.json', p.architectureElementCoverage);
  writeJson(outDir, 'module-and-dependency-analysis.json', p.moduleAndDependencyAnalysis);
  writeJson(outDir, 'authority-boundary-analysis.json', p.authorityBoundaryAnalysis);
  writeJson(outDir, 'adr-coverage.json', p.adrCoverage);
  writeJson(outDir, 'fitness-function-coverage.json', p.fitnessFunctionCoverage);
  writeJson(outDir, 'quality-and-control-coverage.json', p.qualityAndControlCoverage);
  writeJson(outDir, 'assumption-risk-gap-register.json', p.assumptionRiskGapRegister);
  writeJson(outDir, 'house-p0-coverage.json', p.houseP0Coverage);
  writeJson(outDir, 'downstream-handoff-coverage.json', p.downstreamHandoffCoverage);

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
