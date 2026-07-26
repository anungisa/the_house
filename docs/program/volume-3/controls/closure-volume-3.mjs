// Control: deterministic Volume 3 closure assessment (`npm run governance:closure:v3`).
//
// Emits a set of NON-AUTHORITATIVE JSON projections and a Markdown closure report
// that summarise integrated operating coverage across identifiers, operating
// capabilities, accountability, authority and segregation, controls and assurance,
// dependencies, measures, and the validation backlog for the source-controlled
// Volume 3 corpus.
//
// This tooling never mutates the corpus and is never a source of truth. The
// Markdown chapters, YAML registers, JSON schemas, and control scripts remain the
// authoritative record. Volume 0, Volume 1, and Volume 2 remain frozen. This
// closure assessment extends the Volume 3 trace tooling; it does not replace it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, REQUIREMENT_CHAIN, isInheritedRef, loadContext } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

// Build the requirement graph: OUT (REG-301) then all REG-303 records.
function chainRecords(ctx) {
  const out = records(ctx, 'REG-301').map((r) => ({ id: r.id, level: 'OUT', traces_to: [], acceptance_ref: [] }));
  const reqs = records(ctx, 'REG-303').map((r) => ({ ...r, traces_to: r.traces_to ?? [], acceptance_ref: r.acceptance_ref ?? [] }));
  return [...out, ...reqs];
}

function buildChildIndex(chain) {
  const byId = new Map(chain.map((r) => [r.id, r]));
  const children = new Map();
  for (const r of chain) {
    for (const t of [...(r.traces_to ?? []), ...(r.acceptance_ref ?? [])]) {
      if (isInheritedRef(t) || !byId.has(t)) continue;
      if (!children.has(t)) children.set(t, []);
      children.get(t).push(r.id);
    }
  }
  return { byId, children };
}

function hasDescendantLevel(id, targetLevel, byId, children, seen = new Set()) {
  if (seen.has(id)) return false;
  seen.add(id);
  for (const k of children.get(id) ?? []) {
    const rec = byId.get(k);
    if (rec && rec.level === targetLevel) return true;
    if (hasDescendantLevel(k, targetLevel, byId, children, seen)) return true;
  }
  return false;
}

function buildIdentifierCounts(ctx) {
  const counts = {};
  for (const level of REQUIREMENT_CHAIN) counts[level] = 0;
  counts.OUT = records(ctx, 'REG-301').length;
  for (const r of records(ctx, 'REG-303')) {
    if (counts[r.level] == null) counts[r.level] = 0;
    counts[r.level] += 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    generated_at: null,
    counts_by_level: counts,
    requirement_total: total,
    stakeholders: records(ctx, 'REG-302').length,
    decisions: records(ctx, 'REG-304').length,
    approvals: records(ctx, 'REG-305').length,
    chapters: ctx.chapters.length,
    registers: Object.keys(ctx.registers).length
  };
}

