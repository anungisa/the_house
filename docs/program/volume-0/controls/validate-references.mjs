// Control: cross-reference (referential) integrity for the Volume 0 corpus.
//
// Validates that every reference resolves to an existing artifact: corpus-index
// entries point at real chapter files with matching version/status; decision
// evidence_refs resolve; approval artifact_id / scope / closure_record resolve;
// every RATIFIED chapter is indexed; superseded artifacts are not cited as current.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, makeFinding, runStandalone } from './lib.mjs';

const KNOWN_GATES = new Set(['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9']);

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

export function run(ctx) {
  const findings = [];

  const chapterById = new Map(ctx.chapters.map((c) => [c.fileId, c]));
  const registerIds = new Set(Object.keys(ctx.registers));
  const decisionIds = new Set(records(ctx, 'REG-002').map((r) => r.id));
  const approvalIds = new Set(records(ctx, 'REG-006').map((r) => r.id));
  const supersededChapters = new Set(
    ctx.chapters.filter((c) => c.status === 'SUPERSEDED').map((c) => c.fileId)
  );

  const knownRefs = new Set([
    ...chapterById.keys(),
    ...registerIds,
    ...decisionIds,
    ...approvalIds
  ]);

  // Corpus index integrity.
  const corpus = records(ctx, 'REG-000');
  const indexed = new Set();
  for (const rec of corpus) {
    indexed.add(rec.id);
    const chapter = chapterById.get(rec.id);
    if (!chapter) {
      findings.push(
        makeFinding(Severity.ERROR, 'CORPUS_MISSING_CHAPTER', `REG-000 indexes ${rec.id} but no chapter file exists`, rec.id)
      );
      continue;
    }
    if (rec.path && !existsSync(join(VOLUME_DIR, '..', '..', '..', rec.path))) {
      findings.push(
        makeFinding(Severity.ERROR, 'CORPUS_BAD_PATH', `REG-000 path for ${rec.id} does not exist: ${rec.path}`, rec.id)
      );
    }
    if (chapter.version && rec.version && chapter.version !== rec.version) {
      findings.push(
        makeFinding(Severity.ERROR, 'CORPUS_VERSION_MISMATCH', `${rec.id}: corpus version ${rec.version} != chapter version ${chapter.version}`, rec.id)
      );
    }
    if (chapter.status && rec.status && chapter.status !== rec.status) {
      findings.push(
        makeFinding(Severity.ERROR, 'CORPUS_STATUS_MISMATCH', `${rec.id}: corpus status ${rec.status} != chapter status ${chapter.status}`, rec.id)
      );
    }
  }

  // Every RATIFIED chapter must be indexed in the corpus.
  for (const ch of ctx.chapters) {
    if (ch.status === 'RATIFIED' && !indexed.has(ch.fileId)) {
      findings.push(
        makeFinding(Severity.ERROR, 'UNINDEXED_RATIFIED', `${ch.fileId}: RATIFIED chapter is not indexed in REG-000`, ch.fileId)
      );
    }
  }

  // Decision evidence references.
  for (const dec of records(ctx, 'REG-002')) {
    for (const ref of dec.evidence_refs ?? []) {
      if (!knownRefs.has(ref)) {
        findings.push(
          makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${dec.id}: evidence_ref ${ref} does not resolve`, dec.id)
        );
      } else if (supersededChapters.has(ref)) {
        findings.push(
          makeFinding(Severity.WARNING, 'SUPERSEDED_REFERENCE', `${dec.id}: references superseded artifact ${ref}`, dec.id)
        );
      }
    }
  }

  // Approval references.
  for (const app of records(ctx, 'REG-006')) {
    const art = app.artifact_id;
    const isPackage = /^PACKAGE-[0-9]$/.test(art);
    if (!isPackage && !chapterById.has(art) && !decisionIds.has(art)) {
      findings.push(
        makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${app.id}: artifact_id ${art} does not resolve`, app.id)
      );
    }
    for (const s of app.scope ?? []) {
      if (!chapterById.has(s)) {
        findings.push(
          makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${app.id}: scope entry ${s} does not resolve`, app.id)
        );
      }
    }
    if (app.closure_record && !chapterById.has(app.closure_record)) {
      findings.push(
        makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${app.id}: closure_record ${app.closure_record} does not resolve`, app.id)
      );
    }
  }

  // RAID gate impact references.
  for (const raid of records(ctx, 'REG-003')) {
    if (raid.gate_impact && !KNOWN_GATES.has(raid.gate_impact)) {
      findings.push(
        makeFinding(Severity.WARNING, 'UNKNOWN_GATE', `${raid.id}: gate_impact ${raid.gate_impact} is not a known gate`, raid.id)
      );
    }
  }

  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runStandalone('Volume 0 cross-reference integrity', run);
}
