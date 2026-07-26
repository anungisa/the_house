// Control: Volume 5 data-governance traceability projection (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown report describing the shape
// of the Volume 5 conceptual information corpus: catalogue counts by kind, domain
// authority coverage, rule/quality/lineage coverage, classification coverage, and
// how conceptual entities/relationships/rules trace to governed domains and
// inherited Volume 1-4 constraints. The corpus remains authoritative.

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

export function project(ctx) {
  const catalogue = records(ctx, 'REG-501');
  const rules = records(ctx, 'REG-502');
  const decisions = records(ctx, 'REG-503');
  const backlog = records(ctx, 'REG-504');
  const approvals = records(ctx, 'REG-505');

  const domains = catalogue.filter((r) => r.kind === 'INFORMATION_DOMAIN');
  const entities = catalogue.filter((r) => r.kind === 'CONCEPTUAL_ENTITY');
  const relationships = catalogue.filter((r) => r.kind === 'CONCEPTUAL_RELATIONSHIP');
  const products = catalogue.filter((r) => r.kind === 'DATA_PRODUCT');
  const classifications = catalogue.filter((r) => r.kind === 'CLASSIFICATION');

  const identifierCounts = {
    chapters: ctx.chapters.length,
    information_domains: domains.length,
    conceptual_entities: entities.length,
    conceptual_relationships: relationships.length,
    data_products: products.length,
    classifications: classifications.length,
    rules_and_controls: rules.length,
    decisions: decisions.length,
    backlog_items: backlog.length,
    approvals: approvals.length
  };

  const domainAuthorityCoverage = {
    by_business_authority: countBy(domains, 'business_authority'),
    by_system_of_record_authority: countBy(domains, 'system_of_record_authority'),
    by_classification: countBy(domains, 'classification')
  };

  const ruleCoverage = {
    by_kind: countBy(rules, 'kind'),
    by_quality_dimension: countBy(rules.filter((r) => r.kind === 'QUALITY'), 'quality_dimension')
  };

  const inheritedTraceCoverage = catalogue.map((r) => {
    const traces = r.traces_to ?? [];
    return {
      id: r.id,
      kind: r.kind,
      traces_to_inherited: traces.filter((t) => isInheritedRef(t)),
      traces_to_local: traces.filter((t) => !isInheritedRef(t))
    };
  });

  const authorizationInvariants = {
    catalogue_authorizing_implementation: catalogue.filter((r) => r.authorizes_implementation === true).map((r) => r.id),
    rules_authorizing_implementation: rules.filter((r) => r.authorizes_implementation === true).map((r) => r.id),
    decisions_authorizing_implementation: decisions.filter((r) => r.authorizes_implementation === true).map((r) => r.id),
    backlog_authorizing_implementation: backlog.filter((r) => r.authorizes_implementation === true).map((r) => r.id)
  };

  return {
    identifierCounts,
    domainAuthorityCoverage,
    ruleCoverage,
    classificationCoverage: countBy(classifications, 'id'),
    inheritedTraceCoverage,
    authorizationInvariants
  };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'traceability');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'identifier-counts.json', p.identifierCounts);
  writeJson(outDir, 'domain-authority-coverage.json', p.domainAuthorityCoverage);
  writeJson(outDir, 'rule-coverage.json', p.ruleCoverage);
  writeJson(outDir, 'inherited-trace-coverage.json', p.inheritedTraceCoverage);
  writeJson(outDir, 'authorization-invariants.json', p.authorizationInvariants);

  const authorizing =
    p.authorizationInvariants.catalogue_authorizing_implementation.length +
    p.authorizationInvariants.rules_authorizing_implementation.length +
    p.authorizationInvariants.decisions_authorizing_implementation.length +
    p.authorizationInvariants.backlog_authorizing_implementation.length;

  const report = `# Volume 5 Data-Governance Traceability Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 5 corpus. Not a source of
> truth and not a basis for ratification. Volume 5 Package 1 defines DATA
> GOVERNANCE and CONCEPTUAL INFORMATION semantics only; it authorizes no
> implementation.

## Identifier counts

| Category | Count |
| --- | --- |
| Chapters | ${p.identifierCounts.chapters} |
| Information domains | ${p.identifierCounts.information_domains} |
| Conceptual entities | ${p.identifierCounts.conceptual_entities} |
| Conceptual relationships | ${p.identifierCounts.conceptual_relationships} |
| Data products | ${p.identifierCounts.data_products} |
| Classifications | ${p.identifierCounts.classifications} |
| Rules and controls | ${p.identifierCounts.rules_and_controls} |
| Decisions | ${p.identifierCounts.decisions} |
| Backlog items | ${p.identifierCounts.backlog_items} |
| Approvals | ${p.identifierCounts.approvals} |

## Domain business-authority coverage

| Authority | Domains |
| --- | --- |
${Object.entries(p.domainAuthorityCoverage.by_business_authority).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Rule coverage by kind

| Kind | Count |
| --- | --- |
${Object.entries(p.ruleCoverage.by_kind).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Authorization posture

- Records authorizing implementation: ${authorizing} (must be 0)
`;
  writeFileSync(join(outDir, 'volume-5-traceability-report.md'), report, 'utf8');
  return outDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = generate();
  console.log(`Volume 5 traceability projections written to ${outDir}`);
}
