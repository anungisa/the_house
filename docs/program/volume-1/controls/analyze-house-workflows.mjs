// Analyzer: governed workflow (FSM), evidence/audit, and outbox integration posture.
//
// - Workflow: parses the seeded AffiliationApplication state machine (states,
//   transitions with risk/evidence/approval flags, guard catalog) from the migration
//   seed and cross-references the seeded guard codes against the implemented guard
//   handler codes; inventories the workflow services (planner, decision, execution).
// - Evidence/audit: inventories evidence storage providers, malware scanning, quarantine.
// - Integration/outbox: inventories outbox stores/publishers (Noop default vs Azure
//   Service Bus), the worker runtime, backoff/jitter, and leasing signals.
// Static parse only; no readiness claim is made.

import { existsSync } from 'node:fs';
import { readText, walk } from './house-lib.mjs';

function matchAll(text, rx, mapper) {
  const out = [];
  const re = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : `${rx.flags}g`);
  let m;
  while ((m = re.exec(text)) !== null) out.push(mapper(m));
  return out;
}

function fileList(ctx, relDir, extraPredicate = () => true) {
  return walk(ctx.abs(relDir), (f) => f.endsWith('.ts') && !/\.test\.ts$/.test(f) && extraPredicate(f)).map(
    (f) => ctx.rel(f),
  );
}

function analyzeWorkflow(ctx) {
  const seedAbs = ctx.abs('db/migrations/0002_affiliation_application_v1_seed.sql');
  const seed = existsSync(seedAbs) ? readText(seedAbs) : '';

  const states = matchAll(seed, /\('(\w+)',\s+(true|false),\s+(true|false),\s+(\d+)\)/g, (m) => ({
    name: m[1],
    is_initial: m[2] === 'true',
    is_terminal: m[3] === 'true',
    sort_order: Number(m[4]),
  }));

  const transitions = matchAll(
    seed,
    /\('(\w+)',\s*'(\w+)',\s*'(\w+)',\s*'(low|high)',\s*(true|false),\s*(true|false)\)/g,
    (m) => ({
      trigger: m[1],
      from: m[2],
      to: m[3],
      risk: m[4],
      evidence_required: m[5] === 'true',
      approval_required: m[6] === 'true',
    }),
  );

  const seededGuards = [
    ...new Set(matchAll(seed, /'(AFFILIATION_[A-Z_]+|SEASON_IS_CURRENT|ACTOR_HAS_REVIEWER_SCOPE)'/g, (m) => m[1])),
  ].sort();

  const registryAbs = ctx.abs('src/governance/guards/GuardRegistry.ts');
  const registryText = existsSync(registryAbs) ? readText(registryAbs) : '';
  const implementedGuards = [
    ...new Set(matchAll(registryText, /'(AFFILIATION_[A-Z_]+|SEASON_IS_CURRENT|ACTOR_HAS_REVIEWER_SCOPE)'/g, (m) => m[1])),
  ].sort();

  const guardsSeededNotImplemented = seededGuards.filter((g) => !implementedGuards.includes(g));
  const guardsImplementedNotSeeded = implementedGuards.filter((g) => !seededGuards.includes(g));

  const services = fileList(ctx, 'src/governance/workflow', (f) => /Service|Planner|Execution/.test(f));

  return {
    summary: {
      states: states.length,
      terminal_states: states.filter((s) => s.is_terminal).map((s) => s.name),
      transitions: transitions.length,
      high_risk_transitions: transitions.filter((t) => t.risk === 'high').map((t) => t.trigger),
      evidence_required_transitions: transitions.filter((t) => t.evidence_required).map((t) => t.trigger),
      approval_required_transitions: transitions.filter((t) => t.approval_required).map((t) => t.trigger),
      seeded_guards: seededGuards.length,
      implemented_guards: implementedGuards.length,
      guards_seeded_not_implemented: guardsSeededNotImplemented,
      guards_implemented_not_seeded: guardsImplementedNotSeeded,
      has_approved_execution_service: services.some((s) => /ApprovedWorkflowExecutionService/.test(s)),
    },
    states,
    transitions,
    seeded_guards: seededGuards,
    implemented_guards: implementedGuards,
    workflow_services: services,
  };
}

