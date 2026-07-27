// Orchestrator for `npm run governance:check:v9`.
//
// Runs every Volume 9 governance control against a single loaded context,
// regenerates the non-authoritative control report, foundation projections,
// provenance-integrity projections, and Gate V9-G1 readiness projection, prints an
// aggregated summary, and exits non-zero when any ERROR-severity finding is present.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, loadContext, printFindings } from './lib.mjs';
import { collectFindings, buildReport } from './generate-control-report.mjs';
import { generate as generateFoundation } from './foundation-volume-9.mjs';
import { generate as generateProvenance } from './provenance-integrity-volume-9.mjs';
import { generate as generateGate } from './gate-g1-volume-9.mjs';
import { generate as generateAffiliation } from './affiliation-test-definition-volume-9.mjs';
import { generate as generateGate2 } from './gate-g2-volume-9.mjs';
import { generate as generateAssurance } from './cross-cutting-assurance-test-definition-volume-9.mjs';
import { generate as generateGate3 } from './gate-g3-volume-9.mjs';
import { generate as generateFinalClosure } from './final-closure-analysis-volume-9.mjs';
import { generate as generateGate4 } from './gate-g4-volume-9.mjs';

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
generateProvenance(ctx);
generateGate(ctx);
generateAffiliation(ctx);
generateGate2(ctx);
generateAssurance(ctx);
generateGate3(ctx);
generateFinalClosure(ctx);
generateGate4(ctx);

console.log('\n=== Volume 9 governance check summary ===');
console.log(`  Registers checked: ${Object.keys(ctx.registers).length}`);
console.log(`  Chapters checked:  ${ctx.chapters.length}`);
console.log(`  Errors:   ${allErrors}`);
console.log(`  Warnings: ${allWarnings}`);
console.log(`  Info:     ${allInfo}`);
console.log(`  Report:   ${outPath}`);
console.log(`  Result:   ${allErrors > 0 ? 'FAIL' : 'PASS'}`);

process.exitCode = allErrors > 0 ? 1 : 0;
