// Control: structural, schema, and contract-governance conformance for the
// Volume 8 corpus.
//
// Validates: YAML parse integrity, JSON Schema conformance of every register,
// identifier uniqueness, chapter header/H1 integrity, and the fail-closed
// contract-governance guards required by the directive: contract surfaces without
// institutional authority or authoritative source; producers and consumers
// without ownership; surfaces without an authentication/authorization posture;
// commands without preconditions or result semantics; queries without authority
// or staleness posture; events without an envelope or delivery posture; webhooks
// without authentication, integrity, or replay handling; operations without an
// idempotency or concurrency posture; unknown-outcome interactions without a
// reconciliation dependency; errors without a language-neutral canonical code or
// a privacy constraint; restricted classification carried in an inappropriate
// message surface; provider contexts without incident, continuity, exit, data
// return, or deletion-evidence obligations; exchanges without accept/reject/
// quarantine or reconciliation semantics; compatibility rules without consumer
// evidence; backlog items without owners or future gates; unresolved items
// pointing to completed gates; records authorizing implementation; records not in
// a not-implemented posture; and executable/contract leakage (DDL / IAM /
// migration / key material / coded interface / OpenAPI / AsyncAPI / GraphQL /
// Protobuf / route definitions / JSON payload schema).

import Ajv from 'ajv';
import {
  Severity,
  REGISTER_SCHEMAS,
  LEAKAGE_PATTERNS,
  completedGates,
  loadSchema,
  makeFinding,
  runStandalone
} from './lib.mjs';

function buildAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addSchema(loadSchema('common.schema.json'));
  for (const file of Object.values(REGISTER_SCHEMAS)) {
    ajv.addSchema(loadSchema(file));
  }
  return ajv;
}

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

// Registers whose records must all carry a NOT_IMPLEMENTED_OR_NOT_PROVEN posture.
const FOUNDATION_REGISTERS = ['REG-801', 'REG-802', 'REG-803', 'REG-804'];

function validateSchemas(ctx, findings) {
  const ajv = buildAjv();
  for (const [regId, schemaFile] of Object.entries(REGISTER_SCHEMAS)) {
    const entry = ctx.registers[regId];
    if (!entry) {
      findings.push(makeFinding(Severity.ERROR, 'REGISTER_MISSING', `Register ${regId} is not present in the corpus`, regId));
      continue;
    }
    const validate = ajv.getSchema(schemaFile);
    const ok = validate(entry.doc);
    if (!ok) {
      for (const e of validate.errors ?? []) {
        findings.push(makeFinding(Severity.ERROR, 'SCHEMA_CONFORMANCE', `${entry.path}: ${e.instancePath || '/'} ${e.message}`, regId));
      }
    }
  }
}

function reportParseErrors(ctx, findings) {
  for (const e of ctx.registerErrors) {
    findings.push(makeFinding(Severity.ERROR, 'YAML_PARSE', `${e.path}: ${e.message}`, e.file));
  }
}

function validateIdUniqueness(ctx, findings) {
  for (const entry of Object.values(ctx.registers)) {
    const rows = entry.doc?.records ?? [];
    const seen = new Map();
    for (const row of rows) {
      const id = row?.id;
      if (id == null) continue;
      if (seen.has(id)) {
        findings.push(makeFinding(Severity.ERROR, 'DUPLICATE_ID', `Duplicate identifier "${id}" in ${entry.id}`, entry.id));
      }
      seen.set(id, true);
    }
  }
  const chapterIds = new Map();
  for (const ch of ctx.chapters) {
    if (chapterIds.has(ch.fileId)) {
      findings.push(makeFinding(Severity.ERROR, 'DUPLICATE_ID', `Duplicate chapter identifier "${ch.fileId}"`, ch.file));
    }
    chapterIds.set(ch.fileId, true);
  }
}

