// Control: cross-reference (referential) integrity for the Volume 4 corpus.
//
// Validates that every reference resolves to an existing artifact or an inherited
// Volume 0 / 1 / 2 / 3 baseline artifact: corpus-index entries point at real
// chapter files with matching version/status; architecture elements trace along
// the ARCH->...->DEP order; architecture decisions, fitness functions,
// assumptions, and approvals reference resolvable artifacts; every RATIFIED
// chapter is indexed.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  Severity,
  VOLUME_DIR,
  ARCHITECTURE_CHAIN,
  isInheritedRef,
  makeFinding,
  runStandalone
} from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

function idSet(ctx, regId) {
  return new Set(records(ctx, regId).map((r) => r.id));
}

// Kind prefix of an architecture element id (e.g. "MOD-V4-001" -> "MOD").
function kindOf(id) {
  const m = String(id).match(/^([A-Z]+)-V4-[0-9]{3}$/);
  return m ? m[1] : null;
}

export function run(ctx) {
  const findings = [];

  const chapterById = new Map(ctx.chapters.map((c) => [c.fileId, c]));
  const registerIds = new Set(Object.keys(ctx.registers));
  const architectureIds = idSet(ctx, 'REG-401');
  const decisionIds = idSet(ctx, 'REG-402');
  const fitnessIds = idSet(ctx, 'REG-403');
  const assumptionIds = idSet(ctx, 'REG-404');
  const approvalIds = idSet(ctx, 'REG-405');

  const resolves = (ref) => {
    if (isInheritedRef(ref)) return true;
    if (chapterById.has(ref)) return true;
    if (registerIds.has(ref)) return true;
    if (architectureIds.has(ref)) return true;
    if (decisionIds.has(ref)) return true;
    if (fitnessIds.has(ref)) return true;
    if (assumptionIds.has(ref)) return true;
    if (approvalIds.has(ref)) return true;
    return false;
  };

  // Corpus index integrity.
  const corpus = records(ctx, 'REG-400');
  const indexed = new Set();
  for (const rec of corpus) {
    indexed.add(rec.id);
    const chapter = chapterById.get(rec.id);
    if (!chapter) {
      findings.push(
        makeFinding(Severity.ERROR, 'CORPUS_MISSING_CHAPTER', `REG-400 indexes ${rec.id} but no chapter file exists`, rec.id)
      );
      continue;
    }
    if (rec.path && !existsSync(join(VOLUME_DIR, '..', '..', '..', rec.path))) {
      findings.push(
        makeFinding(Severity.ERROR, 'CORPUS_BAD_PATH', `REG-400 path for ${rec.id} does not exist: ${rec.path}`, rec.id)
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
        makeFinding(Severity.ERROR, 'UNINDEXED_RATIFIED', `${ch.fileId}: RATIFIED chapter is not indexed in REG-400`, ch.fileId)
      );
    }
  }

  // Architecture element traceability along the ARCH->...->DEP order.
  for (const el of records(ctx, 'REG-401')) {
    const childKind = el.kind;
    const childPos = ARCHITECTURE_CHAIN.indexOf(childKind);
    let tracedToParent = false;
    for (const t of el.traces_to ?? []) {
      if (isInheritedRef(t)) {
        tracedToParent = true;
        continue;
      }
      if (!resolves(t)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${el.id}: traces_to ${t} does not resolve`, el.id));
        continue;
      }
      const parentKind = kindOf(t);
      const parentPos = parentKind ? ARCHITECTURE_CHAIN.indexOf(parentKind) : -1;
      if (parentPos >= 0 && childPos >= 0 && parentPos >= childPos) {
        findings.push(
          makeFinding(
            Severity.WARNING,
            'CHAIN_ORDER_NOTE',
            `${el.id} (${childKind}) traces_to ${t} (${parentKind}); parent normally precedes child in ARCH->...->DEP`,
            el.id
          )
        );
      } else {
        tracedToParent = true;
      }
    }
    for (const c of el.constrains ?? []) {
      if (!resolves(c)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${el.id}: constrains ${c} does not resolve`, el.id));
      }
    }
    if (!tracedToParent && (el.traces_to ?? []).length > 0) {
      findings.push(
        makeFinding(Severity.INFO, 'CHAIN_NO_PARENT', `${el.id}: no traces_to target precedes its kind in the architecture order`, el.id)
      );
    }
    if (el.chapter_ref && !resolves(el.chapter_ref)) {
      findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${el.id}: chapter_ref ${el.chapter_ref} does not resolve`, el.id));
    }
  }

  // Architecture decision references.
  for (const dec of records(ctx, 'REG-402')) {
    for (const ref of dec.evidence_refs ?? []) {
      if (!resolves(ref)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${dec.id}: evidence_ref ${ref} does not resolve`, dec.id));
      }
    }
    if (dec.chapter_ref && !resolves(dec.chapter_ref)) {
      findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${dec.id}: chapter_ref ${dec.chapter_ref} does not resolve`, dec.id));
    }
  }

  // Fitness-function references.
  for (const fit of records(ctx, 'REG-403')) {
    for (const t of fit.traces_to ?? []) {
      if (!resolves(t)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${fit.id}: traces_to ${t} does not resolve`, fit.id));
      }
    }
    if (fit.chapter_ref && !resolves(fit.chapter_ref)) {
      findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${fit.id}: chapter_ref ${fit.chapter_ref} does not resolve`, fit.id));
    }
  }

  // Assumption / risk / exception references.
  for (const asm of records(ctx, 'REG-404')) {
    for (const t of asm.traces_to ?? []) {
      if (!resolves(t)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${asm.id}: traces_to ${t} does not resolve`, asm.id));
      }
    }
    if (asm.chapter_ref && !resolves(asm.chapter_ref)) {
      findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${asm.id}: chapter_ref ${asm.chapter_ref} does not resolve`, asm.id));
    }
  }

  // Approval references.
  for (const app of records(ctx, 'REG-405')) {
    const art = app.artifact_id;
    const isPackage = /^PACKAGE-4-[0-9]$/.test(art);
    const isVolume = /^VOLUME-4$/.test(art);
    const isGate = /^GATE-V4-G[0-9]$/.test(art);
    if (!isPackage && !isVolume && !isGate && !chapterById.has(art) && !decisionIds.has(art)) {
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
  await runStandalone('Volume 4 cross-reference integrity', run);
}
