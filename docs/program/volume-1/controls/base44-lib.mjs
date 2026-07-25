// Shared helpers for the deterministic Base44 corpus extraction tooling.
//
// These controls read ONLY an extracted Base44 export and write NON-AUTHORITATIVE
// generated reports under docs/program/volume-1/generated/. They never modify the
// export, The House runtime, or any ratified/frozen governance artifact. Their
// output is evidence INPUT to qualification, not a qualification decision.
//
// The source under assessment is an EXPLICIT input. Callers pass a controlled
// source id (resolved via SOURCE_REGISTRY) or an explicit --archive/--extract-dir
// pair. The tooling never silently depends on a hardcoded legacy directory.

import { createHash } from 'node:crypto';
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
export const GENERATED_ROOT = join(REPO_ROOT, 'docs', 'program', 'volume-1', 'generated');

// Controlled source registry. Each entry binds a source id to an archive, an
// extraction directory, and a generated-output subdirectory. SRC-001 is the
// program's declared current Base44 export; SRC-009 is the superseded historical
// export retained for longitudinal comparison.
export const SOURCE_REGISTRY = {
  'SRC-001': {
    id: 'SRC-001',
    label: 'Base44 current declared export (7)',
    filename: 'curl-link-hub (7).zip',
    archive: join(REPO_ROOT, 'legacy', 'curl-link-hub (7).zip'),
    extractDir: join(REPO_ROOT, 'legacy', 'curl-link-hub-7-extracted'),
    genSubdir: 'base44',
  },
  'SRC-009': {
    id: 'SRC-009',
    label: 'Base44 historical export (5) - superseded, reference-case',
    filename: 'curl-link-hub (5).zip',
    archive: join(REPO_ROOT, 'legacy', 'curl-link-hub (5).zip'),
    extractDir: join(REPO_ROOT, 'legacy', 'curl-link-hub-extracted'),
    genSubdir: 'base44/historical-5',
  },
};

// --- stateless helpers (path-argument based; no bound source state) ---

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

export function pct(n, total) {
  if (!total) return 0;
  return Math.round((n / total) * 1000) / 10;
}

// Deterministic detection of a dependency/integration profile for a source root.
export function buildDependencyInventory(sourceRoot) {
  const pkg = JSON.parse(readText(join(sourceRoot, 'package.json')));
  const deps = pkg.dependencies ?? {};
  const dev = pkg.devDependencies ?? {};
  const names = Object.keys(deps);
  const integrations = {
    payments_stripe: names.some((n) => n.includes('stripe')),
    base44_sdk: names.some((n) => n.includes('@base44')),
    data_fetching_react_query: names.some((n) => n.includes('react-query')),
    routing_react_router: names.some((n) => n.includes('react-router')),
    ui_radix: names.filter((n) => n.startsWith('@radix-ui')).length,
    forms_react_hook_form: names.some((n) => n.includes('react-hook-form')),
    knowledge_document360: existsSync(join(sourceRoot, 'src', 'components', 'Document360Widget.jsx')),
  };
  return {
    summary: {
      dependencies: names.length,
      dev_dependencies: Object.keys(dev).length,
      radix_ui_packages: integrations.ui_radix,
    },
    integrations,
    dependencies: names.sort(),
  };
}

// Deterministic localization inventory for a source root.
export function buildLocalizationInventory(sourceRoot) {
  const i18nFiles = [
    ...walk(join(sourceRoot, 'src', 'lib', 'i18n')),
    ...walk(join(sourceRoot, 'src', 'components', 'i18n')),
  ].map((f) => f.replace(`${sourceRoot}/`, ''));
  const translationsPage = existsSync(join(sourceRoot, 'src', 'pages', 'Translations.jsx'));
  let frenchMarkers = 0;
  for (const f of walk(join(sourceRoot, 'src'), (x) => x.endsWith('.js') || x.endsWith('.jsx'))) {
    const t = readText(f);
    if (/fr[-_]CA|fran\u00e7ais|bilingual|useTranslation/.test(t)) frenchMarkers += 1;
  }
  return {
    summary: {
      i18n_files: i18nFiles.length,
      has_translations_admin_page: translationsPage,
      files_referencing_translation_or_french: frenchMarkers,
      framework: 'Homegrown i18n (src/lib/i18n/useTranslation.js); not a standard i18n library',
    },
    i18n_files: i18nFiles,
  };
}

