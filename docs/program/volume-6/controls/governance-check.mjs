// Orchestrator for `npm run governance:check:v6`.
//
// Runs every Volume 6 governance control against a single loaded context,
// regenerates the non-authoritative control report and the foundation and
// traceability projections, prints an aggregated summary, and exits non-zero when
// any ERROR-severity finding is present.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, loadContext, printFindings } from './lib.mjs';
import { collectFindings, buildReport } from './generate-control-report.mjs';
import { generate as generateTrace } from './trace-volume-6.mjs';
import { generate as generateFoundation } from './foundation-volume-6.mjs';
import { generate as generateControlModel } from './control-model-volume-6.mjs';
import { generate as generateComplianceAccessibility } from './compliance-accessibility-volume-6.mjs';

const ctx = loadContext();
const grouped = collectFindings(ctx);

let allErrors = 0;
let allWarnings = 0;
let allInfo = 0;
for (const [name, findings] of Object.entries(grouped)) {
  const s = printFindings(name, findings);
  allErrors += s.errors;
  allWarnings += s.warnings;
  allInfo += s.info;
}

const markdown = buildReport(ctx, grouped);
const outDir = join(VOLUME_DIR, 'generated');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'governance-control-report.md');
writeFileSync(outPath, markdown, 'utf8');

// Emit the non-authoritative traceability and Package 1 foundation projections
// alongside the control report so the generated corpus stays in sync with every
// check.
generateTrace(ctx);
generateFoundation(ctx);
generateControlModel(ctx);
generateComplianceAccessibility(ctx);

console.log('\n=== Volume 6 governance check summary ===');
console.log(`  Registers checked: ${Object.keys(ctx.registers).length}`);
console.log(`  Chapters checked:  ${ctx.chapters.length}`);
console.log(`  Errors:   ${allErrors}`);
console.log(`  Warnings: ${allWarnings}`);
console.log(`  Info:     ${allInfo}`);
console.log(`  Report:   ${outPath}`);
console.log(`  Result:   ${allErrors > 0 ? 'FAIL' : 'PASS'}`);

process.exitCode = allErrors > 0 ? 1 : 0;
