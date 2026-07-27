// Control: generate a NON-AUTHORITATIVE Volume 7 governance control report.
//
// The report is a projection of the source-controlled Volume 7 corpus. It is never
// a source of truth and never the basis of a ratification. It aggregates the
// findings of the structural, reference, experience-foundation, and Gate V7-G1
// readiness controls.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, loadContext, summarize } from './lib.mjs';
import { run as runStructural } from './validate-volume-7.mjs';
import { run as runReferences } from './validate-references.mjs';
import { run as runFoundation } from './foundation-volume-7.mjs';
import { run as runGate } from './gate-volume-7.mjs';
import { run as runInteraction } from './interaction-model-volume-7.mjs';
import { run as runGateG2 } from './gate-volume-7-g2.mjs';
import { run as runDesign } from './design-system-volume-7.mjs';
import { run as runGateG3 } from './gate-volume-7-g3.mjs';
import { run as runProvenance } from './provenance-integrity-volume-7.mjs';
import { run as runValidation } from './validation-handoff-volume-7.mjs';
import { run as runGateG4 } from './gate-volume-7-g4.mjs';

export function collectFindings(ctx) {
  return {
    'Structural, schema & experience conformance': runStructural(ctx),
    'Cross-reference & traceability integrity': runReferences(ctx),
    'Experience-foundation coverage': runFoundation(ctx),
    'Gate V7-G1 readiness': runGate(ctx),
    'Interaction-model coverage': runInteraction(ctx),
    'Gate V7-G2 readiness': runGateG2(ctx),
    'Design-system coverage': runDesign(ctx),
    'Gate V7-G3 readiness': runGateG3(ctx),
    'Provenance & gate-chronology integrity': runProvenance(ctx),
    'Validation-handoff coverage': runValidation(ctx),
    'Gate V7-G4 readiness': runGateG4(ctx)
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

  const approvals = ctx.registers['REG-705']?.doc?.records ?? [];
  const conditions = approvals
    .flatMap((a) => (a.conditions ?? []).map((c) => `- ${a.id} (${a.artifact_id}): ${c}`))
    .join('\n');

  return `# Volume 7 Governance Control Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 7 corpus. It is not a source of truth, does not confer ratification, and
> does not assert implementation, accessibility conformance, bilingual validation,
> usability, or stakeholder validation. The Markdown chapters, YAML registers, JSON
> schemas, and control scripts are the authoritative record. Volume 0 through
> Volume 6 remain frozen/released and are not modified by Volume 7 work. Volume 7
> Package 1 defines EXPERIENCE, SERVICE, INFORMATION-ARCHITECTURE, CONTENT,
> ACCESSIBILITY, BILINGUAL, PRIVACY, and RECOVERY OBLIGATIONS only and authorizes
> no implementation, final visual design, production content, coded interface,
> design-system implementation, executable workflow, procurement, sequencing,
> staffing, or cost.

## Summary

- Total findings: ${totals.total}
- Errors: ${totals.errors}
- Warnings: ${totals.warnings}
- Info: ${totals.info}
- Overall: ${totals.errors > 0 ? 'FAIL (experience/service-design integrity errors present)' : 'PASS (no integrity errors)'}

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

## Recorded conditions (from REG-705 approvals)

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
  console.log(`Volume 7 control report written to ${outPath}`);
}
