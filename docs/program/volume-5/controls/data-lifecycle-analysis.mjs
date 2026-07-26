// Control: Volume 5 Package 3 data-lifecycle & stewardship analysis projection
// (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown report describing the shape
// of the Volume 5 Package 3 DATA-LIFECYCLE governance model: the master/reference/
// transactional/evidentiary/derived data classification; controlled-vocabulary and
// reference-data governance (bilingual semantics, versioning); data ownership,
// stewardship, custody and decision rights; data-quality rule lifecycle and
// exception posture; data lifecycle, records, retention, legal-hold, archival and
// disposition dependencies; identity resolution and survivorship posture;
// cross-system reconciliation and conflict-authority alignment; data exchange,
// transformation and lineage semantics; purpose, minimization and disclosure
// constraints; stewardship-measure coverage; and the Package 3 validation backlog
// with future (uncompleted) gates. The corpus and its recorded approvals remain
// the authoritative record.
//
// Package 3 defines DATA-LIFECYCLE and STEWARDSHIP governance semantics only. No
// projection here authorizes implementation, physical schema, migration, ORM
// mapping, executable quality rule, executable pipeline, infrastructure, vendor
// selection, procurement, retention period, deletion schedule, delivery sequence,
// staffing, or cost.

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

const REFERENCE_KINDS = ['REFERENCE_DATA', 'REFERENCE_DATA_SET', 'CODE_SET', 'CONTROLLED_TERM'];

