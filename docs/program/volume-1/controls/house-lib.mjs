// Shared helpers for the deterministic House-implementation qualification tooling.
//
// These controls read ONLY the committed House v2 repository (src/, db/migrations,
// scripts/, infra/, .github/, tests/) and write NON-AUTHORITATIVE generated reports
// under docs/program/volume-1/generated/house/. They never modify the runtime, and
// they never write to any ratified/frozen governance artifact. Their output is
// deterministic evidence INPUT to Package 3 qualification, not a qualification
// decision.
//
// Unlike the Base44 tooling (which assesses an extracted export archive), the source
// under assessment here is the repository working tree itself. The tooling therefore
// records a GIT/RUNTIME fingerprint (assessed commit, runtime-tree commit, tree
// digests) so every generated artifact is anchored to an exact, reproducible baseline.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
export const GENERATED_ROOT = join(REPO_ROOT, 'docs', 'program', 'volume-1', 'generated');

// The single controlled House implementation source. SRC-002 in REG-101.
export const HOUSE_SOURCE = {
  id: 'SRC-002',
  label: 'The House v2 repository (production-candidate implementation)',
  genSubdir: 'house',
  // Material runtime roots assessed by the tooling (repository-relative).
  roots: {
    src: 'src',
    migrations: 'db/migrations',
    scripts: 'scripts',
    infra: 'infra',
    ci: '.github/workflows',
    tests: 'tests',
  },
};

// --- stateless filesystem helpers (absolute-path based) ---

export function readText(absPath) {
  return readFileSync(absPath, 'utf8');
}

export function sha256File(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

export function sha256String(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function fileSize(absPath) {
  return statSync(absPath).size;
}

// Recursively list files under a directory, skipping node_modules, .git and build output.
export function walk(absDir, predicate = () => true) {
  const out = [];
  if (!existsSync(absDir)) return out;
  const stack = [absDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'coverage') {
        continue;
      }
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
      } else if (predicate(full)) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

export function listDirs(absDir) {
  if (!existsSync(absDir)) return [];
  return readdirSync(absDir)
    .map((name) => join(absDir, name))
    .filter((full) => statSync(full).isDirectory())
    .sort();
}

export function pct(n, total) {
  if (!total) return 0;
  return Math.round((n / total) * 1000) / 10;
}

// Count non-blank lines in a text file (deterministic size proxy for inventories).
export function countLines(text) {
  return text.split('\n').filter((l) => l.trim().length > 0).length;
}

// Count regex matches across a string (global).
export function countMatches(text, regex) {
  const re = regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`);
  const m = text.match(re);
  return m ? m.length : 0;
}

// --- git / runtime fingerprint ---

function git(args) {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// A tree digest over a set of files: hash of sorted "relpath:sha256" lines. Stable
// across runs when the working tree is unchanged; independent of filesystem order.
export function treeDigest(absFiles) {
  const lines = absFiles
    .map((f) => `${relative(REPO_ROOT, f).split(sep).join('/')}:${sha256File(f)}`)
    .sort();
  return { digest: sha256String(lines.join('\n')), file_count: lines.length };
}

// Compute the repository + runtime fingerprint. The RUNTIME commit is restricted to
// application-runtime paths (src + db/migrations) so documentation-only commits do
// not misrepresent when the assessed implementation last changed.
export function computeFingerprint() {
  const srcFiles = walk(join(REPO_ROOT, 'src'), (f) => f.endsWith('.ts'));
  const migrationFiles = walk(join(REPO_ROOT, 'db', 'migrations'), (f) => f.endsWith('.sql'));
  const srcDigest = treeDigest(srcFiles);
  const migDigest = treeDigest(migrationFiles);
  const porcelain = git(['status', '--porcelain']);
  const lockPath = join(REPO_ROOT, 'package-lock.json');
  const pkgPath = join(REPO_ROOT, 'package.json');
  return {
    repository_commit: git(['rev-parse', 'HEAD']),
    runtime_commit: git(['log', '-1', '--format=%H', '--', 'src', 'db/migrations']),
    runtime_commit_date: git(['log', '-1', '--format=%cI', '--', 'src', 'db/migrations']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    working_tree_state: porcelain === null ? 'unknown' : porcelain.length === 0 ? 'clean' : 'dirty',
    src_tree_digest: srcDigest.digest,
    src_ts_file_count: srcDigest.file_count,
    migrations_digest: migDigest.digest,
    migration_file_count: migDigest.file_count,
    package_json_sha256: existsSync(pkgPath) ? sha256File(pkgPath) : null,
    package_lock_sha256: existsSync(lockPath) ? sha256File(lockPath) : null,
  };
}

// --- context ---

export function parseArgs(argv = []) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--gen-subdir') args.genSubdir = argv[(i += 1)];
  }
  return args;
}

// Build the assessment context bound to the House repository source. Analyzers and
// the orchestrator receive this context and never reach for global source state.
export function createContext(argvOrOpts = {}) {
  const opts = Array.isArray(argvOrOpts) ? parseArgs(argvOrOpts) : argvOrOpts;
  const genSubdir = opts.genSubdir ?? HOUSE_SOURCE.genSubdir;
  const GEN_DIR = join(GENERATED_ROOT, genSubdir);
  const fingerprint = computeFingerprint();
  const abs = (relPath) => join(REPO_ROOT, relPath);
  return {
    id: HOUSE_SOURCE.id,
    label: HOUSE_SOURCE.label,
    roots: HOUSE_SOURCE.roots,
    fingerprint,
    REPO_ROOT,
    GEN_DIR,
    abs,
    rel(absPath) {
      return relative(REPO_ROOT, absPath).split(sep).join('/');
    },
    ensureGenDir() {
      mkdirSync(GEN_DIR, { recursive: true });
    },
    writeJson(name, data) {
      mkdirSync(GEN_DIR, { recursive: true });
      const payload = {
        _meta: {
          generated_by: 'docs/program/volume-1/controls house-implementation qualification tooling',
          authority:
            'NON-AUTHORITATIVE. Deterministic evidence input to Package 3 qualification; not a qualification decision.',
          source_id: HOUSE_SOURCE.id,
          source_label: HOUSE_SOURCE.label,
          repository_commit: fingerprint.repository_commit,
          runtime_commit: fingerprint.runtime_commit,
          branch: fingerprint.branch,
          working_tree_state: fingerprint.working_tree_state,
          src_tree_digest: fingerprint.src_tree_digest,
          migrations_digest: fingerprint.migrations_digest,
        },
        ...data,
      };
      writeFileSync(join(GEN_DIR, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      return payload;
    },
  };
}
