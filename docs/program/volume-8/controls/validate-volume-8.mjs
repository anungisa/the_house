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

// ---- Package 3: event, outbox, webhook, notification & delivery contracts ----
// The following guards fail closed on Package 3 event-and-delivery contract kinds.
// Each keys on a kind introduced in Package 3, so it adds obligations without
// altering the evaluation of any Package 1 or Package 2 record.

// Event/delivery surfaces and contexts (REG-801) without their governing obligations.
function validateEventDeliverySurfaces(ctx, findings) {
  for (const s of records(ctx, 'REG-801')) {
    if (s.kind === 'EVENT_CONTRACT_SURFACE') {
      if (!s.institutional_authority) findings.push(makeFinding(Severity.ERROR, 'EVENT_SURFACE_WITHOUT_AUTHORITY', `${s.id}: event contract surface names no institutional_authority`, s.id));
      if (!s.authoritative_source) findings.push(makeFinding(Severity.ERROR, 'EVENT_SURFACE_WITHOUT_SOURCE', `${s.id}: event contract surface names no authoritative_source`, s.id));
      if (!s.delivery_posture) findings.push(makeFinding(Severity.ERROR, 'EVENT_SURFACE_WITHOUT_DELIVERY', `${s.id}: event contract surface names no delivery_posture`, s.id));
    } else if (s.kind === 'EVENT_PRODUCER_CONTEXT' || s.kind === 'EVENT_CONSUMER_CONTEXT') {
      if (!s.owner && !s.institutional_authority) findings.push(makeFinding(Severity.ERROR, 'EVENT_ENDPOINT_WITHOUT_OWNERSHIP', `${s.id}: ${s.kind.toLowerCase()} names no owner or institutional_authority`, s.id));
      if (!s.interaction_type) findings.push(makeFinding(Severity.ERROR, 'EVENT_ENDPOINT_WITHOUT_INTERACTION', `${s.id}: ${s.kind.toLowerCase()} names no interaction_type`, s.id));
    } else if (s.kind === 'WEBHOOK_CONTEXT') {
      if (!s.authentication_requirement) findings.push(makeFinding(Severity.ERROR, 'WEBHOOK_CONTEXT_WITHOUT_AUTHENTICATION', `${s.id}: webhook context names no authentication_requirement`, s.id));
      if (!s.integrity_requirement) findings.push(makeFinding(Severity.ERROR, 'WEBHOOK_CONTEXT_WITHOUT_INTEGRITY', `${s.id}: webhook context names no integrity_requirement`, s.id));
      if (!s.replay_protection_dependency) findings.push(makeFinding(Severity.ERROR, 'WEBHOOK_CONTEXT_WITHOUT_REPLAY', `${s.id}: webhook context names no replay_protection_dependency`, s.id));
      if (!s.unknown_outcome_posture) findings.push(makeFinding(Severity.ERROR, 'WEBHOOK_CONTEXT_WITHOUT_UNKNOWN_OUTCOME', `${s.id}: webhook context names no unknown_outcome_posture`, s.id));
    } else if (s.kind === 'NOTIFICATION_CONTEXT') {
      if (!s.audience) findings.push(makeFinding(Severity.ERROR, 'NOTIFICATION_CONTEXT_WITHOUT_AUDIENCE', `${s.id}: notification context names no audience`, s.id));
      if (!s.disclosure_authority) findings.push(makeFinding(Severity.ERROR, 'NOTIFICATION_CONTEXT_WITHOUT_DISCLOSURE_AUTHORITY', `${s.id}: notification context names no disclosure_authority`, s.id));
    } else if (s.kind === 'DELIVERY_TRUST_BOUNDARY') {
      if (!s.fail_closed_posture) findings.push(makeFinding(Severity.ERROR, 'DELIVERY_BOUNDARY_WITHOUT_FAIL_CLOSED', `${s.id}: delivery trust boundary names no fail_closed_posture`, s.id));
    }
  }
}

// Event contracts without authoritative source, producing transition, or delivery posture.
function validateEventContracts(ctx, findings) {
  for (const e of records(ctx, 'REG-802')) {
    if (e.kind !== 'EVENT_CONTRACT') continue;
    if (!e.institutional_authority) findings.push(makeFinding(Severity.ERROR, 'EVENT_CONTRACT_WITHOUT_AUTHORITY', `${e.id}: event contract names no institutional_authority`, e.id));
    if (!e.authoritative_source) findings.push(makeFinding(Severity.ERROR, 'EVENT_CONTRACT_WITHOUT_SOURCE', `${e.id}: event contract names no authoritative_source`, e.id));
    if (!e.triggering_transition) findings.push(makeFinding(Severity.ERROR, 'EVENT_CONTRACT_WITHOUT_TRANSITION', `${e.id}: event contract names no triggering_transition`, e.id));
    if (!e.delivery_posture) findings.push(makeFinding(Severity.ERROR, 'EVENT_CONTRACT_WITHOUT_DELIVERY', `${e.id}: event contract names no delivery_posture`, e.id));
  }
}

