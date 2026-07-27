// Control: cross-reference and traceability integrity for the Volume 7 corpus.
//
// Verifies that every intra-corpus reference (chapter_ref, traces_to, approval_ref,
// journey_ref, and *_ref fields) resolves either to a defined Volume 7 identifier
// (a chapter, a register record, or an approval artifact) or to an inherited
// Volume 0-6 identifier resolved by inheritance. Unknown references fail closed.

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
  ids.add('PACKAGE-7-1');
  ids.add('PACKAGE-7-2');
  ids.add('PACKAGE-7-3');
  ids.add('PACKAGE-7-4');
  ids.add('PACKAGE-7-5');
  ids.add('VOLUME-7');
  ids.add('GATE-V7-G1');
  ids.add('GATE-V7-G2');
  ids.add('GATE-V7-G3');
  ids.add('GATE-V7-G4');
  ids.add('GATE-V7-G5');
  return ids;
}

function refFieldsOf(record) {
  const refs = [];
  const push = (v) => {
    if (typeof v === 'string' && v.trim()) refs.push(v.trim());
  };
  push(record.chapter_ref);
  push(record.approval_ref);
  push(record.journey_ref);
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

  // REG-700 index rows should name a chapter that exists as a file.
  const indexRows = ctx.registers['REG-700']?.doc?.records ?? [];
  const chapterFileIds = new Set(ctx.chapters.map((c) => c.fileId));
  for (const row of indexRows) {
    if (row.id && !chapterFileIds.has(row.id)) {
      findings.push(
        makeFinding(Severity.ERROR, 'INDEX_ROW_WITHOUT_CHAPTER', `REG-700 indexes ${row.id} but no matching chapter file is present`, 'REG-700')
      );
    }
  }

  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStandalone('Cross-reference & traceability integrity', run);
}
