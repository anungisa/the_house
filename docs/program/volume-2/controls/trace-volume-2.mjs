// Control: deterministic Volume 2 traceability projection (`npm run governance:trace:v2`).
//
// Emits a set of NON-AUTHORITATIVE JSON projections and a Markdown report that
// summarise identifier counts, orphan analysis, requirement-chain coverage,
// acceptance coverage, House/Button authority-boundary analysis, and the
// validation backlog for the source-controlled Volume 2 corpus.
//
// This tooling never mutates the corpus and is never a source of truth. The
// Markdown chapters, YAML registers, JSON schemas, and control scripts remain
// the authoritative record. Volume 0 and Volume 1 remain frozen.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, REQUIREMENT_CHAIN, isInheritedRef, loadContext } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

function levelOf(id) {
  const m = String(id).match(/^([A-Z]+)-V2-[0-9]{3}$/);
  return m ? m[1] : null;
}

// Ordered list of every requirement-chain record: OUT (REG-201) then REG-203.
function chainRecords(ctx) {
  const out = records(ctx, 'REG-201').map((r) => ({
    id: r.id,
    level: 'OUT',
    product: r.product ?? null,
    traces_to: [],
    acceptance_ref: [],
    validation_status: r.validation_status ?? null
  }));
  const reqs = records(ctx, 'REG-203').map((r) => ({
    id: r.id,
    level: r.level,
    product: r.product ?? null,
    traces_to: r.traces_to ?? [],
    acceptance_ref: r.acceptance_ref ?? [],
    validation_status: r.validation_status ?? null,
    rule_classification: r.rule_classification ?? null,
    acceptance_status: r.acceptance_status ?? null,
    measure_identifier: r.measure_identifier ?? null,
    measure_baseline_status: r.measure_baseline_status ?? null,
    gap_disposition: r.gap_disposition ?? null,
    validation_authority: r.validation_authority ?? null,
    future_blocking_gate: r.future_blocking_gate ?? null,
    authorizes_implementation: r.authorizes_implementation ?? null
  }));
  return [...out, ...reqs];
}

function buildIdentifierCounts(ctx) {
  const counts = {};
  for (const level of REQUIREMENT_CHAIN) counts[level] = 0;
  counts.OUT = records(ctx, 'REG-201').length;
  for (const r of records(ctx, 'REG-203')) {
    if (counts[r.level] == null) counts[r.level] = 0;
    counts[r.level] += 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    generated_at: null,
    requirement_chain: REQUIREMENT_CHAIN,
    counts_by_level: counts,
    requirement_total: total,
    stakeholders: records(ctx, 'REG-202').length,
    decisions: records(ctx, 'REG-204').length,
    approvals: records(ctx, 'REG-205').length,
    chapters: ctx.chapters.length,
    registers: Object.keys(ctx.registers).length
  };
}

// A reference resolves if it is inherited or matches a known corpus id.
function makeResolver(ctx) {
  const known = new Set();
  for (const regId of ['REG-201', 'REG-202', 'REG-203', 'REG-204', 'REG-205']) {
    for (const r of records(ctx, regId)) known.add(r.id);
  }
  for (const c of ctx.chapters) known.add(c.fileId);
  for (const id of Object.keys(ctx.registers)) known.add(id);
  return (ref) => isInheritedRef(ref) || known.has(ref);
}

function buildOrphanAnalysis(ctx) {
  const chain = chainRecords(ctx);
  const resolves = makeResolver(ctx);
  const consumed = new Set(); // ids that appear as a traces_to / acceptance_ref target
  for (const r of chain) {
    for (const t of r.traces_to) if (!isInheritedRef(t)) consumed.add(t);
    for (const a of r.acceptance_ref) if (!isInheritedRef(a)) consumed.add(a);
  }
  const brokenTraces = [];
  const noParent = [];
  const noConsumer = [];
  for (const r of chain) {
    for (const t of r.traces_to) {
      if (!resolves(t)) brokenTraces.push({ id: r.id, unresolved: t });
    }
    const hasParent =
      r.level === 'OUT' ||
      r.traces_to.some((t) => isInheritedRef(t) || resolves(t));
    if (!hasParent) noParent.push(r.id);
    // TEST records are legitimate leaves; OUT records are legitimate roots.
    if (r.level !== 'TEST' && r.level !== 'OUT' && !consumed.has(r.id)) {
      noConsumer.push({ id: r.id, level: r.level });
    }
  }
  return {
    generated_at: null,
    broken_traces: brokenTraces.sort((a, b) => a.id.localeCompare(b.id)),
    records_without_parent: noParent.sort(),
    records_without_consumer: noConsumer.sort((a, b) => a.id.localeCompare(b.id))
  };
}

