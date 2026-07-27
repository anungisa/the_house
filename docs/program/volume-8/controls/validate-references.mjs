// Control: cross-reference and traceability integrity for the Volume 8 corpus.
//
// Verifies that every intra-corpus reference (chapter_ref, traces_to, approval_ref,
// and *_ref fields) resolves either to a defined Volume 8 identifier (a chapter, a
// register record, or an approval artifact) or to an inherited Volume 0-7
// identifier resolved by inheritance. Unknown references fail closed.

import { Severity, isInheritedRef, makeFinding, runStandalone } from './lib.mjs';

function collectKnownIds(ctx) {
  const ids = new Set();
  for (const ch of ctx.chapters) {
    ids.add(ch.fileId);
    ids.add(ch.id);
  }
  for (const entry of Object.values(ctx.registers)) {
    ids.add(entry.id);
    for (const r of entry.doc?.records ?? []) {
      if (r.id) ids.add(r.id);
      if (r.artifact_id) ids.add(r.artifact_id);
    }
  }
  // Package and volume freeze artifacts are legitimate reference targets.
  ids.add('PACKAGE-8-1');
  ids.add('PACKAGE-8-2');
  ids.add('PACKAGE-8-3');
  ids.add('VOLUME-8');
  ids.add('GATE-V8-G1');
  ids.add('GATE-V8-G2');
  ids.add('GATE-V8-G3');
  return ids;
}

function refFieldsOf(record) {
  const refs = [];
  const push = (v) => {
    if (typeof v === 'string' && v.trim()) refs.push(v.trim());
  };
  push(record.chapter_ref);
  push(record.approval_ref);
  for (const t of record.traces_to ?? []) push(t);
  return refs;
}

export function run(ctx) {
  const findings = [];
  const known = collectKnownIds(ctx);

  for (const entry of Object.values(ctx.registers)) {
    for (const r of entry.doc?.records ?? []) {
      for (const ref of refFieldsOf(r)) {
        if (known.has(ref) || isInheritedRef(ref)) continue;
        findings.push(
          makeFinding(
            Severity.ERROR,
            'UNRESOLVED_REFERENCE',
            `${r.id ?? '(record)'} references unknown identifier "${ref}"`,
            entry.id
          )
        );
      }
    }
  }

  // REG-800 index rows should name a chapter that exists as a file.
  const indexRows = ctx.registers['REG-800']?.doc?.records ?? [];
  const chapterFileIds = new Set(ctx.chapters.map((c) => c.fileId));
  for (const row of indexRows) {
    if (row.id && !chapterFileIds.has(row.id)) {
      findings.push(
        makeFinding(Severity.ERROR, 'INDEX_ROW_WITHOUT_CHAPTER', `REG-800 indexes ${row.id} but no matching chapter file is present`, 'REG-800')
      );
    }
  }

  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStandalone('Cross-reference & traceability integrity', run);
}
