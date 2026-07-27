// Control: generate a NON-AUTHORITATIVE Volume 11 governance control report.
//
// The report is a projection of the source-controlled Volume 11 corpus. It is never
// a source of truth and never the basis of a ratification. It aggregates the
// findings of the structural, reference, operational-governance-foundation,
// provenance-integrity, and Gate V11-G1 readiness controls.

import { summarize } from './lib.mjs';
import { run as runStructural } from './validate-volume-11.mjs';
import { run as runReferences } from './validate-references.mjs';
import { run as runFoundation } from './foundation-volume-11.mjs';
import { run as runProvenance } from './provenance-integrity-volume-11.mjs';
import { run as runGate } from './gate-g1-volume-11.mjs';

export function collectFindings(ctx) {
  return {
    'Structural, schema & operational-governance conformance': runStructural(ctx),
    'Cross-reference & traceability integrity': runReferences(ctx),
    'Operational-governance-foundation coverage': runFoundation(ctx),
    'Provenance-integrity enforcement': runProvenance(ctx),
    'Gate V11-G1 readiness': runGate(ctx)
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

  return `# Volume 11 Governance Control Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 11 corpus. It is not a source of truth, does not confer ratification, and
> does not assert implementation, operation, migration, backup, restore, recovery,
> training, provider engagement, incident handling, procurement, staffing,
> commitment, release, deployment, cutover, source retirement, or acceptance. The
> Markdown chapters, YAML registers, JSON schemas, and control scripts are the
> authoritative record. Volume 0 through Volume 10 remain frozen/released and are not
> modified by Volume 11 work. Volume 11 Package 1 defines OPERATIONS, MIGRATION,
> ADOPTION, AND ASSURANCE GOVERNANCE OBLIGATIONS only and authorizes no
> implementation or operations.

## Summary

- Total findings: ${totals.total}
- Errors: ${totals.errors}
- Warnings: ${totals.warnings}
- Info: ${totals.info}
- Overall: ${totals.errors > 0 ? 'FAIL (operational-governance integrity errors present)' : 'PASS (no integrity errors)'}

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
`;
}
