// Control: Gate V8-G1 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the twenty-five Gate V8-G1 conditions from the Volume 8 Package 1
// directive against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-805 approval carrying GATE-V8-G1 and the disposition
// API_EVENT_INTEGRATION_CONTRACT_GOVERNANCE_FOUNDATION_READY.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-8.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
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
  const errors = byKind(ctx, 'REG-802', 'ERROR_SEMANTIC');
  const idempotency = byKind(ctx, 'REG-802', 'IDEMPOTENCY_REQUIREMENT');
  const delivery = byKind(ctx, 'REG-802', 'DELIVERY_REQUIREMENT');
  const replay = byKind(ctx, 'REG-802', 'REPLAY_REQUIREMENT');
  const reconciliation = byKind(ctx, 'REG-802', 'RECONCILIATION_REQUIREMENT');
  const compatibility = byKind(ctx, 'REG-802', 'COMPATIBILITY_RULE');
  const backlog = records(ctx, 'REG-804');
  const approvals = records(ctx, 'REG-805');

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;

  const allNotImplemented = ['REG-801', 'REG-802', 'REG-803', 'REG-804']
    .flatMap((r) => records(ctx, r))
    .every((r) => r.authorizes_implementation === false && r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');

  const backlogComplete = backlog.length > 0 && backlog.every((b) => b.owner && b.future_blocking_gate);
  const freezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-8-1' && a.approval_state === 'ratified');
  const closureApproval = approvals.some((a) => a.artifact_id === 'V8-A' && a.approval_state === 'ratified');

  add(1, 'Released Volume 7 provenance inherited', bodyMentions(ctx, 'V8-00', 'central-registration-volume-7-v1.0.0'));
  add(2, 'Contract authority and amendment rules controlled', hasChapter(ctx, 'V8-00'));
  add(3, 'Contract-authority doctrine defined', hasChapter(ctx, 'V8-01'));
  add(4, 'Contract-surface catalogue present', hasChapter(ctx, 'V8-02') && surfaces.length >= 6);
  add(5, 'Every contract surface names authority and authoritative source', surfaces.length > 0 && surfaces.every((s) => s.institutional_authority && s.authoritative_source));
  add(6, 'Identity, authorization-context, and trust-boundary model defined', hasChapter(ctx, 'V8-03') && trustBoundaries.length >= 2 && authContexts.length >= 1);
  add(7, 'Producers and consumers carry ownership', (producers.length + consumers.length) >= 4 && [...producers, ...consumers].every((p) => p.owner || p.institutional_authority));
  add(8, 'Command, query, and response semantics governed', hasChapter(ctx, 'V8-04') && commands.length >= 3 && queries.length >= 2);
  add(9, 'Commands name preconditions and result semantics', commands.length > 0 && commands.every((c) => (c.preconditions ?? []).length > 0 && c.result_semantics));
  add(10, 'Queries name authority and staleness posture', queries.length > 0 && queries.every((q) => (q.institutional_authority || q.authoritative_source) && q.staleness_posture));
  add(11, 'Event, outbox, and webhook doctrine defined', hasChapter(ctx, 'V8-05') && events.length >= 3 && webhooks.length >= 1);
  add(12, 'Events name envelope and delivery posture', events.length > 0 && events.every((e) => (e.envelope_fields ?? []).length > 0 && e.delivery_posture));
  add(13, 'Webhooks name authentication, integrity, and replay handling', webhooks.length > 0 && webhooks.every((w) => w.authentication_requirement && w.integrity_requirement && w.replay_posture));
  add(14, 'Idempotency, replay, ordering, and concurrency defined', hasChapter(ctx, 'V8-06') && (idempotency.length + delivery.length + replay.length) >= 3);
  add(15, 'Error and reconciliation taxonomy defined', hasChapter(ctx, 'V8-07') && errors.length >= 3 && reconciliation.length >= 1);
  add(16, 'Errors name language-neutral codes and privacy constraints', errors.length > 0 && errors.every((e) => e.canonical_code && (e.privacy_constraint || e.logging_constraint)));
  add(17, 'Data classification and privacy constraints defined', hasChapter(ctx, 'V8-08'));
  add(18, 'Provider, file, batch, and exchange foundation defined', hasChapter(ctx, 'V8-09') && providerContexts.length >= 1 && exchanges.length >= 2);
  add(19, 'Provider contexts name incident, continuity, exit, return, and deletion obligations', providerContexts.length > 0 && providerContexts.every((p) => p.incident_notification_dependency && p.continuity_dependency && p.exit_dependency && p.data_return_dependency && p.deletion_evidence_dependency));
  add(20, 'Versioning, compatibility, and deprecation defined', hasChapter(ctx, 'V8-10') && compatibility.length >= 2 && compatibility.every((c) => c.consumer_evidence));
  add(21, 'Deterministic Package 1 analysis completes without blocking defects', structuralErrors === 0);
  add(22, 'No prohibited implementation/coded/executable-contract artifacts created', leakageErrors === 0);
  add(23, 'Unresolved items have owners, evidence requirements, and future gates', backlogComplete);
  add(24, 'No record authorizes implementation', allNotImplemented);
  add(25, 'Package 1 receives line-level review and a separate freeze commit', closureApproval && freezeApproval);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V8_G1_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V8-G1'));
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
    gate: 'V8-G1',
    disposition_target: 'API_EVENT_INTEGRATION_CONTRACT_GOVERNANCE_FOUNDATION_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v8-g1-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V8-G1 readiness', run);
}
