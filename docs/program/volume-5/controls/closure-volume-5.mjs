// Control: Volume 5 integrated governed-data closure projection (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown closure report describing
// the readiness of the complete Volume 5 governed-data definition consolidated
// from Packages 1 through 4. Non-authoritative: the source-controlled corpus and
// its recorded approvals remain the sole source of truth. These projections are
// rebuildable from the governed registers and authorize no implementation.

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

function byKind(items) {
  return countBy(items, 'kind');
}

function writeJson(dir, name, data) {
  writeFileSync(join(dir, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function project(ctx) {
  const catalogue = records(ctx, 'REG-501');
  const rules = records(ctx, 'REG-502');
  const decisions = records(ctx, 'REG-503');
  const backlog = records(ctx, 'REG-504');

  const of = (kind) => catalogue.filter((r) => r.kind === kind);
  const rulesOf = (kind) => rules.filter((r) => r.kind === kind);

  const domains = of('INFORMATION_DOMAIN');
  const conceptualEntities = of('CONCEPTUAL_ENTITY');
  const conceptualRelationships = of('CONCEPTUAL_RELATIONSHIP');
  const logicalEntities = of('LOGICAL_ENTITY');
  const logicalRelationships = of('LOGICAL_RELATIONSHIP');
  const physicalRelations = of('PHYSICAL_RELATION');

  // 1. Identifier counts.
  const identifierCounts = {
    registers: {
      catalogue: catalogue.length,
      rules_and_controls: rules.length,
      decisions: decisions.length,
      backlog: backlog.length
    },
    catalogue_by_kind: byKind(catalogue),
    rules_by_kind: byKind(rules),
    backlog_by_kind: byKind(backlog)
  };

  // 2. Domain authority and stewardship coverage.
  const domainAuthorityAndStewardshipCoverage = {
    total: domains.length,
    with_business_authority: domains.filter((d) => d.business_authority).length,
    with_system_of_record: domains.filter((d) => d.system_of_record_authority).length,
    with_steward: domains.filter((d) => d.data_steward).length,
    with_classification: domains.filter((d) => d.classification).length,
    without_business_authority: domains.filter((d) => !d.business_authority).map((d) => d.id),
    without_system_of_record: domains.filter((d) => !d.system_of_record_authority).map((d) => d.id),
    without_steward: domains.filter((d) => !d.data_steward).map((d) => d.id)
  };

  // 3. Conceptual-logical-physical traceability.
  const physicalWithoutLogicalSource = physicalRelations.filter((p) => !p.logical_source).map((p) => p.id);
  const physicalWithoutOwningDomain = physicalRelations.filter((p) => !p.owning_domain).map((p) => p.id);
  const logicalWithoutTrace = logicalEntities.filter((l) => !(l.traces_to && l.traces_to.length)).map((l) => l.id);
  const conceptualLogicalPhysicalTraceability = {
    conceptual_entities: conceptualEntities.length,
    conceptual_relationships: conceptualRelationships.length,
    logical_entities: logicalEntities.length,
    logical_relationships: logicalRelationships.length,
    physical_relations: physicalRelations.length,
    physical_without_logical_source: physicalWithoutLogicalSource,
    physical_without_owning_domain: physicalWithoutOwningDomain,
    logical_without_conceptual_trace: logicalWithoutTrace
  };

  // 4. Identity, relationship, and scope analysis.
  const identityRelationshipAndScopeAnalysis = {
    conceptual_entities: conceptualEntities.length,
    conceptual_relationships: conceptualRelationships.length,
    logical_relationships: logicalRelationships.length,
    value_objects: of('VALUE_OBJECT').length,
    composite_scope_keys: of('COMPOSITE_SCOPE_KEY').length,
    master_data_sets: of('MASTER_DATA_SET').length
  };

  // 5. Temporal, versioning, and lineage analysis.
  const temporalVersioningAndLineageAnalysis = {
    state_records: of('STATE_RECORD').length,
    snapshots: of('SNAPSHOT').length,
    correction_records: of('CORRECTION_RECORD').length,
    provenance_records: of('PROVENANCE_RECORD').length,
    lineage_rules: rulesOf('LINEAGE').length,
    lineage_rules_without_source: rulesOf('LINEAGE').filter((r) => !r.source).map((r) => r.id)
  };

  // 6. Evidence, decision, financial, and activation analysis.
  const integrityRules = rulesOf('INTEGRITY');
  const evidenceDecisionFinancialActivationAnalysis = {
    integrity_rules: integrityRules.length,
    integrity_rules_without_condition: integrityRules
      .filter((r) => !r.logical_condition)
      .map((r) => r.id),
    integrity_rules_without_affected_entities: integrityRules
      .filter((r) => !(r.affected_entities && r.affected_entities.length))
      .map((r) => r.id)
  };

  // 7. Reference data, quality, records, and lifecycle analysis.
  const qualityRules = rulesOf('QUALITY');
  const referenceQualityRecordsAndLifecycleAnalysis = {
    reference_data_sets: of('REFERENCE_DATA_SET').length,
    code_sets: of('CODE_SET').length,
    controlled_terms: of('CONTROLLED_TERM').length,
    quality_rules: qualityRules.length,
    quality_rules_without_correction_authority: qualityRules
      .filter((r) => !r.correction_authority)
      .map((r) => r.id),
    data_lifecycle_records: of('DATA_LIFECYCLE').length,
    retention_dependencies: of('RETENTION_DEPENDENCY').length,
    data_issues: of('DATA_ISSUE').length,
    stewardship_measures: of('STEWARDSHIP_MEASURE').length
  };

  // 8. Physical integrity and index analysis.
  const physicalIntegrityAndIndexAnalysis = {
    physical_relations: physicalRelations.length,
    foreign_keys: of('FOREIGN_KEY').length,
    unique_constraints: of('UNIQUE_CONSTRAINT').length,
    check_constraints: of('CHECK_CONSTRAINT').length,
    alternate_keys: of('ALTERNATE_KEY').length,
    index_requirements: of('INDEX_REQUIREMENT').length,
    partition_requirements: of('PARTITION_REQUIREMENT').length,
    audit_relations: of('AUDIT_RELATION').length,
    outbox_relations: of('OUTBOX_RELATION').length,
    integrity_rules: integrityRules.length
  };

  // 9. Migration, reconciliation, and exchange analysis.
  const migrationReconciliationAndExchangeAnalysis = {
    staging_relations: of('STAGING_RELATION').length,
    quarantine_relations: of('QUARANTINE_RELATION').length,
    exchange_records: of('EXCHANGE_RECORD').length,
    reconciliation_contexts: of('RECONCILIATION_CONTEXT').length,
    data_uses: of('DATA_USE').length
  };

  // 10. Projection, analytics, and export analysis.
  const dataProducts = of('DATA_PRODUCT');
  const derivedProducts = of('DERIVED_DATA_PRODUCT');
  const projectionAnalyticsAndExportAnalysis = {
    data_products: dataProducts.length,
    derived_data_products: derivedProducts.length,
    materialized_projections: of('MATERIALIZED_PROJECTION').length,
    database_views: of('DATABASE_VIEW').length,
    data_products_without_source: dataProducts.filter((p) => !p.authoritative_source).map((p) => p.id),
    derived_products_without_source: derivedProducts
      .filter((p) => !p.authoritative_source && !p.derived_from)
      .map((p) => p.id),
    all_non_authoritative: dataProducts
      .concat(derivedProducts)
      .every((p) => p.authorizes_implementation === false)
  };

  // 11. House P0 data coverage (documentary; every physical structure is
  // data-defined and recorded as not implemented and not proven).
  const houseP0DataCoverage = {
    physical_relations: physicalRelations.length,
    by_implementation_status: countBy(physicalRelations, 'implementation_status'),
    by_verification_class: countBy(physicalRelations, 'verification_class'),
    physical_relations_implemented_or_proven: physicalRelations.filter(
      (p) => p.implementation_status && !/PENDING|NOT_IMPLEMENTED|NOT_PROVEN/.test(p.implementation_status)
    ).map((p) => p.id),
    integrity_rules_supporting_findings: integrityRules.length
  };

  // 12. Downstream handoff coverage.
  const validationItems = backlog.filter((b) => b.kind === 'VALIDATION');
  const downstreamHandoffCoverage = {
    validation_items: validationItems.length,
    by_future_blocking_gate: countBy(validationItems, 'future_blocking_gate'),
    by_target: countBy(validationItems, 'target_package_or_volume'),
    validation_items_naming_v5_g5: validationItems
      .filter((b) => b.future_blocking_gate === 'V5-G5')
      .map((b) => b.id)
  };

  // 13. Unresolved readiness register.
  const unresolvedReadinessRegister = {
    total: backlog.length,
    assumptions: backlog.filter((b) => b.kind === 'ASM').map((b) => ({ id: b.id, title: b.title, owner: b.owner, future_blocking_gate: b.future_blocking_gate ?? null })),
    risks: backlog.filter((b) => b.kind === 'RISK').map((b) => ({ id: b.id, title: b.title, owner: b.owner, future_blocking_gate: b.future_blocking_gate ?? null })),
    exceptions: backlog.filter((b) => b.kind === 'EXC').map((b) => ({ id: b.id, title: b.title, owner: b.owner, future_blocking_gate: b.future_blocking_gate ?? null })),
    validations: validationItems.map((b) => ({ id: b.id, title: b.title, owner: b.owner, future_blocking_gate: b.future_blocking_gate ?? null })),
    validations_without_owner: validationItems.filter((b) => !b.owner).map((b) => b.id),
    validations_without_gate: validationItems.filter((b) => !b.future_blocking_gate).map((b) => b.id)
  };

  // Authorization invariant across all registers.
  const authorizationInvariants = {
    catalogue_authorizing_implementation: catalogue.filter((r) => r.authorizes_implementation === true).length,
    rules_authorizing_implementation: rules.filter((r) => r.authorizes_implementation === true).length,
    decisions_authorizing_implementation: decisions.filter((r) => r.authorizes_implementation === true).length,
    backlog_authorizing_implementation: backlog.filter((r) => r.authorizes_implementation === true).length
  };

  return {
    identifierCounts,
    domainAuthorityAndStewardshipCoverage,
    conceptualLogicalPhysicalTraceability,
    identityRelationshipAndScopeAnalysis,
    temporalVersioningAndLineageAnalysis,
    evidenceDecisionFinancialActivationAnalysis,
    referenceQualityRecordsAndLifecycleAnalysis,
    physicalIntegrityAndIndexAnalysis,
    migrationReconciliationAndExchangeAnalysis,
    projectionAnalyticsAndExportAnalysis,
    houseP0DataCoverage,
    downstreamHandoffCoverage,
    unresolvedReadinessRegister,
    authorizationInvariants
  };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'closure');
  mkdirSync(outDir, { recursive: true });

  writeJson(outDir, 'identifier-counts.json', p.identifierCounts);
  writeJson(outDir, 'domain-authority-and-stewardship-coverage.json', p.domainAuthorityAndStewardshipCoverage);
  writeJson(outDir, 'conceptual-logical-physical-traceability.json', p.conceptualLogicalPhysicalTraceability);
  writeJson(outDir, 'identity-relationship-and-scope-analysis.json', p.identityRelationshipAndScopeAnalysis);
  writeJson(outDir, 'temporal-versioning-and-lineage-analysis.json', p.temporalVersioningAndLineageAnalysis);
  writeJson(outDir, 'evidence-decision-financial-activation-analysis.json', p.evidenceDecisionFinancialActivationAnalysis);
  writeJson(outDir, 'reference-quality-records-and-lifecycle-analysis.json', p.referenceQualityRecordsAndLifecycleAnalysis);
  writeJson(outDir, 'physical-integrity-and-index-analysis.json', p.physicalIntegrityAndIndexAnalysis);
  writeJson(outDir, 'migration-reconciliation-and-exchange-analysis.json', p.migrationReconciliationAndExchangeAnalysis);
  writeJson(outDir, 'projection-analytics-and-export-analysis.json', p.projectionAnalyticsAndExportAnalysis);
  writeJson(outDir, 'house-p0-data-coverage.json', p.houseP0DataCoverage);
  writeJson(outDir, 'downstream-handoff-coverage.json', p.downstreamHandoffCoverage);
  writeJson(outDir, 'unresolved-readiness-register.json', p.unresolvedReadinessRegister);

  const totalAuthorizing = Object.values(p.authorizationInvariants).reduce((a, b) => a + b, 0);
  const t = p.conceptualLogicalPhysicalTraceability;
  const d = p.domainAuthorityAndStewardshipCoverage;
  const h = p.downstreamHandoffCoverage;

  const report = `# Volume 5 Integrated Governed-Data Closure Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 5 corpus consolidated from
> Packages 1 through 4. Not a source of truth and not a basis for ratification.
> Volume 5 defines governed DATA only; it authorizes no implementation, executable
> schema, migration, pipeline, infrastructure, procurement, retention period, or
> master development plan. These projections are rebuildable from the governed
> registers.

## Identifier counts

| Register | Count |
| --- | --- |
| Catalogue (REG-501) | ${p.identifierCounts.registers.catalogue} |
| Rules and controls (REG-502) | ${p.identifierCounts.registers.rules_and_controls} |
| Decisions (REG-503) | ${p.identifierCounts.registers.decisions} |
| Backlog (REG-504) | ${p.identifierCounts.registers.backlog} |

## Domain authority and stewardship coverage

- Domains total: ${d.total}
- With business authority: ${d.with_business_authority}
- With system-of-record authority: ${d.with_system_of_record}
- With data steward: ${d.with_steward}
- Without business authority (must be 0): ${d.without_business_authority.length}
- Without system-of-record authority (must be 0): ${d.without_system_of_record.length}
- Without data steward (must be 0): ${d.without_steward.length}

## Conceptual-logical-physical traceability

- Conceptual entities: ${t.conceptual_entities}
- Logical entities: ${t.logical_entities}
- Physical relations: ${t.physical_relations}
- Physical without a logical source (must be 0): ${t.physical_without_logical_source.length}
- Physical without an owning domain (must be 0): ${t.physical_without_owning_domain.length}
- Logical without a conceptual trace (must be 0): ${t.logical_without_conceptual_trace.length}

## Downstream handoff coverage

- Validation items: ${h.validation_items}
- Validation items still naming Gate V5-G5 (must be 0): ${h.validation_items_naming_v5_g5.length}

## House P0 data coverage

- Physical relations: ${p.houseP0DataCoverage.physical_relations}
- Physical relations recorded as implemented or proven (must be 0): ${p.houseP0DataCoverage.physical_relations_implemented_or_proven.length}

## Authorization posture

- Records authorizing implementation across all registers: ${totalAuthorizing} (must be 0)
`;
  writeFileSync(join(outDir, 'volume-5-closure-report.md'), report, 'utf8');
  return outDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = generate();
  console.log(`Volume 5 integrated closure projections written to ${outDir}`);
}
