// Control: generate a NON-AUTHORITATIVE Volume 2 governance control report.
//
// The report is a projection of the source-controlled Volume 2 corpus. It is
// never a source of truth and never the basis of a ratification. It aggregates
// the findings of the structural and reference controls.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, loadContext, summarize } from './lib.mjs';
import { run as runStructural } from './validate-volume-2.mjs';
import { run as runReferences } from './validate-references.mjs';

export function collectFindings(ctx) {
  return {
    'Structural & schema conformance': runStructural(ctx),
    'Cross-reference & traceability integrity': runReferences(ctx)
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
  const chapterStatus = Object.entries(statusCounts)
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join('\n');

  const findingsSections = Object.entries(grouped)
    .map(([name, findings]) => {
      const s = summarize(findings);
      const body =
        findings.length === 0
          ? '- (no findings)'
          : findings.map((f) => line(f.severity, f)).join('\n');
      return `### ${name}\n\nErrors: ${s.errors} | Warnings: ${s.warnings} | Info: ${s.info}\n\n${body}`;
    })
    .join('\n\n');

  const approvals = ctx.registers['REG-205']?.doc?.records ?? [];
  const conditions = approvals
    .flatMap((a) => (a.conditions ?? []).map((c) => `- ${a.id} (${a.artifact_id}): ${c}`))
    .join('\n');

  return `# Volume 2 Governance Control Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 2 corpus. It is not a source of truth, does not confer ratification, and
> does not assert independent assurance. The Markdown chapters, YAML registers,
> JSON schemas, and control scripts are the authoritative record. Volume 0 and
> Volume 1 remain frozen and are not modified by Volume 2 work.

## Summary

- Total findings: ${totals.total}
- Errors: ${totals.errors}
- Warnings: ${totals.warnings}
- Info: ${totals.info}
- Overall: ${totals.errors > 0 ? 'FAIL (product-definition integrity errors present)' : 'PASS (no integrity errors)'}

## Product-definition vocabularies (schema-enforced)

- Requirement chain: OUT -> CAP -> BR -> FR -> NFR -> UC -> RULE -> WF -> UX -> DATA -> API -> EVT -> CTRL -> TEST
- Product boundary: House, Button, Both, Neither
- Stakeholder type: institutional, member_organization, club, participant, official, administrator, executive, external_system, public
- Validation status: author_asserted, stakeholder_validation_pending, stakeholder_validated

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

## Recorded conditions (from REG-205 approvals)

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
  console.log(`Volume 2 control report written to ${outPath}`);
}
