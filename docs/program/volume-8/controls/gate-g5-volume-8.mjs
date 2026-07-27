// Control: Gate V8-G5 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the thirty-two Gate V8-G5 conditions from the Volume 8 Package 5
// directive (integrated API, event, integration, and exchange-contract baseline
// and whole-volume closure) against the source-controlled corpus. Each condition
// is satisfied only by concrete corpus evidence; an unsatisfied condition is an
// ERROR. This control reports readiness; it never itself disposes the gate. The
// gate is dispositioned only by a ratified REG-805 approval carrying GATE-V8-G5
// and the disposition
// API_EVENT_INTEGRATION_AND_EXCHANGE_CONTRACT_DEFINITION_COMPLETE, with explicit
// PACKAGE-8-5 and VOLUME-8 freeze approvals.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-8.mjs';
import { isPlaceholder } from './provenance-integrity-volume-8.mjs';

// Package 5 chapters (integrated baseline, synthesis, P0 matrix, readiness,
// handoff, and closure assessment).
const P5 = new Set([
  'V8-41', 'V8-42', 'V8-43', 'V8-44', 'V8-45', 'V8-46', 'V8-47',
  'V8-48', 'V8-49', 'V8-50', 'V8-51', 'V8-52', 'V8-53'
]);

const GATE_DISPOSITION = 'API_EVENT_INTEGRATION_AND_EXCHANGE_CONTRACT_DEFINITION_COMPLETE';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}
function inP5(list) {
  return list.filter((r) => P5.has(r.chapter_ref));
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

  const capabilities = inP5(byKind(ctx, 'REG-802', 'CONTRACT_CAPABILITY'));
  const catalogue = inP5(byKind(ctx, 'REG-801', 'INTEGRATED_SURFACE_CATALOGUE_ENTRY'));
  const p0Coverage = inP5(byKind(ctx, 'REG-802', 'P0_CONTRACT_COVERAGE'));
  const handoffs = inP5(byKind(ctx, 'REG-802', 'DOWNSTREAM_HANDOFF'));
  const readiness = inP5(byKind(ctx, 'REG-804', 'READINESS'));
  const decisions = records(ctx, 'REG-803').filter((d) => P5.has(d.chapter_ref));
  const approvals = records(ctx, 'REG-805');

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;
  const gateAlreadyCompletedErrors = structural.filter((f) => f.code === 'GATE_ALREADY_COMPLETED').length;

  const allNotImplemented = ['REG-801', 'REG-802', 'REG-803', 'REG-804']
    .flatMap((r) => records(ctx, r))
    .every((r) => r.authorizes_implementation === false && r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');
  const noApprovalAuthorizes = approvals.every((a) => a.authorizes_implementation === false);

  // Distinct interaction families across the integrated capability baseline.
  const families = new Set(capabilities.map((c) => c.interaction_family).filter(Boolean));

  // Every unresolved backlog item across the whole volume carries an owner and a
  // forward gate. Readiness dispositions carry an explicit disposition.
  const allBacklog = records(ctx, 'REG-804');
  const backlogComplete = allBacklog.length > 0 && allBacklog.every((b) => b.owner && b.future_blocking_gate);
  const readinessDispositioned = readiness.length > 0 && readiness.every((r) => r.readiness_disposition);
  const noActivePointsToClosedOrG5 =
    gateAlreadyCompletedErrors === 0 &&
    !allBacklog.some((b) => b.future_blocking_gate === 'V8-G5') &&
    !handoffs.some((h) => h.future_blocking_gate === 'V8-G5');

  // Packages 1 through 4 remain frozen and dispositioned (inherited).
  const pFrozen = (id) => approvals.some((a) => a.artifact_id === id && a.approval_state === 'ratified' && a.frozen === true);
  const p1Frozen = pFrozen('PACKAGE-8-1');
  const p2Frozen = pFrozen('PACKAGE-8-2');
  const p3Frozen = pFrozen('PACKAGE-8-3');
  const p4Frozen = pFrozen('PACKAGE-8-4');
  const g4Dispositioned = approvals.some((a) => a.artifact_id === 'GATE-V8-G4' && a.approval_state === 'ratified' &&
    a.gate_disposition === 'EXTERNAL_PROVIDER_FILE_BATCH_MIGRATION_AND_EXCHANGE_CONTRACT_DEFINITION_READY');

  // Package 5 closure (V8-I), gate disposition, and dual freeze (PACKAGE-8-5, VOLUME-8).
  const closureApproval = approvals.some((a) => a.artifact_id === 'V8-I' && a.approval_state === 'ratified');
  const packageFreeze = approvals.some((a) => a.artifact_id === 'PACKAGE-8-5' && a.approval_state === 'ratified' && a.frozen === true);
  const volumeFreeze = approvals.some((a) => a.artifact_id === 'VOLUME-8' && a.approval_state === 'ratified' && a.frozen === true);
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V8-G5' && a.approval_state === 'ratified');
  const gateDispositioned = !!gateApproval && gateApproval.gate_disposition === GATE_DISPOSITION;

  // Fail-closed provenance binding: a completed gate must not report ready while any
  // required gate/closure/freeze effectiveness binding remains an unresolved
  // placeholder. Forward-referencing provenance-amendment fields are excluded.
  const closureRecord = approvals.find((a) => a.artifact_id === 'V8-I' && a.approval_state === 'ratified');
  const packageFreezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-8-5' && a.approval_state === 'ratified');
  const volumeFreezeRecord = approvals.find((a) => a.artifact_id === 'VOLUME-8' && a.approval_state === 'ratified');
  const bindingValues = [
    gateApproval?.effective_commit,
    gateApproval?.gate_effective_commit,
    closureRecord?.closure_binding?.closure_authored_commit,
    closureRecord?.closure_binding?.closure_effective_commit,
    closureRecord?.closure_binding?.freeze_commit,
    closureRecord?.closure_binding?.gate_effective_commit,
    packageFreezeRecord?.authoring_closure_separation?.substantive_authoring_commit,
    packageFreezeRecord?.authoring_closure_separation?.closure_authored_commit,
    packageFreezeRecord?.authoring_closure_separation?.closure_effective_commit,
    packageFreezeRecord?.authoring_closure_separation?.gate_effective_commit,
    packageFreezeRecord?.authoring_closure_separation?.freeze_commit,
    volumeFreezeRecord?.authoring_closure_separation?.freeze_commit
  ];
  const gateBindingsResolved = !!gateApproval && bindingValues.filter((v) => v !== undefined).length > 0 && !bindingValues.some((v) => isPlaceholder(v));

  // Genuine authoring / closure-freeze / pre-merge-binding separation.
  const sep = packageFreezeRecord?.authoring_closure_separation ?? {};
  const separationGenuine =
    sep.separation_status === 'SEPARATED' &&
    sep.sequence_disposition === 'COMPLIANT' &&
    Boolean(sep.substantive_authoring_commit && sep.closure_authored_commit) &&
    !isPlaceholder(sep.substantive_authoring_commit) &&
    !isPlaceholder(sep.closure_authored_commit) &&
    sep.substantive_authoring_commit !== sep.closure_authored_commit;

  add(1, 'Package 4 provenance, V8-H, and V8-H-1 are inherited',
    hasChapter(ctx, 'V8-H') && hasChapter(ctx, 'V8-H-1') && g4Dispositioned);
  add(2, 'Packages 1 through 4 remain frozen and unchanged', p1Frozen && p2Frozen && p3Frozen && p4Frozen);
  add(3, 'One integrated contract-definition baseline exists',
    hasChapter(ctx, 'V8-41') && capabilities.length >= 1);
  add(4, 'House retains institutional authority over the integrated surface catalogue',
    hasChapter(ctx, 'V8-42') && catalogue.length >= 1 && catalogue.every((c) => c.institutional_authority) && bodyMentions(ctx, 'V8-42', 'institutional authority'));
  add(5, 'The Button is recorded as an intent initiator and consumer, not an authority',
    bodyMentions(ctx, 'V8-42', 'Button') && bodyMentions(ctx, 'V8-42', 'custody'));
  add(6, 'Every catalogued surface names owner, authority, and trust boundary and is traceable',
    catalogue.length >= 1 && catalogue.every((c) => c.contract_owner && c.institutional_authority && c.trust_boundary && (c.traces_to ?? []).length > 0));
  add(7, 'Commands, queries, events, webhooks, callbacks, files, batches, migrations, and manual exchanges are distinct capability families',
    hasChapter(ctx, 'V8-43') && hasChapter(ctx, 'V8-44') && hasChapter(ctx, 'V8-45') && families.size >= 7);
  add(8, 'Authentication remains distinct from authorization',
    hasChapter(ctx, 'V8-46') && bodyMentions(ctx, 'V8-46', 'Authentication') && bodyMentions(ctx, 'V8-46', 'authorization'));
  add(9, 'Resource-aware authorization context is complete and fail-closed',
    bodyMentions(ctx, 'V8-46', 'fail-closed') && bodyMentions(ctx, 'V8-46', 'authorization context'));
  add(10, 'Commands define authority, target, preconditions, idempotency, conflict, acceptance, rejection, and evidence',
    bodyMentions(ctx, 'V8-43', 'Command accepted') && bodyMentions(ctx, 'V8-43', 'business outcome'));
  add(11, 'Queries define source, scope, sensitivity, staleness, disclosure, and degraded posture',
    bodyMentions(ctx, 'V8-43', 'staleness') && bodyMentions(ctx, 'V8-43', 'disclosure'));
  add(12, 'Logical resources declare authoritative-or-projected status, classification, lifecycle, and version',
    bodyMentions(ctx, 'V8-42', 'projected') && bodyMentions(ctx, 'V8-42', 'lifecycle'));
  add(13, 'Event envelopes declare identity, version, provenance, scope, sensitivity, correlation, and replay',
    hasChapter(ctx, 'V8-44') && bodyMentions(ctx, 'V8-44', 'envelope') && bodyMentions(ctx, 'V8-44', 'replay'));
  add(14, 'Outbox persistence is distinct from publication, delivery, consumer effect, and reconciliation',
    bodyMentions(ctx, 'V8-44', 'outbox') && bodyMentions(ctx, 'V8-44', 'State transition') && bodyMentions(ctx, 'V8-44', 'reconciliation'));
  add(15, 'Exactly-once business effect is distinct from transport delivery',
    bodyMentions(ctx, 'V8-44', 'exactly-once'));
  add(16, 'Webhooks and callbacks define authentication, integrity, replay, idempotency, and reconciliation',
    bodyMentions(ctx, 'V8-44', 'webhook') && bodyMentions(ctx, 'V8-44', 'integrity'));
  add(17, 'Errors and unknown outcomes are controlled, privacy-safe, and language-neutral',
    hasChapter(ctx, 'V8-47') && bodyMentions(ctx, 'V8-47', 'unknown outcome') && bodyMentions(ctx, 'V8-47', 'Timeout'));
  add(18, 'Data minimization, classification, evidence, privacy, records, and audit are synthesised',
    hasChapter(ctx, 'V8-48') && bodyMentions(ctx, 'V8-48', 'minimization') && bodyMentions(ctx, 'V8-48', 'audit'));
  add(19, 'Provider incidents, continuity, return, deletion, residual copies, and exit remain governed',
    hasChapter(ctx, 'V8-45') && bodyMentions(ctx, 'V8-45', 'provider') && bodyMentions(ctx, 'V8-45', 'exit'));
  add(20, 'Imports, exports, files, batches, migrations, and manual exchanges preserve authority, provenance, uncertainty, acceptance, quarantine, disclosure, and reconciliation',
    bodyMentions(ctx, 'V8-45', 'provenance') && bodyMentions(ctx, 'V8-45', 'quarantine') && bodyMentions(ctx, 'V8-45', 'reconciliation'));
  add(21, 'Versioning, compatibility, deprecation, replacement, and change control are complete',
    hasChapter(ctx, 'V8-49') && bodyMentions(ctx, 'V8-49', 'deprecation') && bodyMentions(ctx, 'V8-49', 'change control'));
  add(22, 'Accessibility and bilingual obligations cover notifications, documents, and user-facing surfaces',
    bodyMentions(ctx, 'V8-48', 'French') && bodyMentions(ctx, 'V8-48', 'accessibility'));
  add(23, 'House P0 findings carry complete contract and evidence mappings',
    hasChapter(ctx, 'V8-50') && p0Coverage.length >= 14 &&
      p0Coverage.every((p) => p.p0_finding && p.contract_surface_ref && p.required_implementation_evidence && p.definition_status === 'DEFINED'));
  add(24, 'Every unresolved item has an owner, an evidence requirement, and a valid downstream gate',
    hasChapter(ctx, 'V8-51') && backlogComplete && readinessDispositioned);
  add(25, 'No active unresolved item points to a completed Volume 8 gate or to Gate V8-G5', noActivePointsToClosedOrG5);
  add(26, 'Deterministic whole-volume closure analysis completes without blocking defects',
    hasChapter(ctx, 'V8-53') && structuralErrors === 0 && decisions.length >= 1);
  add(27, 'No executable interface, event, integration, exchange, or infrastructure specification is created', leakageErrors === 0);
  add(28, 'No implementation, delivery, reconciliation, migration, provider, privacy, compatibility, or operational claim is made without evidence', allNotImplemented);
  add(29, 'No infrastructure, procurement, sequencing, staffing, cost, pilot, rollout, launch, or master development plan is authorised',
    bodyMentions(ctx, 'V8-53', 'procurement') && bodyMentions(ctx, 'V8-53', 'master development plan'));
  add(30, 'No record authorizes implementation', allNotImplemented && noApprovalAuthorizes);
  add(31, 'Package 5 and the whole of Volume 8 receive explicit freeze approvals',
    closureApproval && packageFreeze && volumeFreeze);
  add(32, 'Package 5 uses genuine authoring, closure/dual-freeze, and pre-merge provenance-binding separation with a resolved gate binding',
    closureApproval && packageFreeze && volumeFreeze && gateDispositioned && gateBindingsResolved && separationGenuine);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V8_G5_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V8-G5'));
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
    gate: 'V8-G5',
    disposition_target: GATE_DISPOSITION,
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v8-g5-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V8-G5 readiness', run);
}
