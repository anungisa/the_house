// Control: Volume 4 architecture traceability projection (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown report describing how the
// Volume 4 architecture corpus traces to inherited Volume 1-3 requirements and
// operating constraints, and how architecture elements, decisions, fitness
// functions, and assumptions relate. The corpus remains authoritative.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  VOLUME_DIR,
  ARCHITECTURE_CHAIN,
  isInheritedRef,
  loadContext
} from './lib.mjs';

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
  const approvals = records(ctx, 'REG-405');

  const identifierCounts = {
    chapters: ctx.chapters.length,
    architecture_elements: architecture.length,
    decisions: decisions.length,
    fitness_functions: fitness.length,
    assumptions_risks_exceptions: assumptions.length,
    approvals: approvals.length
  };

  const byKind = {};
  for (const kind of ARCHITECTURE_CHAIN) byKind[kind] = 0;
  for (const el of architecture) {
    byKind[el.kind] = (byKind[el.kind] ?? 0) + 1;
  }

  const inheritedTraceCoverage = architecture.map((el) => {
    const inherited = (el.traces_to ?? []).filter((t) => isInheritedRef(t));
    return {
      id: el.id,
      kind: el.kind,
      authority: el.authority,
      traces_to_inherited: inherited,
      traces_to_local: (el.traces_to ?? []).filter((t) => !isInheritedRef(t)),
      inherited_trace_present: inherited.length > 0
    };
  });

  const orphanElements = inheritedTraceCoverage
    .filter((e) => !e.inherited_trace_present && e.kind !== 'ARCH')
    .map((e) => e.id);

  const authorityCoverage = {};
  for (const el of architecture) {
    authorityCoverage[el.authority] = (authorityCoverage[el.authority] ?? 0) + 1;
  }

  const decisionAuthorization = {
    total: decisions.length,
    authorizing_implementation: decisions.filter((d) => d.authorizes_implementation === true).length
  };

  return {
    identifierCounts,
    byKind,
    inheritedTraceCoverage,
    orphanElements,
    authorityCoverage,
    decisionAuthorization
  };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'traceability');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'identifier-counts.json', p.identifierCounts);
  writeJson(outDir, 'element-kind-coverage.json', p.byKind);
  writeJson(outDir, 'inherited-trace-coverage.json', p.inheritedTraceCoverage);
  writeJson(outDir, 'orphan-analysis.json', { orphan_elements: p.orphanElements });
  writeJson(outDir, 'authority-coverage.json', p.authorityCoverage);

  const report = `# Volume 4 Architecture Traceability Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 4 corpus. Not a source of
> truth and not a basis for ratification. Volume 4 Package 1 defines TARGET
> architecture only; it authorizes no implementation.

## Identifier counts

| Category | Count |
| --- | --- |
| Chapters | ${p.identifierCounts.chapters} |
| Architecture elements | ${p.identifierCounts.architecture_elements} |
| Architecture decisions | ${p.identifierCounts.decisions} |
| Fitness functions | ${p.identifierCounts.fitness_functions} |
| Assumptions / risks / exceptions | ${p.identifierCounts.assumptions_risks_exceptions} |
| Approvals | ${p.identifierCounts.approvals} |

## Architecture elements by kind

| Kind | Count |
| --- | --- |
${ARCHITECTURE_CHAIN.map((k) => `| ${k} | ${p.byKind[k] ?? 0} |`).join('\n')}

## Authority coverage

| Authority | Elements |
| --- | --- |
${Object.entries(p.authorityCoverage).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Elements without an inherited trace (excluding ARCH principles)

${p.orphanElements.length === 0 ? '- (none)' : p.orphanElements.map((id) => `- ${id}`).join('\n')}

## Decision authorization posture

- Decisions total: ${p.decisionAuthorization.total}
- Decisions authorizing implementation: ${p.decisionAuthorization.authorizing_implementation} (must be 0)
`;
  writeFileSync(join(outDir, 'volume-4-traceability-report.md'), report, 'utf8');
  return outDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = generate();
  console.log(`Volume 4 traceability projections written to ${outDir}`);
}
