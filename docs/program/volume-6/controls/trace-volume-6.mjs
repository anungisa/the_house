// Control: Volume 6 protection/trust traceability projection (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown report describing the shape
// of the Volume 6 protection corpus: catalogue counts by kind, asset authority
// coverage, threat control coverage, obligation applicability coverage, and how
// records trace to catalogued protection artifacts and inherited Volume 0-5
// baselines. The corpus remains authoritative.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, isInheritedRef, loadContext } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

function countBy(items, key) {
  const out = {};
  for (const it of items) {
    const v = it[key] ?? 'UNSET';
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

function writeJson(dir, name, data) {
  writeFileSync(join(dir, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function project(ctx) {
  const protection = records(ctx, 'REG-601');
  const controls = records(ctx, 'REG-602');
  const decisions = records(ctx, 'REG-603');
  const backlog = records(ctx, 'REG-604');
  const approvals = records(ctx, 'REG-605');

  const assets = protection.filter((r) => r.kind === 'ASSET');
  const actors = protection.filter((r) => r.kind === 'ACTOR');
  const boundaries = protection.filter((r) => r.kind === 'TRUST_BOUNDARY');
  const threats = protection.filter((r) => r.kind === 'THREAT');
  const abuseCases = protection.filter((r) => r.kind === 'ABUSE_CASE');
  const rights = protection.filter((r) => r.kind === 'RIGHT');

  const identifierCounts = {
    chapters: ctx.chapters.length,
    assets: assets.length,
    actors: actors.length,
    trust_boundaries: boundaries.length,
    threats: threats.length,
    abuse_cases: abuseCases.length,
    rights: rights.length,
    controls_by_kind: countBy(controls, 'kind'),
    decisions: decisions.length,
    backlog_items: backlog.length,
    approvals: approvals.length
  };

  const assetAuthorityCoverage = {
    by_authority_owner: countBy(assets, 'authority_owner'),
    by_classification: countBy(assets, 'classification'),
    by_sensitivity: countBy(assets, 'sensitivity')
  };

  const threatCoverage = {
    total: threats.length,
    with_preventive: threats.filter((t) => t.preventive_objective).length,
    with_detective: threats.filter((t) => t.detective_objective).length,
    with_corrective: threats.filter((t) => t.corrective_objective).length
  };

  const obligationCoverage = {
    by_applicability_status: countBy(
      controls.filter((c) => c.kind === 'OBLIGATION' || c.kind === 'COMPLIANCE_OBLIGATION'),
      'applicability_status'
    ),
    by_control_family: countBy(controls.filter((c) => c.kind === 'CONTROL_OBJECTIVE'), 'control_family')
  };

  const inheritedTraceCoverage = [...protection, ...controls].map((r) => {
    const traces = r.traces_to ?? [];
    return {
      id: r.id,
      kind: r.kind,
      traces_to_inherited: traces.filter((t) => isInheritedRef(t)),
      traces_to_local: traces.filter((t) => !isInheritedRef(t))
    };
  });

  const authorizationInvariants = {
    protection_authorizing_implementation: protection.filter((r) => r.authorizes_implementation === true).map((r) => r.id),
    controls_authorizing_implementation: controls.filter((r) => r.authorizes_implementation === true).map((r) => r.id),
    decisions_authorizing_implementation: decisions.filter((r) => r.authorizes_implementation === true).map((r) => r.id),
    backlog_authorizing_implementation: backlog.filter((r) => r.authorizes_implementation === true).map((r) => r.id)
  };

  return {
    identifierCounts,
    assetAuthorityCoverage,
    threatCoverage,
    obligationCoverage,
    inheritedTraceCoverage,
    authorizationInvariants
  };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'traceability');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'identifier-counts.json', p.identifierCounts);
  writeJson(outDir, 'asset-authority-coverage.json', p.assetAuthorityCoverage);
  writeJson(outDir, 'threat-coverage.json', p.threatCoverage);
  writeJson(outDir, 'obligation-coverage.json', p.obligationCoverage);
  writeJson(outDir, 'inherited-trace-coverage.json', p.inheritedTraceCoverage);
  writeJson(outDir, 'authorization-invariants.json', p.authorizationInvariants);

  const authorizing =
    p.authorizationInvariants.protection_authorizing_implementation.length +
    p.authorizationInvariants.controls_authorizing_implementation.length +
    p.authorizationInvariants.decisions_authorizing_implementation.length +
    p.authorizationInvariants.backlog_authorizing_implementation.length;

  const report = `# Volume 6 Protection Traceability Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 6 corpus. Not a source of
> truth and not a basis for ratification. Volume 6 Package 1 defines PROTECTION,
> RIGHTS, ASSURANCE, and INCLUSIVE-SERVICE obligations only; it authorizes no
> implementation and claims no compliance, conformance, or assurance.

## Identifier counts

| Category | Count |
| --- | --- |
| Chapters | ${p.identifierCounts.chapters} |
| Assets | ${p.identifierCounts.assets} |
| Actors | ${p.identifierCounts.actors} |
| Trust boundaries | ${p.identifierCounts.trust_boundaries} |
| Threats | ${p.identifierCounts.threats} |
| Abuse cases | ${p.identifierCounts.abuse_cases} |
| Rights | ${p.identifierCounts.rights} |
| Decisions | ${p.identifierCounts.decisions} |
| Backlog items | ${p.identifierCounts.backlog_items} |
| Approvals | ${p.identifierCounts.approvals} |

## Asset authority coverage

| Authority owner | Assets |
| --- | --- |
${Object.entries(p.assetAuthorityCoverage.by_authority_owner).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Threat control coverage

- Threats: ${p.threatCoverage.total}
- With preventive objective: ${p.threatCoverage.with_preventive}
- With detective objective: ${p.threatCoverage.with_detective}
- With corrective objective: ${p.threatCoverage.with_corrective}

## Authorization posture

- Records authorizing implementation: ${authorizing} (must be 0)
`;
  writeFileSync(join(outDir, 'volume-6-traceability-report.md'), report, 'utf8');
  return outDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = generate();
  console.log(`Volume 6 traceability projections written to ${outDir}`);
}
