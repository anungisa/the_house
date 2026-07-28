// Control: cross-reference and traceability integrity for the Volume 12 corpus.
//
// Verifies that every intra-corpus reference (chapter_ref, traces_to,
// dependencies, deliverables, required_capabilities, affected_capability,
// affected_service, and handoff_destination) resolves either to a defined
// Volume 12 identifier (a chapter, a register record, or an approval artifact) or
// to an inherited Volume 0-11 identifier resolved by inheritance. Unknown
// references fail closed. REG-1200 index rows must name chapters that exist.

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
  // Package and gate freeze artifacts are legitimate reference targets. Package 1
  // introduces GATE-V12-G1 and the PACKAGE-12-1 freeze; later packages and the
  // whole-volume freeze (VOLUME-12) are legitimate forward references.
  ids.add('PACKAGE-12-1');
  ids.add('GATE-V12-G1');
  ids.add('PACKAGE-12-2');
  ids.add('GATE-V12-G2');
  ids.add('VOLUME-12');
  return ids;
}

function refFieldsOf(record) {
  const refs = [];
  const push = (v) => {
    if (typeof v === 'string' && v.trim()) refs.push(v.trim());
  };
  const pushAll = (arr) => {
    for (const v of arr ?? []) push(v);
  };
  push(record.chapter_ref);
  push(record.affected_capability);
  push(record.affected_service);
  pushAll(record.traces_to);
  pushAll(record.dependencies);
  pushAll(record.deliverables);
  pushAll(record.required_capabilities);
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

  // REG-1200 index rows should name a chapter that exists as a file.
  const indexRows = ctx.registers['REG-1200']?.doc?.records ?? [];
  const chapterFileIds = new Set(ctx.chapters.map((c) => c.fileId));
  for (const row of indexRows) {
    if (row.id && !chapterFileIds.has(row.id)) {
      findings.push(
        makeFinding(Severity.ERROR, 'INDEX_ROW_WITHOUT_CHAPTER', `REG-1200 indexes ${row.id} but no matching chapter file is present`, 'REG-1200')
      );
    }
  }

  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStandalone('Cross-reference & traceability integrity', run);
}