// Event envelope requirements without envelope fields or a replay posture.
function validateEnvelopeRequirements(ctx, findings) {
  for (const e of records(ctx, 'REG-802')) {
    if (e.kind !== 'EVENT_ENVELOPE_REQUIREMENT') continue;
    if (!(e.envelope_fields && e.envelope_fields.length > 0)) findings.push(makeFinding(Severity.ERROR, 'ENVELOPE_WITHOUT_FIELDS', `${e.id}: event envelope requirement names no envelope_fields`, e.id));
    if (!e.replay_posture) findings.push(makeFinding(Severity.ERROR, 'ENVELOPE_WITHOUT_REPLAY', `${e.id}: event envelope requirement names no replay_posture`, e.id));
  }
}

// Outbox requirements without an atomicity requirement or a transactional-outbox posture.
function validateOutboxRequirements(ctx, findings) {
  for (const o of records(ctx, 'REG-802')) {
    if (o.kind !== 'OUTBOX_REQUIREMENT') continue;
    if (!o.atomicity_requirement) findings.push(makeFinding(Severity.ERROR, 'OUTBOX_WITHOUT_ATOMICITY', `${o.id}: outbox requirement names no atomicity_requirement`, o.id));
    if (!o.delivery_posture) findings.push(makeFinding(Severity.ERROR, 'OUTBOX_WITHOUT_DELIVERY', `${o.id}: outbox requirement names no delivery_posture`, o.id));
  }
}

// Delivery semantics without a delivery posture or an exactly-once business invariant.
function validateDeliverySemantics(ctx, findings) {
  for (const d of records(ctx, 'REG-802')) {
    if (d.kind !== 'DELIVERY_SEMANTIC') continue;
    if (!d.delivery_posture) findings.push(makeFinding(Severity.ERROR, 'DELIVERY_SEMANTIC_WITHOUT_POSTURE', `${d.id}: delivery semantic names no delivery_posture`, d.id));
    if (!d.exactly_once_business_invariant) findings.push(makeFinding(Severity.ERROR, 'DELIVERY_SEMANTIC_WITHOUT_BUSINESS_INVARIANT', `${d.id}: delivery semantic names no exactly_once_business_invariant`, d.id));
  }
}

// Consumer requirements without an idempotency posture or a concurrency/conflict posture.
function validateConsumerRequirements(ctx, findings) {
  for (const c of records(ctx, 'REG-802')) {
    if (c.kind !== 'CONSUMER_REQUIREMENT') continue;
    if (!c.idempotency_requirement && !c.deduplication_scope) findings.push(makeFinding(Severity.ERROR, 'CONSUMER_WITHOUT_IDEMPOTENCY', `${c.id}: consumer requirement names no idempotency_requirement or deduplication_scope`, c.id));
    if (!c.concurrency_precondition && !c.conflict_outcome && !c.replay_posture) findings.push(makeFinding(Severity.ERROR, 'CONSUMER_WITHOUT_CONCURRENCY', `${c.id}: consumer requirement names no concurrency_precondition, conflict_outcome, or replay_posture`, c.id));
  }
}

// Deduplication requirements without a deduplication scope; ordering requirements
// without an explicit ordering requirement.
function validateDeduplicationAndOrdering(ctx, findings) {
  for (const d of records(ctx, 'REG-802')) {
    if (d.kind === 'DEDUPLICATION_REQUIREMENT' && !d.deduplication_scope) {
      findings.push(makeFinding(Severity.ERROR, 'DEDUPLICATION_WITHOUT_SCOPE', `${d.id}: deduplication requirement names no deduplication_scope`, d.id));
    }
    if (d.kind === 'ORDERING_REQUIREMENT' && !d.ordering_requirement) {
      findings.push(makeFinding(Severity.ERROR, 'ORDERING_WITHOUT_REQUIREMENT', `${d.id}: ordering requirement names no ordering_requirement`, d.id));
    }
  }
}

