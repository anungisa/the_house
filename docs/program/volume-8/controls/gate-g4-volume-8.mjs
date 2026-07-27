// Control: Gate V8-G4 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the twenty-eight Gate V8-G4 conditions from the Volume 8 Package 4
// directive (external-provider, file, batch, migration, and exchange-contract
// definition) against the source-controlled corpus. Each condition is satisfied
// only by concrete corpus evidence; an unsatisfied condition is an ERROR. This
// control reports readiness; it never itself disposes the gate. The gate is
// dispositioned only by a ratified REG-805 approval carrying GATE-V8-G4 and the
// disposition
// EXTERNAL_PROVIDER_FILE_BATCH_MIGRATION_AND_EXCHANGE_CONTRACT_DEFINITION_READY.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-8.mjs';
import { isPlaceholder } from './provenance-integrity-volume-8.mjs';

// Package 4 chapters (external-provider, file, batch, migration & exchange contracts).
const P4 = new Set(['V8-31', 'V8-32', 'V8-33', 'V8-34', 'V8-35', 'V8-36', 'V8-37', 'V8-38', 'V8-39', 'V8-40']);

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}
function inP4(list) {
  return list.filter((r) => P4.has(r.chapter_ref));
}
function hasChapter(ctx, id) {
  return ctx.chapters.some((c) => c.fileId === id);
}
function bodyMentions(ctx, id, needle) {
  const ch = ctx.chapters.find((c) => c.fileId === id);
  return ch ? ch.body.includes(needle) : false;
}

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok, detail) => conditions.push({ n, title, satisfied: ok, detail });

  const providerSurfaces = inP4(byKind(ctx, 'REG-801', 'PROVIDER_CONTRACT_SURFACE'));
  const importContexts = inP4(byKind(ctx, 'REG-801', 'IMPORT_CONTEXT'));
  const exportContexts = inP4(byKind(ctx, 'REG-801', 'EXPORT_CONTEXT'));
  const fileContexts = inP4(byKind(ctx, 'REG-801', 'FILE_EXCHANGE_CONTEXT'));
  const batchContexts = inP4(byKind(ctx, 'REG-801', 'BATCH_EXCHANGE_CONTEXT'));
  const migrationContexts = inP4(byKind(ctx, 'REG-801', 'MIGRATION_CONTEXT'));
  const manualContexts = inP4(byKind(ctx, 'REG-801', 'MANUAL_EXCHANGE_CONTEXT'));
  const providerBoundaries = inP4(byKind(ctx, 'REG-801', 'PROVIDER_TRUST_BOUNDARY'));
  const exchangeContexts = [...importContexts, ...exportContexts, ...fileContexts, ...batchContexts, ...migrationContexts, ...manualContexts];

  const fileManifests = inP4(byKind(ctx, 'REG-802', 'FILE_MANIFEST_REQUIREMENT'));
  const batchEnvelopes = inP4(byKind(ctx, 'REG-802', 'BATCH_ENVELOPE_REQUIREMENT'));
  const manifests = [...fileManifests, ...batchEnvelopes];
  const imports = inP4(byKind(ctx, 'REG-802', 'IMPORT_REQUIREMENT'));
  const acceptanceSemantics = inP4(byKind(ctx, 'REG-802', 'ACCEPTANCE_SEMANTIC'));
  const rejectionSemantics = inP4(byKind(ctx, 'REG-802', 'REJECTION_SEMANTIC'));
  const partialSemantics = inP4(byKind(ctx, 'REG-802', 'PARTIAL_SUCCESS_SEMANTIC'));
  const exports = inP4(byKind(ctx, 'REG-802', 'EXPORT_REQUIREMENT'));
  const migrationMappings = inP4(byKind(ctx, 'REG-802', 'MIGRATION_MAPPING_REQUIREMENT'));
  const identityResolutions = inP4(byKind(ctx, 'REG-802', 'IDENTITY_RESOLUTION_REQUIREMENT'));
  const continuity = inP4(byKind(ctx, 'REG-802', 'PROVIDER_CONTINUITY_REQUIREMENT'));
  const dataReturns = inP4(byKind(ctx, 'REG-802', 'DATA_RETURN_REQUIREMENT'));
  const deletionEvidence = inP4(byKind(ctx, 'REG-802', 'DELETION_EVIDENCE_REQUIREMENT'));
  const providerExits = inP4(byKind(ctx, 'REG-802', 'PROVIDER_EXIT_REQUIREMENT'));
  const reconciliations = inP4(byKind(ctx, 'REG-802', 'EXCHANGE_RECONCILIATION_REQUIREMENT'));
  const compatibility = inP4(byKind(ctx, 'REG-802', 'COMPATIBILITY_RULE'));
  const decisions = records(ctx, 'REG-803').filter((d) => P4.has(d.chapter_ref));
  const backlog = records(ctx, 'REG-804').filter((b) => P4.has(b.chapter_ref));
  const approvals = records(ctx, 'REG-805');

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;

  const allNotImplemented = ['REG-801', 'REG-802', 'REG-803', 'REG-804']
    .flatMap((r) => records(ctx, r))
    .every((r) => r.authorizes_implementation === false && r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');
  const noApprovalAuthorizes = approvals.every((a) => a.authorizes_implementation === false);

  const backlogComplete = backlog.length > 0 && backlog.every((b) => b.owner && b.future_blocking_gate);

  // Packages 1, 2, and 3 remain frozen and dispositioned (inherited).
  const p1Frozen = approvals.some((a) => a.artifact_id === 'PACKAGE-8-1' && a.approval_state === 'ratified' && a.frozen === true);
  const p2Frozen = approvals.some((a) => a.artifact_id === 'PACKAGE-8-2' && a.approval_state === 'ratified' && a.frozen === true);
  const p3Frozen = approvals.some((a) => a.artifact_id === 'PACKAGE-8-3' && a.approval_state === 'ratified' && a.frozen === true);
  const g3Dispositioned = approvals.some((a) => a.artifact_id === 'GATE-V8-G3' && a.approval_state === 'ratified' && a.gate_disposition === 'AFFILIATION_EVENT_AND_DELIVERY_CONTRACT_DEFINITION_READY');

  // Package 4 closure, gate disposition, and freeze.
  const closureApproval = approvals.some((a) => a.artifact_id === 'V8-G' && a.approval_state === 'ratified');
  const freezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-8-4' && a.approval_state === 'ratified');
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V8-G4' && a.approval_state === 'ratified');
  const gateDispositioned = !!gateApproval && gateApproval.gate_disposition === 'EXTERNAL_PROVIDER_FILE_BATCH_MIGRATION_AND_EXCHANGE_CONTRACT_DEFINITION_READY';

  // Fail-closed provenance binding: a completed gate must not report ready while any
  // required gate/closure/freeze effectiveness binding remains an unresolved
  // placeholder (PENDING/UNKNOWN/TBD/PLACEHOLDER/UNRESOLVED). Forward-referencing
  // provenance-amendment fields are excluded; they are validated by role classification.
  const closureRecord = approvals.find((a) => a.artifact_id === 'V8-G' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-8-4' && a.approval_state === 'ratified');
  const bindingValues = [
    gateApproval?.effective_commit,
    gateApproval?.gate_effective_commit,
    closureRecord?.closure_binding?.closure_authored_commit,
    closureRecord?.closure_binding?.closure_effective_commit,
    closureRecord?.closure_binding?.freeze_commit,
    closureRecord?.closure_binding?.gate_effective_commit,
    freezeRecord?.authoring_closure_separation?.substantive_authoring_commit,
    freezeRecord?.authoring_closure_separation?.closure_authored_commit,
    freezeRecord?.authoring_closure_separation?.closure_effective_commit,
    freezeRecord?.authoring_closure_separation?.gate_effective_commit,
    freezeRecord?.authoring_closure_separation?.freeze_commit,
    freezeRecord?.package_provenance?.authoring_commit,
    freezeRecord?.package_provenance?.closure_freeze_commit,
    freezeRecord?.package_provenance?.freeze_commit,
    freezeRecord?.package_provenance?.effective_commit
  ];
  const gateBindingsResolved = !!gateApproval && bindingValues.filter((v) => v !== undefined).length > 0 && !bindingValues.some((v) => isPlaceholder(v));

  // Genuine authoring / closure-freeze / pre-merge-binding separation.
  const sep = freezeRecord?.authoring_closure_separation ?? {};
  const separationGenuine =
    sep.separation_status === 'SEPARATED' &&
    sep.sequence_disposition === 'COMPLIANT' &&
    Boolean(sep.substantive_authoring_commit && sep.closure_authored_commit) &&
    !isPlaceholder(sep.substantive_authoring_commit) &&
    !isPlaceholder(sep.closure_authored_commit) &&
    sep.substantive_authoring_commit !== sep.closure_authored_commit;

  add(1, 'Package 3 provenance, V8-F, and V8-F-1 are inherited',
    hasChapter(ctx, 'V8-F') && hasChapter(ctx, 'V8-F-1') && g3Dispositioned);
  add(2, 'Packages 1 through 3 remain frozen and unchanged', p1Frozen && p2Frozen && p3Frozen);
  add(3, 'Provider and exchange authority doctrine is controlled',
    hasChapter(ctx, 'V8-31') && providerSurfaces.length >= 1);
  add(4, 'Provider custody remains distinct from institutional authority',
    bodyMentions(ctx, 'V8-31', 'custody') && providerSurfaces.every((p) => p.institutional_authority));
  add(5, 'Provider, import, export, file, batch, migration, and manual-exchange contexts are catalogued',
    hasChapter(ctx, 'V8-32') && providerSurfaces.length >= 1 && importContexts.length >= 1 && exportContexts.length >= 1 &&
      fileContexts.length >= 1 && batchContexts.length >= 1 && migrationContexts.length >= 1 && manualContexts.length >= 1);
  add(6, 'Every exchange identifies producer, consumer, owner, purpose, authority, classification, and trust boundary',
    exchangeContexts.length >= 1 && exchangeContexts.every((s) => s.producer && s.consumer && (s.owner || s.institutional_authority) && s.purpose && s.classification && s.trust_boundary));
  add(7, 'Files and batches define identity, provenance, version, manifest, counts, integrity, and reconciliation',
    hasChapter(ctx, 'V8-33') && manifests.length >= 2 && manifests.every((m) => (m.manifest_fields ?? []).length > 0 && m.integrity_dependency && m.source_provenance && m.version_distinction));
  add(8, 'Structural validity remains distinct from semantic and institutional validity',
    bodyMentions(ctx, 'V8-33', 'structural') && bodyMentions(ctx, 'V8-33', 'semantic'));
  add(9, 'Imports define acceptance, rejection, quarantine, duplicate, correction, and partial-success semantics',
    hasChapter(ctx, 'V8-34') && imports.length >= 1 &&
      imports.every((i) => i.acceptance_authority && i.reject_conditions && i.quarantine_conditions && i.partial_success_posture && i.duplicate_posture && i.correction_posture) &&
      acceptanceSemantics.length >= 1 && rejectionSemantics.length >= 1 && partialSemantics.length >= 1);
  add(10, 'Rejected and quarantined records remain non-authoritative',
    rejectionSemantics.length >= 1 && rejectionSemantics.every((r) => r.non_authoritative_posture) && bodyMentions(ctx, 'V8-34', 'non-authoritative'));
  add(11, 'Imports cannot silently create governed authority',
    imports.length >= 1 && imports.every((i) => i.authoritative_state_consequence) && bodyMentions(ctx, 'V8-34', 'authority'));
  add(12, 'Exports require explicit disclosure and recipient authority',
    hasChapter(ctx, 'V8-35') && exports.length >= 1 && exports.every((e) => e.export_authority && e.recipient_authority_status && e.disclosure_basis_status));
  add(13, 'Read access remains distinct from export authority',
    bodyMentions(ctx, 'V8-35', 'Read access') && bodyMentions(ctx, 'V8-35', 'export authority'));
  add(14, 'Export generation, delivery, receipt, processing, and reconciliation remain distinct',
    exports.length >= 1 && exports.every((e) => (e.delivery_evidence || e.receipt_evidence) && e.recipient_processing_status && e.reconciliation_dependency));
  add(15, 'Migration contracts preserve source provenance and uncertainty',
    hasChapter(ctx, 'V8-36') && migrationMappings.length >= 1 && migrationMappings.every((m) => m.source_provenance && m.uncertainty_posture));
  add(16, 'Mapping remains distinct from identity resolution and authority confirmation',
    migrationMappings.every((m) => m.identity_resolution_dependency) && identityResolutions.length >= 1);
  add(17, 'Migration completion remains distinct from business acceptance and source retirement',
    bodyMentions(ctx, 'V8-36', 'Migration completion'));
  add(18, 'Provider incidents, continuity, substitution, return, deletion, residual copies, and exit are governed',
    hasChapter(ctx, 'V8-37') && continuity.length >= 1 && dataReturns.length >= 1 && deletionEvidence.length >= 1 && providerExits.length >= 1 &&
      deletionEvidence.every((d) => d.residual_copy_posture));
  add(19, 'Provider certification remains distinct from service assurance',
    bodyMentions(ctx, 'V8-37', 'certification'));
  add(20, 'Batch idempotency, replay, ordering, concurrency, partial failure, compensation, and reconciliation are controlled',
    hasChapter(ctx, 'V8-38') && reconciliations.length >= 1 && reconciliations.every((r) => r.reconciliation_owner_status && r.replay_authority && r.partial_success_posture && r.closure_evidence));
  add(21, 'Manual and transitional exchanges remain governed and auditable',
    hasChapter(ctx, 'V8-39') && manualContexts.length >= 1);
  add(22, 'Accessible and bilingual requirements apply to documents and exchange communications',
    bodyMentions(ctx, 'V8-39', 'French') && exports.some((e) => e.english_semantic && e.french_semantic && e.accessibility_requirement));
  add(23, 'Every unresolved item has an owner, an evidence requirement, and a valid future gate', backlogComplete);
  add(24, 'Deterministic Package 4 assessment completes without blocking defects',
    hasChapter(ctx, 'V8-40') && structuralErrors === 0 && decisions.length >= 10 && providerBoundaries.length >= 1 && providerBoundaries.every((b) => b.fail_closed_posture) && compatibility.length >= 1 && compatibility.every((c) => c.compatibility_state && c.consumer_evidence));
  add(25, 'No executable file schema, endpoint, transfer, migration script, provider integration, or infrastructure is created', leakageErrors === 0);
  add(26, 'No migration-complete, provider-assured, data-deleted, reconciliation-complete, compatibility, privacy, or operational claim is made without evidence', allNotImplemented);
  add(27, 'No record authorizes implementation', allNotImplemented && noApprovalAuthorizes);
  add(28, 'Package 4 uses genuine authoring, closure/freeze, and pre-merge provenance-binding separation with a resolved gate binding',
    closureApproval && freezeApproval && gateDispositioned && gateBindingsResolved && separationGenuine);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V8_G4_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V8-G4'));
    }
  }
  return findings;
}

export function generate(ctx = loadContext()) {
  const conditions = evaluate(ctx);
  const unmet = conditions.filter((c) => !c.satisfied);
  const outDir = join(VOLUME_DIR, 'generated', 'foundation');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    gate: 'V8-G4',
    disposition_target: 'EXTERNAL_PROVIDER_FILE_BATCH_MIGRATION_AND_EXCHANGE_CONTRACT_DEFINITION_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v8-g4-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V8-G4 readiness', run);
}
