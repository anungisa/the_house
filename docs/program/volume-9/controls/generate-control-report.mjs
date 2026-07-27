// Control: generate a NON-AUTHORITATIVE Volume 9 governance control report.
//
// The report is a projection of the source-controlled Volume 9 corpus. It is never
// a source of truth and never the basis of a ratification. It aggregates the
// findings of the structural, reference, quality/test-governance-foundation,
// provenance-integrity, and Gate V9-G1 readiness controls.

import { summarize } from './lib.mjs';
import { run as runStructural } from './validate-volume-9.mjs';
import { run as runReferences } from './validate-references.mjs';
import { run as runFoundation } from './foundation-volume-9.mjs';
import { run as runProvenance } from './provenance-integrity-volume-9.mjs';
import { run as runGate } from './gate-g1-volume-9.mjs';
import { run as runAffiliation } from './affiliation-test-definition-volume-9.mjs';
import { run as runGate2 } from './gate-g2-volume-9.mjs';
import { run as runAssurance } from './cross-cutting-assurance-test-definition-volume-9.mjs';
import { run as runGate3 } from './gate-g3-volume-9.mjs';

export function collectFindings(ctx) {
  return {
    'Structural, schema & quality/test-governance conformance': runStructural(ctx),
    'Cross-reference & traceability integrity': runReferences(ctx),
    'Quality & master-test-governance-foundation coverage': runFoundation(ctx),
    'Affiliation test-definition coverage': runAffiliation(ctx),
    'Cross-cutting assurance test-definition coverage': runAssurance(ctx),
    'Provenance-integrity enforcement': runProvenance(ctx),
    'Gate V9-G1 readiness': runGate(ctx),
    'Gate V9-G2 readiness': runGate2(ctx),
    'Gate V9-G3 readiness': runGate3(ctx)
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

  const approvals = ctx.registers['REG-905']?.doc?.records ?? [];
  const conditions = approvals
    .flatMap((a) => (a.conditions ?? []).map((c) => `- ${a.id} (${a.artifact_id}): ${c}`))
    .join('\n');

  return `# Volume 9 Governance Control Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 9 corpus. It is not a source of truth, does not confer ratification, and
> does not assert implementation, executable test, test execution, passing result,
> conformance, compatibility, recovery, readiness, migration success, provider
> assurance, operational proof, or acceptance. The Markdown chapters, YAML
> registers, JSON schemas, and control scripts are the authoritative record.
> Volume 0 through Volume 8 remain frozen/released and are not modified by Volume 9
> work. Volume 9 Package 1 defines QUALITY and TEST-GOVERNANCE OBLIGATIONS only and
> authorizes no implementation, executable test, test environment, test data,
> provider or product selection, or test execution.

## Summary

- Total findings: ${totals.total}
- Errors: ${totals.errors}
- Warnings: ${totals.warnings}
- Info: ${totals.info}
- Overall: ${totals.errors > 0 ? 'FAIL (quality/test-governance integrity errors present)' : 'PASS (no integrity errors)'}

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

## Recorded conditions (from REG-905 approvals)

${conditions || '- (none)'}
`;
}
