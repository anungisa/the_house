// Control: Volume 5 data-governance-foundation closure projection (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown closure report describing
// the readiness of the Volume 5 Package 1 data-governance foundation: information
// domain ownership completeness, classification coverage, quality/correction and
// lineage coverage, projection posture, the open validation backlog, and the
// authorization invariants. Non-authoritative: the corpus and its recorded
// approvals remain the source of truth.

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

export function project(ctx) {
  const catalogue = records(ctx, 'REG-501');
  const rules = records(ctx, 'REG-502');
  const decisions = records(ctx, 'REG-503');
  const backlog = records(ctx, 'REG-504');

  const domains = catalogue.filter((r) => r.kind === 'INFORMATION_DOMAIN');
  const entities = catalogue.filter((r) => r.kind === 'CONCEPTUAL_ENTITY');
  const relationships = catalogue.filter((r) => r.kind === 'CONCEPTUAL_RELATIONSHIP');
  const products = catalogue.filter((r) => r.kind === 'DATA_PRODUCT');
  const classifications = catalogue.filter((r) => r.kind === 'CLASSIFICATION');

  const domainOwnershipCompleteness = {
    total: domains.length,
    with_business_authority: domains.filter((d) => d.business_authority).length,
    with_system_of_record: domains.filter((d) => d.system_of_record_authority).length,
    with_steward: domains.filter((d) => d.data_steward).length,
    with_classification: domains.filter((d) => d.classification).length,
    without_owner: domains.filter((d) => !d.business_authority || !d.data_steward).map((d) => d.id)
  };

  const qualityCoverage = {
    quality_rules: rules.filter((r) => r.kind === 'QUALITY').length,
    quality_rules_without_authority: rules.filter((r) => r.kind === 'QUALITY' && !r.correction_authority).map((r) => r.id),
    lineage_rules: rules.filter((r) => r.kind === 'LINEAGE').length,
    lineage_rules_without_source: rules.filter((r) => r.kind === 'LINEAGE' && !r.source).map((r) => r.id),
    by_quality_dimension: countBy(rules.filter((r) => r.kind === 'QUALITY'), 'quality_dimension')
  };

  const projectionPosture = {
    data_products: products.length,
    products_without_source: products.filter((p) => !p.authoritative_source).map((p) => p.id),
    non_authoritative: products.every((p) => p.kind === 'DATA_PRODUCT')
  };

  const validationItems = backlog.filter((b) => b.kind === 'VALIDATION');
  const validationBacklog = {
    total: validationItems.length,
    without_owner: validationItems.filter((b) => !b.owner).map((b) => b.id),
    without_gate: validationItems.filter((b) => !b.future_blocking_gate).map((b) => b.id),
    by_target: countBy(validationItems, 'target_package_or_volume')
  };

  const openGaps = {
    assumptions: backlog.filter((b) => b.kind === 'ASM').map((b) => ({ id: b.id, title: b.title, owner: b.owner, future_blocking_gate: b.future_blocking_gate })),
    risks: backlog.filter((b) => b.kind === 'RISK').map((b) => ({ id: b.id, title: b.title, owner: b.owner, future_blocking_gate: b.future_blocking_gate })),
    exceptions: backlog.filter((b) => b.kind === 'EXC').map((b) => ({ id: b.id, title: b.title, owner: b.owner, future_blocking_gate: b.future_blocking_gate }))
  };

  const authorizationInvariants = {
    catalogue_authorizing_implementation: catalogue.filter((r) => r.authorizes_implementation === true).length,
    rules_authorizing_implementation: rules.filter((r) => r.authorizes_implementation === true).length,
    decisions_authorizing_implementation: decisions.filter((r) => r.authorizes_implementation === true).length,
    backlog_authorizing_implementation: backlog.filter((r) => r.authorizes_implementation === true).length
  };

  return {
    identifierCounts: {
      information_domains: domains.length,
      conceptual_entities: entities.length,
      conceptual_relationships: relationships.length,
      data_products: products.length,
      classifications: classifications.length,
      rules_and_controls: rules.length,
      decisions: decisions.length,
      backlog_items: backlog.length
    },
    domainOwnershipCompleteness,
    classificationCoverage: countBy(classifications, 'id'),
    qualityCoverage,
    projectionPosture,
    validationBacklog,
    openGaps,
    authorizationInvariants
  };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'closure');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'domain-ownership-completeness.json', p.domainOwnershipCompleteness);
  writeJson(outDir, 'quality-coverage.json', p.qualityCoverage);
  writeJson(outDir, 'projection-posture.json', p.projectionPosture);
  writeJson(outDir, 'validation-backlog.json', p.validationBacklog);
  writeJson(outDir, 'authorization-invariants.json', p.authorizationInvariants);

  const totalAuthorizing = Object.values(p.authorizationInvariants).reduce((a, b) => a + b, 0);

  const report = `# Volume 5 Data-Governance Closure Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 5 corpus. Not a source of
> truth and not a basis for ratification. Volume 5 Package 1 defines DATA
> GOVERNANCE and CONCEPTUAL INFORMATION semantics only; it authorizes no
> implementation, physical schema, migration, pipeline, infrastructure,
> procurement, delivery sequence, staffing, or cost.

## Identifier counts

| Category | Count |
| --- | --- |
| Information domains | ${p.identifierCounts.information_domains} |
| Conceptual entities | ${p.identifierCounts.conceptual_entities} |
| Conceptual relationships | ${p.identifierCounts.conceptual_relationships} |
| Data products | ${p.identifierCounts.data_products} |
| Classifications | ${p.identifierCounts.classifications} |
| Rules and controls | ${p.identifierCounts.rules_and_controls} |
| Decisions | ${p.identifierCounts.decisions} |
| Backlog items | ${p.identifierCounts.backlog_items} |

## Information-domain ownership completeness

- Domains total: ${p.domainOwnershipCompleteness.total}
- With business authority: ${p.domainOwnershipCompleteness.with_business_authority}
- With system-of-record authority: ${p.domainOwnershipCompleteness.with_system_of_record}
- With data steward: ${p.domainOwnershipCompleteness.with_steward}
- With classification: ${p.domainOwnershipCompleteness.with_classification}
- Without an owner (must be empty): ${p.domainOwnershipCompleteness.without_owner.length}

## Quality, correction, and lineage coverage

- Quality rules: ${p.qualityCoverage.quality_rules}
- Quality rules without correction authority (must be 0): ${p.qualityCoverage.quality_rules_without_authority.length}
- Lineage rules: ${p.qualityCoverage.lineage_rules}
- Lineage rules without source (must be 0): ${p.qualityCoverage.lineage_rules_without_source.length}

## Projection posture

- Data products: ${p.projectionPosture.data_products}
- Data products without an authoritative source (must be 0): ${p.projectionPosture.products_without_source.length}
- All products are non-authoritative projections: ${p.projectionPosture.non_authoritative}

## Validation backlog

- Validation items: ${p.validationBacklog.total}
- Without owner (must be 0): ${p.validationBacklog.without_owner.length}
- Without future blocking gate (must be 0): ${p.validationBacklog.without_gate.length}

## Authorization posture

- Records authorizing implementation across all registers: ${totalAuthorizing} (must be 0)
`;
  writeFileSync(join(outDir, 'volume-5-closure-report.md'), report, 'utf8');
  return outDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = generate();
  console.log(`Volume 5 closure projections written to ${outDir}`);
}