function validateChapters(ctx, findings) {
  for (const ch of ctx.chapters) {
    if (!ch.hasH1) {
      findings.push(makeFinding(Severity.ERROR, 'MISSING_H1', `${ch.path}: missing level-1 heading`, ch.id));
    }
    if (!ch.status) {
      findings.push(makeFinding(Severity.ERROR, 'MISSING_STATUS', `${ch.path}: missing Status header`, ch.id));
      continue;
    }
    if (ch.status === 'RATIFIED' && !ch.version) {
      findings.push(makeFinding(Severity.ERROR, 'RATIFIED_NO_VERSION', `${ch.id}: RATIFIED without Version`, ch.id));
    }
    if (ch.status === 'DRAFT') {
      findings.push(makeFinding(Severity.INFO, 'DRAFT_CHAPTER', `${ch.id}: chapter is DRAFT (not yet ratified)`, ch.id));
    }
  }
}

// Implementation-authorization guard (fail closed): no Volume 8 record in any
// register may set authorizes_implementation: true.
function validateNoImplementationAuthorization(ctx, findings) {
  for (const regId of Object.keys(REGISTER_SCHEMAS)) {
    for (const r of records(ctx, regId)) {
      if (r.authorizes_implementation === true) {
        findings.push(makeFinding(Severity.ERROR, 'IMPLEMENTATION_UNAUTHORIZED', `${r.id}: authorizes_implementation must be false (Volume 8 contract foundation cannot authorize construction)`, r.id));
      }
    }
  }
}

// Implementation-status guard (fail closed): every foundation record must carry an
// implementation_status of NOT_IMPLEMENTED_OR_NOT_PROVEN.
function validateImplementationStatus(ctx, findings) {
  for (const regId of FOUNDATION_REGISTERS) {
    for (const r of records(ctx, regId)) {
      if (r.implementation_status !== 'NOT_IMPLEMENTED_OR_NOT_PROVEN') {
        findings.push(makeFinding(Severity.ERROR, 'IMPLEMENTATION_STATUS_INVALID', `${r.id}: implementation_status must be NOT_IMPLEMENTED_OR_NOT_PROVEN in Package 1`, r.id));
      }
    }
  }
}

// Contract surfaces without institutional authority or authoritative source.
function validateContractSurfaces(ctx, findings) {
  for (const s of records(ctx, 'REG-801')) {
    if (s.kind !== 'CONTRACT_SURFACE') continue;
    if (!s.institutional_authority) {
      findings.push(makeFinding(Severity.ERROR, 'SURFACE_WITHOUT_AUTHORITY', `${s.id}: contract surface names no institutional_authority`, s.id));
    }
    if (!s.authoritative_source) {
      findings.push(makeFinding(Severity.ERROR, 'SURFACE_WITHOUT_SOURCE', `${s.id}: contract surface names no authoritative_source`, s.id));
    }
    if (!s.authentication_dependency) {
      findings.push(makeFinding(Severity.ERROR, 'SURFACE_WITHOUT_AUTHENTICATION', `${s.id}: contract surface names no authentication_dependency`, s.id));
    }
    if (!s.authorization_dependency) {
      findings.push(makeFinding(Severity.ERROR, 'SURFACE_WITHOUT_AUTHORIZATION', `${s.id}: contract surface names no authorization_dependency`, s.id));
    }
  }
}

// Producers and consumers without ownership / institutional authority.
function validateProducersConsumers(ctx, findings) {
  for (const p of records(ctx, 'REG-801')) {
    if (p.kind !== 'PRODUCER' && p.kind !== 'CONSUMER') continue;
    if (!p.owner && !p.institutional_authority) {
      findings.push(makeFinding(Severity.ERROR, 'ENDPOINT_WITHOUT_OWNERSHIP', `${p.id}: ${p.kind.toLowerCase()} names no owner or institutional_authority`, p.id));
    }
    if (!p.interaction_type) {
      findings.push(makeFinding(Severity.ERROR, 'ENDPOINT_WITHOUT_INTERACTION', `${p.id}: ${p.kind.toLowerCase()} names no interaction_type`, p.id));
    }
  }
}

