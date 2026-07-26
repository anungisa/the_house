// Control: structural, schema, authority, and data-governance conformance for the
// Volume 5 corpus.
//
// Validates: YAML parse integrity, JSON Schema conformance of every register,
// identifier uniqueness, chapter header/H1 integrity, and the fail-closed
// data-governance guards required by the directive: authority ownership; rules
// without governed domains; domains without owners; correction rules without
// authority; derived products without authoritative sources; lineage without
// sources; validation items without owners or future gates; records authorizing
// implementation; and physical-schema / migration leakage.

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

function validateSchemas(ctx, findings) {
  const ajv = buildAjv();
  for (const [regId, schemaFile] of Object.entries(REGISTER_SCHEMAS)) {
    const entry = ctx.registers[regId];
    if (!entry) {
      findings.push(
        makeFinding(Severity.ERROR, 'REGISTER_MISSING', `Register ${regId} is not present in the corpus`, regId)
      );
      continue;
    }
    const validate = ajv.getSchema(schemaFile);
    const ok = validate(entry.doc);
    if (!ok) {
      for (const e of validate.errors ?? []) {
        findings.push(
          makeFinding(Severity.ERROR, 'SCHEMA_CONFORMANCE', `${entry.path}: ${e.instancePath || '/'} ${e.message}`, regId)
        );
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

// Data-authorization guard (fail closed): no Volume 5 record in any register may
// set authorizes_implementation: true. Package 1 defines conceptual data
// governance only; construction is authorized only downstream through the
// governed gate sequence.
function validateNoImplementationAuthorization(ctx, findings) {
  for (const regId of Object.keys(REGISTER_SCHEMAS)) {
    for (const r of records(ctx, regId)) {
      if (r.authorizes_implementation === true) {
        findings.push(
          makeFinding(
            Severity.ERROR,
            'IMPLEMENTATION_UNAUTHORIZED',
            `${r.id}: authorizes_implementation must be false (Volume 5 data definition cannot authorize construction)`,
            r.id
          )
        );
      }
    }
  }
}

// Authority ownership + domains without owners: every INFORMATION_DOMAIN must
// name business authority, system-of-record authority, and a data steward.
function validateDomainOwnership(ctx, findings) {
  for (const d of records(ctx, 'REG-501')) {
    if (d.kind !== 'INFORMATION_DOMAIN') continue;
    if (!d.business_authority) {
      findings.push(makeFinding(Severity.ERROR, 'DOMAIN_WITHOUT_OWNER', `${d.id}: information domain has no business_authority`, d.id));
    }
    if (!d.system_of_record_authority) {
      findings.push(makeFinding(Severity.ERROR, 'DOMAIN_WITHOUT_SOR', `${d.id}: information domain has no system_of_record_authority`, d.id));
    }
    if (!d.data_steward) {
      findings.push(makeFinding(Severity.ERROR, 'DOMAIN_WITHOUT_STEWARD', `${d.id}: information domain has no data_steward`, d.id));
    }
  }
}

// Rules without governed domains: every RULE must reference at least one governed
// information domain, and each referenced domain must exist.
function validateRuleDomains(ctx, findings) {
  const domainIds = new Set(records(ctx, 'REG-501').filter((r) => r.kind === 'INFORMATION_DOMAIN').map((r) => r.id));
  for (const rule of records(ctx, 'REG-502')) {
    if (rule.kind !== 'RULE') continue;
    const domains = rule.affected_domains ?? [];
    if (domains.length === 0) {
      findings.push(makeFinding(Severity.ERROR, 'RULE_WITHOUT_DOMAIN', `${rule.id}: data rule references no governed information domain`, rule.id));
      continue;
    }
    for (const dref of domains) {
      if (!domainIds.has(dref)) {
        findings.push(makeFinding(Severity.ERROR, 'RULE_DOMAIN_UNRESOLVED', `${rule.id}: affected domain ${dref} does not resolve to a governed domain`, rule.id));
      }
    }
  }
}

// Correction rules without authority: every QUALITY rule must name a correction
// authority for resolution.
function validateCorrectionAuthority(ctx, findings) {
  for (const rule of records(ctx, 'REG-502')) {
    if (rule.kind !== 'QUALITY') continue;
    if (!rule.correction_authority) {
      findings.push(makeFinding(Severity.ERROR, 'CORRECTION_WITHOUT_AUTHORITY', `${rule.id}: quality/correction rule names no correction_authority`, rule.id));
    }
  }
}

// Derived products without authoritative sources: every DATA_PRODUCT must name an
// authoritative source that resolves to a governed domain or entity.
function validateDerivedProductSources(ctx, findings) {
  const sourceIds = new Set(
    records(ctx, 'REG-501')
      .filter((r) => r.kind === 'INFORMATION_DOMAIN' || r.kind === 'CONCEPTUAL_ENTITY')
      .map((r) => r.id)
  );
  for (const dp of records(ctx, 'REG-501')) {
    if (dp.kind !== 'DATA_PRODUCT') continue;
    if (!dp.authoritative_source) {
      findings.push(makeFinding(Severity.ERROR, 'DERIVED_WITHOUT_SOURCE', `${dp.id}: data product names no authoritative_source`, dp.id));
      continue;
    }
    const refs = String(dp.authoritative_source).split(/[,\s]+/).filter(Boolean);
    const anyResolved = refs.some((r) => sourceIds.has(r));
    if (!anyResolved) {
      findings.push(makeFinding(Severity.ERROR, 'DERIVED_SOURCE_UNRESOLVED', `${dp.id}: authoritative_source references no governed domain or entity`, dp.id));
    }
  }
}

// Lineage without sources: every LINEAGE rule must name a source.
function validateLineageSources(ctx, findings) {
  for (const rule of records(ctx, 'REG-502')) {
    if (rule.kind !== 'LINEAGE') continue;
    if (!rule.source) {
      findings.push(makeFinding(Severity.ERROR, 'LINEAGE_WITHOUT_SOURCE', `${rule.id}: lineage rule names no source`, rule.id));
    }
  }
}

// Validation items without owners or future gates: every VALIDATION backlog item
// must name an owner and a future blocking gate.
function validateBacklogItems(ctx, findings) {
  for (const item of records(ctx, 'REG-504')) {
    if (item.kind !== 'VALIDATION') continue;
    if (!item.owner) {
      findings.push(makeFinding(Severity.ERROR, 'VALIDATION_WITHOUT_OWNER', `${item.id}: validation backlog item names no owner`, item.id));
    }
    if (!item.future_blocking_gate) {
      findings.push(makeFinding(Severity.ERROR, 'VALIDATION_WITHOUT_GATE', `${item.id}: validation backlog item names no future_blocking_gate`, item.id));
    }
  }
}

// Validation-gate correctness (fail closed): no unresolved obligation in REG-504
// or integrity/quality rule in REG-502 may name a governance gate that has
// already been dispositioned (passed). An obligation blocked by a completed gate
// can never clear. This enforces the additive reassignment away from Gate V5-G1
// after it passed, and prevents the same defect for any future completed gate.
function validateGateCorrectness(ctx, findings) {
  const done = completedGates(ctx);
  if (done.size === 0) return;
  for (const regId of ['REG-502', 'REG-504']) {
    for (const r of records(ctx, regId)) {
      const g = r.future_blocking_gate;
      if (g && done.has(g)) {
        findings.push(
          makeFinding(
            Severity.ERROR,
            'GATE_ALREADY_PASSED',
            `${r.id}: future_blocking_gate ${g} has already been dispositioned; reassign to an uncompleted future gate`,
            r.id
          )
        );
      }
    }
  }
}

// Logical-model structural guards (fail closed): every LOGICAL_ENTITY must name
// an owning domain, an identity concept, and a lifecycle; every
// LOGICAL_RELATIONSHIP must name at least two endpoints and a relationship
// invariant; every DERIVED_DATA_PRODUCT must name an authoritative source; every
// INTEGRITY rule must name affected entities and a logical condition.
function validateLogicalModel(ctx, findings) {
  const catalogue = records(ctx, 'REG-501');
  const entityLikeIds = new Set(
    catalogue
      .filter((r) => ['CONCEPTUAL_ENTITY', 'LOGICAL_ENTITY', 'VALUE_OBJECT', 'STATE_RECORD', 'SNAPSHOT', 'PROVENANCE_RECORD', 'CORRECTION_RECORD', 'REFERENCE_DATA', 'CODE_SET'].includes(r.kind))
      .map((r) => r.id)
  );
  const domainIds = new Set(catalogue.filter((r) => r.kind === 'INFORMATION_DOMAIN').map((r) => r.id));
  const sourceIds = new Set([...entityLikeIds, ...domainIds]);

  for (const r of catalogue) {
    if (r.kind === 'LOGICAL_ENTITY') {
      if (!r.owning_domain) {
        findings.push(makeFinding(Severity.ERROR, 'LOGICAL_ENTITY_WITHOUT_DOMAIN', `${r.id}: logical entity names no owning_domain`, r.id));
      }
      if (!r.identity_concept) {
        findings.push(makeFinding(Severity.ERROR, 'LOGICAL_ENTITY_WITHOUT_IDENTITY', `${r.id}: logical entity names no identity_concept`, r.id));
      }
      if (!r.lifecycle) {
        findings.push(makeFinding(Severity.ERROR, 'LOGICAL_ENTITY_WITHOUT_LIFECYCLE', `${r.id}: logical entity names no lifecycle`, r.id));
      }
    }
    if (r.kind === 'LOGICAL_RELATIONSHIP') {
      const endpoints = r.endpoints ?? [];
      if (endpoints.length < 2) {
        findings.push(makeFinding(Severity.ERROR, 'LOGICAL_RELATIONSHIP_ENDPOINTS', `${r.id}: logical relationship needs at least two endpoints`, r.id));
      }
      if (!r.relationship_invariant) {
        findings.push(makeFinding(Severity.ERROR, 'LOGICAL_RELATIONSHIP_WITHOUT_INVARIANT', `${r.id}: logical relationship names no relationship_invariant`, r.id));
      }
    }
    if (r.kind === 'DERIVED_DATA_PRODUCT') {
      if (!r.authoritative_source) {
        findings.push(makeFinding(Severity.ERROR, 'DERIVED_WITHOUT_SOURCE', `${r.id}: derived data product names no authoritative_source`, r.id));
      } else {
        const refs = String(r.authoritative_source).split(/[,\s]+/).filter(Boolean);
        if (!refs.some((x) => sourceIds.has(x))) {
          findings.push(makeFinding(Severity.ERROR, 'DERIVED_SOURCE_UNRESOLVED', `${r.id}: authoritative_source resolves to no governed domain or entity`, r.id));
        }
      }
    }
  }

  for (const rule of records(ctx, 'REG-502')) {
    if (rule.kind !== 'INTEGRITY') continue;
    const affected = rule.affected_entities ?? [];
    if (affected.length === 0) {
      findings.push(makeFinding(Severity.ERROR, 'INTEGRITY_WITHOUT_ENTITIES', `${rule.id}: integrity rule names no affected_entities`, rule.id));
    }
    if (!rule.logical_condition) {
      findings.push(makeFinding(Severity.ERROR, 'INTEGRITY_WITHOUT_CONDITION', `${rule.id}: integrity rule names no logical_condition`, rule.id));
    }
  }
}

// Physical-schema / migration leakage: no chapter or register value may contain
// physical DDL, migration file references, or other implementation artifacts.
function validateNoPhysicalLeakage(ctx, findings) {
  for (const ch of ctx.chapters) {
    for (const p of LEAKAGE_PATTERNS) {
      if (p.re.test(ch.body)) {
        findings.push(makeFinding(Severity.ERROR, 'PHYSICAL_LEAKAGE', `${ch.path}: contains physical/implementation artifact (${p.code})`, ch.id));
      }
    }
  }
  for (const entry of Object.values(ctx.registers)) {
    for (const p of LEAKAGE_PATTERNS) {
      if (p.re.test(entry.raw)) {
        findings.push(makeFinding(Severity.ERROR, 'PHYSICAL_LEAKAGE', `${entry.path}: contains physical/implementation artifact (${p.code})`, entry.id));
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
  validateDomainOwnership(ctx, findings);
  validateRuleDomains(ctx, findings);
  validateCorrectionAuthority(ctx, findings);
  validateDerivedProductSources(ctx, findings);
  validateLineageSources(ctx, findings);
  validateBacklogItems(ctx, findings);
  validateGateCorrectness(ctx, findings);
  validateLogicalModel(ctx, findings);
  validateNoPhysicalLeakage(ctx, findings);
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runStandalone('Volume 5 structural, schema, and data-governance conformance', run);
}
