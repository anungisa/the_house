// Orchestrator for `npm run governance:check:v7`.
//
// Runs every Volume 7 governance control against a single loaded context,
// regenerates the non-authoritative control report, foundation projections, and
// Gate V7-G1 readiness projection, prints an aggregated summary, and exits
// non-zero when any ERROR-severity finding is present.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, loadContext, printFindings } from './lib.mjs';
import { collectFindings, buildReport } from './generate-control-report.mjs';
import { generate as generateFoundation } from './foundation-volume-7.mjs';
import { generate as generateGate } from './gate-volume-7.mjs';
import { generate as generateInteraction } from './interaction-model-volume-7.mjs';
import { generate as generateGateG2 } from './gate-volume-7-g2.mjs';
import { generate as generateDesign } from './design-system-volume-7.mjs';
import { generate as generateGateG3 } from './gate-volume-7-g3.mjs';
import { generate as generateProvenance } from './provenance-integrity-volume-7.mjs';

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

generateFoundation(ctx);
generateGate(ctx);
generateInteraction(ctx);
generateGateG2(ctx);
generateDesign(ctx);
generateGateG3(ctx);
generateProvenance(ctx);

console.log('\n=== Volume 7 governance check summary ===');
console.log(`  Registers checked: ${Object.keys(ctx.registers).length}`);
console.log(`  Chapters checked:  ${ctx.chapters.length}`);
console.log(`  Errors:   ${allErrors}`);
console.log(`  Warnings: ${allWarnings}`);
console.log(`  Info:     ${allInfo}`);
console.log(`  Report:   ${outPath}`);
console.log(`  Result:   ${allErrors > 0 ? 'FAIL' : 'PASS'}`);

process.exitCode = allErrors > 0 ? 1 : 0;
