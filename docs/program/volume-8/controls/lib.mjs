// Volume 8 governance controls - shared library.
//
// Non-authoritative executable controls that validate the source-controlled
// Volume 8 API, event, integration, and exchange-contract governance foundation
// corpus (chapters, registers, schemas). The corpus itself remains the
// authoritative record; this tooling only reports findings.
//
// This mirrors the Volume 0-7 controls framework (Ajv + js-yaml + finding model)
// but is fully self-contained so that the frozen/released Volume 0-7 corpora and
// their tooling are never coupled to, or altered by, Volume 8 work.
//
// Volume 8 Package 1 defines CONTRACT-GOVERNANCE, AUTHORITY, IDENTITY, DELIVERY,
// IDEMPOTENCY, ERROR, PRIVACY, PROVIDER, and COMPATIBILITY OBLIGATIONS only. No
// control in this volume, and no record in any Volume 8 register, may authorize
// implementation, executable API contracts, endpoint paths, runtime integrations,
// SDKs, IAM/cryptographic configuration, or infrastructure. The authorization
// guard and contract-leakage guard fail closed on any such artifact.

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
  'REG-800': 'corpus-index.schema.json',
  'REG-801': 'contract-surfaces.schema.json',
  'REG-802': 'contract-requirements.schema.json',
  'REG-803': 'decisions.schema.json',
  'REG-804': 'backlog.schema.json',
  'REG-805': 'approvals.schema.json'
});