function analyzeEvidenceAudit(ctx) {
  const evFiles = fileList(ctx, 'src/governance/evidence');
  const providers = {
    in_memory: evFiles.some((f) => /InMemoryEvidenceStorage/.test(f)),
    azure_blob: evFiles.some((f) => /AzureBlobEvidenceStorage/.test(f)),
  };
  const scanning = {
    noop_scanner: evFiles.some((f) => /NoopEvidenceMalwareScanner/.test(f)),
    signature_scanner: evFiles.some((f) => /SignatureEvidenceMalwareScanner/.test(f)),
    scan_gate: evFiles.some((f) => /EvidenceScanGate/.test(f)),
  };
  const quarantine = {
    service: evFiles.some((f) => /quarantine\/EvidenceQuarantineService/.test(f)),
    pg_store: evFiles.some((f) => /quarantine\/PgEvidenceQuarantineStore/.test(f)),
  };
  // Audit is written by the governance store within the transition transaction; the
  // audit context directory is documentation only (README).
  const auditModuleFiles = fileList(ctx, 'src/governance/audit');
  const storeText = existsSync(ctx.abs('src/governance/store/PgGovernanceStore.ts'))
    ? readText(ctx.abs('src/governance/store/PgGovernanceStore.ts'))
    : '';
  const auditWritesInStore = /audit_event/i.test(storeText);
  const evidenceMetadataInStore = /evidence_object/i.test(storeText);

  // Whether uploaded evidence is bound to a governed transition: look for a metadata
  // binding module and references to a transition/request id in it.
  const bindingAbs = ctx.abs('src/governance/evidence/EvidenceMetadataBinding.ts');
  const bindingText = existsSync(bindingAbs) ? readText(bindingAbs) : '';
  const evidenceBindsToTransition = /transition|request/i.test(bindingText) && bindingText.length > 0;

  return {
    summary: {
      evidence_modules: evFiles.length,
      storage_providers: Object.entries(providers).filter(([, v]) => v).map(([k]) => k),
      malware_scanning: Object.entries(scanning).filter(([, v]) => v).map(([k]) => k),
      quarantine_enabled_modules: Object.entries(quarantine).filter(([, v]) => v).map(([k]) => k),
      audit_written_in_governance_store: auditWritesInStore,
      evidence_metadata_written_in_governance_store: evidenceMetadataInStore,
      evidence_metadata_binding_present: bindingText.length > 0,
      evidence_binding_references_transition: evidenceBindsToTransition,
      dedicated_audit_module_files: auditModuleFiles.length,
    },
    providers,
    scanning,
    quarantine,
    evidence_modules: evFiles,
  };
}

function analyzeIntegrationOutbox(ctx) {
  const outboxFiles = fileList(ctx, 'src/governance/outbox');
  const workerFiles = fileList(ctx, 'src/workers/outbox');
  const factoryAbs = ctx.abs('src/governance/outbox/OutboxPublisherFactory.ts');
  const factoryText = existsSync(factoryAbs) ? readText(factoryAbs) : '';
  const backoffAbs = ctx.abs('src/workers/outbox/backoff.ts');
  const backoffText = existsSync(backoffAbs) ? readText(backoffAbs) : '';
  const pgStoreAbs = ctx.abs('src/governance/outbox/PgOutboxStore.ts');
  const pgStoreText = existsSync(pgStoreAbs) ? readText(pgStoreAbs) : '';

  const publishers = {
    azure_service_bus: outboxFiles.some((f) => /AzureServiceBusPublisher/.test(f)),
    noop_default: /Noop/.test(factoryText),
  };
  const fullJitter = /Math\.random/.test(backoffText) && /cap|2\s*\*\*|Math\.pow|<<|\* 2/.test(backoffText);
  const leasing = {
    skip_locked: /SKIP\s+LOCKED/i.test(pgStoreText),
    locked_until: /locked_until/i.test(pgStoreText),
    locked_by: /locked_by/i.test(pgStoreText),
  };
  const publisherText = readText(ctx.abs('src/governance/outbox/AzureServiceBusPublisher.ts'));
  // Sessions are ENABLED only if a SessionId is actually set or the v1 doctrine
  // constant is true. Mere mention of the word "session" (in a comment stating
  // sessions are NOT used) does not count.
  const sessionsEnabled =
    /\bsessionId\s*:/.test(publisherText) || /V1_SERVICE_BUS_USES_SESSIONS\s*=\s*true/.test(publisherText);

  return {
    summary: {
      outbox_modules: outboxFiles.length,
      worker_modules: workerFiles.length,
      publishers: Object.entries(publishers).filter(([, v]) => v).map(([k]) => k),
      default_publisher_is_noop: publishers.noop_default,
      real_broker_publisher_present: publishers.azure_service_bus,
      full_jitter_backoff_detected: fullJitter,
      lease_based_claim: leasing.skip_locked && leasing.locked_until,
      leasing_signals: Object.entries(leasing).filter(([, v]) => v).map(([k]) => k),
      service_bus_sessions_enabled: sessionsEnabled,
    },
    outbox_modules: outboxFiles,
    worker_modules: workerFiles,
  };
}

export function analyze(ctx) {
  return {
    workflow: analyzeWorkflow(ctx),
    evidenceAudit: analyzeEvidenceAudit(ctx),
    integrationOutbox: analyzeIntegrationOutbox(ctx),
  };
}