// Webhook and callback requirements without authentication, integrity, replay
// protection, unknown-outcome, or reconciliation handling.
function validateWebhookAndCallbackRequirements(ctx, findings) {
  for (const w of records(ctx, 'REG-802')) {
    if (w.kind === 'WEBHOOK_REQUIREMENT') {
      if (!w.authentication_requirement) findings.push(makeFinding(Severity.ERROR, 'WEBHOOK_REQUIREMENT_WITHOUT_AUTHENTICATION', `${w.id}: webhook requirement names no authentication_requirement`, w.id));
      if (!w.integrity_requirement) findings.push(makeFinding(Severity.ERROR, 'WEBHOOK_REQUIREMENT_WITHOUT_INTEGRITY', `${w.id}: webhook requirement names no integrity_requirement`, w.id));
      if (!w.replay_protection_dependency && !w.replay_posture) findings.push(makeFinding(Severity.ERROR, 'WEBHOOK_REQUIREMENT_WITHOUT_REPLAY', `${w.id}: webhook requirement names no replay_protection_dependency or replay_posture`, w.id));
      if (!w.reconciliation_dependency) findings.push(makeFinding(Severity.ERROR, 'WEBHOOK_REQUIREMENT_WITHOUT_RECONCILIATION', `${w.id}: webhook requirement names no reconciliation_dependency`, w.id));
    } else if (w.kind === 'CALLBACK_REQUIREMENT') {
      if (!w.unknown_outcome_posture) findings.push(makeFinding(Severity.ERROR, 'CALLBACK_WITHOUT_UNKNOWN_OUTCOME', `${w.id}: callback requirement names no unknown_outcome_posture`, w.id));
      if (!w.reconciliation_dependency) findings.push(makeFinding(Severity.ERROR, 'CALLBACK_WITHOUT_RECONCILIATION', `${w.id}: callback requirement names no reconciliation_dependency`, w.id));
    }
  }
}

// Quarantine requirements without a quarantine posture or a reconciliation dependency.
function validateQuarantineRequirements(ctx, findings) {
  for (const q of records(ctx, 'REG-802')) {
    if (q.kind !== 'QUARANTINE_REQUIREMENT') continue;
    if (!q.quarantine_posture) findings.push(makeFinding(Severity.ERROR, 'QUARANTINE_WITHOUT_POSTURE', `${q.id}: quarantine requirement names no quarantine_posture`, q.id));
    if (!q.reconciliation_dependency) findings.push(makeFinding(Severity.ERROR, 'QUARANTINE_WITHOUT_RECONCILIATION', `${q.id}: quarantine requirement names no reconciliation_dependency`, q.id));
  }
}

// Notification requirements without bilingual, accessible, minimum-necessary content,
// or that carry restricted evidence as routine notification content.
function validateNotificationRequirements(ctx, findings) {
  for (const n of records(ctx, 'REG-802')) {
    if (n.kind !== 'NOTIFICATION_REQUIREMENT') continue;
    if (!n.english_semantic) findings.push(makeFinding(Severity.ERROR, 'NOTIFICATION_WITHOUT_ENGLISH', `${n.id}: notification requirement names no english_semantic`, n.id));
    if (!n.french_semantic) findings.push(makeFinding(Severity.ERROR, 'NOTIFICATION_WITHOUT_FRENCH', `${n.id}: notification requirement names no french_semantic`, n.id));
    if (!n.accessibility_requirement) findings.push(makeFinding(Severity.ERROR, 'NOTIFICATION_WITHOUT_ACCESSIBILITY', `${n.id}: notification requirement names no accessibility_requirement`, n.id));
    if (!n.minimum_necessary_content) findings.push(makeFinding(Severity.ERROR, 'NOTIFICATION_WITHOUT_MINIMUM_NECESSARY', `${n.id}: notification requirement names no minimum_necessary_content`, n.id));
    if (n.classification === 'RESTRICTED_EVIDENCE') findings.push(makeFinding(Severity.ERROR, 'NOTIFICATION_CARRIES_RESTRICTED_EVIDENCE', `${n.id}: notification requirement carries restricted evidence as routine content`, n.id));
  }
}

// ---- Package 4: external-provider, file, batch, migration & exchange contracts ----
// The following guards fail closed on Package 4 provider-and-exchange contract kinds.
// Each keys on a kind introduced in Package 4, so it adds obligations without
// altering the evaluation of any Package 1, Package 2, or Package 3 record.

