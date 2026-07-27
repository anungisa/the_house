// Control: generate a NON-AUTHORITATIVE Volume 8 governance control report.
//
// The report is a projection of the source-controlled Volume 8 corpus. It is never
// a source of truth and never the basis of a ratification. It aggregates the
// findings of the structural, reference, contract-governance-foundation, and Gate
// V8-G1 readiness controls.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, loadContext, summarize } from './lib.mjs';
import { run as runStructural } from './validate-volume-8.mjs';
import { run as runReferences } from './validate-references.mjs';
import { run as runFoundation } from './foundation-volume-8.mjs';
import { run as runProvenance } from './provenance-integrity-volume-8.mjs';
import { run as runGate } from './gate-volume-8.mjs';
import { run as runGateG2 } from './gate-g2-volume-8.mjs';
import { run as runGateG3 } from './gate-g3-volume-8.mjs';
import { run as runGateG4 } from './gate-g4-volume-8.mjs';
import { run as runGateG5 } from './gate-g5-volume-8.mjs';
import { run as runEventDelivery } from './event-delivery-volume-8.mjs';
import { run as runProviderExchange } from './provider-exchange-volume-8.mjs';
import { run as runFinalClosure } from './final-closure-volume-8.mjs';

export function collectFindings(ctx) {
  return {
    'Structural, schema & contract-governance conformance': runStructural(ctx),
    'Cross-reference & traceability integrity': runReferences(ctx),
    'Contract-governance-foundation coverage': runFoundation(ctx),
    'Provenance-integrity enforcement': runProvenance(ctx),
    'Gate V8-G1 readiness': runGate(ctx),
    'Gate V8-G2 readiness': runGateG2(ctx),
    'Gate V8-G3 readiness': runGateG3(ctx),
    'Gate V8-G4 readiness': runGateG4(ctx),
    'Gate V8-G5 readiness': runGateG5(ctx),
    'Event-delivery contract coverage': runEventDelivery(ctx),
    'Provider-exchange contract coverage': runProviderExchange(ctx),
    'Integrated closure coverage': runFinalClosure(ctx)
  };
}

function line(sev, f) {
  const where = f.artifact ? ` [${f.artifact}]` : '';
  return `- ${sev} ${f.code}${where}: ${f.message}`;
}

export function buildReport(ctx, grouped) {
  const all = Object.values(grouped).flat();
  const totals = summarize(all);
  const now = new Date().toISOString();

  const registerRows = Object.values(ctx.registers)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => `| ${r.id} | ${r.doc?.name ?? ''} | ${r.doc?.status ?? ''} | ${r.doc?.version ?? ''} | ${(r.doc?.records ?? []).length} |`)
    .join('\n');

  const statusCounts = {};
  for (const ch of ctx.chapters) {
    statusCounts[ch.status ?? 'UNKNOWN'] = (statusCounts[ch.status ?? 'UNKNOWN'] ?? 0) + 1;
  }
  const chapterStatus = Object.entries(statusCounts).map(([k, v]) => `| ${k} | ${v} |`).join('\n');

  const findingsSections = Object.entries(grouped)
    .map(([name, findings]) => {
      const s = summarize(findings);
      const body = findings.length === 0 ? '- (no findings)' : findings.map((f) => line(f.severity, f)).join('\n');
      return `### ${name}\n\nErrors: ${s.errors} | Warnings: ${s.warnings} | Info: ${s.info}\n\n${body}`;
    })
    .join('\n\n');

  const approvals = ctx.registers['REG-805']?.doc?.records ?? [];
  const conditions = approvals
    .flatMap((a) => (a.conditions ?? []).map((c) => `- ${a.id} (${a.artifact_id}): ${c}`))
    .join('\n');

  return `# Volume 8 Governance Control Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 8 corpus. It is not a source of truth, does not confer ratification, and
> does not assert implementation, interface conformance, delivery guarantee,
> integration outcome, provider assurance, or compatibility validation. The
> Markdown chapters, YAML registers, JSON schemas, and control scripts are the
> authoritative record. Volume 0 through Volume 7 remain frozen/released and are
> not modified by Volume 8 work. Volume 8 Package 1 defines CONTRACT-GOVERNANCE,
> AUTHORITY, IDENTITY, DELIVERY, IDEMPOTENCY, ERROR, PRIVACY, PROVIDER, and
> COMPATIBILITY OBLIGATIONS only and authorizes no implementation, executable API
> contract, endpoint path, runtime integration, SDK, IAM/cryptographic
> configuration, provider procurement, or infrastructure.

## Summary

- Total findings: ${totals.total}
- Errors: ${totals.errors}
- Warnings: ${totals.warnings}
- Info: ${totals.info}
- Overall: ${totals.errors > 0 ? 'FAIL (contract-governance integrity errors present)' : 'PASS (no integrity errors)'}

## Chapter status

| Status | Count |
| --- | --- |
${chapterStatus}

## Register health

| Register | Name | Status | Version | Records |
| --- | --- | --- | --- | --- |
${registerRows}

## Findings by control

${findingsSections}

## Recorded conditions (from REG-805 approvals)

${conditions || '- (none)'}
`;
}

export function generate(ctx = loadContext()) {
  const grouped = collectFindings(ctx);
  const markdown = buildReport(ctx, grouped);
  const outDir = join(VOLUME_DIR, 'generated');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'governance-control-report.md');
  writeFileSync(outPath, markdown, 'utf8');
  return { outPath, grouped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { outPath } = generate();
  console.log(`Volume 8 control report written to ${outPath}`);
}
