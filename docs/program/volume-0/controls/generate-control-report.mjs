// Control: generate a NON-AUTHORITATIVE governance control report.
//
// The report is a projection of the source-controlled corpus (V0-10 10.12). It is
// never a source of truth and never the basis of a ratification. It aggregates the
// findings of the structural, reference, ratification, and freeze controls.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, loadContext, summarize } from './lib.mjs';
import { run as runStructural } from './validate-volume-0.mjs';
import { run as runReferences } from './validate-references.mjs';
import { run as runRatification } from './validate-ratification.mjs';
import { run as runFreeze } from './validate-freeze.mjs';

export function collectFindings(ctx) {
  return {
    'Structural & schema conformance': runStructural(ctx),
    'Cross-reference integrity': runReferences(ctx),
    'Ratification integrity': runRatification(ctx),
    'Freeze & amendment integrity': runFreeze(ctx)
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
    .map((r) => `| ${r.id} | ${r.doc?.name ?? ''} | ${r.doc?.status ?? ''} | ${r.doc?.version ?? ''} | ${(r.doc?.records ?? r.doc?.terms ?? []).length} |`)
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

  const approvals = ctx.registers['REG-006']?.doc?.records ?? [];
  const conditions = approvals
    .flatMap((a) => (a.conditions ?? []).map((c) => `- ${a.id} (${a.artifact_id}): ${c}`))
    .join('\n');

  return `# Volume 0 Governance Control Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 0 corpus (see V0-10 10.12). It is not a source of truth, does not confer
> ratification, and does not assert independent assurance. The Markdown chapters,
> YAML registers, JSON schemas, and control scripts are the authoritative record.

## Summary

- Total findings: ${totals.total}
- Errors: ${totals.errors}
- Warnings: ${totals.warnings}
- Info: ${totals.info}
- Overall: ${totals.errors > 0 ? 'FAIL (constitutional integrity errors present)' : 'PASS (no integrity errors)'}

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

## Recorded conditions (from REG-006 approvals)

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
  const { outPath, grouped } = generate();
  const totals = summarize(Object.values(grouped).flat());
  console.log(`Governance control report written to ${outPath}`);
  console.log(`Findings: ${totals.errors} error(s), ${totals.warnings} warning(s), ${totals.info} info`);
  // Report generation itself does not fail the build; governance:check enforces errors.
}