// Provider contract surfaces (REG-801) without retained authority, an authoritative
// source, a trust boundary, or provider lifecycle obligations.
function validateProviderContractSurfaces(ctx, findings) {
  for (const s of records(ctx, 'REG-801')) {
    if (s.kind !== 'PROVIDER_CONTRACT_SURFACE') continue;
    if (!s.institutional_authority) findings.push(makeFinding(Severity.ERROR, 'PROVIDER_SURFACE_WITHOUT_AUTHORITY', `${s.id}: provider contract surface names no institutional_authority`, s.id));
    if (!s.authoritative_source) findings.push(makeFinding(Severity.ERROR, 'PROVIDER_SURFACE_WITHOUT_SOURCE', `${s.id}: provider contract surface names no authoritative_source`, s.id));
    if (!s.trust_boundary) findings.push(makeFinding(Severity.ERROR, 'PROVIDER_SURFACE_WITHOUT_TRUST_BOUNDARY', `${s.id}: provider contract surface names no trust_boundary`, s.id));
    if (!s.incident_notification_dependency) findings.push(makeFinding(Severity.ERROR, 'PROVIDER_SURFACE_WITHOUT_INCIDENT', `${s.id}: provider contract surface names no incident_notification_dependency`, s.id));
    if (!s.continuity_dependency) findings.push(makeFinding(Severity.ERROR, 'PROVIDER_SURFACE_WITHOUT_CONTINUITY', `${s.id}: provider contract surface names no continuity_dependency`, s.id));
    if (!s.exit_dependency) findings.push(makeFinding(Severity.ERROR, 'PROVIDER_SURFACE_WITHOUT_EXIT', `${s.id}: provider contract surface names no exit_dependency`, s.id));
  }
}

// Import/export/file/batch/migration/manual exchange contexts (REG-801) without
// ownership, purpose, producer, consumer, a trust boundary, or a classification.
function validateExchangeContexts(ctx, findings) {
  const kinds = new Set(['IMPORT_CONTEXT', 'EXPORT_CONTEXT', 'FILE_EXCHANGE_CONTEXT', 'BATCH_EXCHANGE_CONTEXT', 'MIGRATION_CONTEXT', 'MANUAL_EXCHANGE_CONTEXT']);
  for (const s of records(ctx, 'REG-801')) {
    if (!kinds.has(s.kind)) continue;
    const k = s.kind.toLowerCase();
    if (!s.owner && !s.institutional_authority) findings.push(makeFinding(Severity.ERROR, 'EXCHANGE_CONTEXT_WITHOUT_OWNERSHIP', `${s.id}: ${k} names no owner or institutional_authority`, s.id));
    if (!s.purpose) findings.push(makeFinding(Severity.ERROR, 'EXCHANGE_CONTEXT_WITHOUT_PURPOSE', `${s.id}: ${k} names no purpose`, s.id));
    if (!s.producer) findings.push(makeFinding(Severity.ERROR, 'EXCHANGE_CONTEXT_WITHOUT_PRODUCER', `${s.id}: ${k} names no producer`, s.id));
    if (!s.consumer) findings.push(makeFinding(Severity.ERROR, 'EXCHANGE_CONTEXT_WITHOUT_CONSUMER', `${s.id}: ${k} names no consumer`, s.id));
    if (!s.trust_boundary) findings.push(makeFinding(Severity.ERROR, 'EXCHANGE_CONTEXT_WITHOUT_TRUST_BOUNDARY', `${s.id}: ${k} names no trust_boundary`, s.id));
    if (!s.classification) findings.push(makeFinding(Severity.ERROR, 'EXCHANGE_CONTEXT_WITHOUT_CLASSIFICATION', `${s.id}: ${k} names no classification`, s.id));
  }
}

// Provider trust boundaries (REG-801) without a fail-closed posture.
function validateProviderTrustBoundaries(ctx, findings) {
  for (const s of records(ctx, 'REG-801')) {
    if (s.kind !== 'PROVIDER_TRUST_BOUNDARY') continue;
    if (!s.fail_closed_posture) findings.push(makeFinding(Severity.ERROR, 'PROVIDER_BOUNDARY_WITHOUT_FAIL_CLOSED', `${s.id}: provider trust boundary names no fail_closed_posture`, s.id));
    if (!s.trust_boundary) findings.push(makeFinding(Severity.ERROR, 'PROVIDER_BOUNDARY_WITHOUT_BOUNDARY', `${s.id}: provider trust boundary names no trust_boundary`, s.id));
  }
}

// File-manifest and batch-envelope requirements (REG-802) without manifest fields,
// an integrity dependency, source provenance, or a version distinction.
function validateFileBatchManifests(ctx, findings) {
  for (const r of records(ctx, 'REG-802')) {
    if (r.kind !== 'FILE_MANIFEST_REQUIREMENT' && r.kind !== 'BATCH_ENVELOPE_REQUIREMENT') continue;
    if (!(r.manifest_fields && r.manifest_fields.length > 0)) findings.push(makeFinding(Severity.ERROR, 'MANIFEST_WITHOUT_FIELDS', `${r.id}: file/batch manifest requirement names no manifest_fields`, r.id));
    if (!r.integrity_dependency) findings.push(makeFinding(Severity.ERROR, 'MANIFEST_WITHOUT_INTEGRITY', `${r.id}: file/batch manifest requirement names no integrity_dependency`, r.id));
    if (!r.source_provenance) findings.push(makeFinding(Severity.ERROR, 'MANIFEST_WITHOUT_PROVENANCE', `${r.id}: file/batch manifest requirement names no source_provenance`, r.id));
    if (!r.version_distinction) findings.push(makeFinding(Severity.ERROR, 'MANIFEST_WITHOUT_VERSION_DISTINCTION', `${r.id}: file/batch manifest requirement names no version_distinction`, r.id));
  }
}

