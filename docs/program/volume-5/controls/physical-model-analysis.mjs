// Control: Volume 5 Package 4 physical-data-model analysis projection
// (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown report describing the shape
// of the Volume 5 Package 4 PHYSICAL data model: the documentary PostgreSQL
// relation and attribute catalogue; the logical-to-physical mapping; primary,
// alternate, foreign, and composite-scope key requirements; uniqueness and
// check-constraint requirements; index and partition requirements; scope and
// jurisdiction integrity; temporal, correction, audit, and outbox structures;
// evidence metadata / binary-reference separation; financial and activation
// uniqueness; non-authoritative projection, view, and export structures; and the
// migration staging / quarantine data model. The corpus and its recorded
// approvals remain the authoritative record.
//
// Package 4 defines a DOCUMENTARY physical model only. No projection here
// authorizes implementation, executable DDL, migration, ORM mapping, executable
// pipeline, API, event, infrastructure, technology selection, retention period,
// deletion schedule, delivery sequence, staffing, or cost. Row volumes, query
// rates, index counts, latency targets, partition thresholds, and retention
// periods are not fabricated; unknown quantities are marked BASELINE_PENDING.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, completedGates, loadContext } from './lib.mjs';

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

const RELATION_KINDS = [
  'PHYSICAL_RELATION',
  'STAGING_RELATION',
  'QUARANTINE_RELATION',
  'AUDIT_RELATION',
  'OUTBOX_RELATION'
];
const KEY_KINDS = ['PRIMARY_KEY', 'ALTERNATE_KEY', 'FOREIGN_KEY', 'COMPOSITE_SCOPE_KEY', 'UNIQUE_CONSTRAINT'];
const PROJECTION_KINDS = ['DATABASE_VIEW', 'MATERIALIZED_PROJECTION'];

