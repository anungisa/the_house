// Orchestrator: deterministic current-ecosystem qualification inventory (Package 4).
//
// Structures the CONTROLLED ecosystem input (docs/program/volume-1/inputs/
// ecosystem-input.yaml) and the ratified Volume 0 authority register (REG-005) into a
// set of NON-AUTHORITATIVE JSON inventories plus two human-readable markdown reports
// under docs/program/volume-1/generated/ecosystem/. Every artifact is anchored to the
// input/source fingerprint so it is reproducible.
//
// Usage:  node docs/program/volume-1/controls/inventory-ecosystem.mjs
//
// This tooling is evidence INPUT to Package 4. It authorizes nothing and decides
// nothing; qualification decisions live in the ratified chapters and registers. It
// derives no facts from absence: unvalidated records remain ASSUMPTION /
// STAKEHOLDER_STATEMENT / VENDOR_CLAIM with validation_status pending.

import { createEcosystemContext, tally } from './ecosystem-lib.mjs';

function buildSourceManifest(ctx) {
  const reg005Sources = (ctx.reg005?.sources ?? []).map((s) => ({
    id: s.id,
    name: s.name ?? s.system ?? s.title ?? null,
    authority_level: s.authority_level ?? null,
    authority_type: s.authority_type ?? s.role ?? null,
  }));
  return {
    summary: {
      controlled_input: ctx.fingerprint.ecosystem_input_path,
      controlled_input_sha256: ctx.fingerprint.ecosystem_input_sha256,
      ratified_authority_source: ctx.fingerprint.reg005_path,
      ratified_authority_source_sha256: ctx.fingerprint.reg005_sha256,
      reg005_source_count: reg005Sources.length,
      note: 'Facts are structured from these controlled sources only; none are generated from absence.',
    },
    reg005_sources: reg005Sources,
    primary_grounding: ctx.input.meta?.primary_grounding ?? [],
  };
}

function buildSystemInventory(ctx) {
  const systems = ctx.input.systems ?? [];
  return {
    summary: {
      total_systems: systems.length,
      by_truth_classification: tally(systems, 'truth_classification'),
      by_validation_status: tally(systems, 'validation_status'),
      grounded_in_ratified_v0: systems.filter((s) => s.source_ref).length,
      unvalidated_not_in_v0: systems.filter((s) => !s.source_ref).length,
    },
    systems,
  };
}

function buildAuthorityMatrix(ctx) {
  const systems = ctx.input.systems ?? [];
  const boundaries = ctx.input.authority_boundaries ?? [];
  const matrix = systems.map((s) => ({
    id: s.id,
    name: s.name,
    authority_classification: s.authority_classification,
    reconciliation: s.reconciliation,
    target_disposition_hypothesis: s.target_disposition_hypothesis,
    truth_classification: s.truth_classification,
    validation_status: s.validation_status,
    source_ref: s.source_ref,
  }));
  return {
    summary: {
      authority_tiers: boundaries.length,
      systems_classified: matrix.length,
      note: 'No system is automatically retained or retired; all target dispositions are UNPROVEN hypotheses.',
    },
    authority_boundaries: boundaries,
    system_authority_matrix: matrix,
  };
}

function buildProcessInventory(ctx) {
  const steps = ctx.input.affiliation_process ?? [];
  return {
    summary: {
      total_steps: steps.length,
      by_validation_status: tally(steps, 'validation_status'),
      manual_or_email_steps: steps.filter((s) =>
        /email|spreadsheet|manual/i.test(`${s.system_used} ${s.manual_artifact}`),
      ).length,
      historical_baseline: ctx.input.historical_affiliation_baseline ?? null,
    },
    steps,
  };
}

function buildDataFlowInventory(ctx) {
  const elements = ctx.input.data_elements ?? [];
  return {
    summary: {
      total_elements: elements.length,
      by_truth_classification: tally(elements, 'truth_classification'),
      high_privacy_elements: elements.filter((e) =>
        /high/i.test(e.privacy_classification ?? ''),
      ).length,
    },
    data_elements: elements,
  };
}

function buildIntegrationInventory(ctx) {
  const systems = ctx.input.systems ?? [];
  const integrations = systems
    .filter((s) => (s.inbound_flows && s.inbound_flows !== 'None') || s.outbound_flows)
    .map((s) => ({
      id: s.id,
      name: s.name,
      inbound_flows: s.inbound_flows,
      outbound_flows: s.outbound_flows,
      contract_dependency: s.contract_dependency,
      validation_status: s.validation_status,
    }));
  return {
    summary: { total_integrations: integrations.length },
    integrations,
  };
}