function buildChainCoverage(ctx) {
  const chain = chainRecords(ctx);
  const byLevel = {};
  for (const level of ['OUT', ...REQUIREMENT_CHAIN.filter((l) => l !== 'OUT')]) {
    byLevel[level] = { total: 0, with_parent: 0 };
  }
  const reverseOrder = [];
  for (const r of chain) {
    if (byLevel[r.level] == null) byLevel[r.level] = { total: 0, with_parent: 0 };
    byLevel[r.level].total += 1;
    const childPos = REQUIREMENT_CHAIN.indexOf(r.level);
    let hasPrecedingParent = r.level === 'OUT';
    for (const t of r.traces_to) {
      if (isInheritedRef(t)) {
        hasPrecedingParent = true;
        continue;
      }
      const parentLevel = levelOf(t);
      const parentPos = parentLevel ? REQUIREMENT_CHAIN.indexOf(parentLevel) : -1;
      if (parentPos >= 0 && childPos >= 0) {
        if (parentPos >= childPos) {
          reverseOrder.push({ id: r.id, level: r.level, traces_to: t, parent_level: parentLevel });
        } else {
          hasPrecedingParent = true;
        }
      } else {
        hasPrecedingParent = true;
      }
    }
    if (hasPrecedingParent) byLevel[r.level].with_parent += 1;
  }
  return {
    generated_at: null,
    chain: REQUIREMENT_CHAIN,
    by_level: byLevel,
    reverse_or_same_order_references: reverseOrder.sort((a, b) => a.id.localeCompare(b.id))
  };
}

// Forward/backward reachability across the requirement graph.
function buildAcceptanceCoverage(ctx) {
  const chain = chainRecords(ctx);
  const byId = new Map(chain.map((r) => [r.id, r]));
  const children = new Map(); // parentId -> [childId]
  for (const r of chain) {
    for (const t of [...r.traces_to, ...r.acceptance_ref]) {
      if (isInheritedRef(t) || !byId.has(t)) continue;
      if (!children.has(t)) children.set(t, []);
      children.get(t).push(r.id);
    }
  }
  // Does a record reach any TEST descendant?
  const reachesTestCache = new Map();
  function reachesTest(id, seen = new Set()) {
    if (reachesTestCache.has(id)) return reachesTestCache.get(id);
    if (seen.has(id)) return false;
    seen.add(id);
    const rec = byId.get(id);
    if (rec && rec.level === 'TEST') {
      reachesTestCache.set(id, true);
      return true;
    }
    const kids = children.get(id) ?? [];
    const res = kids.some((k) => reachesTest(k, seen));
    reachesTestCache.set(id, res);
    return res;
  }
  const outcomesWithoutAcceptance = [];
  for (const r of chain.filter((x) => x.level === 'OUT')) {
    if (!reachesTest(r.id)) outcomesWithoutAcceptance.push(r.id);
  }
  const capabilitiesWithoutRules = [];
  const rulesWithoutWorkflows = [];
  const workflowsWithoutExperience = [];
  const controlsWithoutTests = [];
  // Helper: any descendant of a given level.
  function hasDescendantLevel(id, targetLevel, seen = new Set()) {
    if (seen.has(id)) return false;
    seen.add(id);
    for (const k of children.get(id) ?? []) {
      const rec = byId.get(k);
      if (rec && rec.level === targetLevel) return true;
      if (hasDescendantLevel(k, targetLevel, seen)) return true;
    }
    return false;
  }
  for (const r of chain) {
    if (r.level === 'CAP' && !hasDescendantLevel(r.id, 'RULE') && !hasDescendantLevel(r.id, 'FR')) {
      capabilitiesWithoutRules.push(r.id);
    }
    if (r.level === 'RULE' && !hasDescendantLevel(r.id, 'WF')) rulesWithoutWorkflows.push(r.id);
    if (r.level === 'WF' && !hasDescendantLevel(r.id, 'UX')) workflowsWithoutExperience.push(r.id);
    if (r.level === 'CTRL' && !hasDescendantLevel(r.id, 'TEST')) controlsWithoutTests.push(r.id);
  }
  // TEST records that do not trace back (transitively) to any OUT.
  const parents = new Map();
  for (const r of chain) {
    for (const t of [...r.traces_to, ...r.acceptance_ref]) {
      if (isInheritedRef(t)) continue;
      if (!parents.has(r.id)) parents.set(r.id, []);
      parents.get(r.id).push(t);
    }
  }
  function reachesOutcome(id, seen = new Set()) {
    if (seen.has(id)) return false;
    seen.add(id);
    const rec = byId.get(id);
    if (rec && rec.level === 'OUT') return true;
    for (const p of parents.get(id) ?? []) {
      if (isInheritedRef(p)) return true; // inherited outcome lineage
      if (reachesOutcome(p, seen)) return true;
    }
    return false;
  }
  const testsWithoutOutcome = [];
  for (const r of chain.filter((x) => x.level === 'TEST')) {
    if (!reachesOutcome(r.id)) testsWithoutOutcome.push(r.id);
  }
  return {
    generated_at: null,
    outcomes_without_acceptance: outcomesWithoutAcceptance.sort(),
    capabilities_without_rules_or_fr: capabilitiesWithoutRules.sort(),
    rules_without_workflows: rulesWithoutWorkflows.sort(),
    workflows_without_experience: workflowsWithoutExperience.sort(),
    controls_without_tests: controlsWithoutTests.sort(),
    tests_without_outcome_lineage: testsWithoutOutcome.sort()
  };
}