// Trust boundaries without a fail-closed posture.
function validateTrustBoundaries(ctx, findings) {
  for (const t of records(ctx, 'REG-801')) {
    if (t.kind !== 'TRUST_BOUNDARY') continue;
    if (!t.fail_closed_posture) {
      findings.push(makeFinding(Severity.ERROR, 'TRUST_BOUNDARY_WITHOUT_FAIL_CLOSED', `${t.id}: trust boundary names no fail_closed_posture`, t.id));
    }
  }
}

// Authorization contexts without named context elements.
function validateAuthorizationContexts(ctx, findings) {
  for (const a of records(ctx, 'REG-801')) {
    if (a.kind !== 'AUTHORIZATION_CONTEXT') continue;
    if (!(a.context_elements && a.context_elements.length > 0)) {
      findings.push(makeFinding(Severity.ERROR, 'AUTHCTX_WITHOUT_ELEMENTS', `${a.id}: authorization context names no context_elements`, a.id));
    }
  }
}

// Logical resource contracts without an owning authority, authoritative source, or
// purpose. A logical resource is a governed definition, not a wire schema; it must
// resolve to a single authority and source before any later package may shape it.
function validateLogicalResources(ctx, findings) {
  for (const r of records(ctx, 'REG-801')) {
    if (r.kind !== 'LOGICAL_RESOURCE') continue;
    if (!r.institutional_authority) {
      findings.push(makeFinding(Severity.ERROR, 'RESOURCE_WITHOUT_AUTHORITY', `${r.id}: logical resource names no institutional_authority`, r.id));
    }
    if (!r.authoritative_source) {
      findings.push(makeFinding(Severity.ERROR, 'RESOURCE_WITHOUT_SOURCE', `${r.id}: logical resource names no authoritative_source`, r.id));
    }
    if (!r.purpose) {
      findings.push(makeFinding(Severity.ERROR, 'RESOURCE_WITHOUT_PURPOSE', `${r.id}: logical resource names no purpose`, r.id));
    }
  }
}

// Provider contexts without incident, continuity, exit, data-return, or
// deletion-evidence obligations.
function validateProviderContexts(ctx, findings) {
  for (const p of records(ctx, 'REG-801')) {
    if (p.kind !== 'PROVIDER_CONTEXT') continue;
    if (!p.incident_notification_dependency) {
      findings.push(makeFinding(Severity.ERROR, 'PROVIDER_WITHOUT_INCIDENT', `${p.id}: provider context names no incident_notification_dependency`, p.id));
    }
    if (!p.continuity_dependency) {
      findings.push(makeFinding(Severity.ERROR, 'PROVIDER_WITHOUT_CONTINUITY', `${p.id}: provider context names no continuity_dependency`, p.id));
    }
    if (!p.exit_dependency) {
      findings.push(makeFinding(Severity.ERROR, 'PROVIDER_WITHOUT_EXIT', `${p.id}: provider context names no exit_dependency`, p.id));
    }
    if (!p.data_return_dependency) {
      findings.push(makeFinding(Severity.ERROR, 'PROVIDER_WITHOUT_DATA_RETURN', `${p.id}: provider context names no data_return_dependency`, p.id));
    }
    if (!p.deletion_evidence_dependency) {
      findings.push(makeFinding(Severity.ERROR, 'PROVIDER_WITHOUT_DELETION_EVIDENCE', `${p.id}: provider context names no deletion_evidence_dependency`, p.id));
    }
  }
}

// Command classes without preconditions or result semantics.
function validateCommandClasses(ctx, findings) {
  for (const c of records(ctx, 'REG-802')) {
    if (c.kind !== 'COMMAND_CLASS') continue;
    if (!(c.preconditions && c.preconditions.length > 0)) {
      findings.push(makeFinding(Severity.ERROR, 'COMMAND_WITHOUT_PRECONDITIONS', `${c.id}: command class names no preconditions`, c.id));
    }
    if (!c.result_semantics) {
      findings.push(makeFinding(Severity.ERROR, 'COMMAND_WITHOUT_RESULT', `${c.id}: command class names no result_semantics`, c.id));
    }
    if (!c.error_semantics) {
      findings.push(makeFinding(Severity.ERROR, 'COMMAND_WITHOUT_ERROR', `${c.id}: command class names no error_semantics`, c.id));
    }
    if (!c.idempotency_requirement) {
      findings.push(makeFinding(Severity.ERROR, 'COMMAND_WITHOUT_IDEMPOTENCY', `${c.id}: command class names no idempotency_requirement`, c.id));
    }
  }
}