// Import requirements without source authority, acceptance authority, reject and
// quarantine conditions, a partial-success posture, an authoritative-state
// consequence, or a reconciliation requirement.
function validateImportRequirements(ctx, findings) {
  for (const r of records(ctx, 'REG-802')) {
    if (r.kind !== 'IMPORT_REQUIREMENT') continue;
    if (!r.source_authority) findings.push(makeFinding(Severity.ERROR, 'IMPORT_WITHOUT_SOURCE_AUTHORITY', `${r.id}: import requirement names no source_authority`, r.id));
    if (!r.acceptance_authority) findings.push(makeFinding(Severity.ERROR, 'IMPORT_WITHOUT_ACCEPTANCE_AUTHORITY', `${r.id}: import requirement names no acceptance_authority`, r.id));
    if (!r.reject_conditions) findings.push(makeFinding(Severity.ERROR, 'IMPORT_WITHOUT_REJECT_CONDITIONS', `${r.id}: import requirement names no reject_conditions`, r.id));
    if (!r.quarantine_conditions) findings.push(makeFinding(Severity.ERROR, 'IMPORT_WITHOUT_QUARANTINE_CONDITIONS', `${r.id}: import requirement names no quarantine_conditions`, r.id));
    if (!r.partial_success_posture) findings.push(makeFinding(Severity.ERROR, 'IMPORT_WITHOUT_PARTIAL_SUCCESS', `${r.id}: import requirement names no partial_success_posture`, r.id));
    if (!r.authoritative_state_consequence) findings.push(makeFinding(Severity.ERROR, 'IMPORT_WITHOUT_STATE_CONSEQUENCE', `${r.id}: import requirement names no authoritative_state_consequence`, r.id));
    if (!r.reconciliation_dependency) findings.push(makeFinding(Severity.ERROR, 'IMPORT_WITHOUT_RECONCILIATION', `${r.id}: import requirement names no reconciliation_dependency`, r.id));
  }
}

// Export requirements without export authority, recipient authority status,
// disclosure basis, minimum-necessary content, delivery/receipt evidence, or
// reconciliation.
function validateExportRequirements(ctx, findings) {
  for (const r of records(ctx, 'REG-802')) {
    if (r.kind !== 'EXPORT_REQUIREMENT') continue;
    if (!r.export_authority) findings.push(makeFinding(Severity.ERROR, 'EXPORT_WITHOUT_AUTHORITY', `${r.id}: export requirement names no export_authority`, r.id));
    if (!r.recipient_authority_status) findings.push(makeFinding(Severity.ERROR, 'EXPORT_WITHOUT_RECIPIENT_AUTHORITY', `${r.id}: export requirement names no recipient_authority_status`, r.id));
    if (!r.disclosure_basis_status) findings.push(makeFinding(Severity.ERROR, 'EXPORT_WITHOUT_DISCLOSURE_BASIS', `${r.id}: export requirement names no disclosure_basis_status`, r.id));
    if (!r.minimum_necessary_content) findings.push(makeFinding(Severity.ERROR, 'EXPORT_WITHOUT_MINIMUM_NECESSARY', `${r.id}: export requirement names no minimum_necessary_content`, r.id));
    if (!r.delivery_evidence && !r.receipt_evidence) findings.push(makeFinding(Severity.ERROR, 'EXPORT_WITHOUT_DELIVERY_EVIDENCE', `${r.id}: export requirement names no delivery_evidence or receipt_evidence`, r.id));
    if (!r.reconciliation_dependency) findings.push(makeFinding(Severity.ERROR, 'EXPORT_WITHOUT_RECONCILIATION', `${r.id}: export requirement names no reconciliation_dependency`, r.id));
  }
}

