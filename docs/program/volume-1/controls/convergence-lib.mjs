// Package 5 convergence library.
//
// Loads the CONTROLLED convergence input (docs/program/volume-1/inputs/
// convergence-input.yaml), the ratified Volume 1 registers (REG-101..REG-108), and the
// generated Package 2-4 inventories (generated/base44, generated/house,
// generated/ecosystem). It provides a context for the orchestrator to structure that
// evidence into generated/convergence/*. This tooling INVENTS no target decisions: it
// only structures decisions that already live in the controlled input or the ratified
// registers/chapters, and it stamps every artifact with the input/source fingerprint.
// It authorizes nothing and decides nothing.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const V1_ROOT = join(REPO_ROOT, 'docs', 'program', 'volume-1');
const GEN_DIR = join(V1_ROOT, 'generated', 'convergence');
const INPUT_PATH = join(V1_ROOT, 'inputs', 'convergence-input.yaml');
const REGISTERS_DIR = join(V1_ROOT, 'registers');
const GEN_BASE = join(V1_ROOT, 'generated');

export function sha256String(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export function sha256File(abs) {
  return sha256String(readFileSync(abs, 'utf8'));
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export function readYaml(abs) {
  return load(readFileSync(abs, 'utf8'));
}

export function rel(absPath) {
  return relative(REPO_ROOT, absPath).split(sep).join('/');
}

function loadRegisters() {
  const registers = {};
  for (const file of readdirSync(REGISTERS_DIR)) {
    if (!/^REG-1\d{2}.*\.ya?ml$/.test(file)) continue;
    const doc = readYaml(join(REGISTERS_DIR, file));
    if (doc && doc.register_id) registers[doc.register_id] = doc;
  }
  return registers;
}

function loadGeneratedJson(subdir, name) {
  const abs = join(GEN_BASE, subdir, name);
  return existsSync(abs) ? JSON.parse(readFileSync(abs, 'utf8')) : null;
}

// Build the convergence context. The fingerprint anchors the generated artifacts to the
// exact controlled input and register/generated corpus that produced them.
export function createConvergenceContext() {
  const input = readYaml(INPUT_PATH);
  const registers = loadRegisters();
  const porcelain = git(['status', '--porcelain']);
  const fingerprint = {
    repository_commit: git(['rev-parse', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    working_tree_state:
      porcelain === null ? 'unknown' : porcelain.length === 0 ? 'clean' : 'dirty',
    convergence_input_path: rel(INPUT_PATH),
    convergence_input_sha256: sha256File(INPUT_PATH),
  };
  return {
    input,
    registers,
    fingerprint,
    generated: {
      base44: {
        capabilities: loadGeneratedJson('base44', 'capability-domain-analysis.json'),
        sourceManifest: loadGeneratedJson('base44', 'source-manifest.json'),
      },
      house: {
        domains: loadGeneratedJson('house', 'domain-inventory.json'),
        tests: loadGeneratedJson('house', 'test-inventory.json'),
        sourceManifest: loadGeneratedJson('house', 'source-manifest.json'),
      },
      ecosystem: {
        systems: loadGeneratedJson('ecosystem', 'system-inventory.json'),
        authority: loadGeneratedJson('ecosystem', 'authority-matrix.json'),
        sourceManifest: loadGeneratedJson('ecosystem', 'source-manifest.json'),
      },
    },
    GEN_DIR,
    ensureGenDir() {
      mkdirSync(GEN_DIR, { recursive: true });
    },
    writeJson(name, data) {
      mkdirSync(GEN_DIR, { recursive: true });
      const payload = {
        _meta: {
          generated_by:
            'docs/program/volume-1/controls/inventory-convergence.mjs (Package 5 convergence tooling)',
          authority:
            'NON-AUTHORITATIVE. Deterministic structuring of controlled convergence input and ratified registers; not a target decision and not an authorization. No target decision is invented from tooling.',
          repository_commit: fingerprint.repository_commit,
          branch: fingerprint.branch,
          working_tree_state: fingerprint.working_tree_state,
          convergence_input_sha256: fingerprint.convergence_input_sha256,
        },
        ...data,
      };
      writeFileSync(join(GEN_DIR, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      return payload;
    },
    writeText(name, text) {
      mkdirSync(GEN_DIR, { recursive: true });
      writeFileSync(join(GEN_DIR, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
    },
  };
}

// Deterministic tally of a key across a record set.
export function tally(records, keyFn) {
  const out = {};
  for (const r of records) {
    const k = keyFn(r) ?? 'UNSPECIFIED';
    out[k] = (out[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