// Query classes without authority or staleness posture.
function validateQueryClasses(ctx, findings) {
  for (const q of records(ctx, 'REG-802')) {
    if (q.kind !== 'QUERY_CLASS') continue;
    if (!q.institutional_authority && !q.authoritative_source) {
      findings.push(makeFinding(Severity.ERROR, 'QUERY_WITHOUT_AUTHORITY', `${q.id}: query class names no institutional_authority or authoritative_source`, q.id));
    }
    if (!q.staleness_posture) {
      findings.push(makeFinding(Severity.ERROR, 'QUERY_WITHOUT_STALENESS', `${q.id}: query class names no staleness_posture`, q.id));
    }
  }
}

// Event classes without an envelope or delivery posture.
function validateEventClasses(ctx, findings) {
  for (const e of records(ctx, 'REG-802')) {
    if (e.kind !== 'EVENT_CLASS') continue;
    if (!(e.envelope_fields && e.envelope_fields.length > 0)) {
      findings.push(makeFinding(Severity.ERROR, 'EVENT_WITHOUT_ENVELOPE', `${e.id}: event class names no envelope_fields`, e.id));
    }
    if (!e.delivery_posture) {
      findings.push(makeFinding(Severity.ERROR, 'EVENT_WITHOUT_DELIVERY', `${e.id}: event class names no delivery_posture`, e.id));
    }
    if (!e.ordering_requirement) {
      findings.push(makeFinding(Severity.ERROR, 'EVENT_WITHOUT_ORDERING', `${e.id}: event class names no ordering_requirement`, e.id));
    }
  }
}

// Webhook classes without authentication, integrity, or replay handling.
function validateWebhookClasses(ctx, findings) {
  for (const w of records(ctx, 'REG-802')) {
    if (w.kind !== 'WEBHOOK_CLASS') continue;
    if (!w.authentication_requirement) {
      findings.push(makeFinding(Severity.ERROR, 'WEBHOOK_WITHOUT_AUTHENTICATION', `${w.id}: webhook class names no authentication_requirement`, w.id));
    }
    if (!w.integrity_requirement) {
      findings.push(makeFinding(Severity.ERROR, 'WEBHOOK_WITHOUT_INTEGRITY', `${w.id}: webhook class names no integrity_requirement`, w.id));
    }
    if (!w.replay_posture) {
      findings.push(makeFinding(Severity.ERROR, 'WEBHOOK_WITHOUT_REPLAY', `${w.id}: webhook class names no replay_posture`, w.id));
    }
  }
}

// Idempotency / delivery / replay requirements without an idempotency posture or
// concurrency precondition.
function validateIdempotencyRequirements(ctx, findings) {
  for (const r of records(ctx, 'REG-802')) {
    if (r.kind !== 'IDEMPOTENCY_REQUIREMENT' && r.kind !== 'DELIVERY_REQUIREMENT' && r.kind !== 'REPLAY_REQUIREMENT') continue;
    if (!r.idempotency_requirement && !r.deduplication_scope) {
      findings.push(makeFinding(Severity.ERROR, 'REQUIREMENT_WITHOUT_IDEMPOTENCY', `${r.id}: delivery/idempotency requirement names no idempotency_requirement or deduplication_scope`, r.id));
    }
    if (!r.concurrency_precondition && !r.conflict_outcome) {
      findings.push(makeFinding(Severity.ERROR, 'REQUIREMENT_WITHOUT_CONCURRENCY', `${r.id}: delivery/idempotency requirement names no concurrency_precondition or conflict_outcome`, r.id));
    }
  }
}