// Contract-leakage patterns. Volume 8 Package 1 defines contract-governance
// OBLIGATIONS only; it must not embed executable artifacts: physical DDL,
// migrations, IAM role/policy statements, cryptographic key material, coded
// interface implementation, or executable interface/contract specifications
// (OpenAPI/AsyncAPI/GraphQL/Protobuf documents, HTTP verb + path route
// definitions, or concrete JSON payload schema bodies). These patterns match
// genuine executable artifacts, not prose that names a concept ("the command
// endpoint", "an event envelope", "the webhook receiver").
export const LEAKAGE_PATTERNS = Object.freeze([
  { code: 'DDL_CREATE_TABLE', re: /\bCREATE\s+TABLE\b/i },
  { code: 'DDL_ALTER_TABLE', re: /\bALTER\s+TABLE\b/i },
  { code: 'DDL_DROP_TABLE', re: /\bDROP\s+TABLE\b/i },
  { code: 'DDL_CREATE_INDEX', re: /\bCREATE\s+(UNIQUE\s+)?INDEX\b/i },
  { code: 'DDL_CREATE_SCHEMA', re: /\bCREATE\s+SCHEMA\b/i },
  { code: 'IAM_CREATE_ROLE', re: /\b(CREATE|ALTER|DROP)\s+ROLE\b/i },
  { code: 'IAM_CREATE_POLICY', re: /\bCREATE\s+POLICY\b/i },
  { code: 'IAM_GRANT', re: /\b(GRANT|REVOKE)\s+(SELECT|INSERT|UPDATE|DELETE|ALL|USAGE|EXECUTE)\b/i },
  { code: 'MIGRATION_FILE', re: /\b\d{3,}[_-][a-z0-9_-]+\.(sql|migration)\b/i },
  { code: 'PRIVATE_KEY_MATERIAL', re: /-----BEGIN\s+[A-Z ]*PRIVATE KEY-----/ },
  { code: 'CODED_HTML_ELEMENT', re: /<\/?(div|span|button|input|form|table|nav|section|header|footer)\b[^>]*>/i },
  { code: 'CODED_CSS_RULE', re: /\.[a-z][a-z0-9_-]*\s*\{[^}]*(color|margin|padding|display|font|width|height)\s*:/i },
  { code: 'CODED_JSX_COMPONENT', re: /<[A-Z][A-Za-z0-9]+(\s+[a-zA-Z-]+=|\s*\/?>)/ },
  { code: 'OPENAPI_DOCUMENT', re: /^\s*(openapi|swagger)\s*:\s*["']?\d/im },
  { code: 'ASYNCAPI_DOCUMENT', re: /^\s*asyncapi\s*:\s*["']?\d/im },
  { code: 'GRAPHQL_SCHEMA', re: /\btype\s+[A-Z][A-Za-z0-9]*\s*\{[^}]*:\s*(String|Int|Boolean|ID|Float)\b/ },
  { code: 'PROTOBUF_MESSAGE', re: /\bmessage\s+[A-Z][A-Za-z0-9]*\s*\{\s*(?:[a-z].*=\s*\d+;)/i },
  { code: 'HTTP_ROUTE_DEFINITION', re: /\b(GET|POST|PUT|PATCH|DELETE)\s+\/[a-z0-9{}/_-]+\b/ },
  { code: 'JSON_PAYLOAD_SCHEMA', re: /"\$schema"\s*:\s*"https?:\/\/[^"]*json-schema/i }
]);

// Recognise inherited Volume 0-7 references (resolved by inheritance, not required
// to exist inside the Volume 8 corpus). Volume 8 inherits the frozen Volume 0
// foundation and the released Volume 1-6 baselines and the released Volume 7
// experience and service-design baseline (central-registration-volume-7-v1.0.0).
export function isInheritedRef(ref) {
  return (
    /^V0-/.test(ref) ||
    /^V([1-7])-([0-9]{2}|[A-Z])(-[A-Z0-9]+)?$/.test(ref) ||
    /^REG-[0-7]\d{2}$/.test(ref) ||
    /^(ADR|DEC)-V[1-7]-[0-9]{3}$/.test(ref) ||
    /^APP-V[1-7]-[0-9]{3}$/.test(ref) ||
    /^GATE-V[1-7]-G[0-9]$/.test(ref) ||
    /^V[1-7]-G[0-9]$/.test(ref) ||
    /^(ASSET|ACTOR|TRUST_BOUNDARY|THREAT|ABUSE_CASE|RIGHT|CTRL|TEST|ASM|RISK|EXC)-V[1-7]-[0-9]{3}$/.test(ref) ||
    /^VOLUME-[1-7]$/.test(ref) ||
    /^PACKAGE-[1-7]-[0-9]$/.test(ref) ||
    /^central-registration-volume-[1-7]-v1\.0\.[0-9]$/.test(ref)
  );
}

export function makeFinding(severity, code, message, artifact) {
  return { severity, code, message, artifact: artifact ?? null };
}

// Derive the set of governance gates that have already been dispositioned
// (passed) from the approval register. A gate is "completed" once a ratified
// REG-805 approval carries a GATE-V8-Gx artifact and a gate_disposition. No
// unresolved obligation may name a completed gate as its future blocking gate.
export function completedGates(ctx) {
  const done = new Set();
  const approvals = ctx.registers?.['REG-805']?.doc?.records ?? [];
  for (const a of approvals) {
    const m = /^GATE-(V8-G[0-9])$/.exec(a.artifact_id ?? '');
    if (m && a.approval_state === 'ratified' && a.gate_disposition) {
      done.add(m[1]);
    }
  }
  return done;
}

// Parse the header block of a Volume 8 chapter/annex markdown file.
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
  const idFromName = (fileName.match(/^(V8-[0-9A-Z]+(?:-[0-9A-Z]+)*)/) || [])[1] || fileName;
  return {
    file: fileName,
    path: relative(REPO_ROOT, join(VOLUME_DIR, fileName)),
    id: (header['Document ID'] || idFromName).trim(),
    fileId: idFromName,
    status: header['Status'] || null,
    version: header['Version'] || null,
    owner: header['Owner'] || null,
    approver: header['Approver'] || null,
    gate: header['Associated Gate'] || null,
    ratification: header['Ratification'] || null,
    hasH1: h1,
    body: text
  };
}

export function loadContext() {
  const registers = {};
  const registerErrors = [];
  for (const file of readdirSync(REGISTERS_DIR)) {
    if (!/^REG-8\d{2}.*\.ya?ml$/.test(file)) continue;
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
    if (!/^V8-[0-9A-Z].*\.md$/.test(file)) continue;
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