// Acceptance / rejection / partial-success semantics without an explicit posture
// and a non-authoritative treatment for rejected/quarantined content.
function validateAcceptanceSemantics(ctx, findings) {
  for (const r of records(ctx, 'REG-802')) {
    if (r.kind === 'ACCEPTANCE_SEMANTIC') {
      if (!r.acceptance_posture) findings.push(makeFinding(Severity.ERROR, 'ACCEPTANCE_WITHOUT_POSTURE', `${r.id}: acceptance semantic names no acceptance_posture`, r.id));
    } else if (r.kind === 'REJECTION_SEMANTIC') {
      if (!r.non_authoritative_posture) findings.push(makeFinding(Severity.ERROR, 'REJECTION_WITHOUT_NON_AUTHORITATIVE', `${r.id}: rejection semantic names no non_authoritative_posture`, r.id));
    } else if (r.kind === 'PARTIAL_SUCCESS_SEMANTIC') {
      if (!r.partial_success_posture) findings.push(makeFinding(Severity.ERROR, 'PARTIAL_SUCCESS_WITHOUT_POSTURE', `${r.id}: partial-success semantic names no partial_success_posture`, r.id));
    }
  }
}

// Migration mapping requirements without source provenance, an explicit mapping
// posture, an uncertainty posture, or an identity-resolution dependency.
function validateMigrationMapping(ctx, findings) {
  for (const r of records(ctx, 'REG-802')) {
    if (r.kind !== 'MIGRATION_MAPPING_REQUIREMENT') continue;
    if (!r.source_provenance) findings.push(makeFinding(Severity.ERROR, 'MIGRATION_WITHOUT_PROVENANCE', `${r.id}: migration mapping requirement names no source_provenance`, r.id));
    if (!r.mapping_posture) findings.push(makeFinding(Severity.ERROR, 'MIGRATION_WITHOUT_MAPPING_POSTURE', `${r.id}: migration mapping requirement names no mapping_posture`, r.id));
    if (!r.uncertainty_posture) findings.push(makeFinding(Severity.ERROR, 'MIGRATION_WITHOUT_UNCERTAINTY', `${r.id}: migration mapping requirement names no uncertainty_posture`, r.id));
    if (!r.identity_resolution_dependency) findings.push(makeFinding(Severity.ERROR, 'MIGRATION_WITHOUT_IDENTITY_DEPENDENCY', `${r.id}: migration mapping requirement names no identity_resolution_dependency`, r.id));
  }
}

// Identity-resolution requirements without an explicit resolution posture, an
// uncertainty posture, or an unresolved posture.
function validateIdentityResolution(ctx, findings) {
  for (const r of records(ctx, 'REG-802')) {
    if (r.kind !== 'IDENTITY_RESOLUTION_REQUIREMENT') continue;
    if (!r.resolution_posture) findings.push(makeFinding(Severity.ERROR, 'IDENTITY_WITHOUT_RESOLUTION_POSTURE', `${r.id}: identity resolution requirement names no resolution_posture`, r.id));
    if (!r.uncertainty_posture) findings.push(makeFinding(Severity.ERROR, 'IDENTITY_WITHOUT_UNCERTAINTY', `${r.id}: identity resolution requirement names no uncertainty_posture`, r.id));
    if (!r.unresolved_posture) findings.push(makeFinding(Severity.ERROR, 'IDENTITY_WITHOUT_UNRESOLVED_POSTURE', `${r.id}: identity resolution requirement names no unresolved_posture`, r.id));
  }
}

// Provider continuity requirements without a continuity posture, a substitution
// posture, or an incident linkage.
function validateProviderContinuity(ctx, findings) {
  for (const r of records(ctx, 'REG-802')) {
    if (r.kind !== 'PROVIDER_CONTINUITY_REQUIREMENT') continue;
    if (!r.continuity_posture) findings.push(makeFinding(Severity.ERROR, 'CONTINUITY_WITHOUT_POSTURE', `${r.id}: provider continuity requirement names no continuity_posture`, r.id));
    if (!r.substitution_posture) findings.push(makeFinding(Severity.ERROR, 'CONTINUITY_WITHOUT_SUBSTITUTION', `${r.id}: provider continuity requirement names no substitution_posture`, r.id));
    if (!r.incident_linkage) findings.push(makeFinding(Severity.ERROR, 'CONTINUITY_WITHOUT_INCIDENT_LINKAGE', `${r.id}: provider continuity requirement names no incident_linkage`, r.id));
  }
}