function buildReconciliationInventory(ctx) {
  const systems = ctx.input.systems ?? [];
  const data = ctx.input.data_elements ?? [];
  const rows = [
    ...systems.map((s) => ({
      scope: 'system',
      id: s.id,
      name: s.name,
      reconciliation: s.reconciliation,
      validation_status: s.validation_status,
    })),
    ...data.map((d) => ({
      scope: 'data',
      id: d.id,
      name: d.element,
      reconciliation: d.reconciliation_method,
      quality_concern: d.quality_concern,
      validation_status: d.validation_status,
    })),
  ];
  return {
    summary: { total_reconciliation_points: rows.length },
    reconciliation_points: rows,
  };
}

function buildContractConstraintInventory(ctx) {
  const constraints = ctx.input.contract_constraints ?? [];
  return {
    summary: {
      total_constraints: constraints.length,
      by_truth_classification: tally(constraints, 'truth_classification'),
      by_validation_status: tally(constraints, 'validation_status'),
    },
    contract_constraints: constraints,
  };
}

function buildOperatingRiskInventory(ctx) {
  const findings = ctx.input.operating_findings ?? [];
  const contradictions = ctx.input.operating_contradictions ?? [];
  return {
    summary: {
      total_findings: findings.length,
      high_risk_findings: findings.filter((f) => f.production_risk === 'high').length,
      total_contradictions: contradictions.length,
      by_finding_type: tally(findings, 'finding_type'),
    },
    operating_findings: findings,
    operating_contradictions: contradictions,
  };
}

