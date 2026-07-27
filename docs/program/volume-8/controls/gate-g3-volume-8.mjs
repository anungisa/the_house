// Control: Gate V8-G3 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the twenty-eight Gate V8-G3 conditions from the Volume 8 Package 3
// directive (affiliation event, outbox, webhook, notification, and delivery-contract
// definition) against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-805 approval carrying GATE-V8-G3 and the disposition
// AFFILIATION_EVENT_AND_DELIVERY_CONTRACT_DEFINITION_READY.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-8.mjs';
import { isPlaceholder } from './provenance-integrity-volume-8.mjs';

// Package 3 chapters (affiliation event-and-delivery contract definition).
const P3 = new Set(['V8-21', 'V8-22', 'V8-23', 'V8-24', 'V8-25', 'V8-26', 'V8-27', 'V8-28', 'V8-29', 'V8-30']);

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}
function inP3(list) {
  return list.filter((r) => P3.has(r.chapter_ref));
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

  const eventSurfaces = inP3(byKind(ctx, 'REG-801', 'EVENT_CONTRACT_SURFACE'));
  const eventProducers = inP3(byKind(ctx, 'REG-801', 'EVENT_PRODUCER_CONTEXT'));
  const eventConsumers = inP3(byKind(ctx, 'REG-801', 'EVENT_CONSUMER_CONTEXT'));
  const webhookContexts = inP3(byKind(ctx, 'REG-801', 'WEBHOOK_CONTEXT'));
  const notificationContexts = inP3(byKind(ctx, 'REG-801', 'NOTIFICATION_CONTEXT'));
  const deliveryBoundaries = inP3(byKind(ctx, 'REG-801', 'DELIVERY_TRUST_BOUNDARY'));

  const eventContracts = inP3(byKind(ctx, 'REG-802', 'EVENT_CONTRACT'));
  const envelopes = inP3(byKind(ctx, 'REG-802', 'EVENT_ENVELOPE_REQUIREMENT'));
  const outbox = inP3(byKind(ctx, 'REG-802', 'OUTBOX_REQUIREMENT'));
  const deliverySemantics = inP3(byKind(ctx, 'REG-802', 'DELIVERY_SEMANTIC'));
  const consumers = inP3(byKind(ctx, 'REG-802', 'CONSUMER_REQUIREMENT'));
  const dedup = inP3(byKind(ctx, 'REG-802', 'DEDUPLICATION_REQUIREMENT'));
  const ordering = inP3(byKind(ctx, 'REG-802', 'ORDERING_REQUIREMENT'));
  const replay = inP3(byKind(ctx, 'REG-802', 'REPLAY_REQUIREMENT'));
  const webhookReqs = inP3(byKind(ctx, 'REG-802', 'WEBHOOK_REQUIREMENT'));
  const callbackReqs = inP3(byKind(ctx, 'REG-802', 'CALLBACK_REQUIREMENT'));
  const quarantine = inP3(byKind(ctx, 'REG-802', 'QUARANTINE_REQUIREMENT'));
  const notifications = inP3(byKind(ctx, 'REG-802', 'NOTIFICATION_REQUIREMENT'));
  const compatibility = inP3(byKind(ctx, 'REG-802', 'COMPATIBILITY_RULE'));
  const decisions = records(ctx, 'REG-803').filter((d) => P3.has(d.chapter_ref));
  const backlog = records(ctx, 'REG-804').filter((b) => P3.has(b.chapter_ref));
  const approvals = records(ctx, 'REG-805');

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;

  const allNotImplemented = ['REG-801', 'REG-802', 'REG-803', 'REG-804']
    .flatMap((r) => records(ctx, r))
    .every((r) => r.authorizes_implementation === false && r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');
  const noApprovalAuthorizes = approvals.every((a) => a.authorizes_implementation === false);

  const backlogComplete = backlog.length > 0 && backlog.every((b) => b.owner && b.future_blocking_gate);

  // Package 1 and Package 2 remain frozen and dispositioned (inherited).
  const p1Frozen = approvals.some((a) => a.artifact_id === 'PACKAGE-8-1' && a.approval_state === 'ratified' && a.frozen === true);
  const p2Frozen = approvals.some((a) => a.artifact_id === 'PACKAGE-8-2' && a.approval_state === 'ratified' && a.frozen === true);
  const g2Dispositioned = approvals.some((a) => a.artifact_id === 'GATE-V8-G2' && a.approval_state === 'ratified' && a.gate_disposition === 'AFFILIATION_LOGICAL_CONTRACT_DEFINITION_READY');

  // Package 3 closure, gate disposition, and freeze.
  const closureApproval = approvals.some((a) => a.artifact_id === 'V8-E' && a.approval_state === 'ratified');
  const freezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-8-3' && a.approval_state === 'ratified');
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V8-G3' && a.approval_state === 'ratified');
  const gateDispositioned = !!gateApproval && gateApproval.gate_disposition === 'AFFILIATION_EVENT_AND_DELIVERY_CONTRACT_DEFINITION_READY';

  // Fail-closed provenance binding: a completed gate must not report ready while any
  // required gate/closure/freeze effectiveness binding remains an unresolved
  // placeholder (PENDING/UNKNOWN/TBD/PLACEHOLDER/UNRESOLVED). Forward-referencing
  // provenance-amendment fields are excluded; they are validated by role classification.
  const closureRecord = approvals.find((a) => a.artifact_id === 'V8-E' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-8-3' && a.approval_state === 'ratified');
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

  add(1, 'Package 3 inherits the corrected Package 2 provenance and the V8-D / V8-D-1 amendments',
    hasChapter(ctx, 'V8-D') && hasChapter(ctx, 'V8-D-1') && g2Dispositioned);
  add(2, 'Packages 1 and 2 remain frozen and unchanged', p1Frozen && p2Frozen);
  add(3, 'Event-contract taxonomy and authority doctrine are controlled',
    hasChapter(ctx, 'V8-21') && eventSurfaces.length >= 1 && eventProducers.length >= 1);
  add(4, 'Commands remain distinct from events', bodyMentions(ctx, 'V8-21', 'Command') && bodyMentions(ctx, 'V8-21', 'event'));
  add(5, 'Domain, integration, notification, audit, webhook, callback, and reconciliation event types are distinct',
    notificationContexts.length >= 1 && webhookContexts.length >= 1 && eventConsumers.length >= 1);
  add(6, 'Events represent governed facts with authoritative sources and owners',
    eventContracts.length >= 10 && eventContracts.every((e) => e.institutional_authority && e.authoritative_source));
  add(7, 'Event envelopes define identity, version, provenance, scope, correlation, causation, sensitivity, and replay',
    hasChapter(ctx, 'V8-22') && envelopes.length >= 1 && envelopes.some((e) => (e.envelope_fields ?? []).length >= 12 && e.replay_posture));
  add(8, 'Affiliation lifecycle transitions map to explicit event dispositions',
    hasChapter(ctx, 'V8-23') && eventContracts.every((e) => e.triggering_transition));
  add(9, 'Authoritative state and outbox records share one logical atomicity requirement',
    hasChapter(ctx, 'V8-24') && outbox.length >= 1 && outbox.some((o) => o.atomicity_requirement));
  add(10, 'Outbox persistence remains distinct from publication and delivery',
    outbox.some((o) => o.publication_eligibility) && bodyMentions(ctx, 'V8-24', 'published'));
  add(11, 'At-least-once transport remains distinct from exactly-once business effect',
    deliverySemantics.length >= 1 && deliverySemantics.some((d) => d.exactly_once_business_invariant));
  add(12, 'Consumers define idempotency and deduplication requirements',
    hasChapter(ctx, 'V8-26') && consumers.length >= 1 && consumers.every((c) => c.idempotency_requirement || c.deduplication_scope) && dedup.length >= 1);
  add(13, 'Ordering is scoped explicitly and global ordering is not presumed',
    ordering.length >= 1 && ordering.some((o) => o.ordering_requirement === 'GLOBAL_NOT_PRESUMED'));
  add(14, 'Replay requires authority, provenance, and evidence',
    replay.length >= 1 && replay.every((r) => r.replay_authority && r.replay_evidence));
  add(15, 'Webhooks and callbacks define authentication, integrity, replay, scope, idempotency, and reconciliation',
    hasChapter(ctx, 'V8-25') && webhookReqs.length >= 1 &&
      webhookReqs.every((w) => w.authentication_requirement && w.integrity_requirement && (w.replay_protection_dependency || w.replay_posture) && w.reconciliation_dependency) &&
      callbackReqs.length >= 1);
  add(16, 'Webhook acknowledgement remains distinct from authoritative reconciliation',
    bodyMentions(ctx, 'V8-25', 'acknowledgement') && bodyMentions(ctx, 'V8-25', 'reconciliation'));
  add(17, 'Unknown provider outcomes remain unresolved until reconciliation',
    callbackReqs.length >= 1 && callbackReqs.every((c) => c.unknown_outcome_posture && c.reconciliation_dependency));
  add(18, 'Failure, retry, quarantine, dead-letter, and compensation preserve institutional history',
    hasChapter(ctx, 'V8-28') && quarantine.length >= 1 && quarantine.every((q) => q.quarantine_posture && q.reconciliation_dependency));
  add(19, 'Notification contracts are minimum-necessary, accessible, and bilingual',
    hasChapter(ctx, 'V8-27') && notifications.length >= 2 && notifications.every((n) => n.english_semantic && n.french_semantic && n.accessibility_requirement && n.minimum_necessary_content));
  add(20, 'Restricted evidence is excluded from routine event and notification content',
    hasChapter(ctx, 'V8-29') && notifications.every((n) => n.classification !== 'RESTRICTED_EVIDENCE') && eventContracts.every((e) => e.classification !== 'RESTRICTED_EVIDENCE'));
  add(21, 'Finance, activation, audit, security, and provider boundaries preserve authority',
    deliveryBoundaries.length >= 1 && deliveryBoundaries.every((b) => b.fail_closed_posture) && decisions.length >= 8);
  add(22, 'Event versioning and compatibility are evaluated against known producers and consumers',
    hasChapter(ctx, 'V8-30') && compatibility.length >= 1 && compatibility.every((c) => c.compatibility_state && c.consumer_evidence));
  add(23, 'Every unresolved item has an owner, an evidence requirement, and a valid future gate', backlogComplete);
  add(24, 'Deterministic Package 3 analysis completes without blocking defects', structuralErrors === 0);
  add(25, 'No executable schema, endpoint, topic, broker, or coded-contract artifacts are created', leakageErrors === 0);
  add(26, 'No delivery, exactly-once, provider-assurance, or integration claim is asserted without evidence', allNotImplemented);
  add(27, 'No record authorizes implementation', allNotImplemented && noApprovalAuthorizes);
  add(28, 'Package 3 uses genuine authoring, closure/freeze, and pre-merge provenance-binding separation with a resolved gate binding',
    closureApproval && freezeApproval && gateDispositioned && gateBindingsResolved && separationGenuine);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V8_G3_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V8-G3'));
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
    gate: 'V8-G3',
    disposition_target: 'AFFILIATION_EVENT_AND_DELIVERY_CONTRACT_DEFINITION_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v8-g3-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V8-G3 readiness', run);
}
