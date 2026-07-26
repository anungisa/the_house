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

// Package 3 data-lifecycle & stewardship guards (fail closed): master/reference
// data-set and controlled-vocabulary records must name an authority owner (and
// reference/code/term records must carry a version posture); DATA_LIFECYCLE
// records must name a records authority; DATA_ISSUE records must name a
// resolution authority; RECONCILIATION_CONTEXT records must name a conflict
// authority; EXCHANGE_RECORD records must name a source authority and a
// transformation/lineage; DATA_USE records must name a permitted purpose; and
// STEWARDSHIP_MEASURE records must name an accountable owner. External-authority
// data may never be given independent House authority: an EXCHANGE_RECORD must
// name an external source_authority when its data_class is EXTERNAL_AUTHORITY_DATA.
function validatePackage3Governance(ctx, findings) {
  // A record belongs to Package 3 when its authoring chapter is V5-21..V5-31.
  // The version-posture requirement for reference/code records applies only to
  // Package-3-authored records; frozen Package 1/2 reference records are unchanged.
  const isPackage3Chapter = (ref) => {
    const m = /^V5-([0-9]{2})$/.exec(String(ref ?? ''));
    if (!m) return false;
    const n = Number(m[1]);
    return n >= 21 && n <= 31;
  };
  for (const r of records(ctx, 'REG-501')) {
    switch (r.kind) {
      case 'MASTER_DATA_SET':
      case 'REFERENCE_DATA_SET':
        if (!r.authority_owner) {
          findings.push(makeFinding(Severity.ERROR, 'DATASET_WITHOUT_AUTHORITY', `${r.id}: ${r.kind} names no authority_owner`, r.id));
        }
        break;
      case 'CONTROLLED_TERM':
        if (!r.version_posture) {
          findings.push(makeFinding(Severity.ERROR, 'REFERENCE_WITHOUT_VERSION', `${r.id}: ${r.kind} names no version_posture`, r.id));
        }
        break;
      case 'REFERENCE_DATA':
      case 'CODE_SET':
        if (isPackage3Chapter(r.chapter_ref) && !r.version_posture) {
          findings.push(makeFinding(Severity.ERROR, 'REFERENCE_WITHOUT_VERSION', `${r.id}: ${r.kind} names no version_posture`, r.id));
        }
        break;
      case 'DATA_LIFECYCLE':
        if (!r.records_authority) {
          findings.push(makeFinding(Severity.ERROR, 'LIFECYCLE_WITHOUT_RECORDS_AUTHORITY', `${r.id}: data lifecycle record names no records_authority`, r.id));
        }
        break;
      case 'DATA_ISSUE':
        if (!r.resolution_authority) {
          findings.push(makeFinding(Severity.ERROR, 'ISSUE_WITHOUT_RESOLUTION_AUTHORITY', `${r.id}: data issue record names no resolution_authority`, r.id));
        }
        break;
      case 'RECONCILIATION_CONTEXT':
        if (!r.conflict_authority) {
          findings.push(makeFinding(Severity.ERROR, 'RECON_WITHOUT_CONFLICT_AUTHORITY', `${r.id}: reconciliation context names no conflict_authority`, r.id));
        }
        break;
      case 'EXCHANGE_RECORD':
        if (!r.source_authority) {
          findings.push(makeFinding(Severity.ERROR, 'EXCHANGE_WITHOUT_SOURCE_AUTHORITY', `${r.id}: exchange record names no source_authority`, r.id));
        }
        if (!r.transformation && !r.lineage) {
          findings.push(makeFinding(Severity.ERROR, 'EXCHANGE_WITHOUT_LINEAGE', `${r.id}: exchange record names no transformation or lineage`, r.id));
        }
        break;
      case 'DATA_USE':
        if (!r.permitted_purpose) {
          findings.push(makeFinding(Severity.ERROR, 'USE_WITHOUT_PURPOSE', `${r.id}: data use record names no permitted_purpose`, r.id));
        }
        break;
      case 'STEWARDSHIP_MEASURE':
        if (!r.accountable_owner) {
          findings.push(makeFinding(Severity.ERROR, 'MEASURE_WITHOUT_OWNER', `${r.id}: stewardship measure names no accountable_owner`, r.id));
        }
        break;
      default:
        break;
    }
  }
}

