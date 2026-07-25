// Control: cross-reference (referential) integrity for the Volume 1 corpus.
//
// Validates that every reference resolves to an existing artifact: corpus-index
// entries point at real chapter files with matching version/status; evidence,
// capability, finding, contradiction and qualification-decision cross-references
// resolve; governance decision evidence_refs resolve; approval artifact_id /
// scope / closure_record resolve; every RATIFIED chapter is indexed.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

function idSet(ctx, regId) {
  return new Set(records(ctx, regId).map((r) => r.id));
}

export function run(ctx) {
  const findings = [];

  const chapterById = new Map(ctx.chapters.map((c) => [c.fileId, c]));
  const registerIds = new Set(Object.keys(ctx.registers));
  const sourceIds = idSet(ctx, 'REG-101');
  const evidenceIds = idSet(ctx, 'REG-102');
  const capabilityIds = idSet(ctx, 'REG-103');
  const findingIds = idSet(ctx, 'REG-104');
  const decisionIds = idSet(ctx, 'REG-107');
  const approvalIds = idSet(ctx, 'REG-108');

  const resolves = (ref) => {
    if (sourceIds.has(ref)) return true;
    if (evidenceIds.has(ref)) return true;
    if (capabilityIds.has(ref)) return true;
    if (findingIds.has(ref)) return true;
    if (chapterById.has(ref)) return true;
    if (registerIds.has(ref)) return true;
    if (decisionIds.has(ref)) return true;
    if (approvalIds.has(ref)) return true;
    return false;
  };

  // Corpus index integrity.
  const corpus = records(ctx, 'REG-100');
  const indexed = new Set();
  for (const rec of corpus) {
    indexed.add(rec.id);
    const chapter = chapterById.get(rec.id);
    if (!chapter) {
      findings.push(
        makeFinding(Severity.ERROR, 'CORPUS_MISSING_CHAPTER', `REG-100 indexes ${rec.id} but no chapter file exists`, rec.id)
      );
      continue;
    }
    if (rec.path && !existsSync(join(VOLUME_DIR, '..', '..', '..', rec.path))) {
      findings.push(
        makeFinding(Severity.ERROR, 'CORPUS_BAD_PATH', `REG-100 path for ${rec.id} does not exist: ${rec.path}`, rec.id)
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

  for (const ch of ctx.chapters) {
    if (ch.status === 'RATIFIED' && !indexed.has(ch.fileId)) {
      findings.push(
        makeFinding(Severity.ERROR, 'UNINDEXED_RATIFIED', `${ch.fileId}: RATIFIED chapter is not indexed in REG-100`, ch.fileId)
      );
    }
  }

  // Evidence -> source references.
  for (const ev of records(ctx, 'REG-102')) {
    if (!sourceIds.has(ev.source_ref)) {
      findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${ev.id}: source_ref ${ev.source_ref} does not resolve`, ev.id));
    }
    for (const c of ev.capability_refs ?? []) {
      if (!capabilityIds.has(c)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${ev.id}: capability_ref ${c} does not resolve`, ev.id));
      }
    }
  }

  // Capability cross-references.
  for (const cap of records(ctx, 'REG-103')) {
    for (const s of cap.source_refs ?? []) {
      if (!sourceIds.has(s)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${cap.id}: source_ref ${s} does not resolve`, cap.id));
      }
    }
    for (const f of cap.finding_refs ?? []) {
      if (!findingIds.has(f)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${cap.id}: finding_ref ${f} does not resolve`, cap.id));
      }
    }
  }

  // Finding cross-references.
  for (const fnd of records(ctx, 'REG-104')) {
    for (const s of fnd.source_refs ?? []) {
      if (!resolves(s)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${fnd.id}: source_ref ${s} does not resolve`, fnd.id));
      }
    }
    for (const c of fnd.capability_refs ?? []) {
      if (!capabilityIds.has(c)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${fnd.id}: capability_ref ${c} does not resolve`, fnd.id));
      }
    }
  }

  // Contradiction position sources.
  for (const con of records(ctx, 'REG-105')) {
    for (const p of con.positions ?? []) {
      if (!sourceIds.has(p.source_ref)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${con.id}: position source_ref ${p.source_ref} does not resolve`, con.id));
      }
    }
  }

  // Qualification-decision references.
  for (const qd of records(ctx, 'REG-106')) {
    if (!capabilityIds.has(qd.capability_ref)) {
      findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${qd.id}: capability_ref ${qd.capability_ref} does not resolve`, qd.id));
    }
    for (const ref of qd.evidence_refs ?? []) {
      if (!resolves(ref)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${qd.id}: evidence_ref ${ref} does not resolve`, qd.id));
      }
    }
  }

  // Governance decision references.
  for (const dec of records(ctx, 'REG-107')) {
    for (const ref of dec.evidence_refs ?? []) {
      const isGate = /^GATE-V1-G[0-9]$/.test(ref);
      if (!isGate && !resolves(ref)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${dec.id}: evidence_ref ${ref} does not resolve`, dec.id));
      }
    }
  }

  // Approval references.
  for (const app of records(ctx, 'REG-108')) {
    const art = app.artifact_id;
    const isPackage = /^PACKAGE-[0-9]$/.test(art);
    const isGate = /^GATE-V1-G[0-9]$/.test(art);
    if (!isPackage && !isGate && !chapterById.has(art) && !decisionIds.has(art)) {
      findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${app.id}: artifact_id ${art} does not resolve`, app.id));
    }
    for (const s of app.scope ?? []) {
      if (!chapterById.has(s)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${app.id}: scope entry ${s} does not resolve`, app.id));
      }
    }
    if (app.closure_record && !chapterById.has(app.closure_record)) {
      findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${app.id}: closure_record ${app.closure_record} does not resolve`, app.id));
    }
  }

  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runStandalone('Volume 1 cross-reference integrity', run);
}