function buildOperatingCapabilityCoverage(ctx) {
  const chain = chainRecords(ctx);
  const { byId, children } = buildChildIndex(chain);
  const caps = chain.filter((r) => r.level === 'CAP');
  const capabilitiesWithoutRulesOrFr = caps
    .filter((r) => !hasDescendantLevel(r.id, 'RULE', byId, children) && !hasDescendantLevel(r.id, 'FR', byId, children))
    .map((r) => r.id)
    .sort();
  const capabilitiesWithoutControls = caps
    .filter((r) => !hasDescendantLevel(r.id, 'CTRL', byId, children))
    .map((r) => r.id)
    .sort();
  const namedOperatingCapabilities = records(ctx, 'REG-303')
    .filter((r) => r.operating_capability)
    .map((r) => ({ id: r.id, operating_capability: r.operating_capability }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    generated_at: null,
    capability_total: caps.length,
    capabilities_without_rules_or_fr: capabilitiesWithoutRulesOrFr,
    capabilities_without_controls: capabilitiesWithoutControls,
    named_operating_capabilities: namedOperatingCapabilities
  };
}

function buildAccountabilityCoverage(ctx) {
  const services = records(ctx, 'REG-303').filter((r) => r.service_identifier || r.accountable_function || r.performing_function);
  const servicesWithoutAccountable = records(ctx, 'REG-303')
    .filter((r) => r.service_identifier && !r.accountable_function && !r.performing_function)
    .map((r) => r.id)
    .sort();
  const accountableRecords = records(ctx, 'REG-303')
    .filter((r) => r.accountable_function)
    .map((r) => ({ id: r.id, accountable_function: r.accountable_function }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    generated_at: null,
    records_with_accountability: services.length,
    services_without_accountable_function: servicesWithoutAccountable,
    accountable_records: accountableRecords
  };
}

function buildAuthorityAndSegregationAnalysis(ctx) {
  const authorityRecords = records(ctx, 'REG-303').filter((r) => r.authority_domain);
  const authorityWithoutSegregation = authorityRecords
    .filter((r) => !r.prohibited_combinations && !r.conflict_controls)
    .map((r) => r.id)
    .sort();
  return {
    generated_at: null,
    authority_domain_records: authorityRecords.map((r) => r.id).sort(),
    authority_records_without_segregation_controls: authorityWithoutSegregation,
    prohibited_combination_records: records(ctx, 'REG-303')
      .filter((r) => r.prohibited_combinations)
      .map((r) => r.id)
      .sort()
  };
}

function buildControlAndAssuranceCoverage(ctx) {
  const chain = chainRecords(ctx);
  const { byId, children } = buildChildIndex(chain);
  const controls = chain.filter((r) => r.level === 'CTRL');
  const controlsWithoutTests = controls
    .filter((r) => !hasDescendantLevel(r.id, 'TEST', byId, children))
    .map((r) => r.id)
    .sort();
  const controlsWithoutEvidence = records(ctx, 'REG-303')
    .filter((r) => r.level === 'CTRL' && !r.evidence_generated)
    .map((r) => r.id)
    .sort();
  return {
    generated_at: null,
    control_total: controls.length,
    controls_without_tests: controlsWithoutTests,
    controls_without_evidence: controlsWithoutEvidence
  };
}

function buildDependencyCoverage(ctx) {
  const dependencyRecords = records(ctx, 'REG-303').filter((r) => r.dependencies || r.dependency_owner || r.capacity_dependency);
  const dependenciesWithoutOwner = records(ctx, 'REG-303')
    .filter((r) => (r.dependencies || r.capacity_dependency) && !r.dependency_owner && !r.accountable_function)
    .map((r) => r.id)
    .sort();
  return {
    generated_at: null,
    dependency_records: dependencyRecords.map((r) => r.id).sort(),
    dependency_records_without_owner: dependenciesWithoutOwner
  };
}

function buildMeasureCoverage(ctx) {
  const measureRecords = records(ctx, 'REG-303').filter((r) => r.measure_identifier);
  const measuresWithoutOwner = measureRecords
    .filter((r) => !r.control_owner && !r.validation_authority && !r.accountable_function)
    .map((r) => ({ id: r.id, measure_identifier: r.measure_identifier }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const measures = measureRecords
    .map((r) => ({
      id: r.id,
      measure_identifier: r.measure_identifier,
      baseline_status: r.measure_baseline_status ?? null
    }))
    .sort((a, b) => a.measure_identifier.localeCompare(b.measure_identifier));
  return {
    generated_at: null,
    measure_total: measureRecords.length,
    measures,
    measures_without_owner: measuresWithoutOwner
  };
}

function buildValidationBacklog(ctx) {
  const items = [];
  const bySeparation = {};
  for (const r of records(ctx, 'REG-303')) {
    const flags = [];
    if (r.rule_classification && r.rule_classification !== 'DEFINED_PRODUCT_RULE') flags.push(r.rule_classification);
    if (r.acceptance_status && r.acceptance_status !== 'DEFINED') flags.push(r.acceptance_status);
    if (r.measure_baseline_status && r.measure_baseline_status !== 'DEFINED') flags.push(r.measure_baseline_status);
    if (r.synthesis_classification && r.synthesis_classification !== 'DEFINED') flags.push(r.synthesis_classification);
    if (r.gap_disposition && ['VALIDATION_PENDING', 'POLICY_PENDING', 'DEFECT_REQUIRING_AMENDMENT'].includes(r.gap_disposition)) {
      flags.push(r.gap_disposition);
    }
    if (r.closure_separation) {
      bySeparation[r.closure_separation] = (bySeparation[r.closure_separation] ?? 0) + 1;
    }
    if (flags.length > 0) {
      items.push({
        id: r.id,
        level: r.level,
        classifications: flags,
        owner: r.policy_owner ?? r.operational_owner ?? r.validation_authority ?? r.content_owner ?? r.accountable_function ?? null,
        closure_separation: r.closure_separation ?? null,
        future_blocking_gate: r.future_blocking_gate ?? null
      });
    }
  }
  const byClassification = {};
  for (const it of items) {
    for (const c of it.classifications) byClassification[c] = (byClassification[c] ?? 0) + 1;
  }
  return {
    generated_at: null,
    pending_count: items.length,
    by_classification: byClassification,
    by_closure_separation: bySeparation,
    items: items.sort((a, b) => a.id.localeCompare(b.id))
  };
}

function buildAuthorizationScan(ctx) {
  return records(ctx, 'REG-303')
    .filter((r) => r.authorizes_implementation === true)
    .map((r) => r.id)
    .sort();
}

function buildMarkdown(all, authorizations) {
  const ic = all['identifier-counts'];
  const oc = all['operating-capability-coverage'];
  const ac = all['accountability-coverage'];
  const au = all['authority-and-segregation-analysis'];
  const cc = all['control-and-assurance-coverage'];
  const dc = all['dependency-coverage'];
  const mc = all['measure-coverage'];
  const vb = all['validation-backlog'];
  const countRows = Object.entries(ic.counts_by_level).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const sepRows = Object.entries(vb.by_closure_separation).sort().map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const now = new Date().toISOString();
  return `# Volume 3 Closure Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 3 corpus produced by \`npm run governance:closure:v3\`. It is not a source of
> truth and confers no ratification. The Markdown chapters, YAML registers, JSON
> schemas, and control scripts are the authoritative record.

## Identifier counts

- Requirement total: ${ic.requirement_total}
- Stakeholders: ${ic.stakeholders} | Decisions: ${ic.decisions} | Approvals: ${ic.approvals}
- Chapters: ${ic.chapters} | Registers: ${ic.registers}

| Level | Count |
| --- | --- |
${countRows}

## Operating-capability coverage

- Capabilities: ${oc.capability_total}
- Capabilities without rules or functional requirements: ${oc.capabilities_without_rules_or_fr.length}
- Capabilities without controls: ${oc.capabilities_without_controls.length}
- Named operating capabilities: ${oc.named_operating_capabilities.length}

## Accountability coverage

- Records with accountability: ${ac.records_with_accountability}
- Services without an accountable function: ${ac.services_without_accountable_function.length}

## Authority and segregation

- Authority-domain records: ${au.authority_domain_records.length}
- Authority records without segregation controls: ${au.authority_records_without_segregation_controls.length}
- Prohibited-combination records: ${au.prohibited_combination_records.length}

## Control and assurance coverage

- Controls: ${cc.control_total}
- Controls without tests: ${cc.controls_without_tests.length}
- Controls without evidence: ${cc.controls_without_evidence.length}

## Dependency coverage

- Dependency records: ${dc.dependency_records.length}
- Dependency records without an owner: ${dc.dependency_records_without_owner.length}

## Measure coverage

- Measures: ${mc.measure_total}
- Measures without an owner: ${mc.measures_without_owner.length}

## Validation backlog

- Pending requirement records: ${vb.pending_count}

| Closure separation | Count |
| --- | --- |
${sepRows || '| (none) | 0 |'}

## Authorization scan

- Requirements authorizing implementation (must be 0): ${authorizations.length}
`;
}

export function generate(ctx = loadContext()) {
  const all = {
    'identifier-counts': buildIdentifierCounts(ctx),
    'operating-capability-coverage': buildOperatingCapabilityCoverage(ctx),
    'accountability-coverage': buildAccountabilityCoverage(ctx),
    'authority-and-segregation-analysis': buildAuthorityAndSegregationAnalysis(ctx),
    'control-and-assurance-coverage': buildControlAndAssuranceCoverage(ctx),
    'dependency-coverage': buildDependencyCoverage(ctx),
    'measure-coverage': buildMeasureCoverage(ctx),
    'validation-backlog': buildValidationBacklog(ctx)
  };
  const authorizations = buildAuthorizationScan(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'closure');
  mkdirSync(outDir, { recursive: true });
  for (const [name, data] of Object.entries(all)) {
    writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }
  const markdown = buildMarkdown(all, authorizations);
  writeFileSync(join(outDir, 'volume-3-closure-report.md'), markdown, 'utf8');
  return { outDir, all, authorizations };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { outDir, all, authorizations } = generate();
  const ic = all['identifier-counts'];
  const cc = all['control-and-assurance-coverage'];
  const vb = all['validation-backlog'];
  console.log('=== Volume 3 closure assessment ===');
  console.log(`  Requirement records: ${ic.requirement_total}`);
  console.log(`  Controls without tests: ${cc.controls_without_tests.length}`);
  console.log(`  Validation backlog items: ${vb.pending_count}`);
  console.log(`  Requirements authorizing implementation (must be 0): ${authorizations.length}`);
  console.log(`  Outputs: ${outDir}`);
}
