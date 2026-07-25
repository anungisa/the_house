// Orchestrator: deterministic convergence inventory (Package 5).
//
// Structures the CONTROLLED convergence input (docs/program/volume-1/inputs/
// convergence-input.yaml), the ratified Volume 1 registers, and the generated Package
// 2-4 inventories into a set of NON-AUTHORITATIVE JSON views plus a markdown report
// under docs/program/volume-1/generated/convergence/. Every artifact is anchored to the
// input/corpus fingerprint so it is reproducible.
//
// Usage:  node docs/program/volume-1/controls/inventory-convergence.mjs
//
// This tooling is evidence INPUT to Package 5. It authorizes nothing and decides
// nothing; convergence decisions live in the ratified chapters and registers. It
// invents no target decision: it only structures decisions already recorded in the
// controlled input or the ratified registers. Contradictions are surfaced as open.

import { createConvergenceContext, tally } from './convergence-lib.mjs';

const LAYERS = ['experience', 'domain', 'data_authority', 'integration'];

function buildSourceBaselineSummary(ctx) {
  const g = ctx.generated;
  return {
    summary: {
      controlled_input: ctx.fingerprint.convergence_input_path,
      controlled_input_sha256: ctx.fingerprint.convergence_input_sha256,
      base44_baseline: g.base44.sourceManifest?._meta?.source_id ?? 'SRC-001',
      house_baseline: g.house.sourceManifest?._meta?.source_id ?? 'SRC-002',
      house_runtime_commit: g.house.tests?._meta?.runtime_commit ?? null,
      ecosystem_input_sha256:
        g.ecosystem.systems?._meta?.ecosystem_input_sha256 ?? null,
      note: 'Convergence consumes the three ratified baselines; it introduces no new primary evidence.',
    },
    primary_grounding: ctx.input.meta?.primary_grounding ?? [],
    evidence_precedence: ctx.input.evidence_precedence ?? [],
    precedence_rules: ctx.input.precedence_rules ?? [],
  };
}

function buildCapabilityLayerMatrix(ctx) {
  const caps = ctx.input.capabilities ?? [];
  const rows = [];
  for (const c of caps) {
    for (const layer of LAYERS) {
      const cell = c.layers?.[layer];
      if (!cell) continue;
      rows.push({
        capability_id: c.id,
        capability: c.name,
        layer,
        disposition: cell.disposition,
        source_contribution: cell.contribution,
        note: cell.note ?? null,
        evidence_rating: c.evidence_rating,
      });
    }
  }
  return {
    summary: {
      total_capabilities: caps.length,
      total_layer_cells: rows.length,
      by_disposition: tally(rows, (r) => r.disposition),
      by_layer: tally(rows, (r) => r.layer),
      by_source_contribution: tally(rows, (r) => r.source_contribution),
      note: 'Each capability is dispositioned independently at four layers; a single capability may differ by layer. No implementation is authorized.',
    },
    capability_layer_matrix: rows,
    capabilities: caps.map((c) => ({
      id: c.id,
      name: c.name,
      summary: c.summary,
      base44_contribution: c.base44_contribution,
      house_contribution: c.house_contribution,
      current_process_contribution: c.current_process_contribution,
      external_dependency: c.external_dependency,
      evidence_rating: c.evidence_rating,
      finding_refs: c.finding_refs ?? [],
      unresolved_validation: c.unresolved_validation ?? null,
      release_hypothesis: c.release_hypothesis ?? null,
    })),
  };
}

function buildCrosswalk(ctx) {
  const caps = ctx.input.capabilities ?? [];
  const rows = caps.map((c) => ({
    capability_id: c.id,
    capability: c.name,
    base44: c.base44_contribution,
    the_house: c.house_contribution,
    ecosystem_current_process: c.current_process_contribution,
    external_system: c.external_dependency,
    release_hypothesis: c.release_hypothesis ?? null,
  }));
  return {
    summary: {
      total_capabilities: rows.length,
      note: 'Base44 / The House / ecosystem / external-system contribution per capability. Base44 remains product evidence, not production authority.',
    },
    crosswalk: rows,
  };
}

function buildSystemAuthorityMatrix(ctx) {
  const domains = ctx.input.governed_domains ?? [];
  return {
    summary: {
      total_domains: domains.length,
      boundaries: ctx.input.controlling_boundaries ?? [],
      note: 'Target authority per governed domain. Externalized systems retain their authority; transitional systems require explicit exit triggers.',
    },
    system_authority: domains.map((d) => ({
      domain: d.domain,
      authoritative_source: d.authoritative_source,
      execution_system: d.execution_system,
      external_dependency: d.external_dependency,
      transition_authority: d.transition_authority,
      unresolved_condition: d.unresolved_condition,
    })),
  };
}