// Deterministic, evidence-based detection of automated tests and CI in a source
// root. Replaces any static assumption with an actual filesystem check so the
// no-tests/no-CI finding is re-verified per source version.
export function detectTestsAndCi(sourceRoot) {
  const testDirNames = ['test', 'tests', '__tests__', 'spec', 'e2e'];
  const testDirs = testDirNames.filter((d) => existsSync(join(sourceRoot, d)));
  const isTestFile = (f) => /\.(test|spec)\.[jt]sx?$/.test(f);
  const testFileCount =
    walk(join(sourceRoot, 'src'), isTestFile).length +
    walk(join(sourceRoot, 'base44'), isTestFile).length;
  const ciPaths = ['.github/workflows', '.gitlab-ci.yml', 'azure-pipelines.yml', '.circleci', 'Jenkinsfile'];
  const ciConfigs = ciPaths.filter((p) => existsSync(join(sourceRoot, p)));
  let testScript = null;
  try {
    const pkg = JSON.parse(readText(join(sourceRoot, 'package.json')));
    const s = pkg.scripts?.test;
    if (s && !/no test specified/i.test(s)) testScript = s;
  } catch {
    testScript = null;
  }
  return {
    has_test_dir: testDirs.length > 0,
    test_dirs: testDirs,
    test_file_count: testFileCount,
    has_ci_config: ciConfigs.length > 0,
    ci_configs: ciConfigs,
    has_test_script: Boolean(testScript),
    test_script: testScript,
  };
}

// --- source resolution and context ---

export function parseArgs(argv = []) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--source-id') args.sourceId = argv[(i += 1)];
    else if (a === '--archive') args.archive = argv[(i += 1)];
    else if (a === '--extract-dir') args.extractDir = argv[(i += 1)];
    else if (a === '--gen-subdir') args.genSubdir = argv[(i += 1)];
  }
  return args;
}

export function resolveSource(opts = {}) {
  const reg = opts.sourceId ? SOURCE_REGISTRY[opts.sourceId] : null;
  if (opts.sourceId && !reg) {
    throw new Error(
      `resolveSource: unknown source id "${opts.sourceId}" (known: ${Object.keys(SOURCE_REGISTRY).join(', ')})`,
    );
  }
  const archive = opts.archive ? resolve(opts.archive) : reg?.archive ?? null;
  const extractDir = opts.extractDir ? resolve(opts.extractDir) : reg?.extractDir ?? null;
  const genSubdir = opts.genSubdir ?? reg?.genSubdir ?? 'base44';
  if (!extractDir) {
    throw new Error(
      'resolveSource: an explicit --extract-dir or a known --source-id is required (no hardcoded default)',
    );
  }
  return {
    id: opts.sourceId ?? reg?.id ?? null,
    label: reg?.label ?? null,
    filename: reg?.filename ?? (archive ? basename(archive) : null),
    archive,
    extractDir,
    genSubdir,
    SOURCE_ROOT: extractDir,
    ARCHIVE_PATH: archive,
    GEN_DIR: join(GENERATED_ROOT, genSubdir),
  };
}

// Build an extraction context bound to a single resolved source. Analyzers and
// the orchestrator receive this context and never reach for global source state.
export function createContext(argvOrOpts = {}) {
  const opts = Array.isArray(argvOrOpts) ? parseArgs(argvOrOpts) : argvOrOpts;
  const src = resolveSource(opts);
  return {
    ...src,
    rel(absPath) {
      return relative(src.SOURCE_ROOT, absPath).split(sep).join('/');
    },
    ensureGenDir() {
      mkdirSync(src.GEN_DIR, { recursive: true });
    },
    writeJson(name, data) {
      mkdirSync(src.GEN_DIR, { recursive: true });
      const sha = src.ARCHIVE_PATH && existsSync(src.ARCHIVE_PATH) ? sha256File(src.ARCHIVE_PATH) : null;
      const payload = {
        _meta: {
          generated_by: 'docs/program/volume-1/controls/base44 extraction tooling',
          authority:
            'NON-AUTHORITATIVE. Deterministic evidence input to qualification; not a qualification decision.',
          source_id: src.id,
          source_label: src.label,
          source_archive: src.filename,
          source_sha256: sha,
          source_extract_dir: relative(REPO_ROOT, src.SOURCE_ROOT),
        },
        ...data,
      };
      writeFileSync(join(src.GEN_DIR, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      return payload;
    },
  };
}
