// Control: Volume 8 Package 4 external-provider, file, batch, migration, and
// exchange contract coverage analysis and NON-AUTHORITATIVE projections.
//
// Emits deterministic JSON projections and a markdown coverage report for the
// provider, exchange-context, file/batch manifest, import intake, export/disclosure,
// migration/mapping, provider-continuity/return/deletion/exit, batch idempotency/
// replay/reconciliation, and manual/accessible/bilingual exchange contract plane
// defined in Package 4. Every generated file is a projection of the
// source-controlled corpus and is never authoritative. The control also returns
// coverage-gap findings as INFO backlog signals; genuinely blocking structural
// defects are raised elsewhere as ERRORs.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

const P4 = new Set(['V8-31', 'V8-32', 'V8-33', 'V8-34', 'V8-35', 'V8-36', 'V8-37', 'V8-38', 'V8-39', 'V8-40']);

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind && P4.has(r.chapter_ref));
}

function analyse(ctx) {
  const providerSurfaces = byKind(ctx, 'REG-801', 'PROVIDER_CONTRACT_SURFACE');
  const importContexts = byKind(ctx, 'REG-801', 'IMPORT_CONTEXT');
  const exportContexts = byKind(ctx, 'REG-801', 'EXPORT_CONTEXT');
  const fileContexts = byKind(ctx, 'REG-801', 'FILE_EXCHANGE_CONTEXT');
  const batchContexts = byKind(ctx, 'REG-801', 'BATCH_EXCHANGE_CONTEXT');
  const migrationContexts = byKind(ctx, 'REG-801', 'MIGRATION_CONTEXT');
  const manualContexts = byKind(ctx, 'REG-801', 'MANUAL_EXCHANGE_CONTEXT');
  const providerBoundaries = byKind(ctx, 'REG-801', 'PROVIDER_TRUST_BOUNDARY');
  const exchangeContexts = [...importContexts, ...exportContexts, ...fileContexts, ...batchContexts, ...migrationContexts, ...manualContexts];

  const fileManifests = byKind(ctx, 'REG-802', 'FILE_MANIFEST_REQUIREMENT');
  const batchEnvelopes = byKind(ctx, 'REG-802', 'BATCH_ENVELOPE_REQUIREMENT');
  const imports = byKind(ctx, 'REG-802', 'IMPORT_REQUIREMENT');
  const acceptanceSemantics = byKind(ctx, 'REG-802', 'ACCEPTANCE_SEMANTIC');
  const rejectionSemantics = byKind(ctx, 'REG-802', 'REJECTION_SEMANTIC');
  const partialSemantics = byKind(ctx, 'REG-802', 'PARTIAL_SUCCESS_SEMANTIC');
  const exports = byKind(ctx, 'REG-802', 'EXPORT_REQUIREMENT');
  const migrationMappings = byKind(ctx, 'REG-802', 'MIGRATION_MAPPING_REQUIREMENT');
  const identityResolutions = byKind(ctx, 'REG-802', 'IDENTITY_RESOLUTION_REQUIREMENT');
  const continuity = byKind(ctx, 'REG-802', 'PROVIDER_CONTINUITY_REQUIREMENT');
  const dataReturns = byKind(ctx, 'REG-802', 'DATA_RETURN_REQUIREMENT');
  const deletionEvidence = byKind(ctx, 'REG-802', 'DELETION_EVIDENCE_REQUIREMENT');
  const providerExits = byKind(ctx, 'REG-802', 'PROVIDER_EXIT_REQUIREMENT');
  const reconciliations = byKind(ctx, 'REG-802', 'EXCHANGE_RECONCILIATION_REQUIREMENT');
  const compatibility = byKind(ctx, 'REG-802', 'COMPATIBILITY_RULE');

  const providersWithoutAuthority = providerSurfaces.filter((p) => !p.institutional_authority || !p.authoritative_source);
  const exchangesWithoutOwner = exchangeContexts.filter((s) => !s.owner && !s.institutional_authority);
  const exchangesWithoutTrustBoundary = exchangeContexts.filter((s) => !s.trust_boundary);
  const manifestsWithoutIntegrity = [...fileManifests, ...batchEnvelopes].filter((m) => !m.integrity_dependency || !(m.manifest_fields ?? []).length);
  const importsWithoutAcceptReject = imports.filter((i) => !i.acceptance_authority || !i.reject_conditions || !i.quarantine_conditions || !i.partial_success_posture);
  const importsWithoutStateConsequence = imports.filter((i) => !i.authoritative_state_consequence);
  const exportsWithoutDisclosureAuthority = exports.filter((e) => !e.export_authority || !e.disclosure_basis_status || !e.recipient_authority_status);
  const migrationsWithoutUncertainty = migrationMappings.filter((m) => !m.uncertainty_posture || !m.source_provenance);
  const mappingsImplyingResolution = migrationMappings.filter((m) => !m.identity_resolution_dependency);
  const providersWithoutLifecycle = providerSurfaces.filter((p) => !p.incident_notification_dependency || !p.continuity_dependency || !p.exit_dependency);
  const reconciliationsWithoutOwner = reconciliations.filter((r) => !r.reconciliation_owner_status || !r.closure_evidence);
  const manualsWithoutRecords = manualContexts.filter((s) => !s.records_dependency && !s.evidence_requirement);
  const compatibilityWithoutEvidence = compatibility.filter((c) => !c.consumer_evidence);

  return {
    counts: {
      provider_contract_surfaces: providerSurfaces.length,
      import_contexts: importContexts.length,
      export_contexts: exportContexts.length,
      file_exchange_contexts: fileContexts.length,
      batch_exchange_contexts: batchContexts.length,
      migration_contexts: migrationContexts.length,
      manual_exchange_contexts: manualContexts.length,
      provider_trust_boundaries: providerBoundaries.length,
      file_manifest_requirements: fileManifests.length,
      batch_envelope_requirements: batchEnvelopes.length,
      import_requirements: imports.length,
      acceptance_semantics: acceptanceSemantics.length,
      rejection_semantics: rejectionSemantics.length,
      partial_success_semantics: partialSemantics.length,
      export_requirements: exports.length,
      migration_mapping_requirements: migrationMappings.length,
      identity_resolution_requirements: identityResolutions.length,
      provider_continuity_requirements: continuity.length,
      data_return_requirements: dataReturns.length,
      deletion_evidence_requirements: deletionEvidence.length,
      provider_exit_requirements: providerExits.length,
      exchange_reconciliation_requirements: reconciliations.length,
      compatibility_rules: compatibility.length
    },
    records: {
      providerSurfaces, importContexts, exportContexts, fileContexts, batchContexts, migrationContexts, manualContexts, providerBoundaries,
      fileManifests, batchEnvelopes, imports, acceptanceSemantics, rejectionSemantics, partialSemantics, exports,
      migrationMappings, identityResolutions, continuity, dataReturns, deletionEvidence, providerExits, reconciliations, compatibility
    },
    gaps: {
      providers_without_authority_or_source: providersWithoutAuthority.map((r) => r.id),
      exchanges_without_owner: exchangesWithoutOwner.map((r) => r.id),
      exchanges_without_trust_boundary: exchangesWithoutTrustBoundary.map((r) => r.id),
      manifests_without_integrity_or_fields: manifestsWithoutIntegrity.map((r) => r.id),
      imports_without_accept_reject_quarantine_partial: importsWithoutAcceptReject.map((r) => r.id),
      imports_without_authoritative_state_consequence: importsWithoutStateConsequence.map((r) => r.id),
      exports_without_disclosure_or_recipient_authority: exportsWithoutDisclosureAuthority.map((r) => r.id),
      migrations_without_provenance_or_uncertainty: migrationsWithoutUncertainty.map((r) => r.id),
      mappings_without_identity_resolution_dependency: mappingsImplyingResolution.map((r) => r.id),
      providers_without_incident_continuity_or_exit: providersWithoutLifecycle.map((r) => r.id),
      reconciliations_without_owner_or_closure_evidence: reconciliationsWithoutOwner.map((r) => r.id),
      manual_exchanges_without_records_or_evidence: manualsWithoutRecords.map((r) => r.id),
      compatibility_without_consumer_evidence: compatibilityWithoutEvidence.map((r) => r.id)
    }
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  for (const [name, list] of Object.entries(a.gaps)) {
    if (list.length > 0) {
      findings.push(makeFinding(Severity.INFO, 'PROVIDER_EXCHANGE_COVERAGE_GAP', `${name}: ${list.join(', ')}`, 'REG-801/REG-802'));
    }
  }
  return findings;
}

function report(ctx, a) {
  const now = new Date().toISOString();
  const countRows = Object.entries(a.counts).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const gapRows = Object.entries(a.gaps).map(([k, v]) => `| ${k} | ${v.length} | ${v.join(', ') || '(none)'} |`).join('\n');
  return `# Volume 8 Package 4 — External-Provider, File, Batch, Migration, and Exchange Contract Coverage Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 8 Package 4 external-provider, file, batch, migration, and exchange-contract
> corpus. It is not a source of truth, confers no ratification, and asserts no
> implementation, interface conformance, file or transfer capability, import or
> export outcome, migration completion, provider assurance, data-return or deletion
> completion, reconciliation completion, privacy compliance, or compatibility
> validation. The Markdown chapters, YAML registers, JSON schemas, and control
> scripts are the authoritative record. Volume 0 through Volume 7 remain
> frozen/released and are not modified by Volume 8 work. Packages 1 through 3 remain
> frozen. Package 4 defines PROVIDER, EXCHANGE-CONTEXT, FILE, BATCH, MANIFEST,
> INTEGRITY, IMPORT, ACCEPTANCE, REJECTION, QUARANTINE, PARTIAL-SUCCESS, EXPORT,
> DISCLOSURE, MIGRATION, MAPPING, IDENTITY-RESOLUTION, PROVIDER-CONTINUITY, DATA-RETURN,
> DELETION-EVIDENCE, PROVIDER-EXIT, RECONCILIATION, and MANUAL/ACCESSIBLE/BILINGUAL
> EXCHANGE OBLIGATIONS only and authorizes no implementation, executable file or
> payload schema, transfer endpoint, migration script, provider integration, or
> infrastructure.

## Corpus counts

| Element | Count |
| --- | --- |
${countRows}

## Coverage backlog signals (non-blocking)

| Signal | Count | Identifiers |
| --- | --- | --- |
${gapRows}
`;
}

export function generate(ctx = loadContext()) {
  const a = analyse(ctx);
  const r = a.records;
  const outDir = join(VOLUME_DIR, 'generated', 'provider-exchange-contracts');
  mkdirSync(outDir, { recursive: true });
  const write = (name, obj) => writeFileSync(join(outDir, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');

  write('provider-and-exchange-context-catalogue.json', {
    provider_contract_surfaces: a.counts.provider_contract_surfaces,
    import_contexts: a.counts.import_contexts,
    export_contexts: a.counts.export_contexts,
    file_exchange_contexts: a.counts.file_exchange_contexts,
    batch_exchange_contexts: a.counts.batch_exchange_contexts,
    migration_contexts: a.counts.migration_contexts,
    manual_exchange_contexts: a.counts.manual_exchange_contexts,
    contexts: [...r.providerSurfaces, ...r.importContexts, ...r.exportContexts, ...r.fileContexts, ...r.batchContexts, ...r.migrationContexts, ...r.manualContexts]
      .map((s) => ({ id: s.id, kind: s.kind, purpose: s.purpose ?? null, producer: s.producer ?? null, consumer: s.consumer ?? null, owner: s.owner ?? s.institutional_authority ?? null, classification: s.classification ?? null })),
    gaps: { exchanges_without_owner: a.gaps.exchanges_without_owner }
  });
  write('provider-authority-and-trust-boundary-analysis.json', {
    provider_contract_surfaces: a.counts.provider_contract_surfaces,
    provider_trust_boundaries: a.counts.provider_trust_boundaries,
    providers: r.providerSurfaces.map((p) => ({ id: p.id, institutional_authority: p.institutional_authority ?? null, authoritative_source: p.authoritative_source ?? null, trust_boundary: p.trust_boundary ?? null })),
    boundaries: r.providerBoundaries.map((b) => ({ id: b.id, fail_closed_posture: Boolean(b.fail_closed_posture), trust_boundary: b.trust_boundary ?? null })),
    gaps: { providers_without_authority_or_source: a.gaps.providers_without_authority_or_source, exchanges_without_trust_boundary: a.gaps.exchanges_without_trust_boundary }
  });
  write('file-batch-manifest-and-integrity-coverage.json', {
    file_manifest_requirements: a.counts.file_manifest_requirements,
    batch_envelope_requirements: a.counts.batch_envelope_requirements,
    manifests: [...r.fileManifests, ...r.batchEnvelopes].map((m) => ({ id: m.id, kind: m.kind, manifest_field_count: (m.manifest_fields ?? []).length, integrity_dependency: m.integrity_dependency ?? null, source_provenance: m.source_provenance ?? null, version_distinction: m.version_distinction ?? null })),
    gaps: { manifests_without_integrity_or_fields: a.gaps.manifests_without_integrity_or_fields }
  });
  write('import-accept-reject-quarantine-analysis.json', {
    import_requirements: a.counts.import_requirements,
    acceptance_semantics: a.counts.acceptance_semantics,
    rejection_semantics: a.counts.rejection_semantics,
    partial_success_semantics: a.counts.partial_success_semantics,
    imports: r.imports.map((i) => ({ id: i.id, source_authority: i.source_authority ?? null, acceptance_authority: i.acceptance_authority ?? null, reject_conditions: i.reject_conditions ?? null, quarantine_conditions: i.quarantine_conditions ?? null, partial_success_posture: i.partial_success_posture ?? null, authoritative_state_consequence: i.authoritative_state_consequence ?? null })),
    gaps: { imports_without_accept_reject_quarantine_partial: a.gaps.imports_without_accept_reject_quarantine_partial, imports_without_authoritative_state_consequence: a.gaps.imports_without_authoritative_state_consequence }
  });
  write('export-disclosure-delivery-and-reconciliation-analysis.json', {
    export_requirements: a.counts.export_requirements,
    exports: r.exports.map((e) => ({ id: e.id, export_authority: e.export_authority ?? null, recipient_authority_status: e.recipient_authority_status ?? null, disclosure_basis_status: e.disclosure_basis_status ?? null, delivery_evidence: e.delivery_evidence ?? null, receipt_evidence: e.receipt_evidence ?? null, recipient_processing_status: e.recipient_processing_status ?? null, reconciliation_dependency: e.reconciliation_dependency ?? null })),
    gaps: { exports_without_disclosure_or_recipient_authority: a.gaps.exports_without_disclosure_or_recipient_authority }
  });
  write('migration-provenance-mapping-and-uncertainty-analysis.json', {
    migration_mapping_requirements: a.counts.migration_mapping_requirements,
    identity_resolution_requirements: a.counts.identity_resolution_requirements,
    mappings: r.migrationMappings.map((m) => ({ id: m.id, source_provenance: m.source_provenance ?? null, mapping_posture: m.mapping_posture ?? null, uncertainty_posture: m.uncertainty_posture ?? null, identity_resolution_dependency: m.identity_resolution_dependency ?? null })),
    identity: r.identityResolutions.map((i) => ({ id: i.id, resolution_posture: i.resolution_posture ?? null, uncertainty_posture: i.uncertainty_posture ?? null, unresolved_posture: i.unresolved_posture ?? null })),
    gaps: { migrations_without_provenance_or_uncertainty: a.gaps.migrations_without_provenance_or_uncertainty, mappings_without_identity_resolution_dependency: a.gaps.mappings_without_identity_resolution_dependency }
  });
  write('provider-continuity-return-deletion-and-exit-analysis.json', {
    provider_continuity_requirements: a.counts.provider_continuity_requirements,
    data_return_requirements: a.counts.data_return_requirements,
    deletion_evidence_requirements: a.counts.deletion_evidence_requirements,
    provider_exit_requirements: a.counts.provider_exit_requirements,
    continuity: r.continuity.map((c) => ({ id: c.id, continuity_posture: c.continuity_posture ?? null, substitution_posture: c.substitution_posture ?? null, incident_linkage: c.incident_linkage ?? null })),
    data_return: r.dataReturns.map((d) => ({ id: d.id, return_posture: d.return_posture ?? null, portability_posture: d.portability_posture ?? null })),
    deletion: r.deletionEvidence.map((d) => ({ id: d.id, deletion_evidence_posture: d.deletion_evidence_posture ?? null, residual_copy_posture: d.residual_copy_posture ?? null })),
    exit: r.providerExits.map((e) => ({ id: e.id, exit_posture: e.exit_posture ?? null, termination_distinction: e.termination_distinction ?? null, exit_acceptance: e.exit_acceptance ?? null })),
    gaps: { providers_without_incident_continuity_or_exit: a.gaps.providers_without_incident_continuity_or_exit }
  });
  write('batch-idempotency-replay-partial-failure-and-reconciliation.json', {
    exchange_reconciliation_requirements: a.counts.exchange_reconciliation_requirements,
    reconciliations: r.reconciliations.map((x) => ({ id: x.id, reconciliation_owner_status: x.reconciliation_owner_status ?? null, replay_authority: x.replay_authority ?? null, partial_success_posture: x.partial_success_posture ?? null, replacement_posture: x.replacement_posture ?? null, compensation_limitation: x.compensation_limitation ?? null, closure_evidence: x.closure_evidence ?? null })),
    gaps: { reconciliations_without_owner_or_closure_evidence: a.gaps.reconciliations_without_owner_or_closure_evidence }
  });
  write('manual-accessible-and-bilingual-exchange-analysis.json', {
    manual_exchange_contexts: a.counts.manual_exchange_contexts,
    manual: r.manualContexts.map((s) => ({ id: s.id, purpose: s.purpose ?? null, classification: s.classification ?? null, records_dependency: s.records_dependency ?? null, accessibility_requirement: s.accessibility_requirement ?? null })),
    exports_bilingual: r.exports.map((e) => ({ id: e.id, english_semantic: Boolean(e.english_semantic), french_semantic: Boolean(e.french_semantic), accessibility_requirement: Boolean(e.accessibility_requirement) })),
    gaps: { manual_exchanges_without_records_or_evidence: a.gaps.manual_exchanges_without_records_or_evidence }
  });
  writeFileSync(join(outDir, 'package-4-provider-exchange-contract-report.md'), report(ctx, a), 'utf8');
  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Provider-exchange contract coverage', run);
}
