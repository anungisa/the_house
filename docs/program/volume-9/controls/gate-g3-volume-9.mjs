// Control: Gate V9-G3 readiness evaluation (deterministic, NON-AUTHORITATIVE).
//
// Evaluates the thirty-six Gate V9-G3 conditions from the Volume 9 Package 3
// directive against the source-controlled corpus. Each condition is satisfied only
// by concrete corpus evidence; an unsatisfied condition is an ERROR. This control
// reports readiness; it never itself disposes the gate. The gate is dispositioned
// only by a ratified REG-905 approval carrying GATE-V9-G3 and the disposition
// SECURITY_PRIVACY_ACCESSIBILITY_BILINGUAL_FINANCIAL_RECORDS_RESILIENCE_RECOVERY_AND_OPERATIONAL_ASSURANCE_TEST_DEFINITION_READY.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, summarize, runStandalone, completedGates } from './lib.mjs';
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

const COVERAGE_KINDS = [
  'SECURITY_TEST_COVERAGE',
  'PRIVACY_RECORDS_TEST_COVERAGE',
  'ACCESSIBILITY_TEST_COVERAGE',
  'BILINGUAL_SEMANTIC_TEST_COVERAGE',
  'FINANCIAL_CONTROL_TEST_COVERAGE',
  'RESILIENCE_RECOVERY_TEST_COVERAGE',
  'OPERATIONAL_ASSURANCE_TEST_COVERAGE',
  'PROVIDER_ASSURANCE_TEST_COVERAGE',
  'HOUSE_P0_ASSURANCE_COVERAGE'
];
const REQUIREMENT_KINDS = [
  'SECURITY_TEST_REQUIREMENT',
  'PRIVACY_TEST_REQUIREMENT',
  'RECORDS_TEST_REQUIREMENT',
  'ACCESSIBILITY_STATIC_TEST_REQUIREMENT',
  'ACCESSIBILITY_MANUAL_TEST_REQUIREMENT',
  'ASSISTIVE_TECHNOLOGY_TEST_REQUIREMENT',
  'BILINGUAL_SEMANTIC_TEST_REQUIREMENT',
  'FINANCIAL_CONTROL_TEST_REQUIREMENT',
  'RESILIENCE_TEST_REQUIREMENT',
  'BACKUP_RESTORE_TEST_REQUIREMENT',
  'RECOVERY_EXERCISE_REQUIREMENT',
  'OBSERVABILITY_TEST_REQUIREMENT',
  'INCIDENT_RESPONSE_TEST_REQUIREMENT',
  'DEPLOYMENT_PATH_TEST_REQUIREMENT',
  'PROVIDER_CONTINUITY_TEST_REQUIREMENT',
  'INDEPENDENT_ASSURANCE_REQUIREMENT'
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

  const coverage = byKinds(ctx, 'REG-901', COVERAGE_KINDS);
  const covByKind = Object.fromEntries(COVERAGE_KINDS.map((k) => [k, coverage.filter((r) => r.kind === k)]));
  const hasCov = (k) => (covByKind[k]?.length ?? 0) > 0;
  const invariants = new Set(byKind(ctx, 'REG-901', 'INSTITUTIONAL_INVARIANT').map((r) => r.id));

  const requirements = byKinds(ctx, 'REG-902', REQUIREMENT_KINDS);
  const reqByKind = Object.fromEntries(REQUIREMENT_KINDS.map((k) => [k, requirements.filter((r) => r.kind === k)]));
  const has = (k) => (reqByKind[k]?.length ?? 0) > 0;
  const scenarios = byKinds(ctx, 'REG-902', SCENARIO_KINDS);
  const scnByKind = Object.fromEntries(SCENARIO_KINDS.map((k) => [k, scenarios.filter((r) => r.kind === k)]));
  const hasScn = (k) => (scnByKind[k]?.length ?? 0) > 0;
  const oracleIds = new Set(byKind(ctx, 'REG-902', 'TEST_ORACLE').map((r) => r.id));
  const evidenceReq = byKind(ctx, 'REG-902', 'TEST_EVIDENCE_REQUIREMENT');

  const backlog = records(ctx, 'REG-904');
  const approvals = records(ctx, 'REG-905');
  const done = completedGates(ctx);

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

  // Backlog completeness: every item names an owner and a forward gate, the
  // Package 3 risk and assumption items each name a required evidence expectation,
  // and none point at an already-completed Volume 9 gate. The required-evidence
  // obligation is scoped to Package 3 items (identified by their Package 3
  // chapter reference); inherited, frozen Package 1 and Package 2 items are not
  // reopened.
  const P3_CHAPTERS = new Set(['V9-21', 'V9-22', 'V9-23', 'V9-24', 'V9-25', 'V9-26', 'V9-27', 'V9-28', 'V9-29', 'V9-30', 'V9-E']);
  const p3RiskItems = backlog.filter((b) => (b.kind === 'RISK' || b.kind === 'ASM') && P3_CHAPTERS.has(b.chapter_ref));
  const backlogComplete = backlog.length > 0 && backlog.every((b) => b.owner && b.future_blocking_gate) && p3RiskItems.length > 0 && p3RiskItems.every((b) => b.required_evidence);
  const backlogForwardOnly = backlog.every((b) => !b.future_blocking_gate || !done.has(b.future_blocking_gate));

  // Package 1 and Package 2 inheritance and freeze integrity.
  const pkg1Gate = approvals.some((a) => a.artifact_id === 'GATE-V9-G1' && a.approval_state === 'ratified');
  const pkg2Gate = approvals.some((a) => a.artifact_id === 'GATE-V9-G2' && a.approval_state === 'ratified');
  const pkg1Frozen = approvals.some((a) => a.artifact_id === 'PACKAGE-9-1' && a.approval_state === 'ratified' && (a.frozen === true || (a.frozen_artifacts ?? []).length > 0));
  const pkg2Frozen = approvals.some((a) => a.artifact_id === 'PACKAGE-9-2' && a.approval_state === 'ratified' && (a.frozen === true || (a.frozen_artifacts ?? []).length > 0));
  const pkg1RoleClassification = approvals.some((a) => a.approval_state === 'ratified' && a.provenance_role_classification && a.provenance_role_classification.package === 'PACKAGE-9-1');
  const pkg2RoleClassification = approvals.some((a) => a.approval_state === 'ratified' && a.provenance_role_classification && a.provenance_role_classification.package === 'PACKAGE-9-2');

  // Every assurance obligation traces to a governed institutional invariant, and
  // every coverage record names an authoritative source.
  const requirementsTrace = requirements.length > 0 && requirements.every((r) => r.institutional_invariant_ref && invariants.has(r.institutional_invariant_ref));
  const coverageSourced = coverage.length > 0 && coverage.every((c) => c.authoritative_source);
  const requirementsIndependence = requirements.every((r) => r.independence_requirement);
  const scenariosOracle = scenarios.length > 0 && scenarios.every((s) => s.expected_result_oracle_ref && oracleIds.has(s.expected_result_oracle_ref) && s.evidence_tier_required);
  const failClosedDenial = hasScn('DENIAL_TEST_SCENARIO') && scnByKind.DENIAL_TEST_SCENARIO.some((s) => /denied|fail[- ]?closed|refus/i.test(s.scenario_disposition ?? ''));

  // Package 3 closure, gate disposition, freeze, and pre-merge binding.
  const closureApproval = approvals.some((a) => a.artifact_id === 'V9-E' && a.approval_state === 'ratified');
  const freezeApproval = approvals.some((a) => a.artifact_id === 'PACKAGE-9-3' && a.approval_state === 'ratified');
  const gateApproval = approvals.find((a) => a.artifact_id === 'GATE-V9-G3' && a.approval_state === 'ratified');
  const closureRecord = approvals.find((a) => a.artifact_id === 'V9-E' && a.approval_state === 'ratified');
  const freezeRecord = approvals.find((a) => a.artifact_id === 'PACKAGE-9-3' && a.approval_state === 'ratified');
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

  add(1, 'Package 1 and Package 2 provenance and freezes are inherited', pkg1RoleClassification && pkg2RoleClassification && hasChapter(ctx, 'V9-B') && hasChapter(ctx, 'V9-B-1') && hasChapter(ctx, 'V9-D') && hasChapter(ctx, 'V9-D-1'));
  add(2, 'Packages 1 and 2 remain frozen and unchanged', pkg1Gate && pkg2Gate && pkg1Frozen && pkg2Frozen);
  add(3, 'Security, privacy, records, accessibility, bilingual, financial, resilience, recovery, observability, provider, and operational-assurance domains are controlled', COVERAGE_KINDS.every((k) => hasCov(k)));
  add(4, 'Each obligation traces to an authoritative source and protected asset, right, or invariant', requirementsTrace && coverageSourced);
  add(5, 'Authentication remains distinct from authorization', has('SECURITY_TEST_REQUIREMENT') && bodyMentions(ctx, 'V9-22', 'authentication') && bodyMentions(ctx, 'V9-22', 'authorization'));
  add(6, 'Organization, jurisdiction, resource, lifecycle, delegation, assignment, and service-identity denial paths are defined', hasScn('DENIAL_TEST_SCENARIO') && has('SECURITY_TEST_REQUIREMENT') && bodyMentions(ctx, 'V9-22', 'service identity'));
  add(7, 'Missing or unavailable policy and authority context fails closed', failClosedDenial);
  add(8, 'Restricted evidence has access, disclosure, logging, and trace tests', has('PRIVACY_TEST_REQUIREMENT') && bodyMentions(ctx, 'V9-23', 'disclosure') && bodyMentions(ctx, 'V9-23', 'trace'));
  add(9, 'Privacy and records test definitions include minimum necessary, exports, legal hold, retention dependencies, and disposition', has('RECORDS_TEST_REQUIREMENT') && bodyMentions(ctx, 'V9-23', 'minimum necessary') && bodyMentions(ctx, 'V9-23', 'legal hold') && bodyMentions(ctx, 'V9-23', 'disposition'));
  add(10, 'Privacy evidence is not represented as legal-compliance proof', bodyMentions(ctx, 'V9-23', 'legal') && bodyMentions(ctx, 'V9-23', 'compliance'));
  add(11, 'Automated accessibility tests remain distinct from manual, keyboard, and assistive-technology evidence', has('ACCESSIBILITY_STATIC_TEST_REQUIREMENT') && has('ACCESSIBILITY_MANUAL_TEST_REQUIREMENT') && has('ASSISTIVE_TECHNOLOGY_TEST_REQUIREMENT'));
  add(12, 'Primary, exception, staff, interruption, degraded, and recovery tasks have accessibility obligations', bodyMentions(ctx, 'V9-24', 'keyboard') && bodyMentions(ctx, 'V9-24', 'recovery') && bodyMentions(ctx, 'V9-24', 'interruption'));
  add(13, 'Bilingual string presence remains distinct from semantic equivalence', has('BILINGUAL_SEMANTIC_TEST_REQUIREMENT') && bodyMentions(ctx, 'V9-25', 'semantic equivalence'));
  add(14, 'Statuses, actions, errors, denials, notifications, financial concepts, decisions, and documents have bilingual semantic obligations', bodyMentions(ctx, 'V9-25', 'status') && bodyMentions(ctx, 'V9-25', 'error') && bodyMentions(ctx, 'V9-25', 'document'));
  add(15, 'Payment acknowledgement, accounting confirmation, reconciliation, activation, and standing remain distinct', has('FINANCIAL_CONTROL_TEST_REQUIREMENT') && bodyMentions(ctx, 'V9-26', 'reconciliation') && bodyMentions(ctx, 'V9-26', 'activation') && bodyMentions(ctx, 'V9-26', 'standing'));
  add(16, 'Financial test definitions preserve decision-authority boundaries', bodyMentions(ctx, 'V9-26', 'decision authority'));
  add(17, 'Dependency failure, delay, duplication, interruption, backlog, quarantine, and stale-state scenarios are defined', hasScn('DEGRADED_TEST_SCENARIO') && hasScn('INTERRUPTION_TEST_SCENARIO') && hasScn('DUPLICATE_TEST_SCENARIO') && hasScn('STALE_STATE_TEST_SCENARIO'));
  add(18, 'Backup integrity remains distinct from restoration', has('BACKUP_RESTORE_TEST_REQUIREMENT') && bodyMentions(ctx, 'V9-27', 'backup') && bodyMentions(ctx, 'V9-27', 'restoration'));
  add(19, 'Restoration remains distinct from service recovery and business reconciliation', has('RECOVERY_EXERCISE_REQUIREMENT') && bodyMentions(ctx, 'V9-27', 'recovery') && bodyMentions(ctx, 'V9-27', 'reconciliation'));
  add(20, 'Recovery definitions include authoritative-state and outstanding-obligation reconciliation', bodyMentions(ctx, 'V9-27', 'authoritative state') && bodyMentions(ctx, 'V9-27', 'outstanding obligation'));
  add(21, 'Telemetry, alerts, incident detection, incident handling, recovery, and post-incident reconciliation remain distinct', has('OBSERVABILITY_TEST_REQUIREMENT') && has('INCIDENT_RESPONSE_TEST_REQUIREMENT') && bodyMentions(ctx, 'V9-28', 'incident'));
  add(22, 'Deployment-path tests include configuration, secrets dependency, entry points, composition, and rollback evidence', has('DEPLOYMENT_PATH_TEST_REQUIREMENT') && bodyMentions(ctx, 'V9-28', 'rollback') && bodyMentions(ctx, 'V9-28', 'configuration'));
  add(23, 'Provider assurance includes incidents, continuity, substitution, return, deletion, residual copies, backups, reconciliation, and exit', has('PROVIDER_CONTINUITY_TEST_REQUIREMENT') && bodyMentions(ctx, 'V9-29', 'substitution') && bodyMentions(ctx, 'V9-29', 'deletion') && bodyMentions(ctx, 'V9-29', 'exit'));
  add(24, 'Provider certification and provider-managed tests remain distinct from end-to-end assurance', bodyMentions(ctx, 'V9-29', 'certification') && bodyMentions(ctx, 'V9-29', 'end-to-end'));
  add(25, 'Every scenario has a governed oracle and required evidence', scenariosOracle);
  add(26, 'Evidence binds environment, configuration, version, identity, organization, jurisdiction, data, and time', evidenceReq.length >= 1 && bodyMentions(ctx, 'V9-30', 'environment') && bodyMentions(ctx, 'V9-30', 'configuration'));
  add(27, 'Independence and acceptance requirements are controlled', has('INDEPENDENT_ASSURANCE_REQUIREMENT') && requirementsIndependence);
  add(28, 'House P0 findings have cross-cutting assurance destinations', hasCov('HOUSE_P0_ASSURANCE_COVERAGE'));
  add(29, 'Every unresolved item has an owner, an evidence requirement, and a valid future gate', backlogComplete);
  add(30, 'No active unresolved item points to a completed Volume 9 gate', backlogForwardOnly);
  add(31, 'Deterministic Package 3 analysis completes without blocking defects', structuralErrors === 0);
  add(32, 'Package-indexed provenance projections cover every authoritative package record', pkg1RoleClassification && pkg2RoleClassification);
  add(33, 'No executable tests, environments, datasets, credentials, secrets, tools, services, provider testing, recovery exercises, penetration tests, accessibility evaluations, implementation, procurement, sequencing, staffing, costs, pilot, rollout, release, or master plan created', leakageErrors === 0 && productionDataErrors === 0);
  add(34, 'No conformance, effectiveness, compliance, readiness, or acceptance claim is made without evidence', allNotImplemented);
  add(35, 'No record authorizes implementation or test execution', allNoImplAuth);
  add(36, 'Genuine authoring, closure-and-freeze, and pre-merge provenance-binding separation is preserved', closureApproval && freezeApproval && gateBindingsResolved);

  return conditions;
}

