// Control: cross-reference (referential) integrity for the Volume 6 corpus.
//
// Validates that every reference resolves to an existing artifact or an inherited
// Volume 0-5 baseline artifact: corpus-index entries point at real chapter files
// with matching version/status; threats reference resolvable assets, rights, and
// trust boundaries; privacy purposes map to resolvable (inherited) information
// domains; obligations reference resolvable control objectives; decisions,
// backlog items, and approvals reference resolvable artifacts; and every RATIFIED
// chapter is indexed.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  Severity,
  VOLUME_DIR,
  isInheritedRef,
  makeFinding,
  runStandalone
} from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

function idSet(ctx, regId, filter) {
  return new Set(records(ctx, regId).filter(filter ?? (() => true)).map((r) => r.id));
}

function refList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value).split(/[,\s]+/).filter(Boolean);
}

export function run(ctx) {
  const findings = [];

  const chapterById = new Map(ctx.chapters.map((c) => [c.fileId, c]));
  const registerIds = new Set(Object.keys(ctx.registers));
  const protectionIds = idSet(ctx, 'REG-601');
  const assetIds = idSet(ctx, 'REG-601', (r) => r.kind === 'ASSET');
  const rightIds = idSet(ctx, 'REG-601', (r) => r.kind === 'RIGHT');
  const boundaryIds = idSet(ctx, 'REG-601', (r) => r.kind === 'TRUST_BOUNDARY');
  const controlIds = idSet(ctx, 'REG-602');
  const controlObjectiveIds = idSet(ctx, 'REG-602', (r) => r.kind === 'CONTROL_OBJECTIVE');
  const decisionIds = idSet(ctx, 'REG-603');
  const backlogIds = idSet(ctx, 'REG-604');
  const approvalIds = idSet(ctx, 'REG-605');

  const resolves = (ref) => {
    if (isInheritedRef(ref)) return true;
    if (chapterById.has(ref)) return true;
    if (registerIds.has(ref)) return true;
    if (protectionIds.has(ref)) return true;
    if (controlIds.has(ref)) return true;
    if (decisionIds.has(ref)) return true;
    if (backlogIds.has(ref)) return true;
    if (approvalIds.has(ref)) return true;
    return false;
  };

  // Corpus index integrity.
  const corpus = records(ctx, 'REG-600');
  const indexed = new Set();
  for (const rec of corpus) {
    indexed.add(rec.id);
    const chapter = chapterById.get(rec.id);
    if (!chapter) {
      findings.push(makeFinding(Severity.ERROR, 'CORPUS_MISSING_CHAPTER', `REG-600 indexes ${rec.id} but no chapter file exists`, rec.id));
      continue;
    }
    if (rec.path && !existsSync(join(VOLUME_DIR, '..', '..', '..', rec.path))) {
      findings.push(makeFinding(Severity.ERROR, 'CORPUS_BAD_PATH', `REG-600 path for ${rec.id} does not exist: ${rec.path}`, rec.id));
    }
    if (chapter.version && rec.version && chapter.version !== rec.version) {
      findings.push(makeFinding(Severity.ERROR, 'CORPUS_VERSION_MISMATCH', `${rec.id}: corpus version ${rec.version} != chapter version ${chapter.version}`, rec.id));
    }
    if (chapter.status && rec.status && chapter.status !== rec.status) {
      findings.push(makeFinding(Severity.ERROR, 'CORPUS_STATUS_MISMATCH', `${rec.id}: corpus status ${rec.status} != chapter status ${chapter.status}`, rec.id));
    }
  }

  for (const ch of ctx.chapters) {
    if (ch.status === 'RATIFIED' && !indexed.has(ch.fileId)) {
      findings.push(makeFinding(Severity.ERROR, 'UNINDEXED_RATIFIED', `${ch.fileId}: RATIFIED chapter is not indexed in REG-600`, ch.fileId));
    }
  }

  // Assets, actors, boundaries, threats, and rights references.
  for (const rec of records(ctx, 'REG-601')) {
    if (rec.chapter_ref && !resolves(rec.chapter_ref)) {
      findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${rec.id}: chapter_ref ${rec.chapter_ref} does not resolve`, rec.id));
    }
    for (const t of rec.traces_to ?? []) {
      if (!resolves(t)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${rec.id}: traces_to ${t} does not resolve`, rec.id));
      }
    }
    if (rec.kind === 'THREAT' || rec.kind === 'ABUSE_CASE') {
      if (rec.affected_asset && !assetIds.has(rec.affected_asset) && !isInheritedRef(rec.affected_asset)) {
        findings.push(makeFinding(Severity.ERROR, 'THREAT_ASSET_UNRESOLVED', `${rec.id}: affected_asset ${rec.affected_asset} does not resolve to a catalogued asset`, rec.id));
      }
      if (rec.affected_right && !rightIds.has(rec.affected_right)) {
        findings.push(makeFinding(Severity.ERROR, 'THREAT_RIGHT_UNRESOLVED', `${rec.id}: affected_right ${rec.affected_right} does not resolve to a catalogued right`, rec.id));
      }
      if (rec.trust_boundary && !boundaryIds.has(rec.trust_boundary)) {
        findings.push(makeFinding(Severity.ERROR, 'THREAT_BOUNDARY_UNRESOLVED', `${rec.id}: trust_boundary ${rec.trust_boundary} does not resolve to a catalogued boundary`, rec.id));
      }
    }
    if (rec.kind === 'ASSET') {
      for (const d of rec.information_domains ?? []) {
        if (!isInheritedRef(d)) {
          findings.push(makeFinding(Severity.ERROR, 'ASSET_DOMAIN_UNRESOLVED', `${rec.id}: information domain ${d} does not resolve to an inherited governed domain`, rec.id));
        }
      }
    }
  }

  // Obligations, controls, accessibility, and assurance references.
  for (const rec of records(ctx, 'REG-602')) {
    if (rec.chapter_ref && !resolves(rec.chapter_ref)) {
      findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${rec.id}: chapter_ref ${rec.chapter_ref} does not resolve`, rec.id));
    }
    for (const t of rec.traces_to ?? []) {
      if (!resolves(t)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${rec.id}: traces_to ${t} does not resolve`, rec.id));
      }
    }
    if (rec.kind === 'PROCESSING_PURPOSE') {
      for (const d of rec.information_domains ?? []) {
        if (!isInheritedRef(d)) {
          findings.push(makeFinding(Severity.ERROR, 'PURPOSE_DOMAIN_UNRESOLVED', `${rec.id}: information domain ${d} does not resolve to an inherited governed domain`, rec.id));
        }
      }
    }
    if (rec.kind === 'OBLIGATION' || rec.kind === 'COMPLIANCE_OBLIGATION') {
      for (const cref of refList(rec.control_objective_ref)) {
        if (!controlObjectiveIds.has(cref) && !isInheritedRef(cref)) {
          findings.push(makeFinding(Severity.ERROR, 'OBLIGATION_CONTROL_UNRESOLVED', `${rec.id}: control_objective_ref ${cref} does not resolve to a control objective`, rec.id));
        }
      }
    }
    if (rec.protected_asset_or_right) {
      for (const pref of refList(rec.protected_asset_or_right)) {
        if (!assetIds.has(pref) && !rightIds.has(pref) && !isInheritedRef(pref)) {
          findings.push(makeFinding(Severity.ERROR, 'PROTECTED_TARGET_UNRESOLVED', `${rec.id}: protected_asset_or_right ${pref} does not resolve`, rec.id));
        }
      }
    }
  }

  // Decision references.
  for (const dec of records(ctx, 'REG-603')) {
    if (dec.chapter_ref && !resolves(dec.chapter_ref)) {
      findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${dec.id}: chapter_ref ${dec.chapter_ref} does not resolve`, dec.id));
    }
    for (const ref of dec.evidence_refs ?? []) {
      if (!resolves(ref)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${dec.id}: evidence_ref ${ref} does not resolve`, dec.id));
      }
    }
    for (const t of dec.traces_to ?? []) {
      if (!resolves(t)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${dec.id}: traces_to ${t} does not resolve`, dec.id));
      }
    }
  }

  // Backlog references.
  for (const item of records(ctx, 'REG-604')) {
    if (item.chapter_ref && !resolves(item.chapter_ref)) {
      findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${item.id}: chapter_ref ${item.chapter_ref} does not resolve`, item.id));
    }
    for (const t of item.traces_to ?? []) {
      if (!resolves(t)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${item.id}: traces_to ${t} does not resolve`, item.id));
      }
    }
  }

  // Approval references.
  for (const app of records(ctx, 'REG-605')) {
    const art = app.artifact_id;
    const isPackage = /^PACKAGE-6-[0-9]$/.test(art);
    const isVolume = /^VOLUME-6$/.test(art);
    const isGate = /^GATE-V6-G[0-9]$/.test(art);
    const isDecision = /^ADR-V6-[0-9]{3}$/.test(art);
    if (!isPackage && !isVolume && !isGate && !chapterById.has(art) && !(isDecision && decisionIds.has(art))) {
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
    for (const fa of app.frozen_artifacts ?? []) {
      if (!chapterById.has(fa.id)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${app.id}: frozen artifact ${fa.id} does not resolve`, app.id));
      }
    }
  }

  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runStandalone('Volume 6 cross-reference integrity', run);
}
