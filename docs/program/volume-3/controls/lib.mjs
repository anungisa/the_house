// Volume 3 governance controls - shared library.
//
// Non-authoritative executable controls that validate the source-controlled
// Volume 3 product-and-service-definition corpus (chapters, registers, schemas).
// The corpus itself remains the authoritative record; this tooling only reports
// findings.
//
// This mirrors the Volume 1 and Volume 2 controls framework (Ajv + js-yaml +
// finding model) but is fully self-contained so that the frozen Volume 0, Volume 1,
// and Volume 2 corpora
// and their tooling are never coupled to, or altered by, Volume 3 work.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const CONTROLS_DIR = dirname(fileURLToPath(import.meta.url));
export const VOLUME_DIR = resolve(CONTROLS_DIR, '..');
export const REPO_ROOT = resolve(VOLUME_DIR, '..', '..', '..');
export const SCHEMAS_DIR = join(VOLUME_DIR, 'schemas');
export const REGISTERS_DIR = join(VOLUME_DIR, 'registers');

export const Severity = Object.freeze({
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO'
});

// Map register id to its schema file.
export const REGISTER_SCHEMAS = Object.freeze({
  'REG-300': 'corpus-index.schema.json',
  'REG-301': 'outcomes.schema.json',
  'REG-302': 'stakeholders.schema.json',
  'REG-303': 'requirements.schema.json',
  'REG-304': 'decisions.schema.json',
  'REG-305': 'approvals.schema.json'
});

// Requirement chain order (OUT lives in REG-301; the remaining levels in REG-303).
export const REQUIREMENT_CHAIN = Object.freeze([
  'OUT',
  'CAP',
  'BR',
  'FR',
  'NFR',
  'UC',
  'RULE',
  'WF',
  'UX',
  'DATA',
  'API',
  'EVT',
  'CTRL',
  'TEST'
]);

// Recognise inherited Volume 0 / Volume 1 / Volume 2 references (resolved by
// inheritance, not required to exist inside the Volume 3 corpus). Volume 3 is the
// business-operating-model volume; it inherits the frozen Volume 0 foundation,
// the corrected Volume 1 v1.0.1 baseline, and the corrected Volume 2 v1.0.1
// product-and-service definition.
export function isInheritedRef(ref) {
  return (
    /^V0-/.test(ref) ||
    /^V1-([0-9]{2}|[A-Z])$/.test(ref) ||
    /^V2-([0-9]{2}|[A-Z])$/.test(ref) ||
    /^REG-0\d{2}$/.test(ref) ||
    /^REG-1\d{2}$/.test(ref) ||
    /^REG-2\d{2}$/.test(ref) ||
    /^DEC-V1-[0-9]{3}$/.test(ref) ||
    /^DEC-V2-[0-9]{3}$/.test(ref) ||
    /^APP-V1-[0-9]{3}$/.test(ref) ||
    /^APP-V2-[0-9]{3}$/.test(ref) ||
    /^GATE-V1-G[0-9]$/.test(ref) ||
    /^GATE-V2-G[0-9]$/.test(ref) ||
    /^(OUT|CAP|BR|FR|NFR|UC|RULE|WF|UX|DATA|API|EVT|CTRL|TEST|STK|MEAS)-V2-[0-9]{2,3}$/.test(ref) ||
    /^VOLUME-1$/.test(ref) ||
    /^VOLUME-2$/.test(ref) ||
    ref === 'central-registration-volume-1-v1.0.1' ||
    ref === 'central-registration-volume-1-v1.0.0' ||
    ref === 'central-registration-volume-2-v1.0.1' ||
    ref === 'central-registration-volume-2-v1.0.0'
  );
}

export function makeFinding(severity, code, message, artifact) {
  return { severity, code, message, artifact: artifact ?? null };
}

// Parse the header block of a Volume 3 chapter/annex markdown file.
function parseChapter(fileName, text) {
  const lines = text.split(/\r?\n/).slice(0, 20);
  const header = {};
  for (const line of lines) {
    const m = line.match(/^(Document ID|Status|Version|Owner|Approver|Associated Gate|Ratification):\s*(.+?)\s*$/);
    if (m) {
      header[m[1]] = m[2];
    }
  }
  const h1 = (text.split(/\r?\n/)[0] || '').startsWith('# ');
  const idFromName = (fileName.match(/^(V3-[0-9A-Z]+)/) || [])[1] || fileName;
  return {
    file: fileName,
    path: relative(REPO_ROOT, join(VOLUME_DIR, fileName)),
    id: (header['Document ID'] || idFromName).trim(),
    fileId: idFromName,
    status: header['Status'] || null,
    version: header['Version'] || null,
    owner: header['Owner'] || null,
    approver: header['Approver'] || null,
    ratification: header['Ratification'] || null,
    hasH1: h1
  };
}

export function loadContext() {
  const registers = {};
  const registerErrors = [];
  for (const file of readdirSync(REGISTERS_DIR)) {
    if (!/^REG-3\d{2}.*\.ya?ml$/.test(file)) continue;
    const full = join(REGISTERS_DIR, file);
    const raw = readFileSync(full, 'utf8');
    try {
      const doc = load(raw);
      const id = doc && doc.register_id ? doc.register_id : file;
      registers[id] = { id, file, path: relative(REPO_ROOT, full), doc, raw };
    } catch (err) {
      registerErrors.push({ file, path: relative(REPO_ROOT, full), message: err.message });
    }
  }

  const chapters = [];
  for (const file of readdirSync(VOLUME_DIR)) {
    if (!/^V3-[0-9A-Z].*\.md$/.test(file)) continue;
    const raw = readFileSync(join(VOLUME_DIR, file), 'utf8');
    chapters.push(parseChapter(file, raw));
  }
  chapters.sort((a, b) => a.file.localeCompare(b.file));

  return { registers, registerErrors, chapters };
}

export function loadSchema(fileName) {
  return JSON.parse(readFileSync(join(SCHEMAS_DIR, fileName), 'utf8'));
}

export function summarize(findings) {
  return {
    errors: findings.filter((f) => f.severity === Severity.ERROR).length,
    warnings: findings.filter((f) => f.severity === Severity.WARNING).length,
    info: findings.filter((f) => f.severity === Severity.INFO).length,
    total: findings.length
  };
}

export function printFindings(title, findings) {
  const s = summarize(findings);
  console.log(`\n=== ${title} ===`);
  if (findings.length === 0) {
    console.log('  (no findings)');
  }
  for (const f of findings) {
    const where = f.artifact ? ` [${f.artifact}]` : '';
    console.log(`  ${f.severity.padEnd(7)} ${f.code}${where}: ${f.message}`);
  }
  console.log(`  -- ${s.errors} error(s), ${s.warnings} warning(s), ${s.info} info`);
  return s;
}

// Run a validator module's run() as a standalone process.
export async function runStandalone(title, runFn) {
  const ctx = loadContext();
  const findings = await runFn(ctx);
  const s = printFindings(title, findings);
  process.exitCode = s.errors > 0 ? 1 : 0;
}