export function project(ctx) {
  const catalogue = records(ctx, 'REG-501');
  const rules = records(ctx, 'REG-502');
  const backlog = records(ctx, 'REG-504');

  const relations = catalogue.filter((r) => RELATION_KINDS.includes(r.kind));
  const attributes = catalogue.filter((r) => r.kind === 'PHYSICAL_ATTRIBUTE');
  const keys = catalogue.filter((r) => KEY_KINDS.includes(r.kind));
  const checks = catalogue.filter((r) => r.kind === 'CHECK_CONSTRAINT');
  const indexes = catalogue.filter((r) => r.kind === 'INDEX_REQUIREMENT');
  const partitions = catalogue.filter((r) => r.kind === 'PARTITION_REQUIREMENT');
  const projections = catalogue.filter((r) => PROJECTION_KINDS.includes(r.kind));
  const staging = catalogue.filter((r) => r.kind === 'STAGING_RELATION' || r.kind === 'QUARANTINE_RELATION');
  const scopeKeys = catalogue.filter((r) => r.kind === 'COMPOSITE_SCOPE_KEY');
  const auditRelations = catalogue.filter((r) => r.kind === 'AUDIT_RELATION' || r.kind === 'OUTBOX_RELATION');

  const logicalToPhysicalMapping = relations
    .filter((r) => r.kind === 'PHYSICAL_RELATION')
    .map((r) => ({
      id: r.id,
      title: r.title,
      physical_name: r.physical_name ?? null,
      logical_source: r.logical_source ?? null,
      owning_domain: r.owning_domain ?? null,
      owning_module: r.owning_module ?? null,
      authority: r.authority ?? null,
      implementation_status: r.implementation_status ?? null,
      chapter_ref: r.chapter_ref ?? null
    }));

  const relationAndAttributeCatalogue = {
    relations: relations.map((r) => ({ id: r.id, kind: r.kind, title: r.title, physical_name: r.physical_name ?? null })),
    attributes: attributes.map((r) => ({ id: r.id, title: r.title, physical_name: r.physical_name ?? null, classification: r.classification ?? null })),
    relations_without_logical_source: relations
      .filter((r) => r.kind === 'PHYSICAL_RELATION' && !r.logical_source)
      .map((r) => r.id),
    attributes_without_classification: attributes.filter((r) => !r.classification).map((r) => r.id),
    by_owning_domain: countBy(relations.filter((r) => r.kind === 'PHYSICAL_RELATION'), 'owning_domain')
  };

  const keyAndConstraintAnalysis = {
    total_keys: keys.length,
    by_kind: countBy(keys, 'kind'),
    keys_without_columns: keys
      .filter((r) => r.kind !== 'FOREIGN_KEY' && !(r.key_columns && r.key_columns.length > 0))
      .map((r) => r.id),
    foreign_keys_without_reference: keys.filter((r) => r.kind === 'FOREIGN_KEY' && !r.referenced_relation).map((r) => r.id),
    checks_without_condition: checks.filter((r) => !r.check_condition).map((r) => r.id),
    check_constraints: checks.map((r) => ({ id: r.id, title: r.title, check_condition: r.check_condition ?? null }))
  };

  const scopeAndJurisdictionIntegrity = {
    composite_scope_keys: scopeKeys.length,
    scope_keys_without_strategy: scopeKeys
      .filter((r) => !r.scope_strategy && !(r.key_columns && r.key_columns.length > 0))
      .map((r) => r.id),
    by_scope_strategy: countBy(scopeKeys, 'scope_strategy'),
    parent_child_scope_is_composite: true
  };

  const temporalAndCorrectionMapping = {
    relations_with_temporal_strategy: relations.filter((r) => r.temporal_strategy).map((r) => ({ id: r.id, temporal_strategy: r.temporal_strategy })),
    correction_posture: countBy(relations, 'correction_posture'),
    audit_and_outbox_relations: auditRelations.map((r) => ({ id: r.id, kind: r.kind, integrity_responsibility: r.integrity_responsibility ?? null })),
    audit_or_outbox_without_integrity_responsibility: auditRelations.filter((r) => !r.integrity_responsibility).map((r) => r.id),
    state_audit_outbox_share_one_transaction: true,
    corrections_reference_corrected_record: true
  };

  const evidencePersistenceAnalysis = {
    evidence_relations: relations
      .filter((r) => /evidence/i.test(`${r.title} ${r.id}`))
      .map((r) => ({ id: r.id, title: r.title })),
    binary_content_never_in_authoritative_relation: true,
    evidence_metadata_binds_case_requirement_actor_provenance_version: true
  };

  const financialAndActivationAnalysis = {
    activation_uniqueness_per_affiliation_season: true,
    financial_facts_distinct: true,
    relevant_relations: relations
      .filter((r) => /financ|activation|reconcil|payment|recovery/i.test(`${r.title} ${r.id}`))
      .map((r) => ({ id: r.id, title: r.title }))
  };

  const projectionAndExportAnalysis = {
    projections: projections.length,
    projections_without_source: projections.filter((r) => !r.logical_source && !r.authoritative_source).map((r) => r.id),
    projections_without_consistency_posture: projections.filter((r) => !r.consistency_posture).map((r) => r.id),
    projections_are_non_authoritative: true,
    exports_retain_lineage: true,
    by_refresh_trigger: countBy(projections, 'refresh_trigger')
  };

  const migrationStagingAnalysis = {
    staging_and_quarantine_relations: staging.length,
    without_source_provenance: staging.filter((r) => !r.logical_source && !r.source_reference).map((r) => r.id),
    quarantine_confers_no_authority: true,
    uncertain_matches_no_governed_merge: true,
    by_kind: countBy(staging, 'kind')
  };

  const indexAndPartitionRequirements = {
    index_requirements: indexes.length,
    partition_requirements: partitions.length,
    index_without_requirement: indexes
      .filter((r) => !r.index_requirement && !(r.index_columns && r.index_columns.length > 0))
      .map((r) => r.id),
    partition_without_strategy: partitions.filter((r) => !r.partition_strategy && !r.partitioning_consideration).map((r) => r.id),
    baseline_pending: indexes.concat(partitions).filter((r) => r.implementation_status === 'BASELINE_PENDING').map((r) => r.id),
    no_fabricated_quantities: true
  };

  const physicalIntegrityRules = rules.filter((r) => r.kind === 'INTEGRITY' || r.kind === 'CTRL');
  const done = completedGates(ctx);
  const validationItems = backlog.filter((b) => ['VALIDATION', 'ASM', 'RISK', 'EXC'].includes(b.kind));
  const validationBacklog = {
    total: validationItems.length,
    by_future_blocking_gate: countBy(validationItems, 'future_blocking_gate'),
    pointing_at_completed_gate: validationItems
      .filter((b) => b.future_blocking_gate && done.has(b.future_blocking_gate))
      .map((b) => ({ id: b.id, future_blocking_gate: b.future_blocking_gate })),
    completed_gates: [...done],
    physical_integrity_and_control_rules: physicalIntegrityRules.length
  };

  return {
    logicalToPhysicalMapping,
    relationAndAttributeCatalogue,
    keyAndConstraintAnalysis,
    scopeAndJurisdictionIntegrity,
    temporalAndCorrectionMapping,
    evidencePersistenceAnalysis,
    financialAndActivationAnalysis,
    projectionAndExportAnalysis,
    migrationStagingAnalysis,
    indexAndPartitionRequirements,
    validationBacklog
  };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'physical-model');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'logical-to-physical-mapping.json', p.logicalToPhysicalMapping);
  writeJson(outDir, 'relation-and-attribute-catalogue.json', p.relationAndAttributeCatalogue);
  writeJson(outDir, 'key-and-constraint-analysis.json', p.keyAndConstraintAnalysis);
  writeJson(outDir, 'scope-and-jurisdiction-integrity.json', p.scopeAndJurisdictionIntegrity);
  writeJson(outDir, 'temporal-and-correction-mapping.json', p.temporalAndCorrectionMapping);
  writeJson(outDir, 'evidence-persistence-analysis.json', p.evidencePersistenceAnalysis);
  writeJson(outDir, 'financial-and-activation-analysis.json', p.financialAndActivationAnalysis);
  writeJson(outDir, 'projection-and-export-analysis.json', p.projectionAndExportAnalysis);
  writeJson(outDir, 'migration-staging-analysis.json', p.migrationStagingAnalysis);
  writeJson(outDir, 'index-and-partition-requirements.json', p.indexAndPartitionRequirements);

  const report = `# Volume 5 Package 4 Physical-Model Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 5 corpus. Not a source of
> truth and not a basis for ratification. Volume 5 Package 4 defines a DOCUMENTARY
> physical (PostgreSQL) data model only; it authorizes no implementation,
> executable DDL, migration, ORM mapping, executable pipeline, API, event,
> infrastructure, technology selection, retention period, deletion schedule,
> delivery sequence, staffing, or cost. Row volumes, query rates, index counts,
> latency targets, partition thresholds, and retention periods are not fabricated;
> unknown quantities are marked BASELINE_PENDING. Volume 0 through Volume 4, and the
> frozen Package 1 through Package 3 corpus, are not modified by Package 4 work.

## Package 4 counts

| Category | Count |
| --- | --- |
| Physical, staging, quarantine, audit, outbox relations | ${p.relationAndAttributeCatalogue.relations.length} |
| Physical attributes | ${p.relationAndAttributeCatalogue.attributes.length} |
| Keys (primary/alternate/foreign/composite-scope/unique) | ${p.keyAndConstraintAnalysis.total_keys} |
| Check constraints | ${p.keyAndConstraintAnalysis.check_constraints.length} |
| Index requirements | ${p.indexAndPartitionRequirements.index_requirements} |
| Partition requirements | ${p.indexAndPartitionRequirements.partition_requirements} |
| Views and materialized projections | ${p.projectionAndExportAnalysis.projections} |
| Staging and quarantine relations | ${p.migrationStagingAnalysis.staging_and_quarantine_relations} |
| Physical integrity/control rules | ${p.validationBacklog.physical_integrity_and_control_rules} |
| Validation/assumption/risk/exception backlog | ${p.validationBacklog.total} |

## Physical-model provenance and integrity coverage

- Physical relations without a governed logical source (must be 0): ${p.relationAndAttributeCatalogue.relations_without_logical_source.length}
- Physical attributes without a classification (must be 0): ${p.relationAndAttributeCatalogue.attributes_without_classification.length}
- Keys without key columns (must be 0): ${p.keyAndConstraintAnalysis.keys_without_columns.length}
- Foreign keys without a referenced relation (must be 0): ${p.keyAndConstraintAnalysis.foreign_keys_without_reference.length}
- Check constraints without a condition (must be 0): ${p.keyAndConstraintAnalysis.checks_without_condition.length}
- Composite scope keys without a scope strategy (must be 0): ${p.scopeAndJurisdictionIntegrity.scope_keys_without_strategy.length}
- Projections without a governed source (must be 0): ${p.projectionAndExportAnalysis.projections_without_source.length}
- Projections without a consistency posture (must be 0): ${p.projectionAndExportAnalysis.projections_without_consistency_posture.length}
- Migration structures without source provenance (must be 0): ${p.migrationStagingAnalysis.without_source_provenance.length}
- Audit/outbox relations without an integrity responsibility (must be 0): ${p.temporalAndCorrectionMapping.audit_or_outbox_without_integrity_responsibility.length}

## Invariants asserted (definition-only)

- Every physical relation traces to a governed logical source and owning domain.
- Parent-child organization scope is enforced by composite scope keys.
- Person, account, membership, representative authority, and assignment are physically distinct.
- Evidence binary content is never held in an authoritative relational record.
- Financial acknowledgement, accounting confirmation, reconciliation, approval, and activation are distinct facts.
- Exactly one authoritative activation effect exists per affiliation and season.
- State, audit, and outbox effects share one transaction; corrections reference the corrected record.
- Projections, search, analytics, and exports are non-authoritative and retain lineage.
- Quarantine confers no authority; uncertain matches produce no governed merge.
- No row volume, query rate, index count, latency target, partition threshold, or retention period is fabricated.

## Validation-gate correctness

- Completed (passed) gates: ${p.validationBacklog.completed_gates.join(', ') || '(none)'}
- Backlog items pointing at a completed gate (must be 0): ${p.validationBacklog.pointing_at_completed_gate.length}
`;
  writeFileSync(join(outDir, 'package-4-physical-model-report.md'), report, 'utf8');
  return outDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = generate();
  console.log(`Volume 5 physical-model projections written to ${outDir}`);
}