function buildDataAuthorityMatrix(ctx) {
  const domains = ctx.input.governed_domains ?? [];
  return {
    summary: {
      total_domains: domains.length,
      note: 'Read-model and authority split per governed data domain.',
    },
    data_authority: domains.map((d) => ({
      domain: d.domain,
      authoritative_source: d.authoritative_source,
      read_model: d.read_model,
      transition_authority: d.transition_authority,
      unresolved_condition: d.unresolved_condition,
    })),
  };
}

function buildReconciliationMatrix(ctx) {
  const domains = ctx.input.governed_domains ?? [];
  return {
    summary: {
      total_domains: domains.length,
      note: 'Inbound/outbound reconciliation per governed domain.',
    },
    reconciliation: domains.map((d) => ({
      domain: d.domain,
      inbound_reconciliation: d.inbound_reconciliation,
      outbound_reconciliation: d.outbound_reconciliation,
      external_dependency: d.external_dependency,
      unresolved_condition: d.unresolved_condition,
    })),
  };
}

function buildAffiliationTargetFlow(ctx) {
  const flow = ctx.input.affiliation_target_flow ?? [];
  const pathways = ctx.input.transition_pathways ?? [];
  return {
    summary: {
      total_steps: flow.length,
      total_pathways: pathways.length,
      by_owner_layer: tally(flow, (s) => s.owner_layer),
      note: 'Target affiliation operating model. Exactly-once activation; The House owns governed state, The Button presents it.',
    },
    steps: flow,
    transition_pathways: pathways,
  };
}

function buildFirstReleaseBoundary(ctx) {
  const b = ctx.input.first_release_boundary ?? {};
  return {
    summary: {
      included_count: (b.included ?? []).length,
      excluded_count: (b.excluded ?? []).length,
      note: 'Smallest legitimate first affiliation release. Everything outside is explicitly excluded until the vertical is proven.',
    },
    included: b.included ?? [],
    excluded: b.excluded ?? [],
  };
}

function buildContradictionDisposition(ctx) {
  const cons = ctx.input.contradiction_dispositions ?? [];
  return {
    summary: {
      total: cons.length,
      retained_open: cons.filter((c) => c.disposition === 'RETAIN_OPEN').length,
      note: 'Unresolved material contradictions are retained open; none are force-closed, and none are resolved using the wrong authority type.',
    },
    contradiction_dispositions: cons,
  };
}

function buildStakeholderBacklog(ctx) {
  const items = ctx.input.stakeholder_validation_backlog ?? [];
  return {
    summary: {
      total: items.length,
      note: 'Pending consultation blocks only the affected claim.',
    },
    stakeholder_validation_backlog: items,
  };
}

function buildTransitionConstraintInventory(ctx) {
  const items = ctx.input.transition_constraints ?? [];
  return {
    summary: {
      total: items.length,
      by_confidence: tally(items, (i) => i.current_confidence),
      note: 'Evidence-backed transition constraint set. NOT the master development plan; the later plan must respect these.',
    },
    transition_constraints: items,
  };
}

function buildTestReconciliation(ctx) {
  const t = ctx.input.test_reconciliation ?? {};
  return {
    summary: {
      automated_inventory_count: t.automated_inventory_count ?? null,
      executed_count: t.executed_count ?? null,
      skipped_count: t.skipped_count ?? null,
      todo_count: t.todo_count ?? null,
      excluded_count: t.excluded_count ?? null,
      controlling_figure: t.executed_count ?? null,
      note: 'Narrow Package 3 evidence correction; does not reopen or modify the frozen Package 3 artifacts.',
    },
    ...t,
  };
}

