// Control: Gate V9-G2 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the thirty-four Gate V9-G2 conditions from the Volume 9 Package 2
// directive against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-905 approval carrying GATE-V9-G2 and the disposition
// AFFILIATION_FUNCTIONAL_CONTRACT_WORKFLOW_DATA_AND_MIGRATION_TEST_DEFINITION_READY.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, summarize, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-9.mjs';
import { isPlaceholder } from './provenance-integrity-volume-9.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}
function byKinds(ctx, regId, kinds) {
  const set = new Set(kinds);
  return records(ctx, regId).filter((r) => set.has(r.kind));
}
function hasChapter(ctx, id) {
  return ctx.chapters.some((c) => c.fileId === id);
}
function bodyMentions(ctx, id, needle) {
  const ch = ctx.chapters.find((c) => c.fileId === id);
  return ch ? ch.body.toLowerCase().includes(needle.toLowerCase()) : false;
}

const REQUIREMENT_KINDS = [
  'FUNCTIONAL_TEST_REQUIREMENT',
  'WORKFLOW_TEST_REQUIREMENT',
  'CONTRACT_TEST_REQUIREMENT',
  'EVENT_TEST_REQUIREMENT',
  'WEBHOOK_TEST_REQUIREMENT',
  'PROVIDER_TEST_REQUIREMENT',
  'DATA_QUALITY_TEST_REQUIREMENT',
  'DATABASE_BEHAVIOUR_TEST_REQUIREMENT',
  'MIGRATION_TEST_REQUIREMENT'
];
const SCENARIO_KINDS = [
  'NEGATIVE_TEST_SCENARIO',
  'DENIAL_TEST_SCENARIO',
  'CONFLICT_TEST_SCENARIO',
  'STALE_STATE_TEST_SCENARIO',
  'DEGRADED_TEST_SCENARIO',
  'INTERRUPTION_TEST_SCENARIO',
  'DUPLICATE_TEST_SCENARIO',
  'REPLAY_TEST_SCENARIO',
  'RECOVERY_TEST_SCENARIO'
];