// Reconciliation requirements (unknown-outcome interactions) without a
// reconciliation dependency.
function validateReconciliation(ctx, findings) {
  for (const r of records(ctx, 'REG-802')) {
    if (r.kind !== 'RECONCILIATION_REQUIREMENT') continue;
    if (!r.reconciliation_dependency) {
      findings.push(makeFinding(Severity.ERROR, 'RECONCILIATION_WITHOUT_DEPENDENCY', `${r.id}: reconciliation requirement names no reconciliation_dependency for unknown outcomes`, r.id));
    }
  }
}

// Error semantics without a language-neutral canonical code, a user-safe
// semantic, or a privacy/logging constraint.
function validateErrorSemantics(ctx, findings) {
  for (const e of records(ctx, 'REG-802')) {
    if (e.kind !== 'ERROR_SEMANTIC') continue;
    if (!e.canonical_code) {
      findings.push(makeFinding(Severity.ERROR, 'ERROR_WITHOUT_CANONICAL_CODE', `${e.id}: error semantic names no language-neutral canonical_code`, e.id));
    }
    if (!e.user_safe_semantic) {
      findings.push(makeFinding(Severity.ERROR, 'ERROR_WITHOUT_USER_SAFE', `${e.id}: error semantic names no user_safe_semantic`, e.id));
    }
    if (!e.privacy_constraint && !e.logging_constraint) {
      findings.push(makeFinding(Severity.ERROR, 'ERROR_WITHOUT_PRIVACY', `${e.id}: error semantic names no privacy_constraint or logging_constraint`, e.id));
    }
  }
}

// Restricted classification carried in an inappropriate message surface: any
// requirement classified RESTRICTED must name an explicit privacy constraint and
// must not be marked user-facing/user-safe without one.
function validateClassificationDiscipline(ctx, findings) {
  for (const r of records(ctx, 'REG-802')) {
    if (r.classification === 'RESTRICTED_EVIDENCE' || r.classification === 'AUDIT_AND_SECURITY' || r.classification === 'SECRETS_AND_CONFIGURATION') {
      if (!r.privacy_constraint) {
        findings.push(makeFinding(Severity.ERROR, 'RESTRICTED_WITHOUT_PRIVACY', `${r.id}: restricted classification carried without an explicit privacy_constraint`, r.id));
      }
    }
  }
  for (const s of records(ctx, 'REG-801')) {
    if ((s.classification === 'RESTRICTED_EVIDENCE' || s.classification === 'SECRETS_AND_CONFIGURATION') && !s.privacy_constraint) {
      findings.push(makeFinding(Severity.ERROR, 'RESTRICTED_WITHOUT_PRIVACY', `${s.id}: restricted contract surface names no privacy_constraint`, s.id));
    }
  }
}

// Exchange classes without accept/reject/quarantine or reconciliation semantics.
function validateExchangeClasses(ctx, findings) {
  for (const x of records(ctx, 'REG-802')) {
    if (x.kind !== 'EXCHANGE_CLASS') continue;
    if (!x.accept_reject_quarantine_semantics) {
      findings.push(makeFinding(Severity.ERROR, 'EXCHANGE_WITHOUT_ACCEPT_REJECT', `${x.id}: exchange class names no accept_reject_quarantine_semantics`, x.id));
    }
    if (!x.reconciliation_dependency) {
      findings.push(makeFinding(Severity.ERROR, 'EXCHANGE_WITHOUT_RECONCILIATION', `${x.id}: exchange class names no reconciliation_dependency`, x.id));
    }
    if (!x.manifest_and_integrity) {
      findings.push(makeFinding(Severity.ERROR, 'EXCHANGE_WITHOUT_INTEGRITY', `${x.id}: exchange class names no manifest_and_integrity requirement`, x.id));
    }
  }
}