function buildAuthorityBoundary(ctx) {
  const stk = records(ctx, 'REG-202');
  const governedAuthority = stk.filter((r) => r.governed_authority === true).map((r) => r.id);
  const buttonPrimaryWithGovernedAuthority = stk
    .filter((r) => r.governed_authority === true && r.primary_product === 'Button')
    .map((r) => r.id);
  const productCounts = { House: 0, Button: 0, Both: 0, Neither: 0 };
  for (const r of records(ctx, 'REG-203')) {
    if (productCounts[r.product] == null) productCounts[r.product] = 0;
    productCounts[r.product] += 1;
  }
  // Requirements that authorize implementation (must be none).
  const authorizeImplementation = records(ctx, 'REG-203')
    .filter((r) => r.authorizes_implementation === true)
    .map((r) => r.id);
  return {
    generated_at: null,
    stakeholders_with_governed_authority: governedAuthority.sort(),
    button_primary_with_governed_authority_conflict: buttonPrimaryWithGovernedAuthority.sort(),
    requirement_product_distribution: productCounts,
    requirements_authorizing_implementation: authorizeImplementation.sort()
  };
}

function buildValidationBacklog(ctx) {
  const items = [];
  for (const r of records(ctx, 'REG-203')) {
    const flags = [];
    if (r.rule_classification && r.rule_classification !== 'DEFINED_PRODUCT_RULE') flags.push(r.rule_classification);
    if (r.acceptance_status && r.acceptance_status !== 'DEFINED') flags.push(r.acceptance_status);
    if (r.measure_baseline_status && r.measure_baseline_status !== 'DEFINED') flags.push(r.measure_baseline_status);
    if (r.gap_disposition && ['VALIDATION_PENDING', 'POLICY_PENDING', 'DEFECT_REQUIRING_AMENDMENT'].includes(r.gap_disposition)) {
      flags.push(r.gap_disposition);
    }
    if (flags.length > 0) {
      items.push({
        id: r.id,
        level: r.level,
        classifications: flags,
        owner: r.policy_owner ?? r.operational_owner ?? r.validation_authority ?? r.content_owner ?? null,
        future_blocking_gate: r.future_blocking_gate ?? null
      });
    }
  }
  const byClassification = {};
  for (const it of items) {
    for (const c of it.classifications) {
      byClassification[c] = (byClassification[c] ?? 0) + 1;
    }
  }
  return {
    generated_at: null,
    pending_count: items.length,
    by_classification: byClassification,
    items: items.sort((a, b) => a.id.localeCompare(b.id))
  };
}