export function project(ctx) {
  const catalogue = records(ctx, 'REG-501');
  const rules = records(ctx, 'REG-502');
  const backlog = records(ctx, 'REG-504');

  const masterSets = catalogue.filter((r) => r.kind === 'MASTER_DATA_SET');
  const referenceRecords = catalogue.filter((r) => REFERENCE_KINDS.includes(r.kind));
  const lifecycleRecords = catalogue.filter((r) => r.kind === 'DATA_LIFECYCLE');
  const issueRecords = catalogue.filter((r) => r.kind === 'DATA_ISSUE');
  const reconContexts = catalogue.filter((r) => r.kind === 'RECONCILIATION_CONTEXT');
  const exchangeRecords = catalogue.filter((r) => r.kind === 'EXCHANGE_RECORD');
  const useRecords = catalogue.filter((r) => r.kind === 'DATA_USE');
  const measures = catalogue.filter((r) => r.kind === 'STEWARDSHIP_MEASURE');
  const retentionDeps = catalogue.filter((r) => r.kind === 'RETENTION_DEPENDENCY');
  const qualityRules = rules.filter((r) => r.kind === 'QUALITY');

  const masterAndReferenceCatalogue = [...masterSets, ...referenceRecords].map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    data_class: r.data_class ?? null,
    authority_owner: r.authority_owner ?? null,
    steward: r.steward ?? null,
    version_posture: r.version_posture ?? null,
    english_label: r.english_label ?? null,
    french_label: r.french_label ?? null,
    chapter_ref: r.chapter_ref ?? null
  }));

  const controlledVocabularyGovernance = {
    total: referenceRecords.length,
    without_version_posture: referenceRecords.filter((r) => !r.version_posture).map((r) => r.id),
    without_bilingual_labels: referenceRecords
      .filter((r) => r.kind === 'CONTROLLED_TERM' || r.kind === 'CODE_SET')
      .filter((r) => !r.english_label || !r.french_label)
      .map((r) => r.id),
    by_compatibility_posture: countBy(referenceRecords, 'compatibility_posture')
  };

  const stewardshipCoverage = {
    master_sets_without_authority: masterSets.filter((r) => !r.authority_owner).map((r) => r.id),
    master_sets_without_steward: masterSets.filter((r) => !r.steward).map((r) => r.id),
    by_owning_domain: countBy([...masterSets, ...referenceRecords], 'owning_domain')
  };

  const qualityRuleCoverage = {
    total: qualityRules.length,
    without_dimension: qualityRules.filter((r) => !r.quality_dimension).map((r) => r.id),
    without_correction_authority: qualityRules.filter((r) => !r.correction_authority).map((r) => r.id),
    with_exception_authority: qualityRules.filter((r) => r.exception_authority).map((r) => r.id),
    by_quality_dimension: countBy(qualityRules, 'quality_dimension')
  };

  const retentionAndDisposition = {
    lifecycle_records: lifecycleRecords.length,
    lifecycle_without_records_authority: lifecycleRecords.filter((r) => !r.records_authority).map((r) => r.id),
    lifecycle_with_legal_hold_dependency: lifecycleRecords.filter((r) => r.legal_hold_dependency).map((r) => r.id),
    lifecycle_with_external_dependency: lifecycleRecords.filter((r) => r.external_dependency).map((r) => r.id),
    retention_dependencies: retentionDeps.map((r) => ({ id: r.id, title: r.title, deletion_authority: r.deletion_authority ?? null })),
    no_approved_retention_period: true
  };

  const identityResolutionControl = {
    issue_records: issueRecords.length,
    issues_without_resolution_authority: issueRecords.filter((r) => !r.resolution_authority).map((r) => r.id),
    by_issue_classification: countBy(issueRecords, 'issue_classification'),
    similarity_is_not_identity: true,
    automated_matching_advisory_unless_validated: true
  };

  const reconciliationCoverage = {
    contexts: reconContexts.length,
    without_conflict_authority: reconContexts.filter((r) => !r.conflict_authority).map((r) => r.id),
    by_mismatch_class: countBy(reconContexts, 'mismatch_class'),
    preserves_authority_boundaries: true
  };

  const exchangeAndLineage = {
    exchange_records: exchangeRecords.length,
    without_source_authority: exchangeRecords.filter((r) => !r.source_authority).map((r) => r.id),
    without_lineage: exchangeRecords.filter((r) => !r.transformation && !r.lineage).map((r) => r.id),
    external_authority_data: exchangeRecords
      .filter((r) => r.data_class === 'EXTERNAL_AUTHORITY_DATA')
      .map((r) => ({ id: r.id, source_authority: r.source_authority ?? null })),
    external_data_retains_external_authority: true
  };

  const dataUseConstraint = {
    use_records: useRecords.length,
    without_permitted_purpose: useRecords.filter((r) => !r.permitted_purpose).map((r) => r.id),
    with_disclosure_authority: useRecords.filter((r) => r.disclosure_authority).map((r) => r.id),
    by_privacy_validation_status: countBy(useRecords, 'privacy_validation_status'),
    derived_data_never_independent_authority: true
  };

  const stewardshipMeasureCoverage = {
    total: measures.length,
    without_accountable_owner: measures.filter((r) => !r.accountable_owner).map((r) => r.id),
    without_operational_proof_requirement: measures.filter((r) => !r.operational_proof_requirement).map((r) => r.id),
    by_baseline_status: countBy(measures, 'baseline_status')
  };

  const done = completedGates(ctx);
  const validationItems = backlog.filter((b) => ['VALIDATION', 'ASM', 'RISK', 'EXC'].includes(b.kind));
  const validationBacklog = {
    total: validationItems.length,
    by_future_blocking_gate: countBy(validationItems, 'future_blocking_gate'),
    pointing_at_completed_gate: validationItems
      .filter((b) => b.future_blocking_gate && done.has(b.future_blocking_gate))
      .map((b) => ({ id: b.id, future_blocking_gate: b.future_blocking_gate })),
    completed_gates: [...done]
  };

  return {
    masterAndReferenceCatalogue,
    controlledVocabularyGovernance,
    stewardshipCoverage,
    qualityRuleCoverage,
    retentionAndDisposition,
    identityResolutionControl,
    reconciliationCoverage,
    exchangeAndLineage,
    dataUseConstraint,
    stewardshipMeasureCoverage,
    validationBacklog
  };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'data-lifecycle');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'master-and-reference-data-catalogue.json', p.masterAndReferenceCatalogue);
  writeJson(outDir, 'controlled-vocabulary-governance.json', p.controlledVocabularyGovernance);
  writeJson(outDir, 'stewardship-coverage.json', p.stewardshipCoverage);
  writeJson(outDir, 'quality-rule-coverage.json', p.qualityRuleCoverage);
  writeJson(outDir, 'retention-and-disposition-dependencies.json', p.retentionAndDisposition);
  writeJson(outDir, 'identity-resolution-control-analysis.json', p.identityResolutionControl);
  writeJson(outDir, 'reconciliation-coverage.json', p.reconciliationCoverage);
  writeJson(outDir, 'exchange-and-lineage-analysis.json', p.exchangeAndLineage);
  writeJson(outDir, 'data-use-constraint-analysis.json', p.dataUseConstraint);
  writeJson(outDir, 'stewardship-measure-coverage.json', p.stewardshipMeasureCoverage);
  writeJson(outDir, 'package-3-validation-backlog.json', p.validationBacklog);

  const report = `# Volume 5 Package 3 Data-Lifecycle Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 5 corpus. Not a source of
> truth and not a basis for ratification. Volume 5 Package 3 defines DATA-LIFECYCLE
> and STEWARDSHIP governance semantics only; it authorizes no implementation,
> physical schema, migration, ORM mapping, executable quality rule, executable
> pipeline, infrastructure, vendor selection, procurement, retention period,
> deletion schedule, delivery sequence, staffing, or cost. Volume 0 through Volume
> 4, and the frozen Package 1 and Package 2 corpus, are not modified by Package 3
> work.

## Package 3 counts

| Category | Count |
| --- | --- |
| Master and reference/vocabulary records | ${p.masterAndReferenceCatalogue.length} |
| Data-quality rules | ${p.qualityRuleCoverage.total} |
| Data lifecycle records | ${p.retentionAndDisposition.lifecycle_records} |
| Data issue records | ${p.identityResolutionControl.issue_records} |
| Reconciliation contexts | ${p.reconciliationCoverage.contexts} |
| Exchange records | ${p.exchangeAndLineage.exchange_records} |
| Data use records | ${p.dataUseConstraint.use_records} |
| Stewardship measures | ${p.stewardshipMeasureCoverage.total} |
| Validation/assumption/risk/exception backlog | ${p.validationBacklog.total} |

## Stewardship and authority coverage

- Master data sets without an authority owner (must be 0): ${p.stewardshipCoverage.master_sets_without_authority.length}
- Reference/vocabulary records without a version posture (must be 0): ${p.controlledVocabularyGovernance.without_version_posture.length}
- Data lifecycle records without a records authority (must be 0): ${p.retentionAndDisposition.lifecycle_without_records_authority.length}
- Data issue records without a resolution authority (must be 0): ${p.identityResolutionControl.issues_without_resolution_authority.length}
- Reconciliation contexts without a conflict authority (must be 0): ${p.reconciliationCoverage.without_conflict_authority.length}
- Exchange records without a source authority (must be 0): ${p.exchangeAndLineage.without_source_authority.length}
- Data use records without a permitted purpose (must be 0): ${p.dataUseConstraint.without_permitted_purpose.length}
- Stewardship measures without an accountable owner (must be 0): ${p.stewardshipMeasureCoverage.without_accountable_owner.length}

## Invariants asserted (definition-only)

- No approved retention period, deletion schedule, or disposition authorization is conferred.
- External-authority data retains its external authority; House never becomes its independent authority.
- Derived data is never an independent authority.
- Record similarity is not identity; automated matching is advisory unless validated.
- Reconciliation preserves authority boundaries; legal hold supersedes disposition.

## Validation-gate correctness

- Completed (passed) gates: ${p.validationBacklog.completed_gates.join(', ') || '(none)'}
- Backlog items pointing at a completed gate (must be 0): ${p.validationBacklog.pointing_at_completed_gate.length}
`;
  writeFileSync(join(outDir, 'package-3-data-lifecycle-report.md'), report, 'utf8');
  return outDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = generate();
  console.log(`Volume 5 data-lifecycle projections written to ${outDir}`);
}
