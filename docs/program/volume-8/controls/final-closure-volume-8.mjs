// Control: Volume 8 Package 5 integrated-baseline and whole-volume closure
// coverage analysis and NON-AUTHORITATIVE projections.
//
// Emits deterministic JSON projections and a markdown closure report that
// consolidate the entire source-controlled Volume 8 contract-definition corpus:
// the integrated capability baseline, the authority/surface/producer/consumer/
// trust-boundary catalogue, the affiliation command/query/resource/response plane,
// the event/outbox/webhook/notification/delivery plane, the provider/file/batch/
// migration/exchange plane, the identity/authorization/service-trust plane, the
// error/unknown-outcome/retry/reconciliation plane, the data/privacy/evidence/
// records/audit plane, the versioning/compatibility/deprecation/change-control
// plane, the House P0 contract-coverage matrix, the downstream-volume handoff, and
// the unresolved readiness register. Every generated file is a projection of the
// source-controlled corpus and is never authoritative. The control returns
// coverage-gap findings as INFO backlog signals; genuinely blocking structural
// defects are raised elsewhere as ERRORs.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

const P5 = new Set([
  'V8-41', 'V8-42', 'V8-43', 'V8-44', 'V8-45', 'V8-46', 'V8-47',
  'V8-48', 'V8-49', 'V8-50', 'V8-51', 'V8-52', 'V8-53'
]);

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}
function byKind(ctx, regId, kind) {
  return records(ctx, regId).filter((r) => r.kind === kind);
}
function countByKind(list) {
  const out = {};
  for (const r of list) out[r.kind] = (out[r.kind] ?? 0) + 1;
  return out;
}

function analyse(ctx) {
  const reg801 = records(ctx, 'REG-801');
  const reg802 = records(ctx, 'REG-802');
  const reg803 = records(ctx, 'REG-803');
  const reg804 = records(ctx, 'REG-804');
  const reg805 = records(ctx, 'REG-805');

  const capabilities = byKind(ctx, 'REG-802', 'CONTRACT_CAPABILITY');
  const catalogue = byKind(ctx, 'REG-801', 'INTEGRATED_SURFACE_CATALOGUE_ENTRY');
  const p0Coverage = byKind(ctx, 'REG-802', 'P0_CONTRACT_COVERAGE');
  const handoffs = byKind(ctx, 'REG-802', 'DOWNSTREAM_HANDOFF');
  const readiness = byKind(ctx, 'REG-804', 'READINESS');

  const families = [...new Set(capabilities.map((c) => c.interaction_family).filter(Boolean))].sort();

  const gaps = {
    capabilities_without_interaction_family: capabilities.filter((c) => !c.interaction_family).map((c) => c.id),
    catalogue_without_trust_boundary: catalogue.filter((c) => !c.trust_boundary).map((c) => c.id),
    catalogue_without_traceability: catalogue.filter((c) => !(c.traces_to ?? []).length).map((c) => c.id),
    p0_without_definition_status: p0Coverage.filter((p) => p.definition_status !== 'DEFINED').map((p) => p.id),
    p0_without_implementation_evidence: p0Coverage.filter((p) => !p.required_implementation_evidence).map((p) => p.id),
    handoffs_without_items: handoffs.filter((h) => !(h.handoff_items ?? []).length).map((h) => h.id),
    readiness_without_disposition: readiness.filter((r) => !r.readiness_disposition).map((r) => r.id),
    backlog_without_forward_gate: reg804.filter((b) => !b.future_blocking_gate).map((b) => b.id)
  };

  return {
    counts: {
      chapters: ctx.chapters.length,
      package_5_chapters: ctx.chapters.filter((c) => P5.has(c.fileId)).length,
      reg_801_records: reg801.length,
      reg_802_records: reg802.length,
      reg_803_records: reg803.length,
      reg_804_records: reg804.length,
      reg_805_records: reg805.length,
      contract_capabilities: capabilities.length,
      integrated_catalogue_entries: catalogue.length,
      p0_contract_coverage_records: p0Coverage.length,
      downstream_handoff_records: handoffs.length,
      readiness_records: readiness.length
    },
    interaction_families: families,
    kinds_801: countByKind(reg801),
    kinds_802: countByKind(reg802),
    records: { reg801, reg802, reg803, reg804, reg805, capabilities, catalogue, p0Coverage, handoffs, readiness },
    gaps
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);
  for (const [name, list] of Object.entries(a.gaps)) {
    if (list.length > 0) {
      findings.push(makeFinding(Severity.INFO, 'VOLUME_8_CLOSURE_COVERAGE_GAP', `${name}: ${list.join(', ')}`, 'REG-801/REG-802/REG-804'));
    }
  }
  return findings;
}

function pick(r, keys) {
  const out = {};
  for (const k of keys) out[k] = r[k] ?? null;
  return out;
}