// Compatibility rules without consumer evidence or a deprecation rule.
function validateCompatibilityRules(ctx, findings) {
  for (const c of records(ctx, 'REG-802')) {
    if (c.kind !== 'COMPATIBILITY_RULE') continue;
    if (!c.compatibility_state) {
      findings.push(makeFinding(Severity.ERROR, 'COMPATIBILITY_WITHOUT_STATE', `${c.id}: compatibility rule names no compatibility_state`, c.id));
    }
    if (!c.consumer_evidence) {
      findings.push(makeFinding(Severity.ERROR, 'COMPATIBILITY_WITHOUT_CONSUMER_EVIDENCE', `${c.id}: compatibility rule names no consumer_evidence`, c.id));
    }
  }
}

// Exceptions without expiry or approval; assumptions/risks/tests without owner or
// future gate.
function validateBacklog(ctx, findings) {
  for (const b of records(ctx, 'REG-804')) {
    if (!b.owner) {
      findings.push(makeFinding(Severity.ERROR, 'BACKLOG_WITHOUT_OWNER', `${b.id}: backlog item names no owner`, b.id));
    }
    if (!b.future_blocking_gate) {
      findings.push(makeFinding(Severity.ERROR, 'BACKLOG_WITHOUT_GATE', `${b.id}: backlog item names no future_blocking_gate`, b.id));
    }
    if (b.kind === 'EXC' && !b.expiry && !b.approval_ref) {
      findings.push(makeFinding(Severity.ERROR, 'EXCEPTION_WITHOUT_EXPIRY_OR_APPROVAL', `${b.id}: exception names neither expiry nor approval_ref`, b.id));
    }
  }
}

// Unresolved obligations must not name a completed gate as their future blocker.
function validateGateForwardOnly(ctx, findings) {
  const done = completedGates(ctx);
  const scan = (regId) => {
    for (const r of records(ctx, regId)) {
      const g = r.future_blocking_gate;
      if (g && done.has(g)) {
        findings.push(makeFinding(Severity.ERROR, 'GATE_ALREADY_COMPLETED', `${r.id}: future_blocking_gate ${g} is already dispositioned; unresolved items must name a forward gate`, r.id));
      }
    }
  };
  scan('REG-801');
  scan('REG-802');
  scan('REG-804');
}

// Executable/contract leakage: chapter prose must not embed DDL/IAM/migration/
// key-material, coded interface, or executable contract specifications.
function validateLeakage(ctx, findings) {
  for (const ch of ctx.chapters) {
    for (const p of LEAKAGE_PATTERNS) {
      if (p.re.test(ch.body)) {
        findings.push(makeFinding(Severity.ERROR, 'EXECUTABLE_LEAKAGE', `${ch.path}: chapter prose matches forbidden executable/coded pattern ${p.code}`, ch.id));
      }
    }
  }
}

export function run(ctx) {
  const findings = [];
  reportParseErrors(ctx, findings);
  validateSchemas(ctx, findings);
  validateIdUniqueness(ctx, findings);
  validateChapters(ctx, findings);
  validateNoImplementationAuthorization(ctx, findings);
  validateImplementationStatus(ctx, findings);
  validateContractSurfaces(ctx, findings);
  validateProducersConsumers(ctx, findings);
  validateTrustBoundaries(ctx, findings);
  validateAuthorizationContexts(ctx, findings);
  validateProviderContexts(ctx, findings);
  validateLogicalResources(ctx, findings);
  validateCommandClasses(ctx, findings);
  validateQueryClasses(ctx, findings);
  validateEventClasses(ctx, findings);
  validateWebhookClasses(ctx, findings);
  validateIdempotencyRequirements(ctx, findings);
  validateReconciliation(ctx, findings);
  validateErrorSemantics(ctx, findings);
  validateClassificationDiscipline(ctx, findings);
  validateExchangeClasses(ctx, findings);
  validateCompatibilityRules(ctx, findings);
  validateBacklog(ctx, findings);
  validateGateForwardOnly(ctx, findings);
  validateLeakage(ctx, findings);
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStandalone('Structural, schema & contract-governance conformance', run);
}