function buildMarkdown(all) {
  const ic = all['identifier-counts'];
  const oa = all['orphan-analysis'];
  const cc = all['chain-coverage'];
  const ac = all['acceptance-coverage'];
  const ab = all['authority-boundary-analysis'];
  const vb = all['validation-backlog'];
  const countRows = Object.entries(ic.counts_by_level)
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join('\n');
  const backlogRows = Object.entries(vb.by_classification)
    .sort()
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join('\n');
  const now = new Date().toISOString();
  return `# Volume 2 Traceability Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 2 corpus produced by \`npm run governance:trace:v2\`. It is not a source of
> truth and confers no ratification. The Markdown chapters, YAML registers, JSON
> schemas, and control scripts are the authoritative record.

## Identifier counts

- Requirement total: ${ic.requirement_total}
- Stakeholders: ${ic.stakeholders} | Decisions: ${ic.decisions} | Approvals: ${ic.approvals}
- Chapters: ${ic.chapters} | Registers: ${ic.registers}

| Level | Count |
| --- | --- |
${countRows}

## Orphan analysis

- Broken traces: ${oa.broken_traces.length}
- Records without a resolving parent: ${oa.records_without_parent.length}
- Non-leaf records without a consumer: ${oa.records_without_consumer.length}

## Chain coverage

- Reverse/same-order references: ${cc.reverse_or_same_order_references.length}

## Acceptance coverage

- Outcomes without acceptance lineage: ${ac.outcomes_without_acceptance.length}
- Capabilities without rules or functional requirements: ${ac.capabilities_without_rules_or_fr.length}
- Rules without workflows: ${ac.rules_without_workflows.length}
- Workflows without experience requirements: ${ac.workflows_without_experience.length}
- Controls without tests: ${ac.controls_without_tests.length}
- Tests without outcome lineage: ${ac.tests_without_outcome_lineage.length}

## Authority-boundary analysis

- Stakeholders with governed authority: ${ab.stakeholders_with_governed_authority.length}
- Button-primary governed-authority conflicts: ${ab.button_primary_with_governed_authority_conflict.length}
- Requirements authorizing implementation (must be 0): ${ab.requirements_authorizing_implementation.length}
- Requirement product distribution: House ${ab.requirement_product_distribution.House}, Button ${ab.requirement_product_distribution.Button}, Both ${ab.requirement_product_distribution.Both}, Neither ${ab.requirement_product_distribution.Neither}

## Validation backlog

- Pending requirement records: ${vb.pending_count}

| Classification | Count |
| --- | --- |
${backlogRows || '| (none) | 0 |'}
`;
}

export function generate(ctx = loadContext()) {
  const all = {
    'identifier-counts': buildIdentifierCounts(ctx),
    'orphan-analysis': buildOrphanAnalysis(ctx),
    'chain-coverage': buildChainCoverage(ctx),
    'acceptance-coverage': buildAcceptanceCoverage(ctx),
    'authority-boundary-analysis': buildAuthorityBoundary(ctx),
    'validation-backlog': buildValidationBacklog(ctx)
  };
  const outDir = join(VOLUME_DIR, 'generated', 'traceability');
  mkdirSync(outDir, { recursive: true });
  for (const [name, data] of Object.entries(all)) {
    writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }
  const markdown = buildMarkdown(all);
  writeFileSync(join(outDir, 'volume-2-traceability-report.md'), markdown, 'utf8');
  return { outDir, all };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { outDir, all } = generate();
  const ic = all['identifier-counts'];
  const ac = all['acceptance-coverage'];
  const vb = all['validation-backlog'];
  console.log('=== Volume 2 traceability projection ===');
  console.log(`  Requirement records: ${ic.requirement_total}`);
  console.log(`  Outcomes without acceptance lineage: ${ac.outcomes_without_acceptance.length}`);
  console.log(`  Controls without tests: ${ac.controls_without_tests.length}`);
  console.log(`  Validation backlog items: ${vb.pending_count}`);
  console.log(`  Outputs: ${outDir}`);
}
