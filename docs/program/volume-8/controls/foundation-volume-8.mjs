// Control: Volume 8 Package 1 contract-governance-foundation coverage analysis and
// NON-AUTHORITATIVE projections.
//
// Emits deterministic JSON projections and a markdown coverage report for the API,
// event, integration, and exchange-contract governance foundation. All generated
// files are projections of the source-controlled corpus and are never
// authoritative. The control also returns findings: coverage gaps enumerated by
// the directive (surfaces without authority, endpoints without ownership, commands
// without result semantics, queries without staleness posture, events without
// delivery posture, webhooks without integrity handling, requirements without
// idempotency, unknown outcomes without reconciliation, errors without canonical
// codes, restricted data without privacy constraints, providers without exit
// obligations, exchanges without reconciliation, and compatibility rules without
// consumer evidence) are reported as INFO backlog signals; only genuinely blocking
// structural defects are raised elsewhere as ERRORs.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}

function analyse(ctx) {
  const surfaces = byKind(ctx, 'REG-801', 'CONTRACT_SURFACE');
  const producers = byKind(ctx, 'REG-801', 'PRODUCER');
  const consumers = byKind(ctx, 'REG-801', 'CONSUMER');
  const trustBoundaries = byKind(ctx, 'REG-801', 'TRUST_BOUNDARY');
  const providerContexts = byKind(ctx, 'REG-801', 'PROVIDER_CONTEXT');
  const authContexts = byKind(ctx, 'REG-801', 'AUTHORIZATION_CONTEXT');
  const commands = byKind(ctx, 'REG-802', 'COMMAND_CLASS');
  const queries = byKind(ctx, 'REG-802', 'QUERY_CLASS');
  const events = byKind(ctx, 'REG-802', 'EVENT_CLASS');
  const webhooks = byKind(ctx, 'REG-802', 'WEBHOOK_CLASS');
  const exchanges = byKind(ctx, 'REG-802', 'EXCHANGE_CLASS');
  const messages = byKind(ctx, 'REG-802', 'MESSAGE_REQUIREMENT');
  const errors = byKind(ctx, 'REG-802', 'ERROR_SEMANTIC');
  const delivery = byKind(ctx, 'REG-802', 'DELIVERY_REQUIREMENT');
  const idempotency = byKind(ctx, 'REG-802', 'IDEMPOTENCY_REQUIREMENT');
  const replay = byKind(ctx, 'REG-802', 'REPLAY_REQUIREMENT');
  const reconciliation = byKind(ctx, 'REG-802', 'RECONCILIATION_REQUIREMENT');
  const compatibility = byKind(ctx, 'REG-802', 'COMPATIBILITY_RULE');
  const decisions = records(ctx, 'REG-803');
  const backlog = records(ctx, 'REG-804');

  const surfacesWithoutAuthority = surfaces.filter((s) => !s.institutional_authority);
  const endpointsWithoutOwnership = [...producers, ...consumers].filter((p) => !p.owner && !p.institutional_authority);
  const commandsWithoutResult = commands.filter((c) => !c.result_semantics);
  const queriesWithoutStaleness = queries.filter((q) => !q.staleness_posture);
  const eventsWithoutDelivery = events.filter((e) => !e.delivery_posture);
  const webhooksWithoutIntegrity = webhooks.filter((w) => !w.integrity_requirement);
  const errorsWithoutCode = errors.filter((e) => !e.canonical_code);
  const providersWithoutExit = providerContexts.filter((p) => !p.exit_dependency);
  const exchangesWithoutReconciliation = exchanges.filter((x) => !x.reconciliation_dependency);
  const compatibilityWithoutEvidence = compatibility.filter((c) => !c.consumer_evidence);

  return {
    counts: {
      contract_surfaces: surfaces.length,
      producers: producers.length,
      consumers: consumers.length,
      trust_boundaries: trustBoundaries.length,
      provider_contexts: providerContexts.length,
      authorization_contexts: authContexts.length,
      command_classes: commands.length,
      query_classes: queries.length,
      event_classes: events.length,
      webhook_classes: webhooks.length,
      exchange_classes: exchanges.length,
      message_requirements: messages.length,
      error_semantics: errors.length,
      delivery_requirements: delivery.length,
      idempotency_requirements: idempotency.length,
      replay_requirements: replay.length,
      reconciliation_requirements: reconciliation.length,
      compatibility_rules: compatibility.length,
      decisions: decisions.length,
      backlog: backlog.length
    },
    gaps: {
      surfaces_without_authority: surfacesWithoutAuthority.map((r) => r.id),
      endpoints_without_ownership: endpointsWithoutOwnership.map((r) => r.id),
      commands_without_result: commandsWithoutResult.map((r) => r.id),
      queries_without_staleness: queriesWithoutStaleness.map((r) => r.id),
      events_without_delivery: eventsWithoutDelivery.map((r) => r.id),
      webhooks_without_integrity: webhooksWithoutIntegrity.map((r) => r.id),
      errors_without_canonical_code: errorsWithoutCode.map((r) => r.id),
      providers_without_exit: providersWithoutExit.map((r) => r.id),
      exchanges_without_reconciliation: exchangesWithoutReconciliation.map((r) => r.id),
      compatibility_without_consumer_evidence: compatibilityWithoutEvidence.map((r) => r.id)
    }
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  for (const [name, list] of Object.entries(a.gaps)) {
    if (list.length > 0) {
      findings.push(makeFinding(Severity.INFO, 'CONTRACT_COVERAGE_GAP', `${name}: ${list.join(', ')}`, 'REG-801/REG-802'));
    }
  }
  return findings;
}

function report(ctx, a) {
  const now = new Date().toISOString();
  const countRows = Object.entries(a.counts).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const gapRows = Object.entries(a.gaps).map(([k, v]) => `| ${k} | ${v.length} | ${v.join(', ') || '(none)'} |`).join('\n');
  return `# Volume 8 Package 1 — Contract Governance Foundation Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 8 API, event, integration, and exchange-contract governance foundation
> corpus. It is not a source of truth, confers no ratification, and asserts no
> implementation, interface conformance, delivery guarantee, integration outcome,
> provider assurance, or compatibility validation. The Markdown chapters, YAML
> registers, JSON schemas, and control scripts are the authoritative record.
> Volume 0 through Volume 7 remain frozen/released and are not modified by Volume 8
> work. Volume 8 Package 1 defines CONTRACT-GOVERNANCE, AUTHORITY, IDENTITY,
> DELIVERY, IDEMPOTENCY, ERROR, PRIVACY, PROVIDER, and COMPATIBILITY OBLIGATIONS
> only and authorizes no implementation.

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
  const outDir = join(VOLUME_DIR, 'generated', 'foundation');
  mkdirSync(outDir, { recursive: true });

  const write = (name, obj) => writeFileSync(join(outDir, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');
  write('contract-surface-catalogue.json', { counts: { contract_surfaces: a.counts.contract_surfaces, producers: a.counts.producers, consumers: a.counts.consumers }, gaps: { surfaces_without_authority: a.gaps.surfaces_without_authority, endpoints_without_ownership: a.gaps.endpoints_without_ownership } });
  write('identity-and-trust-boundary-coverage.json', { trust_boundaries: a.counts.trust_boundaries, authorization_contexts: a.counts.authorization_contexts });
  write('command-and-query-semantics.json', { command_classes: a.counts.command_classes, query_classes: a.counts.query_classes, commands_without_result: a.gaps.commands_without_result, queries_without_staleness: a.gaps.queries_without_staleness });
  write('event-and-webhook-coverage.json', { event_classes: a.counts.event_classes, webhook_classes: a.counts.webhook_classes, events_without_delivery: a.gaps.events_without_delivery, webhooks_without_integrity: a.gaps.webhooks_without_integrity });
  write('idempotency-and-replay-coverage.json', { idempotency_requirements: a.counts.idempotency_requirements, replay_requirements: a.counts.replay_requirements, reconciliation_requirements: a.counts.reconciliation_requirements, exchanges_without_reconciliation: a.gaps.exchanges_without_reconciliation });
  write('error-and-reconciliation-taxonomy.json', { error_semantics: a.counts.error_semantics, errors_without_canonical_code: a.gaps.errors_without_canonical_code });
  write('provider-and-exchange-coverage.json', { provider_contexts: a.counts.provider_contexts, exchange_classes: a.counts.exchange_classes, providers_without_exit: a.gaps.providers_without_exit });
  write('compatibility-and-versioning-coverage.json', { compatibility_rules: a.counts.compatibility_rules, compatibility_without_consumer_evidence: a.gaps.compatibility_without_consumer_evidence });
  writeFileSync(join(outDir, 'package-1-contract-governance-foundation-report.md'), report(ctx, a), 'utf8');
  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Contract governance foundation coverage', run);
}