function fmtCounts(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

function writeConvergenceReport(ctx, sections) {
  const fp = ctx.fingerprint;
  const lines = [];
  lines.push('# Convergence and Target Disposition — Structured Inventory (NON-AUTHORITATIVE)');
  lines.push('');
  lines.push(
    'Deterministic evidence input to Volume 1 Package 5. Generated by ' +
      '`docs/program/volume-1/controls/inventory-convergence.mjs` from the controlled input ' +
      `\`${fp.convergence_input_path}\`, the ratified registers, and the generated Package 2-4 ` +
      'inventories. This report decides nothing and authorizes nothing; convergence decisions ' +
      'live in the ratified chapters/registers. No target decision is invented from tooling.',
  );
  lines.push('');
  lines.push('## Provenance');
  lines.push('');
  lines.push(`- Repository commit: \`${fp.repository_commit}\``);
  lines.push(`- Branch: \`${fp.branch}\` (working tree: ${fp.working_tree_state})`);
  lines.push(`- Controlled input: \`${fp.convergence_input_path}\``);
  lines.push(`- Controlled input sha256: \`${fp.convergence_input_sha256}\``);
  lines.push('');
  lines.push('## Source baselines converged');
  lines.push('');
  const sb = sections.sourceBaseline.summary;
  lines.push(`- Base44 baseline: ${sb.base44_baseline} (product evidence, not production authority)`);
  lines.push(`- The House baseline: ${sb.house_baseline} (runtime commit \`${sb.house_runtime_commit}\`)`);
  lines.push(`- Ecosystem input sha256: \`${sb.ecosystem_input_sha256}\``);
  lines.push('');
  lines.push('## Capability-layer disposition');
  lines.push('');
  const cm = sections.capabilityLayerMatrix.summary;
  lines.push(`- Capabilities: ${cm.total_capabilities}; layer cells: ${cm.total_layer_cells}`);
  lines.push(`- By disposition: ${fmtCounts(cm.by_disposition)}`);
  lines.push(`- By layer: ${fmtCounts(cm.by_layer)}`);
  lines.push(`- By source contribution: ${fmtCounts(cm.by_source_contribution)}`);
  lines.push('');
  lines.push('## Target system and data authority');
  lines.push('');
  lines.push(`- Governed domains: ${sections.systemAuthority.summary.total_domains}`);
  lines.push('');
  lines.push('## Affiliation target model');
  lines.push('');
  const af = sections.affiliationTargetFlow.summary;
  lines.push(`- Target flow steps: ${af.total_steps}`);
  lines.push(`- Governed transition pathways: ${af.total_pathways}`);
  lines.push('');
  lines.push('## First-release boundary');
  lines.push('');
  const fr = sections.firstReleaseBoundary.summary;
  lines.push(`- Included: ${fr.included_count}; explicitly excluded: ${fr.excluded_count}`);
  lines.push('');
  lines.push('## Unresolved contradictions');
  lines.push('');
  const cd = sections.contradictionDisposition.summary;
  lines.push(`- Retained open: ${cd.retained_open} of ${cd.total}`);
  lines.push('');
  lines.push('## Transition constraints and stakeholder backlog');
  lines.push('');
  lines.push(`- Transition constraints: ${sections.transitionConstraints.summary.total}`);
  lines.push(`- Stakeholder validation backlog: ${sections.stakeholderBacklog.summary.total}`);
  lines.push('');
  lines.push('## Package 3 test-accounting reconciliation');
  lines.push('');
  const tr = sections.testReconciliation.summary;
  lines.push(
    `- Automated inventory: ${tr.automated_inventory_count}; executed and passed: ${tr.executed_count}; ` +
      `skipped: ${tr.skipped_count}; todo: ${tr.todo_count}; excluded: ${tr.excluded_count}.`,
  );
  lines.push(`- Controlling figure for Volume 1: ${tr.controlling_figure} executed and passed.`);
  lines.push('');
  lines.push('## Standing constraints');
  lines.push('');
  lines.push('- This inventory authorizes no implementation and no master development plan.');
  lines.push('- Newer/polished/current is not automatically authoritative or desirable.');
  lines.push('- Unresolved contradictions remain open; pending consultation blocks only the affected claim.');
  lines.push('');
  ctx.writeText('convergence-report.md', lines.join('\n'));
}

function main() {
  const ctx = createConvergenceContext();
  ctx.ensureGenDir();

  const sections = {
    sourceBaseline: ctx.writeJson('source-baseline-summary.json', buildSourceBaselineSummary(ctx)),
    capabilityLayerMatrix: ctx.writeJson('capability-layer-matrix.json', buildCapabilityLayerMatrix(ctx)),
    crosswalk: ctx.writeJson('base44-house-ecosystem-crosswalk.json', buildCrosswalk(ctx)),
    systemAuthority: ctx.writeJson('system-authority-matrix.json', buildSystemAuthorityMatrix(ctx)),
    dataAuthority: ctx.writeJson('data-authority-matrix.json', buildDataAuthorityMatrix(ctx)),
    reconciliation: ctx.writeJson('reconciliation-matrix.json', buildReconciliationMatrix(ctx)),
    affiliationTargetFlow: ctx.writeJson('affiliation-target-flow.json', buildAffiliationTargetFlow(ctx)),
    firstReleaseBoundary: ctx.writeJson('first-release-boundary.json', buildFirstReleaseBoundary(ctx)),
    contradictionDisposition: ctx.writeJson('contradiction-disposition.json', buildContradictionDisposition(ctx)),
    stakeholderBacklog: ctx.writeJson('stakeholder-validation-backlog.json', buildStakeholderBacklog(ctx)),
    transitionConstraints: ctx.writeJson('transition-constraint-inventory.json', buildTransitionConstraintInventory(ctx)),
    testReconciliation: ctx.writeJson('test-reconciliation.json', buildTestReconciliation(ctx)),
  };

  writeConvergenceReport(ctx, sections);

  process.stdout.write(
    `convergence inventory written to docs/program/volume-1/generated/convergence/ ` +
      `(${sections.capabilityLayerMatrix.summary.total_capabilities} capabilities, ` +
      `${sections.capabilityLayerMatrix.summary.total_layer_cells} layer cells, ` +
      `${sections.systemAuthority.summary.total_domains} governed domains, ` +
      `${sections.affiliationTargetFlow.summary.total_steps} target-flow steps).\n`,
  );
}

main();