// Data return / deletion evidence / provider exit requirements without their
// governing postures and distinctions.
function validateDataReturnDeletionExit(ctx, findings) {
  for (const r of records(ctx, 'REG-802')) {
    if (r.kind === 'DATA_RETURN_REQUIREMENT') {
      if (!r.return_posture) findings.push(makeFinding(Severity.ERROR, 'DATA_RETURN_WITHOUT_POSTURE', `${r.id}: data return requirement names no return_posture`, r.id));
    } else if (r.kind === 'DELETION_EVIDENCE_REQUIREMENT') {
      if (!r.deletion_evidence_posture) findings.push(makeFinding(Severity.ERROR, 'DELETION_WITHOUT_EVIDENCE_POSTURE', `${r.id}: deletion evidence requirement names no deletion_evidence_posture`, r.id));
      if (!r.residual_copy_posture) findings.push(makeFinding(Severity.ERROR, 'DELETION_WITHOUT_RESIDUAL_POSTURE', `${r.id}: deletion evidence requirement names no residual_copy_posture`, r.id));
    } else if (r.kind === 'PROVIDER_EXIT_REQUIREMENT') {
      if (!r.exit_posture) findings.push(makeFinding(Severity.ERROR, 'EXIT_WITHOUT_POSTURE', `${r.id}: provider exit requirement names no exit_posture`, r.id));
      if (!r.termination_distinction) findings.push(makeFinding(Severity.ERROR, 'EXIT_WITHOUT_TERMINATION_DISTINCTION', `${r.id}: provider exit requirement names no termination_distinction`, r.id));
    }
  }
}