function fmtCounts(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

function writeAffiliationCurrentStateReport(ctx, process) {
  const fp = ctx.fingerprint;
  const lines = [];
  lines.push('# Current Club-Affiliation Process — Structured Trace (NON-AUTHORITATIVE)');
  lines.push('');
  lines.push(
    'Deterministic evidence input to Volume 1 Package 4. Generated by ' +
      '`docs/program/volume-1/controls/inventory-ecosystem.mjs` from the controlled input ' +
      `\`${fp.ecosystem_input_path}\`. This report decides nothing and authorizes nothing.`,
  );
  lines.push('');
  lines.push(`- Controlled input sha256: \`${fp.ecosystem_input_sha256}\``);
  lines.push(`- Steps traced: ${process.steps.length}`);
  lines.push(`- Validation status: ${fmtCounts(process.summary.by_validation_status)}`);
  lines.push('');
  const baseline = process.summary.historical_baseline;
  if (baseline) {
    lines.push('## Historical / goodwill affiliation baseline');
    lines.push('');
    lines.push(`> ${baseline.statement}`);
    lines.push('');
    lines.push(
      `Classification: ${baseline.truth_classification}; validation: ${baseline.validation_status}.`,
    );
    lines.push('');
  }
  lines.push('## Traced steps');
  lines.push('');
  for (const s of process.steps) {
    lines.push(`### Step ${s.step} — ${s.name}`);
    lines.push('');
    lines.push(`- Actor: ${s.actor}`);
    lines.push(`- Accountable authority: ${s.accountable_authority}`);
    lines.push(`- System used: ${s.system_used}`);
    lines.push(`- Manual artifact: ${s.manual_artifact}`);
    lines.push(`- Decision: ${s.decision}`);
    lines.push(`- Failure mode: ${s.failure_mode}`);
    lines.push(`- Authoritative source: ${s.authoritative_source}`);
    lines.push(`- Reconciliation requirement: ${s.reconciliation_requirement}`);
    lines.push(
      `- Classification: ${s.truth_classification}; validation: ${s.validation_status}`,
    );
    lines.push('');
  }
  ctx.writeText('affiliation-current-state-report.md', lines.join('\n'));
}

function writeQualificationReport(ctx, sections) {
  const fp = ctx.fingerprint;
  const lines = [];
  lines.push('# Current Ecosystem and Operating Reality — Qualification Inventory (NON-AUTHORITATIVE)');
  lines.push('');
  lines.push(
    'Deterministic evidence input to Volume 1 Package 4. Generated by ' +
      '`docs/program/volume-1/controls/inventory-ecosystem.mjs`. This report decides nothing ' +
      'and authorizes nothing; qualification decisions live in the ratified chapters/registers. ' +
      'No facts are generated from absence — unvalidated records remain ASSUMPTION / ' +
      'STAKEHOLDER_STATEMENT / VENDOR_CLAIM pending validation.',
  );
  lines.push('');
  lines.push('## Provenance');
  lines.push('');
  lines.push(`- Repository commit: \`${fp.repository_commit}\``);
  lines.push(`- Branch: \`${fp.branch}\` (working tree: ${fp.working_tree_state})`);
  lines.push(`- Controlled input: \`${fp.ecosystem_input_path}\``);
  lines.push(`- Controlled input sha256: \`${fp.ecosystem_input_sha256}\``);
  lines.push(`- Ratified authority source: \`${fp.reg005_path}\` (sha256 \`${fp.reg005_sha256}\`)`);
  lines.push('');
  lines.push('## Source manifest');
  lines.push('');
  lines.push(
    `- Ratified Volume 0 authority sources (REG-005): ${sections.sourceManifest.summary.reg005_source_count}`,
  );
  lines.push('');
  lines.push('## System and authority inventory');
  lines.push('');
  const si = sections.systemInventory.summary;
  lines.push(`- Systems inventoried: ${si.total_systems}`);
  lines.push(`- Grounded in ratified Volume 0: ${si.grounded_in_ratified_v0}`);
  lines.push(`- Unvalidated / not in Volume 0: ${si.unvalidated_not_in_v0}`);
  lines.push(`- By truth classification: ${fmtCounts(si.by_truth_classification)}`);
  lines.push(`- By validation status: ${fmtCounts(si.by_validation_status)}`);
  lines.push('');
  lines.push(
    '> No system is automatically retained or retired. All target dispositions are UNPROVEN hypotheses.',
  );
  lines.push('');
  lines.push('## Affiliation process');
  lines.push('');
  lines.push(`- Steps traced end to end: ${sections.processInventory.summary.total_steps}`);
  lines.push(
    `- Steps running on manual/email/spreadsheet: ${sections.processInventory.summary.manual_or_email_steps}`,
  );
  lines.push('');
  lines.push('## Data flow and reconciliation');
  lines.push('');
  lines.push(`- Data elements: ${sections.dataFlowInventory.summary.total_elements}`);
  lines.push(
    `- High-privacy elements: ${sections.dataFlowInventory.summary.high_privacy_elements}`,
  );
  lines.push(
    `- Reconciliation points: ${sections.reconciliationInventory.summary.total_reconciliation_points}`,
  );
  lines.push(
    `- Integrations: ${sections.integrationInventory.summary.total_integrations}`,
  );
  lines.push('');
  lines.push('## Contractual and transition constraints');
  lines.push('');
  const cc = sections.contractConstraintInventory.summary;
  lines.push(`- Constraints captured: ${cc.total_constraints}`);
  lines.push(`- By truth classification: ${fmtCounts(cc.by_truth_classification)}`);
  lines.push(`- By validation status: ${fmtCounts(cc.by_validation_status)}`);
  lines.push('');
  lines.push('## Operating findings and contradictions');
  lines.push('');
  const orr = sections.operatingRiskInventory.summary;
  lines.push(`- Operating findings: ${orr.total_findings} (high risk: ${orr.high_risk_findings})`);
  lines.push(`- Registered contradictions: ${orr.total_contradictions}`);
  lines.push(`- By finding type: ${fmtCounts(orr.by_finding_type)}`);
  lines.push('');
  lines.push('## Standing constraints');
  lines.push('');
  lines.push('- This inventory authorizes no implementation.');
  lines.push('- Current practice is not treated as automatically desirable.');
  lines.push('- Stakeholder and vendor validation are pending and block only the affected claims.');
  lines.push('');
  ctx.writeText('ecosystem-qualification-report.md', lines.join('\n'));
}

function main() {
  const ctx = createEcosystemContext();
  ctx.ensureGenDir();

  const sourceManifest = ctx.writeJson('source-manifest.json', buildSourceManifest(ctx));
  const systemInventory = ctx.writeJson('system-inventory.json', buildSystemInventory(ctx));
  const authorityMatrix = ctx.writeJson('authority-matrix.json', buildAuthorityMatrix(ctx));
  const processInventory = ctx.writeJson('process-inventory.json', buildProcessInventory(ctx));
  const dataFlowInventory = ctx.writeJson('data-flow-inventory.json', buildDataFlowInventory(ctx));
  const integrationInventory = ctx.writeJson(
    'integration-inventory.json',
    buildIntegrationInventory(ctx),
  );
  const reconciliationInventory = ctx.writeJson(
    'reconciliation-inventory.json',
    buildReconciliationInventory(ctx),
  );
  const contractConstraintInventory = ctx.writeJson(
    'contract-constraint-inventory.json',
    buildContractConstraintInventory(ctx),
  );
  const operatingRiskInventory = ctx.writeJson(
    'operating-risk-inventory.json',
    buildOperatingRiskInventory(ctx),
  );

  const sections = {
    sourceManifest,
    systemInventory,
    authorityMatrix,
    processInventory,
    dataFlowInventory,
    integrationInventory,
    reconciliationInventory,
    contractConstraintInventory,
    operatingRiskInventory,
  };

  writeAffiliationCurrentStateReport(ctx, processInventory);
  writeQualificationReport(ctx, sections);

  process.stdout.write(
    `ecosystem qualification inventory written to docs/program/volume-1/generated/ecosystem/ ` +
      `(${systemInventory.summary.total_systems} systems, ${processInventory.summary.total_steps} process steps, ` +
      `${operatingRiskInventory.summary.total_findings} findings, ${operatingRiskInventory.summary.total_contradictions} contradictions).\n`,
  );
}

main();
