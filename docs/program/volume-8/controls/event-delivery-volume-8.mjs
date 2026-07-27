// Control: Volume 8 Package 3 event-and-delivery contract coverage analysis and
// NON-AUTHORITATIVE projections.
//
// Emits deterministic JSON projections and a markdown coverage report for the
// affiliation event, transactional-outbox, delivery-semantic, consumer, webhook,
// callback, notification, failure/quarantine, boundary-constraint, and event
// compatibility contract plane defined in Package 3. Every generated file is a
// projection of the source-controlled corpus and is never authoritative. The
// control also returns coverage-gap findings as INFO backlog signals; genuinely
// blocking structural defects are raised elsewhere as ERRORs.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

const P3 = new Set(['V8-21', 'V8-22', 'V8-23', 'V8-24', 'V8-25', 'V8-26', 'V8-27', 'V8-28', 'V8-29', 'V8-30']);

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind && P3.has(r.chapter_ref));
}

function analyse(ctx) {
  const eventSurfaces = byKind(ctx, 'REG-801', 'EVENT_CONTRACT_SURFACE');
  const eventProducers = byKind(ctx, 'REG-801', 'EVENT_PRODUCER_CONTEXT');
  const eventConsumers = byKind(ctx, 'REG-801', 'EVENT_CONSUMER_CONTEXT');
  const webhookContexts = byKind(ctx, 'REG-801', 'WEBHOOK_CONTEXT');
  const notificationContexts = byKind(ctx, 'REG-801', 'NOTIFICATION_CONTEXT');
  const deliveryBoundaries = byKind(ctx, 'REG-801', 'DELIVERY_TRUST_BOUNDARY');

  const eventContracts = byKind(ctx, 'REG-802', 'EVENT_CONTRACT');
  const envelopes = byKind(ctx, 'REG-802', 'EVENT_ENVELOPE_REQUIREMENT');
  const outbox = byKind(ctx, 'REG-802', 'OUTBOX_REQUIREMENT');
  const deliverySemantics = byKind(ctx, 'REG-802', 'DELIVERY_SEMANTIC');
  const consumers = byKind(ctx, 'REG-802', 'CONSUMER_REQUIREMENT');
  const dedup = byKind(ctx, 'REG-802', 'DEDUPLICATION_REQUIREMENT');
  const ordering = byKind(ctx, 'REG-802', 'ORDERING_REQUIREMENT');
  const replay = byKind(ctx, 'REG-802', 'REPLAY_REQUIREMENT');
  const webhookReqs = byKind(ctx, 'REG-802', 'WEBHOOK_REQUIREMENT');
  const callbackReqs = byKind(ctx, 'REG-802', 'CALLBACK_REQUIREMENT');
  const quarantine = byKind(ctx, 'REG-802', 'QUARANTINE_REQUIREMENT');
  const notifications = byKind(ctx, 'REG-802', 'NOTIFICATION_REQUIREMENT');
  const compatibility = byKind(ctx, 'REG-802', 'COMPATIBILITY_RULE');

  const eventsWithoutTransition = eventContracts.filter((e) => !e.triggering_transition);
  const eventsWithoutSource = eventContracts.filter((e) => !e.institutional_authority || !e.authoritative_source);
  const envelopesWithoutReplay = envelopes.filter((e) => !e.replay_posture);
  const outboxWithoutAtomicity = outbox.filter((o) => !o.atomicity_requirement);
  const semanticsWithoutInvariant = deliverySemantics.filter((d) => !d.exactly_once_business_invariant);
  const consumersWithoutIdempotency = consumers.filter((c) => !c.idempotency_requirement && !c.deduplication_scope);
  const orderingGlobalPresumed = ordering.filter((o) => o.ordering_requirement !== 'GLOBAL_NOT_PRESUMED' && o.ordering_requirement !== 'PER_AGGREGATE' && o.ordering_requirement !== 'PER_PARTITION_SCOPE' && o.ordering_requirement !== 'NONE');
  const replayWithoutAuthority = replay.filter((r) => !r.replay_authority || !r.replay_evidence);
  const webhooksWithoutIntegrity = webhookReqs.filter((w) => !w.integrity_requirement);
  const callbacksWithoutUnknownOutcome = callbackReqs.filter((c) => !c.unknown_outcome_posture);
  const quarantineWithoutReconciliation = quarantine.filter((q) => !q.reconciliation_dependency);
  const notificationsNotBilingual = notifications.filter((n) => !n.english_semantic || !n.french_semantic || !n.accessibility_requirement);
  const notificationsCarryingRestricted = notifications.filter((n) => n.classification === 'RESTRICTED_EVIDENCE');
  const compatibilityWithoutEvidence = compatibility.filter((c) => !c.consumer_evidence);

  return {
    counts: {
      event_contract_surfaces: eventSurfaces.length,
      event_producer_contexts: eventProducers.length,
      event_consumer_contexts: eventConsumers.length,
      webhook_contexts: webhookContexts.length,
      notification_contexts: notificationContexts.length,
      delivery_trust_boundaries: deliveryBoundaries.length,
      event_contracts: eventContracts.length,
      event_envelope_requirements: envelopes.length,
      outbox_requirements: outbox.length,
      delivery_semantics: deliverySemantics.length,
      consumer_requirements: consumers.length,
      deduplication_requirements: dedup.length,
      ordering_requirements: ordering.length,
      replay_requirements: replay.length,
      webhook_requirements: webhookReqs.length,
      callback_requirements: callbackReqs.length,
      quarantine_requirements: quarantine.length,
      notification_requirements: notifications.length,
      compatibility_rules: compatibility.length
    },
    records: {
      eventSurfaces, eventProducers, eventConsumers, webhookContexts, notificationContexts, deliveryBoundaries,
      eventContracts, envelopes, outbox, deliverySemantics, consumers, dedup, ordering, replay,
      webhookReqs, callbackReqs, quarantine, notifications, compatibility
    },
    gaps: {
      events_without_triggering_transition: eventsWithoutTransition.map((r) => r.id),
      events_without_authority_or_source: eventsWithoutSource.map((r) => r.id),
      envelopes_without_replay_posture: envelopesWithoutReplay.map((r) => r.id),
      outbox_without_atomicity: outboxWithoutAtomicity.map((r) => r.id),
      delivery_semantics_without_business_invariant: semanticsWithoutInvariant.map((r) => r.id),
      consumers_without_idempotency: consumersWithoutIdempotency.map((r) => r.id),
      ordering_with_presumed_global: orderingGlobalPresumed.map((r) => r.id),
      replay_without_authority_or_evidence: replayWithoutAuthority.map((r) => r.id),
      webhooks_without_integrity: webhooksWithoutIntegrity.map((r) => r.id),
      callbacks_without_unknown_outcome: callbacksWithoutUnknownOutcome.map((r) => r.id),
      quarantine_without_reconciliation: quarantineWithoutReconciliation.map((r) => r.id),
      notifications_not_bilingual_or_accessible: notificationsNotBilingual.map((r) => r.id),
      notifications_carrying_restricted_evidence: notificationsCarryingRestricted.map((r) => r.id),
      compatibility_without_consumer_evidence: compatibilityWithoutEvidence.map((r) => r.id)
    }
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  for (const [name, list] of Object.entries(a.gaps)) {
    if (list.length > 0) {
      findings.push(makeFinding(Severity.INFO, 'EVENT_DELIVERY_COVERAGE_GAP', `${name}: ${list.join(', ')}`, 'REG-801/REG-802'));
    }
  }
  return findings;
}

function report(ctx, a) {
  const now = new Date().toISOString();
  const countRows = Object.entries(a.counts).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const gapRows = Object.entries(a.gaps).map(([k, v]) => `| ${k} | ${v.length} | ${v.join(', ') || '(none)'} |`).join('\n');
  return `# Volume 8 Package 3 — Event and Delivery Contract Coverage Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 8 Package 3 affiliation event, outbox, webhook, notification, and
> delivery-contract corpus. It is not a source of truth, confers no ratification,
> and asserts no implementation, interface conformance, delivery guarantee,
> integration outcome, provider assurance, or compatibility validation. The
> Markdown chapters, YAML registers, JSON schemas, and control scripts are the
> authoritative record. Volume 0 through Volume 7 remain frozen/released and are
> not modified by Volume 8 work. Package 1 and Package 2 remain frozen. Package 3
> defines EVENT, ENVELOPE, OUTBOX, DELIVERY, CONSUMER, WEBHOOK, CALLBACK,
> NOTIFICATION, FAILURE, QUARANTINE, BOUNDARY, and COMPATIBILITY OBLIGATIONS only
> and authorizes no implementation, executable event schema, topic, endpoint,
> broker, transport, or provider integration.

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
  const outDir = join(VOLUME_DIR, 'generated', 'event-delivery-contracts');
  mkdirSync(outDir, { recursive: true });
  const write = (name, obj) => writeFileSync(join(outDir, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');

  write('event-contract-catalogue.json', {
    event_contract_surfaces: a.counts.event_contract_surfaces,
    event_contracts: a.counts.event_contracts,
    contracts: r.eventContracts.map((e) => ({ id: e.id, title: e.title, interaction_type: e.interaction_type, authority: e.institutional_authority, source: e.authoritative_source })),
    gaps: { events_without_authority_or_source: a.gaps.events_without_authority_or_source }
  });
  write('event-envelope-coverage.json', {
    event_envelope_requirements: a.counts.event_envelope_requirements,
    envelopes: r.envelopes.map((e) => ({ id: e.id, envelope_field_count: (e.envelope_fields ?? []).length, replay_posture: e.replay_posture ?? null })),
    gaps: { envelopes_without_replay_posture: a.gaps.envelopes_without_replay_posture }
  });
  write('lifecycle-event-transition-map.json', {
    event_contracts: a.counts.event_contracts,
    transitions: r.eventContracts.map((e) => ({ id: e.id, triggering_transition: e.triggering_transition ?? null, delivery_posture: e.delivery_posture ?? null, ordering_requirement: e.ordering_requirement ?? null })),
    gaps: { events_without_triggering_transition: a.gaps.events_without_triggering_transition }
  });
  write('outbox-and-delivery-semantics.json', {
    outbox_requirements: a.counts.outbox_requirements,
    delivery_semantics: a.counts.delivery_semantics,
    outbox: r.outbox.map((o) => ({ id: o.id, atomicity_requirement: o.atomicity_requirement ?? null, publication_eligibility: o.publication_eligibility ?? null, delivery_posture: o.delivery_posture ?? null })),
    semantics: r.deliverySemantics.map((d) => ({ id: d.id, delivery_posture: d.delivery_posture ?? null, exactly_once_business_invariant: d.exactly_once_business_invariant ?? null })),
    gaps: { outbox_without_atomicity: a.gaps.outbox_without_atomicity, delivery_semantics_without_business_invariant: a.gaps.delivery_semantics_without_business_invariant }
  });
  write('consumer-idempotency-and-ordering.json', {
    consumer_requirements: a.counts.consumer_requirements,
    ordering_requirements: a.counts.ordering_requirements,
    consumers: r.consumers.map((c) => ({ id: c.id, idempotency_requirement: c.idempotency_requirement ?? null, deduplication_scope: c.deduplication_scope ?? null })),
    ordering: r.ordering.map((o) => ({ id: o.id, ordering_requirement: o.ordering_requirement ?? null })),
    gaps: { consumers_without_idempotency: a.gaps.consumers_without_idempotency, ordering_with_presumed_global: a.gaps.ordering_with_presumed_global }
  });
  write('replay-and-deduplication-coverage.json', {
    replay_requirements: a.counts.replay_requirements,
    deduplication_requirements: a.counts.deduplication_requirements,
    replay: r.replay.map((x) => ({ id: x.id, replay_authority: x.replay_authority ?? null, replay_evidence: x.replay_evidence ?? null, replay_posture: x.replay_posture ?? null })),
    dedup: r.dedup.map((d) => ({ id: d.id, deduplication_scope: d.deduplication_scope ?? null })),
    gaps: { replay_without_authority_or_evidence: a.gaps.replay_without_authority_or_evidence }
  });
  write('webhook-and-callback-coverage.json', {
    webhook_contexts: a.counts.webhook_contexts,
    webhook_requirements: a.counts.webhook_requirements,
    callback_requirements: a.counts.callback_requirements,
    webhooks: r.webhookReqs.map((w) => ({ id: w.id, authentication_requirement: w.authentication_requirement ?? null, integrity_requirement: w.integrity_requirement ?? null, replay_protection_dependency: w.replay_protection_dependency ?? null, reconciliation_dependency: w.reconciliation_dependency ?? null })),
    callbacks: r.callbackReqs.map((c) => ({ id: c.id, unknown_outcome_posture: c.unknown_outcome_posture ?? null, reconciliation_dependency: c.reconciliation_dependency ?? null })),
    gaps: { webhooks_without_integrity: a.gaps.webhooks_without_integrity, callbacks_without_unknown_outcome: a.gaps.callbacks_without_unknown_outcome }
  });
  write('notification-contract-coverage.json', {
    notification_contexts: a.counts.notification_contexts,
    notification_requirements: a.counts.notification_requirements,
    notifications: r.notifications.map((n) => ({ id: n.id, audience: n.audience ?? null, english_semantic: Boolean(n.english_semantic), french_semantic: Boolean(n.french_semantic), accessibility_requirement: Boolean(n.accessibility_requirement), classification: n.classification ?? null })),
    gaps: { notifications_not_bilingual_or_accessible: a.gaps.notifications_not_bilingual_or_accessible, notifications_carrying_restricted_evidence: a.gaps.notifications_carrying_restricted_evidence }
  });
  write('failure-quarantine-and-reconciliation-coverage.json', {
    quarantine_requirements: a.counts.quarantine_requirements,
    quarantine: r.quarantine.map((q) => ({ id: q.id, quarantine_posture: q.quarantine_posture ?? null, reconciliation_dependency: q.reconciliation_dependency ?? null, compensation_limitation: q.compensation_limitation ?? null })),
    gaps: { quarantine_without_reconciliation: a.gaps.quarantine_without_reconciliation }
  });
  write('event-classification-and-boundary-constraints.json', {
    delivery_trust_boundaries: a.counts.delivery_trust_boundaries,
    boundaries: r.deliveryBoundaries.map((b) => ({ id: b.id, fail_closed_posture: Boolean(b.fail_closed_posture), classification: b.classification ?? null })),
    event_classifications: r.eventContracts.map((e) => ({ id: e.id, classification: e.classification ?? null, sensitivity: e.sensitivity ?? null })),
    gaps: { notifications_carrying_restricted_evidence: a.gaps.notifications_carrying_restricted_evidence }
  });
  write('event-compatibility-and-traceability.json', {
    compatibility_rules: a.counts.compatibility_rules,
    compatibility: r.compatibility.map((c) => ({ id: c.id, compatibility_state: c.compatibility_state ?? null, consumer_evidence: Boolean(c.consumer_evidence) })),
    gaps: { compatibility_without_consumer_evidence: a.gaps.compatibility_without_consumer_evidence }
  });
  writeFileSync(join(outDir, 'package-3-event-and-delivery-contract-report.md'), report(ctx, a), 'utf8');
  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Event-delivery contract coverage', run);
}