// Exchange reconciliation requirements without a reconciliation owner, a replay
// authority, a partial-success posture, or closure evidence.
function validateExchangeReconciliation(ctx, findings) {
  for (const r of records(ctx, 'REG-802')) {
    if (r.kind !== 'EXCHANGE_RECONCILIATION_REQUIREMENT') continue;
    if (!r.reconciliation_owner_status) findings.push(makeFinding(Severity.ERROR, 'RECONCILIATION_WITHOUT_OWNER', `${r.id}: exchange reconciliation requirement names no reconciliation_owner_status`, r.id));
    if (!r.replay_authority) findings.push(makeFinding(Severity.ERROR, 'RECONCILIATION_WITHOUT_REPLAY_AUTHORITY', `${r.id}: exchange reconciliation requirement names no replay_authority`, r.id));
    if (!r.partial_success_posture) findings.push(makeFinding(Severity.ERROR, 'RECONCILIATION_WITHOUT_PARTIAL_SUCCESS', `${r.id}: exchange reconciliation requirement names no partial_success_posture`, r.id));
    if (!r.closure_evidence) findings.push(makeFinding(Severity.ERROR, 'RECONCILIATION_WITHOUT_CLOSURE_EVIDENCE', `${r.id}: exchange reconciliation requirement names no closure_evidence`, r.id));
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

// ---- Package 5: integrated contract baseline & closure synthesis ----
// The following guards fail closed on Package 5 synthesis, catalogue, P0-coverage,
// downstream-handoff, and readiness-disposition kinds. Each keys on a kind
// introduced in Package 5, so it adds obligations without altering the evaluation
// of any Package 1 through Package 4 record.

// Integrated contract-capability baseline (REG-802 CONTRACT_CAPABILITY) without an
// institutional authority, interaction family, producer, or consumer.
function validateContractCapabilities(ctx, findings) {
  for (const c of records(ctx, 'REG-802')) {
    if (c.kind !== 'CONTRACT_CAPABILITY') continue;
    if (!c.institutional_authority) findings.push(makeFinding(Severity.ERROR, 'CAPABILITY_WITHOUT_AUTHORITY', `${c.id}: contract capability names no institutional_authority`, c.id));
    if (!c.interaction_family) findings.push(makeFinding(Severity.ERROR, 'CAPABILITY_WITHOUT_INTERACTION_FAMILY', `${c.id}: contract capability names no interaction_family`, c.id));
    if (!c.producer) findings.push(makeFinding(Severity.ERROR, 'CAPABILITY_WITHOUT_PRODUCER', `${c.id}: contract capability names no producer`, c.id));
    if (!c.consumer) findings.push(makeFinding(Severity.ERROR, 'CAPABILITY_WITHOUT_CONSUMER', `${c.id}: contract capability names no consumer`, c.id));
  }
}

// Integrated surface-catalogue entries (REG-801 INTEGRATED_SURFACE_CATALOGUE_ENTRY)
// without a contract owner, an institutional authority, or a trust boundary.
function validateIntegratedCatalogue(ctx, findings) {
  for (const s of records(ctx, 'REG-801')) {
    if (s.kind !== 'INTEGRATED_SURFACE_CATALOGUE_ENTRY') continue;
    if (!s.contract_owner) findings.push(makeFinding(Severity.ERROR, 'CATALOGUE_WITHOUT_CONTRACT_OWNER', `${s.id}: integrated surface catalogue entry names no contract_owner`, s.id));
    if (!s.institutional_authority) findings.push(makeFinding(Severity.ERROR, 'CATALOGUE_WITHOUT_AUTHORITY', `${s.id}: integrated surface catalogue entry names no institutional_authority`, s.id));
    if (!s.trust_boundary) findings.push(makeFinding(Severity.ERROR, 'CATALOGUE_WITHOUT_TRUST_BOUNDARY', `${s.id}: integrated surface catalogue entry names no trust_boundary`, s.id));
  }
}

// House P0 contract-coverage records (REG-802 P0_CONTRACT_COVERAGE) without a named
// P0 finding, a contract-surface reference, required implementation evidence, or a
// definition status.
function validateP0Coverage(ctx, findings) {
  for (const p of records(ctx, 'REG-802')) {
    if (p.kind !== 'P0_CONTRACT_COVERAGE') continue;
    if (!p.p0_finding) findings.push(makeFinding(Severity.ERROR, 'P0_WITHOUT_FINDING', `${p.id}: P0 coverage record names no p0_finding`, p.id));
    if (!p.contract_surface_ref) findings.push(makeFinding(Severity.ERROR, 'P0_WITHOUT_CONTRACT_SURFACE', `${p.id}: P0 coverage record names no contract_surface_ref`, p.id));
    if (!p.required_implementation_evidence) findings.push(makeFinding(Severity.ERROR, 'P0_WITHOUT_IMPLEMENTATION_EVIDENCE', `${p.id}: P0 coverage record names no required_implementation_evidence`, p.id));
    if (!p.definition_status) findings.push(makeFinding(Severity.ERROR, 'P0_WITHOUT_DEFINITION_STATUS', `${p.id}: P0 coverage record names no definition_status`, p.id));
  }
}

// Downstream-handoff records (REG-802 DOWNSTREAM_HANDOFF) without a receiving
// volume, a set of handoff items, or a receiving gate.
function validateDownstreamHandoff(ctx, findings) {
  for (const h of records(ctx, 'REG-802')) {
    if (h.kind !== 'DOWNSTREAM_HANDOFF') continue;
    if (!h.downstream_volume) findings.push(makeFinding(Severity.ERROR, 'HANDOFF_WITHOUT_VOLUME', `${h.id}: downstream handoff record names no downstream_volume`, h.id));
    if (!(h.handoff_items && h.handoff_items.length > 0)) findings.push(makeFinding(Severity.ERROR, 'HANDOFF_WITHOUT_ITEMS', `${h.id}: downstream handoff record names no handoff_items`, h.id));
    if (!h.future_blocking_gate) findings.push(makeFinding(Severity.ERROR, 'HANDOFF_WITHOUT_GATE', `${h.id}: downstream handoff record names no future_blocking_gate`, h.id));
  }
}

// Readiness-disposition records (REG-804 READINESS) without an explicit
// disposition. Ownership and forward-gate discipline are enforced by
// validateBacklog and validateGateForwardOnly.
function validateReadinessDispositions(ctx, findings) {
  for (const r of records(ctx, 'REG-804')) {
    if (r.kind !== 'READINESS') continue;
    if (!r.readiness_disposition) findings.push(makeFinding(Severity.ERROR, 'READINESS_WITHOUT_DISPOSITION', `${r.id}: readiness record names no readiness_disposition`, r.id));
  }
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
  validateEventDeliverySurfaces(ctx, findings);
  validateEventContracts(ctx, findings);
  validateEnvelopeRequirements(ctx, findings);
  validateOutboxRequirements(ctx, findings);
  validateDeliverySemantics(ctx, findings);
  validateConsumerRequirements(ctx, findings);
  validateDeduplicationAndOrdering(ctx, findings);
  validateWebhookAndCallbackRequirements(ctx, findings);
  validateQuarantineRequirements(ctx, findings);
  validateNotificationRequirements(ctx, findings);
  validateProviderContractSurfaces(ctx, findings);
  validateExchangeContexts(ctx, findings);
  validateProviderTrustBoundaries(ctx, findings);
  validateFileBatchManifests(ctx, findings);
  validateImportRequirements(ctx, findings);
  validateExportRequirements(ctx, findings);
  validateAcceptanceSemantics(ctx, findings);
  validateMigrationMapping(ctx, findings);
  validateIdentityResolution(ctx, findings);
  validateProviderContinuity(ctx, findings);
  validateDataReturnDeletionExit(ctx, findings);
  validateExchangeReconciliation(ctx, findings);
  validateContractCapabilities(ctx, findings);
  validateIntegratedCatalogue(ctx, findings);
  validateP0Coverage(ctx, findings);
  validateDownstreamHandoff(ctx, findings);
  validateReadinessDispositions(ctx, findings);
  validateBacklog(ctx, findings);
  validateGateForwardOnly(ctx, findings);
  validateLeakage(ctx, findings);
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStandalone('Structural, schema & contract-governance conformance', run);
}
