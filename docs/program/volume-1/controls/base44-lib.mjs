// Shared helpers for the deterministic Base44 corpus extraction tooling.
//
// These controls read ONLY the extracted Base44 export under
// legacy/curl-link-hub-extracted and write NON-AUTHORITATIVE generated reports
// under docs/program/volume-1/generated/base44. They never modify the export,
// The House runtime, or any ratified/frozen governance artifact. Their output is
// evidence INPUT to qualification, not a qualification decision.

import { createHash } from 'node:crypto';
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
export const SOURCE_ROOT = join(REPO_ROOT, 'legacy', 'curl-link-hub-extracted');
export const ARCHIVE_PATH = join(REPO_ROOT, 'legacy', 'curl-link-hub (5).zip');
export const GEN_DIR = join(REPO_ROOT, 'docs', 'program', 'volume-1', 'generated', 'base44');

export function ensureGenDir() {
  mkdirSync(GEN_DIR, { recursive: true });
}

export function readText(absPath) {
  return readFileSync(absPath, 'utf8');
}

export function sha256File(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

export function fileSize(absPath) {
  return statSync(absPath).size;
}

// Recursively list files under a directory, skipping node_modules and .git.
export function walk(absDir, predicate = () => true) {
  const out = [];
  if (!existsSync(absDir)) return out;
  const stack = [absDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git') continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
      } else if (predicate(full)) {
        out.push(full);
      }
    }
  }
  return out;
}

export function listDirs(absDir) {
  if (!existsSync(absDir)) return [];
  return readdirSync(absDir)
    .map((name) => join(absDir, name))
    .filter((full) => statSync(full).isDirectory());
}

export function rel(absPath) {
  return relative(SOURCE_ROOT, absPath).split(sep).join('/');
}

// String-aware JSONC comment stripper (handles // and /* */ without corrupting
// string contents such as URLs). Also tolerates trailing commas.
export function parseJsonc(text) {
  let out = '';
  let inString = false;
  let stringQuote = '';
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 1;
      } else if (c === stringQuote) {
        inString = false;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      stringQuote = c;
      out += c;
      continue;
    }
    if (c === '/' && next === '/') {
      inLine = true;
      i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlock = true;
      i += 1;
      continue;
    }
    out += c;
  }
  const noTrailingCommas = out.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(noTrailingCommas);
}

export function writeJson(name, data) {
  ensureGenDir();
  const payload = {
    _meta: {
      generated_by: 'docs/program/volume-1/controls/base44 extraction tooling',
      authority: 'NON-AUTHORITATIVE. Deterministic evidence input to qualification; not a qualification decision.',
      source_archive: 'legacy/curl-link-hub (5).zip',
      generated_from_commit_baseline: 'see REG-101 SRC-001 / SRC-002',
    },
    ...data,
  };
  writeFileSync(join(GEN_DIR, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

export function pct(n, total) {
  if (!total) return 0;
  return Math.round((n / total) * 1000) / 10;
}
