// Control: Volume 5 Package 2 logical-model analysis projection (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown report describing the shape
// of the Volume 5 Package 2 LOGICAL data model: logical entities and their owning
// domains and identity concepts; the logical relationship matrix; identity and
// authority separation; scope and jurisdiction posture; temporal, versioning,
// correction, and provenance posture; evidence-binding posture; financial and
// activation authority posture; derived-data lineage; logical integrity-rule
// coverage; and the logical-model validation backlog with future (uncompleted)
// gates. The corpus and its recorded approvals remain the authoritative record.
//
// Package 2 defines LOGICAL data semantics only. No projection here authorizes
// implementation, physical schema, migration, ORM mapping, executable pipeline,
// infrastructure, vendor selection, procurement, delivery sequence, or cost.

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

const LOGICAL_ENTITY_KINDS = [
  'LOGICAL_ENTITY',
  'VALUE_OBJECT',
  'REFERENCE_DATA',
  'CODE_SET',
  'STATE_RECORD',
  'SNAPSHOT',
  'PROVENANCE_RECORD',
  'CORRECTION_RECORD'
];

export function project(ctx) {
  const catalogue = records(ctx, 'REG-501');
  const rules = records(ctx, 'REG-502');
  const backlog = records(ctx, 'REG-504');

  const logicalEntities = catalogue.filter((r) => LOGICAL_ENTITY_KINDS.includes(r.kind));
  const logicalRelationships = catalogue.filter((r) => r.kind === 'LOGICAL_RELATIONSHIP');
  const derivedProducts = catalogue.filter((r) => r.kind === 'DERIVED_DATA_PRODUCT');
  const integrityRules = rules.filter((r) => r.kind === 'INTEGRITY');

  const logicalEntityCatalogue = logicalEntities.map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.title,
    owning_domain: e.owning_domain ?? null,
    identity_concept: e.identity_concept ?? null,
    authority: e.authority ?? null,
    lifecycle: e.lifecycle ?? null,
    cardinality: e.cardinality ?? null,
    temporal_posture: e.temporal_posture ?? null,
    correction_posture: e.correction_posture ?? null,
    scope_posture: e.scope_posture ?? null,
    classification: e.classification ?? null,
    chapter_ref: e.chapter_ref ?? null
  }));

  const relationshipMatrix = logicalRelationships.map((r) => ({
    id: r.id,
    title: r.title,
    endpoints: r.endpoints ?? [],
    cardinality: r.cardinality ?? null,
    relationship_invariant: r.relationship_invariant ?? null,
    optionality: r.optionality ?? null,
    chapter_ref: r.chapter_ref ?? null
  }));

  const identityAndAuthority = {
    entities_by_authority: countBy(logicalEntities, 'authority'),
    entities_by_identity_concept: logicalEntities.map((e) => ({ id: e.id, identity_concept: e.identity_concept ?? null })),
    entities_without_identity_concept: logicalEntities.filter((e) => e.kind === 'LOGICAL_ENTITY' && !e.identity_concept).map((e) => e.id),
    entities_without_owning_domain: logicalEntities.filter((e) => e.kind === 'LOGICAL_ENTITY' && !e.owning_domain).map((e) => e.id)
  };

  const scopeAndJurisdiction = {
    entities_with_scope_posture: logicalEntities.filter((e) => e.scope_posture).map((e) => ({ id: e.id, scope_posture: e.scope_posture })),
    by_classification: countBy(logicalEntities, 'classification')
  };

  const temporalAndVersioning = {
    entities_by_temporal_posture: countBy(logicalEntities, 'temporal_posture'),
    correction_records: logicalEntities.filter((e) => e.kind === 'CORRECTION_RECORD').map((e) => e.id),
    provenance_records: logicalEntities.filter((e) => e.kind === 'PROVENANCE_RECORD').map((e) => e.id),
    snapshots: logicalEntities.filter((e) => e.kind === 'SNAPSHOT').map((e) => e.id),
    state_records: logicalEntities.filter((e) => e.kind === 'STATE_RECORD').map((e) => e.id)
  };

  const evidenceBinding = {
    evidence_entities: logicalEntities
      .filter((e) => /evidence|submission|response|decision-record|decision record/i.test(`${e.title} ${e.purpose ?? ''}`))
      .map((e) => ({ id: e.id, title: e.title, classification: e.classification ?? null, authority: e.authority ?? null }))
  };

  const financialAuthority = {
    financial_entities: logicalEntities
      .filter((e) => /fee|payment|accounting|reconcil|activation|financial/i.test(`${e.title} ${e.purpose ?? ''}`))
      .map((e) => ({ id: e.id, title: e.title, authority: e.authority ?? null, classification: e.classification ?? null }))
  };

  const derivedDataLineage = derivedProducts.map((p) => ({
    id: p.id,
    title: p.title,
    authoritative_source: p.authoritative_source ?? null,
    derived_semantics: p.derived_semantics ?? null,
    staleness_representation: p.staleness_representation ?? null,
    non_authoritative: true
  }));

  const integrityRuleCoverage = {
    total: integrityRules.length,
    without_affected_entities: integrityRules.filter((r) => !(r.affected_entities ?? []).length).map((r) => r.id),
    without_logical_condition: integrityRules.filter((r) => !r.logical_condition).map((r) => r.id),
    by_future_verification_class: countBy(integrityRules, 'future_verification_class'),
    by_future_blocking_gate: countBy(integrityRules, 'future_blocking_gate')
  };

  const done = completedGates(ctx);
  const validationItems = backlog.filter((b) => b.kind === 'VALIDATION' || b.kind === 'ASM' || b.kind === 'RISK' || b.kind === 'EXC');
  const logicalValidationBacklog = {
    total: validationItems.length,
    by_future_blocking_gate: countBy(validationItems, 'future_blocking_gate'),
    pointing_at_completed_gate: validationItems
      .filter((b) => b.future_blocking_gate && done.has(b.future_blocking_gate))
      .map((b) => ({ id: b.id, future_blocking_gate: b.future_blocking_gate })),
    reassigned_from_v5g1: backlog
      .filter((b) => b.superseded_future_blocking_gate)
      .map((b) => ({ id: b.id, from: b.superseded_future_blocking_gate, to: b.future_blocking_gate ?? null })),
    completed_gates: [...done]
  };

  return {
    logicalEntityCatalogue,
    relationshipMatrix,
    identityAndAuthority,
    scopeAndJurisdiction,
    temporalAndVersioning,
    evidenceBinding,
    financialAuthority,
    derivedDataLineage,
    integrityRuleCoverage,
    logicalValidationBacklog
  };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'logical-model');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'logical-entity-catalogue.json', p.logicalEntityCatalogue);
  writeJson(outDir, 'relationship-matrix.json', p.relationshipMatrix);
  writeJson(outDir, 'identity-and-authority-analysis.json', p.identityAndAuthority);
  writeJson(outDir, 'scope-and-jurisdiction-analysis.json', p.scopeAndJurisdiction);
  writeJson(outDir, 'temporal-and-versioning-analysis.json', p.temporalAndVersioning);
  writeJson(outDir, 'evidence-binding-analysis.json', p.evidenceBinding);
  writeJson(outDir, 'financial-authority-analysis.json', p.financialAuthority);
  writeJson(outDir, 'derived-data-lineage-analysis.json', p.derivedDataLineage);
  writeJson(outDir, 'logical-integrity-rule-coverage.json', p.integrityRuleCoverage);
  writeJson(outDir, 'logical-model-validation-backlog.json', p.logicalValidationBacklog);

  const report = `# Volume 5 Package 2 Logical-Model Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 5 corpus. Not a source of
> truth and not a basis for ratification. Volume 5 Package 2 defines LOGICAL data
> semantics only; it authorizes no implementation, physical schema, migration,
> ORM mapping, executable pipeline, infrastructure, vendor selection, procurement,
> delivery sequence, or cost. Volume 0 through Volume 4, and the frozen Package 1
> corpus, are not modified by Package 2 work.

## Logical model counts

| Category | Count |
| --- | --- |
| Logical entities and records | ${p.logicalEntityCatalogue.length} |
| Logical relationships | ${p.relationshipMatrix.length} |
| Derived data products | ${p.derivedDataLineage.length} |
| Integrity rules | ${p.integrityRuleCoverage.total} |
| Validation/assumption/risk/exception backlog | ${p.logicalValidationBacklog.total} |

## Identity and authority separation

- Logical entities without an identity concept (must be 0): ${p.identityAndAuthority.entities_without_identity_concept.length}
- Logical entities without an owning domain (must be 0): ${p.identityAndAuthority.entities_without_owning_domain.length}

## Integrity-rule coverage

- Integrity rules without affected entities (must be 0): ${p.integrityRuleCoverage.without_affected_entities.length}
- Integrity rules without a logical condition (must be 0): ${p.integrityRuleCoverage.without_logical_condition.length}

## Validation-gate correctness

- Completed (passed) gates: ${p.logicalValidationBacklog.completed_gates.join(', ') || '(none)'}
- Backlog items pointing at a completed gate (must be 0): ${p.logicalValidationBacklog.pointing_at_completed_gate.length}
- Obligations reassigned away from the passed Gate V5-G1: ${p.logicalValidationBacklog.reassigned_from_v5g1.length}

## Derived-data posture

- All derived data products are non-authoritative and name an authoritative source.
`;
  writeFileSync(join(outDir, 'package-2-logical-model-report.md'), report, 'utf8');
  return outDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = generate();
  console.log(`Volume 5 logical-model projections written to ${outDir}`);
}
