#!/usr/bin/env node
// Controlled document-format generator for Volume 0.
//
// Produces non-authoritative DOCX and PDF projections of:
//   1. The complete Volume 0 corpus (chapters in REG-000 order).
//   2. The V0-H Executive Constitutional Brief.
//
// The authoritative source of record remains the Markdown chapters and the
// governed registers under docs/program/volume-0/. Generated files are
// explicitly marked as non-authoritative projections and carry the source
// commit id. Regenerating from the same commit reproduces the same content.
//
// Dependencies (not part of the application runtime; install without touching
// package.json / package-lock):
//   npm install --no-save --no-package-lock marked html-to-docx
//
// PDF generation uses local headless Google Chrome (no LaTeX / pandoc).
//
// Usage:
//   node docs/program/volume-0/controls/build-executive-formats.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

import { marked } from 'marked';
import yaml from 'js-yaml';
import HTMLtoDOCX from 'html-to-docx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VOLUME_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(VOLUME_DIR, '..', '..', '..');
const GENERATED_DIR = resolve(VOLUME_DIR, 'generated');

const VOLUME_VERSION = '1.0.0';
const CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function sourceCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'UNKNOWN';
  }
}

function loadCorpusOrder() {
  const raw = readFileSync(
    resolve(VOLUME_DIR, 'registers', 'REG-000-corpus-index.yaml'),
    'utf8',
  );
  const doc = yaml.load(raw);
  return (doc.records || []).map((r) => ({
    id: r.id,
    title: r.title,
    path: resolve(REPO_ROOT, r.path),
    version: r.version,
    status: r.status,
  }));
}

// Strip the plain-text document-control header block that precedes the first
// Markdown H1 so the rendered document leads with the chapter heading.
function chapterMarkdown(absPath) {
  const raw = readFileSync(absPath, 'utf8');
  const lines = raw.split('\n');
  const h1 = lines.findIndex((l) => /^#\s+/.test(l));
  return h1 > 0 ? lines.slice(h1).join('\n') : raw;
}

const STYLE = `
  :root { --cc-red: #C8102E; --cc-ink: #1a1a1a; --cc-muted: #5a5a5a; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    color: var(--cc-ink); line-height: 1.5; font-size: 11pt; margin: 0;
  }
  h1 { color: var(--cc-red); font-size: 20pt; border-bottom: 3px solid var(--cc-red);
       padding-bottom: 6px; margin-top: 0; page-break-after: avoid; }
  h2 { color: var(--cc-ink); font-size: 15pt; margin-top: 18px; page-break-after: avoid; }
  h3 { color: var(--cc-ink); font-size: 12.5pt; page-break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10pt; }
  th, td { border: 1px solid #cfcfcf; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; }
  code { background: #f2f2f2; padding: 1px 4px; border-radius: 3px; font-size: 9.5pt; }
  pre { background: #f7f7f7; border: 1px solid #e0e0e0; padding: 10px; overflow-x: auto; font-size: 9pt; }
  a { color: var(--cc-red); text-decoration: none; }
  .cover { text-align: center; padding-top: 140px; }
  .cover .kicker { color: var(--cc-red); font-weight: 700; letter-spacing: 3px;
    text-transform: uppercase; font-size: 12pt; }
  .cover h1 { border: none; color: var(--cc-ink); font-size: 30pt; margin: 18px 40px; }
  .cover .subtitle { font-size: 15pt; color: var(--cc-muted); margin-bottom: 60px; }
  .control-box { margin: 40px auto; width: 78%; border: 1px solid #d0d0d0;
    border-top: 4px solid var(--cc-red); padding: 18px 22px; text-align: left; font-size: 10pt; }
  .control-box dt { font-weight: 700; color: var(--cc-red); }
  .control-box dd { margin: 0 0 8px 0; }
  .projection { margin: 24px auto; width: 78%; background: #fff6f6;
    border: 1px solid var(--cc-red); padding: 12px 16px; text-align: left; font-size: 9.5pt; }
  .chapter { page-break-before: always; }
  .toc { page-break-before: always; }
  .toc h2 { color: var(--cc-red); border-bottom: 2px solid var(--cc-red); padding-bottom: 4px; }
  .toc ol { line-height: 1.9; }
`;

function coverHtml({ title, subtitle, commit, generatedAt, scope }) {
  return `
  <section class="cover">
    <div class="kicker">Curling Canada &mdash; Central Registration Platform</div>
    <h1>${title}</h1>
    <div class="subtitle">${subtitle}</div>
    <dl class="control-box">
      <dt>Document version</dt><dd>${VOLUME_VERSION}</dd>
      <dt>Scope</dt><dd>${scope}</dd>
      <dt>Owner</dt><dd>Aubert Nungisa (Accountable Program Authority)</dd>
      <dt>Executive acceptance authority</dt><dd>Nolan</dd>
      <dt>Associated gate</dt><dd>G0</dd>
      <dt>Source commit</dt><dd><code>${commit}</code></dd>
      <dt>Generated</dt><dd>${generatedAt}</dd>
    </dl>
    <div class="projection">
      <strong>Non-authoritative projection.</strong> This file is a formatted
      rendering generated from the governed Markdown source at commit
      <code>${commit}</code>. The authoritative record of Volume 0 is the
      Markdown corpus and governed registers under
      <code>docs/program/volume-0/</code>. Evidence basis is
      SELF-ATTESTED / AUTHOR-VERIFIED; independent certification is not claimed
      and executive organizational acceptance is required at the material
      commitment gate.
    </div>
  </section>`;
}

function tocHtml(chapters) {
  const items = chapters
    .map((c) => `<li>${c.id} &mdash; ${c.title}</li>`)
    .join('\n');
  return `<section class="toc"><h2>Contents</h2><ol>${items}</ol></section>`;
}

function pageHtml(title, bodyInner) {
  return `<!doctype html><html><head><meta charset="utf-8">
  <title>${title}</title><style>${STYLE}</style></head>
  <body>${bodyInner}</body></html>`;
}

async function writeDocx(html, outPath, headerTitle) {
  const buffer = await HTMLtoDOCX(html, null, {
    orientation: 'portrait',
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    title: headerTitle,
    footer: true,
    pageNumber: true,
  });
  writeFileSync(outPath, buffer);
}

function writePdf(html, outPath) {
  const tmpHtml = resolve(tmpdir(), `vol0-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(tmpHtml, html);
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${outPath}`,
      `file://${tmpHtml}`,
    ],
    { stdio: 'ignore' },
  );
}

