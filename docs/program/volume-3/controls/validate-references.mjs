// Control: cross-reference (referential) integrity for the Volume 3 corpus.
//
// Validates that every reference resolves to an existing artifact or an inherited
// Volume 0 / Volume 1 baseline artifact: corpus-index entries point at real
// chapter files with matching version/status; outcomes reference real
// stakeholders; requirements trace along the OUT->...->TEST chain in the correct
// order; governance-decision evidence_refs resolve; approval artifact_id / scope
// / closure_record resolve; every RATIFIED chapter is indexed.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  Severity,
  VOLUME_DIR,
  REQUIREMENT_CHAIN,
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

// Level prefix of a requirement/outcome id (e.g. "CAP-V3-001" -> "CAP").
function levelOf(id) {
  const m = String(id).match(/^([A-Z]+)-V3-[0-9]{3}$/);
  return m ? m[1] : null;
}

export function run(ctx) {
  const findings = [];

  const chapterById = new Map(ctx.chapters.map((c) => [c.fileId, c]));
  const registerIds = new Set(Object.keys(ctx.registers));
  const outcomeIds = idSet(ctx, 'REG-301');
  const stakeholderIds = idSet(ctx, 'REG-302');
  const requirementIds = idSet(ctx, 'REG-303');
  const decisionIds = idSet(ctx, 'REG-304');
  const approvalIds = idSet(ctx, 'REG-305');

  const resolves = (ref) => {
    if (isInheritedRef(ref)) return true;
    if (chapterById.has(ref)) return true;
    if (registerIds.has(ref)) return true;
    if (outcomeIds.has(ref)) return true;
    if (stakeholderIds.has(ref)) return true;
    if (requirementIds.has(ref)) return true;
    if (decisionIds.has(ref)) return true;
    if (approvalIds.has(ref)) return true;
    return false;
  };

  // Corpus index integrity.
  const corpus = records(ctx, 'REG-300');
  const indexed = new Set();
  for (const rec of corpus) {
    indexed.add(rec.id);
    const chapter = chapterById.get(rec.id);
    if (!chapter) {
      findings.push(
        makeFinding(Severity.ERROR, 'CORPUS_MISSING_CHAPTER', `REG-300 indexes ${rec.id} but no chapter file exists`, rec.id)
      );
      continue;
    }
    if (rec.path && !existsSync(join(VOLUME_DIR, '..', '..', '..', rec.path))) {
      findings.push(
        makeFinding(Severity.ERROR, 'CORPUS_BAD_PATH', `REG-300 path for ${rec.id} does not exist: ${rec.path}`, rec.id)
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
        makeFinding(Severity.ERROR, 'UNINDEXED_RATIFIED', `${ch.fileId}: RATIFIED chapter is not indexed in REG-300`, ch.fileId)
      );
    }
  }

  // Outcome cross-references.
  for (const out of records(ctx, 'REG-301')) {
    for (const s of out.stakeholder_refs ?? []) {
      if (!stakeholderIds.has(s)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${out.id}: stakeholder_ref ${s} does not resolve`, out.id));
      }
    }
    for (const s of out.source_refs ?? []) {
      if (!resolves(s)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${out.id}: source_ref ${s} does not resolve`, out.id));
      }
    }
  }

  // Requirement traceability along the OUT->...->TEST chain.
  for (const req of records(ctx, 'REG-303')) {
    const childLevel = req.level;
    const childPos = REQUIREMENT_CHAIN.indexOf(childLevel);
    let tracedToParentLevel = false;
    for (const t of req.traces_to ?? []) {
      if (isInheritedRef(t)) {
        tracedToParentLevel = true;
        continue;
      }
      if (!resolves(t)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${req.id}: traces_to ${t} does not resolve`, req.id));
        continue;
      }
      const parentLevel = levelOf(t);
      const parentPos = parentLevel ? REQUIREMENT_CHAIN.indexOf(parentLevel) : -1;
      if (parentPos >= 0 && childPos >= 0) {
        if (parentPos >= childPos) {
          findings.push(
            makeFinding(
              Severity.ERROR,
              'CHAIN_ORDER_VIOLATION',
              `${req.id} (${childLevel}) traces_to ${t} (${parentLevel}); parent must precede child in OUT->...->TEST`,
              req.id
            )
          );
        } else {
          tracedToParentLevel = true;
        }
      } else {
        tracedToParentLevel = true;
      }
    }
    if (!tracedToParentLevel && (req.traces_to ?? []).length > 0) {
      findings.push(
        makeFinding(Severity.WARNING, 'CHAIN_NO_PARENT', `${req.id}: no traces_to target precedes its level in the chain`, req.id)
      );
    }
    for (const a of req.acceptance_ref ?? []) {
      if (!requirementIds.has(a)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${req.id}: acceptance_ref ${a} does not resolve`, req.id));
      }
    }
  }

  // Governance decision references.
  for (const dec of records(ctx, 'REG-304')) {
    for (const ref of dec.evidence_refs ?? []) {
      const isGate = /^GATE-V3-G[0-9]$/.test(ref);
      if (!isGate && !resolves(ref)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${dec.id}: evidence_ref ${ref} does not resolve`, dec.id));
      }
    }
  }

  // Approval references.
  for (const app of records(ctx, 'REG-305')) {
    const art = app.artifact_id;
    const isPackage = /^PACKAGE-3-[0-9]$/.test(art);
    const isVolume = /^VOLUME-3$/.test(art);
    const isGate = /^GATE-V3-G[0-9]$/.test(art);
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
  await runStandalone('Volume 3 cross-reference integrity', run);
}