export function run(ctx) {
  const findings = [];
  for (const c of evaluate(ctx)) {
    if (!c.satisfied) {
      findings.push(makeFinding(Severity.ERROR, 'GATE_V9_G3_CONDITION_UNMET', `Condition ${c.n} not satisfied: ${c.title}`, 'GATE-V9-G3'));
    }
  }
  return findings;
}

export function generate(ctx = loadContext()) {
  const conditions = evaluate(ctx);
  const unmet = conditions.filter((c) => !c.satisfied);
  const outDir = join(VOLUME_DIR, 'generated', 'cross-cutting-assurance-test-definition');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    gate: 'V9-G3',
    disposition_target: 'SECURITY_PRIVACY_ACCESSIBILITY_BILINGUAL_FINANCIAL_RECORDS_RESILIENCE_RECOVERY_AND_OPERATIONAL_ASSURANCE_TEST_DEFINITION_READY',
    total_conditions: conditions.length,
    satisfied: conditions.length - unmet.length,
    unmet: unmet.map((c) => ({ n: c.n, title: c.title })),
    readiness: unmet.length === 0 ? 'READY' : 'NOT_READY',
    conditions
  };
  writeFileSync(join(outDir, 'gate-v9-g3-readiness.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { readiness: payload.readiness };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Gate V9-G3 readiness', run);
}
