// Package 4 ecosystem-qualification library.
//
// Loads the CONTROLLED ecosystem input (docs/program/volume-1/inputs/ecosystem-input.yaml)
// and the ratified Volume 0 authority register (REG-005), and provides a context for
// the orchestrator to structure that evidence into generated/ecosystem/*. This tooling
// derives nothing from absence: it only structures records the controlled input (or a
// ratified Volume 0 source) already asserts, and it stamps every record with a truth
// classification and a validation_status. It authorizes nothing and decides nothing.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const V1_ROOT = join(REPO_ROOT, 'docs', 'program', 'volume-1');
const GEN_DIR = join(V1_ROOT, 'generated', 'ecosystem');

const INPUT_PATH = join(V1_ROOT, 'inputs', 'ecosystem-input.yaml');
const REG005_PATH = join(
  REPO_ROOT,
  'docs',
  'program',
  'volume-0',
  'registers',
  'REG-005-source-authority.yaml',
);

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

// Build the ecosystem-qualification context. The fingerprint anchors the generated
// artifacts to the exact controlled input and ratified authority source that produced
// them, so the inventory is reproducible.
export function createEcosystemContext() {
  const input = readYaml(INPUT_PATH);
  const reg005 = existsSync(REG005_PATH) ? readYaml(REG005_PATH) : null;
  const porcelain = git(['status', '--porcelain']);
  const fingerprint = {
    repository_commit: git(['rev-parse', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    working_tree_state:
      porcelain === null ? 'unknown' : porcelain.length === 0 ? 'clean' : 'dirty',
    ecosystem_input_path: rel(INPUT_PATH),
    ecosystem_input_sha256: sha256File(INPUT_PATH),
    reg005_path: existsSync(REG005_PATH) ? rel(REG005_PATH) : null,
    reg005_sha256: existsSync(REG005_PATH) ? sha256File(REG005_PATH) : null,
  };
  return {
    input,
    reg005,
    fingerprint,
    GEN_DIR,
    ensureGenDir() {
      mkdirSync(GEN_DIR, { recursive: true });
    },
    writeJson(name, data) {
      mkdirSync(GEN_DIR, { recursive: true });
      const payload = {
        _meta: {
          generated_by:
            'docs/program/volume-1/controls/inventory-ecosystem.mjs (Package 4 ecosystem qualification tooling)',
          authority:
            'NON-AUTHORITATIVE. Deterministic structuring of controlled current-state evidence; not a qualification decision and not an authorization. No facts are generated from absence.',
          repository_commit: fingerprint.repository_commit,
          branch: fingerprint.branch,
          working_tree_state: fingerprint.working_tree_state,
          ecosystem_input_sha256: fingerprint.ecosystem_input_sha256,
          reg005_sha256: fingerprint.reg005_sha256,
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

export function rel(absPath) {
  return relative(REPO_ROOT, absPath).split(sep).join('/');
}

// Deterministic tally of truth classifications / validation statuses across a record set.
export function tally(records, key) {
  const out = {};
  for (const r of records) {
    const k = r[key] ?? 'UNSPECIFIED';
    out[k] = (out[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
