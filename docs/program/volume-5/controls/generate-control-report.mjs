// Control: generate a NON-AUTHORITATIVE Volume 5 governance control report.
//
// The report is a projection of the source-controlled Volume 5 corpus. It is
// never a source of truth and never the basis of a ratification. It aggregates
// the findings of the structural/data-governance and reference controls.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, loadContext, summarize } from './lib.mjs';
import { run as runStructural } from './validate-volume-5.mjs';
import { run as runReferences } from './validate-references.mjs';

export function collectFindings(ctx) {
  return {
    'Structural, schema & data-governance conformance': runStructural(ctx),
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
      const body = findings.length === 0 ? '- (no findings)' : findings.map((f) => line(f.severity, f)).join('\n');
      return `### ${name}\n\nErrors: ${s.errors} | Warnings: ${s.warnings} | Info: ${s.info}\n\n${body}`;
    })
    .join('\n\n');

  const approvals = ctx.registers['REG-505']?.doc?.records ?? [];
  const conditions = approvals
    .flatMap((a) => (a.conditions ?? []).map((c) => `- ${a.id} (${a.artifact_id}): ${c}`))
    .join('\n');

  return `# Volume 5 Governance Control Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 5 corpus. It is not a source of truth, does not confer ratification, and
> does not assert independent assurance. The Markdown chapters, YAML registers,
> JSON schemas, and control scripts are the authoritative record. Volume 0 through
> Volume 4 remain frozen/released and are not modified by Volume 5 work. Volume 5
> Package 1 defines DATA GOVERNANCE and CONCEPTUAL INFORMATION semantics only and
> authorizes no implementation, physical schema, migration, executable pipeline,
> infrastructure provisioning, vendor selection, procurement, delivery
> sequencing, staffing, or cost.

## Summary

- Total findings: ${totals.total}
- Errors: ${totals.errors}
- Warnings: ${totals.warnings}
- Info: ${totals.info}
- Overall: ${totals.errors > 0 ? 'FAIL (data-governance integrity errors present)' : 'PASS (no integrity errors)'}

## Data-governance vocabularies (schema-enforced)

- Catalogue kinds: INFORMATION_DOMAIN, CONCEPTUAL_ENTITY, CONCEPTUAL_RELATIONSHIP, DATA_PRODUCT, CLASSIFICATION
- Rule kinds: RULE, QUALITY, LINEAGE, CTRL
- Authority domains: House, CurlingCanada, Button, External, Staff, Shared, Neither
- Classification categories: PUBLIC, INTERNAL, PERSONAL, RESTRICTED_EVIDENCE, FINANCIAL_STATUS, PRIVILEGED_ADMIN, SECURITY_AUDIT, ANALYTICS_AGGREGATE
- Quality dimensions: VALIDITY, COMPLETENESS, CONSISTENCY, UNIQUENESS, TIMELINESS, ACCURACY, TRACEABILITY, AUTHORITY_ALIGNMENT, JURISDICTION_ALIGNMENT, TEMPORAL_CORRECTNESS

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

## Recorded conditions (from REG-505 approvals)

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
  console.log(`Volume 5 control report written to ${outPath}`);
}