// Package 4 physical-data-model guards (fail closed). Every physical construct
// must preserve its governed logical provenance and integrity responsibility:
// a PHYSICAL_RELATION must name a governed logical source, an owning module, and
// an implementation status; a PHYSICAL_ATTRIBUTE must name a data classification;
// PRIMARY_KEY / ALTERNATE_KEY / UNIQUE_CONSTRAINT records must name their key
// columns; a FOREIGN_KEY must name the referenced relation; a COMPOSITE_SCOPE_KEY
// must name a scope strategy; a CHECK_CONSTRAINT must name a check condition; an
// INDEX_REQUIREMENT must name an index requirement or index columns; a
// PARTITION_REQUIREMENT must name a partition strategy or partitioning
// consideration; a DATABASE_VIEW / MATERIALIZED_PROJECTION must name a governed
// logical source and a consistency posture (projections are never authoritative);
// STAGING_RELATION / QUARANTINE_RELATION migration structures must name a source
// provenance; and AUDIT_RELATION / OUTBOX_RELATION records must name an integrity
// responsibility. These guards are keyed on the physical catalogue kinds first
// introduced in Package 4; no frozen prior-package record carries them.
function validatePackage4Governance(ctx, findings) {
  for (const r of records(ctx, 'REG-501')) {
    switch (r.kind) {
      case 'PHYSICAL_RELATION':
        if (!r.logical_source) {
          findings.push(makeFinding(Severity.ERROR, 'RELATION_WITHOUT_LOGICAL_SOURCE', `${r.id}: physical relation names no logical_source`, r.id));
        }
        if (!r.owning_module) {
          findings.push(makeFinding(Severity.ERROR, 'RELATION_WITHOUT_MODULE', `${r.id}: physical relation names no owning_module`, r.id));
        }
        if (!r.implementation_status) {
          findings.push(makeFinding(Severity.ERROR, 'RELATION_WITHOUT_IMPLEMENTATION_STATUS', `${r.id}: physical relation names no implementation_status`, r.id));
        }
        break;
      case 'PHYSICAL_ATTRIBUTE':
        if (!r.classification) {
          findings.push(makeFinding(Severity.ERROR, 'ATTRIBUTE_WITHOUT_CLASSIFICATION', `${r.id}: physical attribute names no classification`, r.id));
        }
        break;
      case 'PRIMARY_KEY':
      case 'ALTERNATE_KEY':
      case 'UNIQUE_CONSTRAINT':
        if (!(r.key_columns && r.key_columns.length > 0)) {
          findings.push(makeFinding(Severity.ERROR, 'KEY_WITHOUT_COLUMNS', `${r.id}: ${r.kind} names no key_columns`, r.id));
        }
        break;
      case 'FOREIGN_KEY':
        if (!r.referenced_relation) {
          findings.push(makeFinding(Severity.ERROR, 'FOREIGN_KEY_WITHOUT_REFERENCE', `${r.id}: foreign key names no referenced_relation`, r.id));
        }
        break;
      case 'COMPOSITE_SCOPE_KEY':
        if (!r.scope_strategy && !(r.key_columns && r.key_columns.length > 0)) {
          findings.push(makeFinding(Severity.ERROR, 'SCOPE_KEY_WITHOUT_STRATEGY', `${r.id}: composite scope key names no scope_strategy or key_columns`, r.id));
        }
        break;
      case 'CHECK_CONSTRAINT':
        if (!r.check_condition) {
          findings.push(makeFinding(Severity.ERROR, 'CHECK_WITHOUT_CONDITION', `${r.id}: check constraint names no check_condition`, r.id));
        }
        break;
      case 'INDEX_REQUIREMENT':
        if (!r.index_requirement && !(r.index_columns && r.index_columns.length > 0)) {
          findings.push(makeFinding(Severity.ERROR, 'INDEX_WITHOUT_REQUIREMENT', `${r.id}: index requirement names no index_requirement or index_columns`, r.id));
        }
        break;
      case 'PARTITION_REQUIREMENT':
        if (!r.partition_strategy && !r.partitioning_consideration) {
          findings.push(makeFinding(Severity.ERROR, 'PARTITION_WITHOUT_STRATEGY', `${r.id}: partition requirement names no partition_strategy or partitioning_consideration`, r.id));
        }
        break;
      case 'DATABASE_VIEW':
      case 'MATERIALIZED_PROJECTION':
        if (!r.logical_source && !r.authoritative_source) {
          findings.push(makeFinding(Severity.ERROR, 'PROJECTION_WITHOUT_SOURCE', `${r.id}: ${r.kind} names no logical_source or authoritative_source`, r.id));
        }
        if (!r.consistency_posture) {
          findings.push(makeFinding(Severity.ERROR, 'PROJECTION_WITHOUT_CONSISTENCY', `${r.id}: ${r.kind} names no consistency_posture (projections are never authoritative)`, r.id));
        }
        break;
      case 'STAGING_RELATION':
      case 'QUARANTINE_RELATION':
        if (!r.logical_source && !r.source_reference) {
          findings.push(makeFinding(Severity.ERROR, 'MIGRATION_RELATION_WITHOUT_SOURCE', `${r.id}: ${r.kind} names no logical_source or source_reference provenance`, r.id));
        }
        break;
      case 'AUDIT_RELATION':
      case 'OUTBOX_RELATION':
        if (!r.integrity_responsibility) {
          findings.push(makeFinding(Severity.ERROR, 'CONTROL_RELATION_WITHOUT_INTEGRITY', `${r.id}: ${r.kind} names no integrity_responsibility`, r.id));
        }
        break;
      default:
        break;
    }
  }
}
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
  validatePackage3Governance(ctx, findings);
  validatePackage4Governance(ctx, findings);
  validateNoPhysicalLeakage(ctx, findings);
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runStandalone('Volume 5 structural, schema, and data-governance conformance', run);
}