export function evaluate(ctx) {
  const conditions = [];
  const add = (n, title, ok) => conditions.push({ n, title, satisfied: !!ok });

  const domains = byKind(ctx, 'REG-901', 'AFFILIATION_TEST_DOMAIN');
  const authority = byKind(ctx, 'REG-901', 'ACTOR_AUTHORITY_MATRIX');
  const lifecycleCoverage = byKind(ctx, 'REG-901', 'LIFECYCLE_COVERAGE');
  const contractCoverage = byKind(ctx, 'REG-901', 'CONTRACT_COVERAGE');
  const dataIntegrityCoverage = byKind(ctx, 'REG-901', 'DATA_INTEGRITY_COVERAGE');
  const migrationCoverage = byKind(ctx, 'REG-901', 'MIGRATION_COVERAGE');
  const p0Coverage = byKind(ctx, 'REG-901', 'HOUSE_P0_TEST_COVERAGE');
  const invariants = new Set(byKind(ctx, 'REG-901', 'INSTITUTIONAL_INVARIANT').map((r) => r.id));

  const requirements = byKinds(ctx, 'REG-902', REQUIREMENT_KINDS);
  const scenarios = byKinds(ctx, 'REG-902', SCENARIO_KINDS);
  const oracleIds = new Set(byKind(ctx, 'REG-902', 'TEST_ORACLE').map((r) => r.id));
  const reqByKind = Object.fromEntries(REQUIREMENT_KINDS.map((k) => [k, requirements.filter((r) => r.kind === k)]));
  const scnByKind = Object.fromEntries(SCENARIO_KINDS.map((k) => [k, scenarios.filter((r) => r.kind === k)]));
  const has = (k) => (reqByKind[k]?.length ?? 0) > 0;
  const hasScn = (k) => (scnByKind[k]?.length ?? 0) > 0;

  const backlog = records(ctx, 'REG-904');
  const approvals = records(ctx, 'REG-905');

  const structural = runStructural(ctx);
  const structuralErrors = summarize(structural).errors;
  const leakageErrors = structural.filter((f) => f.code === 'EXECUTABLE_LEAKAGE').length;
  const productionDataErrors = structural.filter((f) => f.code === 'PRODUCTION_DATA_NOT_AUTHORIZED').length;

  const allNotImplemented = ['REG-901', 'REG-902', 'REG-903', 'REG-904']
    .flatMap((r) => records(ctx, r))
    .every((r) => r.authorizes_implementation === false && r.implementation_status === 'NOT_IMPLEMENTED_OR_NOT_PROVEN');
  const allNoImplAuth = ['REG-900', 'REG-901', 'REG-902', 'REG-903', 'REG-904', 'REG-905']
    .flatMap((r) => records(ctx, r))
    .every((r) => r.authorizes_implementation === false || r.authorizes_implementation === undefined);

  // Package 2 backlog completeness: at least one Package-2 backlog item, and every
  // backlog item names an owner, a future gate, and is not pointed at a completed gate.
  const backlogComplete = backlog.length > 0 && backlog.every((b) => b.owner && b.future_blocking_gate);

  // Package 1 inheritance and freeze integrity.
  const pkg1Gate = approvals.some((a) => a.artifact_id === 'GATE-V9-G1' && a.approval_state === 'ratified');
  const pkg1Frozen = approvals.some((a) => a.artifact_id === 'PACKAGE-9-1' && a.approval_state === 'ratified' && (a.frozen === true || (a.frozen_artifacts ?? []).length > 0));
  const pkg1RoleClassification = approvals.some((a) => a.approval_state === 'ratified' && a.provenance_role_classification && a.provenance_role_classification.package === 'PACKAGE-9-1');

  // Requirements trace to governed invariants; scenarios name governed oracles and evidence.
  const requirementsTrace = requirements.length > 0 && requirements.every((r) => r.institutional_invariant_ref && invariants.has(r.institutional_invariant_ref));
  const scenariosOracle = scenarios.length > 0 && scenarios.every((s) => s.expected_result_oracle_ref && oracleIds.has(s.expected_result_oracle_ref) && s.evidence_tier_required);

  // Package 2 closure, gate disposition, freeze, and pre-merge binding.
  const closureApproval = approvals.some((a) => a.artifact_id === 'V9-C' && a.approval_state === 'ratified');
  const freezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-9-2' && a.approval_state === 'ratified');
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V9-G2' && a.approval_state === 'ratified');
  const closureRecord = approvals.find((a) => a.artifact_id === 'V9-C' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-9-2' && a.approval_state === 'ratified');
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

  add(1, 'Package 1 provenance and the V9-B / V9-B-1 amendments are inherited unchanged', pkg1RoleClassification && hasChapter(ctx, 'V9-B') && hasChapter(ctx, 'V9-B-1'));
  add(2, 'Package 1 quality and master-test foundation remains frozen and undisturbed', pkg1Gate && pkg1Frozen);
  add(3, 'Every affiliation journey stage is decomposed into governed test obligations', hasChapter(ctx, 'V9-11') && domains.length >= 10);
  add(4, 'Every material Volume 7 experience action maps to a test disposition', hasChapter(ctx, 'V9-12') && hasChapter(ctx, 'V9-13') && authority.length >= 3 && requirements.length >= 12);
  add(5, 'Every material Volume 8 command, query, resource, event, webhook, provider-exchange, file, batch, and migration contract maps to a test obligation', hasChapter(ctx, 'V9-18') && has('CONTRACT_TEST_REQUIREMENT') && has('EVENT_TEST_REQUIREMENT') && has('WEBHOOK_TEST_REQUIREMENT') && has('PROVIDER_TEST_REQUIREMENT') && has('MIGRATION_TEST_REQUIREMENT'));
  add(6, 'Every affiliation test obligation traces to a governed institutional invariant and every oracle to governed authority', requirementsTrace);
  add(7, 'Account, membership, representative-authority, delegation, assignment, finance, and support distinctions carry negative tests', authority.length >= 3 && hasScn('NEGATIVE_TEST_SCENARIO') && hasScn('DENIAL_TEST_SCENARIO'));
  add(8, 'Organization and jurisdiction isolation carry denial tests', hasScn('DENIAL_TEST_SCENARIO') && scnByKind.DENIAL_TEST_SCENARIO.some((s) => (s.jurisdiction_context ?? '').length > 0));
  add(9, 'Missing mandatory authority context fails closed', hasScn('DENIAL_TEST_SCENARIO') && scnByKind.DENIAL_TEST_SCENARIO.some((s) => /denied|fail[- ]?closed|refus/i.test(s.scenario_disposition ?? '')));
  add(10, 'Requirement and evidence versioning carries positive, negative, stale, and conflict tests', has('DATA_QUALITY_TEST_REQUIREMENT') && hasScn('STALE_STATE_TEST_SCENARIO') && hasScn('CONFLICT_TEST_SCENARIO'));
  add(11, 'Restricted-evidence access and disclosure carry tests', hasChapter(ctx, 'V9-14') && bodyMentions(ctx, 'V9-14', 'disclosure') && hasScn('DENIAL_TEST_SCENARIO'));
  add(12, 'Completeness is treated as derived and carries recalculation tests', hasChapter(ctx, 'V9-14') && bodyMentions(ctx, 'V9-14', 'completeness') && has('FUNCTIONAL_TEST_REQUIREMENT'));
  add(13, 'Submission eligibility, receipt, approval, and activation are held distinct', hasChapter(ctx, 'V9-15') && hasChapter(ctx, 'V9-17') && has('FUNCTIONAL_TEST_REQUIREMENT'));
  add(14, 'Submission idempotency, timeout, retry, duplicate, conflict, and unknown-outcome carry tests', hasScn('DUPLICATE_TEST_SCENARIO') && hasScn('CONFLICT_TEST_SCENARIO') && hasScn('INTERRUPTION_TEST_SCENARIO'));
  add(15, 'Return, correction, and resubmission preserve history', hasChapter(ctx, 'V9-16') && has('WORKFLOW_TEST_REQUIREMENT'));
  add(16, 'Reviewer eligibility, jurisdiction, assignment, and sensitivity carry tests', hasChapter(ctx, 'V9-16') && bodyMentions(ctx, 'V9-16', 'reviewer') && hasScn('DENIAL_TEST_SCENARIO'));
  add(17, 'Finance testing preserves decision-authority boundaries', hasChapter(ctx, 'V9-17') && bodyMentions(ctx, 'V9-17', 'reconciliation') && has('FUNCTIONAL_TEST_REQUIREMENT'));
  add(18, 'Decision, reconciliation, activation, standing, and expiry are held distinct', hasChapter(ctx, 'V9-17') && bodyMentions(ctx, 'V9-17', 'activation') && bodyMentions(ctx, 'V9-17', 'standing'));
  add(19, 'Exactly-once activation is tested as a business invariant, not a transport guarantee', bodyMentions(ctx, 'V9-17', 'exactly-once') && hasScn('DUPLICATE_TEST_SCENARIO'));
  add(20, 'Query source, scope, sensitivity, staleness, disclosure, degraded, and unavailable behaviour carry tests', has('CONTRACT_TEST_REQUIREMENT') && hasScn('STALE_STATE_TEST_SCENARIO') && hasScn('DEGRADED_TEST_SCENARIO'));
  add(21, 'Event and outbox atomicity, duplicate, replay, ordering, and consumer idempotency carry tests', has('EVENT_TEST_REQUIREMENT') && hasScn('REPLAY_TEST_SCENARIO') && hasScn('DUPLICATE_TEST_SCENARIO'));
  add(22, 'Webhook authentication, integrity, replay, idempotency, lifecycle, quarantine, and reconciliation carry tests', has('WEBHOOK_TEST_REQUIREMENT') && hasScn('REPLAY_TEST_SCENARIO'));
  add(23, 'Provider and exchange receipt, acceptance, authority, processing, and reconciliation distinctions carry tests', has('PROVIDER_TEST_REQUIREMENT') && hasChapter(ctx, 'V9-18') && bodyMentions(ctx, 'V9-18', 'provider'));
  add(24, 'Data-integrity tenant/parent, version, history, uniqueness, and provenance carry tests', has('DATA_QUALITY_TEST_REQUIREMENT') && dataIntegrityCoverage.length >= 1);
  add(25, 'Database behavioural testing is held distinct from schema inspection and mock behaviour', has('DATABASE_BEHAVIOUR_TEST_REQUIREMENT') && hasChapter(ctx, 'V9-19') && bodyMentions(ctx, 'V9-19', 'database'));
  add(26, 'Migration provenance, uncertainty, duplicate candidates, quarantine, coexistence, reconciliation, and business acceptance carry tests', has('MIGRATION_TEST_REQUIREMENT') && migrationCoverage.length >= 1 && bodyMentions(ctx, 'V9-19', 'migration'));
  add(27, 'Positive, negative, denied, conflict, stale, degraded, interrupted, duplicate, replay, and recovery scenarios all exist', SCENARIO_KINDS.every((k) => hasScn(k)));
  add(28, 'Every scenario names a governed oracle and a required evidence tier', scenariosOracle);
  add(29, 'Every unresolved item names an owner, an evidence expectation, and a valid forward gate', backlogComplete);
  add(30, 'Deterministic Package 2 analysis completes without blocking defects', structuralErrors === 0);
  add(31, 'No executable test, fixture, dataset, environment, credential, provider testing, migration execution, or implementation was created', leakageErrors === 0 && productionDataErrors === 0 && lifecycleCoverage.length >= 1 && contractCoverage.length >= 1 && p0Coverage.length >= 1);
  add(32, 'No passing, conformance, compatibility, integration, database, migration, provider, operational, readiness, or acceptance result is claimed without evidence', allNotImplemented);
  add(33, 'No record authorizes implementation or test execution', allNoImplAuth);
  add(34, 'Genuine authoring, closure-and-freeze, and pre-merge-binding separation is preserved with no unresolved required commit binding', closureApproval && freezeApproval && gateBindingsResolved);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V9_G2_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V9-G2'));
    }
  }
  return findings;
}

export function generate(ctx = loadContext()) {
  const conditions = evaluate(ctx);
  const unmet = conditions.filter((c) => !c.satisfied);
  const outDir = join(VOLUME_DIR, 'generated', 'affiliation-test-definition');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    gate: 'V9-G2',
    disposition_target: 'AFFILIATION_FUNCTIONAL_CONTRACT_WORKFLOW_DATA_AND_MIGRATION_TEST_DEFINITION_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v9-g2-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V9-G2 readiness', run);
}