async function main() {
  if (!existsSync(CHROME)) {
    throw new Error(`Headless Chrome not found at ${CHROME}`);
  }
  mkdirSync(GENERATED_DIR, { recursive: true });

  const commit = sourceCommit();
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const corpus = loadCorpusOrder();

  // ---- Complete Volume 0 ----
  const chapterBodies = corpus
    .map(
      (c) =>
        `<section class="chapter">${marked.parse(chapterMarkdown(c.path))}</section>`,
    )
    .join('\n');

  const volumeInner =
    coverHtml({
      title: 'Volume 0 &mdash; Constitutional Foundation',
      subtitle: 'Complete Corpus (Ratified and Frozen at v1.0.0)',
      commit,
      generatedAt,
      scope: 'Volume 0 chapters V0-00 through V0-12 and annexes V0-A through V0-I',
    }) +
    tocHtml(corpus) +
    chapterBodies;

  const volumeHtml = pageHtml(
    'Central Registration Platform — Volume 0',
    volumeInner,
  );

  const volDocx = resolve(
    GENERATED_DIR,
    'Central-Registration-Platform-Volume-0-v1.0.0.docx',
  );
  const volPdf = resolve(
    GENERATED_DIR,
    'Central-Registration-Platform-Volume-0-v1.0.0.pdf',
  );
  await writeDocx(volumeHtml, volDocx, 'Central Registration Platform — Volume 0 v1.0.0');
  writePdf(volumeHtml, volPdf);

  // ---- Executive Constitutional Brief (V0-H) ----
  const brief = corpus.find((c) => c.id === 'V0-H');
  if (!brief) throw new Error('V0-H not found in REG-000');

  const briefInner =
    coverHtml({
      title: 'Executive Constitutional Brief',
      subtitle: 'Volume 0 &mdash; Plain-Language Executive Summary',
      commit,
      generatedAt,
      scope: 'Annex V0-H — Executive Constitutional Brief',
    }) +
    `<section class="chapter">${marked.parse(chapterMarkdown(brief.path))}</section>`;

  const briefHtml = pageHtml(
    'Central Registration Platform — Executive Constitutional Brief',
    briefInner,
  );

  const briefDocx = resolve(
    GENERATED_DIR,
    'Central-Registration-Platform-Volume-0-Executive-Brief.docx',
  );
  const briefPdf = resolve(
    GENERATED_DIR,
    'Central-Registration-Platform-Volume-0-Executive-Brief.pdf',
  );
  await writeDocx(briefHtml, briefDocx, 'Volume 0 — Executive Constitutional Brief');
  writePdf(briefHtml, briefPdf);

  process.stdout.write(
    [
      'Generated (source commit ' + commit + '):',
      '  ' + volDocx,
      '  ' + volPdf,
      '  ' + briefDocx,
      '  ' + briefPdf,
      '',
    ].join('\n'),
  );
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