function closureReport(ctx, a) {
  const now = new Date().toISOString();
  const countRows = Object.entries(a.counts).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const familyRows = a.interaction_families.map((f) => `| ${f} |`).join('\n') || '| (none) |';
  const gapRows = Object.entries(a.gaps).map(([k, v]) => `| ${k} | ${v.length} | ${v.join(', ') || '(none)'} |`).join('\n');
  return `# Volume 8 — Integrated Contract Baseline and Volume 8 Closure Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the entire
> source-controlled Volume 8 API, event, integration, and exchange-contract
> definition corpus. It is not a source of truth, confers no ratification, and
> asserts no implementation, interface conformance, delivery guarantee, integration
> outcome, provider assurance, migration completion, privacy compliance, or
> compatibility validation. The Markdown chapters, YAML registers, JSON schemas, and
> control scripts are the authoritative record. Volume 0 through Volume 7 remain
> frozen/released and are not modified by Volume 8 work. Packages 1 through 4 remain
> frozen. Package 5 consolidates Packages 1 through 4 into a single integrated
> contract-definition baseline and closes Volume 8; it authorizes no implementation,
> executable interface or payload specification, endpoint, transfer, migration
> script, provider integration, procurement, sequencing, staffing, cost, pilot,
> rollout, launch, master development plan, or infrastructure.

## Corpus counts

| Element | Count |
| --- | --- |
${countRows}

## Integrated interaction families

| Interaction family |
| --- |
${familyRows}

## Closure backlog signals (non-blocking)

| Signal | Count | Identifiers |
| --- | --- | --- |
${gapRows}
`;
}

export function generate(ctx = loadContext()) {
  const a = analyse(ctx);
  const r = a.records;
  const outDir = join(VOLUME_DIR, 'generated', 'final-closure');
  mkdirSync(outDir, { recursive: true });
  const write = (name, obj) => writeFileSync(join(outDir, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');

  write('identifier-and-corpus-counts.json', {
    counts: a.counts,
    interaction_families: a.interaction_families,
    reg_801_kinds: a.kinds_801,
    reg_802_kinds: a.kinds_802
  });

  write('authority-surface-producer-consumer-and-trust-boundary-analysis.json', {
    integrated_catalogue_entries: a.counts.integrated_catalogue_entries,
    catalogue: r.catalogue.map((c) => pick(c, ['id', 'title', 'contract_type', 'interaction_family', 'institutional_authority', 'producer', 'consumer', 'contract_owner', 'operational_owner_status', 'trust_boundary'])),
    gaps: { catalogue_without_trust_boundary: a.gaps.catalogue_without_trust_boundary, catalogue_without_traceability: a.gaps.catalogue_without_traceability }
  });

  const capBy = (fam) => r.capabilities.filter((c) => (c.interaction_family ?? '').toUpperCase().includes(fam)).map((c) => pick(c, ['id', 'title', 'interaction_family', 'institutional_authority', 'producer', 'consumer']));
  write('affiliation-command-query-resource-and-response-coverage.json', {
    commands: capBy('COMMAND'),
    queries: capBy('QUERY'),
    resources: capBy('RESOURCE'),
    responses: capBy('RESPONSE')
  });
  write('event-outbox-webhook-notification-and-delivery-coverage.json', {
    events: capBy('EVENT'),
    outbox: capBy('OUTBOX'),
    webhooks: capBy('WEBHOOK'),
    notifications: capBy('NOTIFICATION'),
    delivery: capBy('DELIVERY')
  });
  write('provider-file-batch-migration-and-exchange-coverage.json', {
    providers: capBy('PROVIDER'),
    files: capBy('FILE'),
    batches: capBy('BATCH'),
    migrations: capBy('MIGRATION'),
    manual_exchanges: capBy('MANUAL')
  });
  write('identity-authorization-context-and-service-trust-analysis.json', {
    capabilities: r.capabilities.map((c) => pick(c, ['id', 'authorization_context', 'institutional_authority'])),
    gaps: { capabilities_without_interaction_family: a.gaps.capabilities_without_interaction_family }
  });
  write('error-unknown-outcome-retry-and-reconciliation-analysis.json', {
    capabilities: r.capabilities.map((c) => pick(c, ['id', 'interaction_family', 'validation_dependency']))
  });
  write('data-privacy-evidence-records-and-audit-contract-analysis.json', {
    capabilities: r.capabilities.map((c) => pick(c, ['id', 'classification', 'privacy_constraint', 'records_dependency']))
  });
  write('versioning-compatibility-deprecation-and-change-control-analysis.json', {
    capabilities: r.capabilities.map((c) => pick(c, ['id', 'lifecycle_dependency', 'validation_dependency']))
  });
  write('house-p0-contract-coverage.json', {
    p0_contract_coverage_records: a.counts.p0_contract_coverage_records,
    coverage: r.p0Coverage.map((p) => pick(p, ['id', 'p0_finding', 'contract_surface_ref', 'required_implementation_evidence', 'required_operational_proof', 'definition_status'])),
    gaps: { p0_without_definition_status: a.gaps.p0_without_definition_status, p0_without_implementation_evidence: a.gaps.p0_without_implementation_evidence }
  });
  write('downstream-handoff-coverage.json', {
    downstream_handoff_records: a.counts.downstream_handoff_records,
    handoffs: r.handoffs.map((h) => pick(h, ['id', 'title', 'downstream_volume', 'handoff_items', 'future_blocking_gate'])),
    gaps: { handoffs_without_items: a.gaps.handoffs_without_items }
  });
  write('unresolved-readiness-register.json', {
    readiness_records: a.counts.readiness_records,
    readiness: r.readiness.map((x) => pick(x, ['id', 'title', 'readiness_disposition', 'owner', 'required_evidence', 'downstream_volume', 'future_blocking_gate'])),
    backlog: r.reg804.map((b) => pick(b, ['id', 'kind', 'owner', 'future_blocking_gate'])),
    gaps: { readiness_without_disposition: a.gaps.readiness_without_disposition, backlog_without_forward_gate: a.gaps.backlog_without_forward_gate }
  });

  writeFileSync(join(outDir, 'volume-8-closure-report.md'), closureReport(ctx, a), 'utf8');
  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Volume 8 integrated-closure coverage', run);
}
