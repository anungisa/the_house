// Control: cross-reference (referential) integrity for the Volume 5 corpus.
//
// Validates that every reference resolves to an existing artifact or an inherited
// Volume 0-4 baseline artifact: corpus-index entries point at real chapter files
// with matching version/status; conceptual entities and relationships reference
// resolvable domains and entities; rules, decisions, backlog items, and approvals
// reference resolvable artifacts; every RATIFIED chapter is indexed.

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

export function run(ctx) {
  const findings = [];

  const chapterById = new Map(ctx.chapters.map((c) => [c.fileId, c]));
  const registerIds = new Set(Object.keys(ctx.registers));
  const catalogueIds = idSet(ctx, 'REG-501');
  const domainIds = idSet(ctx, 'REG-501', (r) => r.kind === 'INFORMATION_DOMAIN');
  const entityIds = idSet(
    ctx,
    'REG-501',
    (r) =>
      r.kind === 'CONCEPTUAL_ENTITY' ||
      r.kind === 'LOGICAL_ENTITY' ||
      r.kind === 'VALUE_OBJECT' ||
      r.kind === 'STATE_RECORD' ||
      r.kind === 'SNAPSHOT' ||
      r.kind === 'PROVENANCE_RECORD' ||
      r.kind === 'CORRECTION_RECORD' ||
      r.kind === 'REFERENCE_DATA' ||
      r.kind === 'CODE_SET'
  );
  const ruleIds = idSet(ctx, 'REG-502');
  const decisionIds = idSet(ctx, 'REG-503');
  const backlogIds = idSet(ctx, 'REG-504');
  const approvalIds = idSet(ctx, 'REG-505');

  const resolves = (ref) => {
    if (isInheritedRef(ref)) return true;
    if (chapterById.has(ref)) return true;
    if (registerIds.has(ref)) return true;
    if (catalogueIds.has(ref)) return true;
    if (ruleIds.has(ref)) return true;
    if (decisionIds.has(ref)) return true;
    if (backlogIds.has(ref)) return true;
    if (approvalIds.has(ref)) return true;
    return false;
  };

  // Corpus index integrity.
  const corpus = records(ctx, 'REG-500');
  const indexed = new Set();
  for (const rec of corpus) {
    indexed.add(rec.id);
    const chapter = chapterById.get(rec.id);
    if (!chapter) {
      findings.push(makeFinding(Severity.ERROR, 'CORPUS_MISSING_CHAPTER', `REG-500 indexes ${rec.id} but no chapter file exists`, rec.id));
      continue;
    }
    if (rec.path && !existsSync(join(VOLUME_DIR, '..', '..', '..', rec.path))) {
      findings.push(makeFinding(Severity.ERROR, 'CORPUS_BAD_PATH', `REG-500 path for ${rec.id} does not exist: ${rec.path}`, rec.id));
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
      findings.push(makeFinding(Severity.ERROR, 'UNINDEXED_RATIFIED', `${ch.fileId}: RATIFIED chapter is not indexed in REG-500`, ch.fileId));
    }
  }

  // Data-catalogue references: entity owning_domain and relationship endpoints.
  for (const rec of records(ctx, 'REG-501')) {
    if (rec.chapter_ref && !resolves(rec.chapter_ref)) {
      findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${rec.id}: chapter_ref ${rec.chapter_ref} does not resolve`, rec.id));
    }
    for (const t of rec.traces_to ?? []) {
      if (!resolves(t)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${rec.id}: traces_to ${t} does not resolve`, rec.id));
      }
    }
    if (rec.kind === 'CONCEPTUAL_ENTITY' || rec.kind === 'LOGICAL_ENTITY') {
      if (!rec.owning_domain) {
        findings.push(makeFinding(Severity.ERROR, 'ENTITY_WITHOUT_DOMAIN', `${rec.id}: entity names no owning_domain`, rec.id));
      } else if (!domainIds.has(rec.owning_domain)) {
        findings.push(makeFinding(Severity.ERROR, 'ENTITY_DOMAIN_UNRESOLVED', `${rec.id}: owning_domain ${rec.owning_domain} does not resolve to a governed domain`, rec.id));
      }
    }
    if (rec.kind === 'CONCEPTUAL_RELATIONSHIP' || rec.kind === 'LOGICAL_RELATIONSHIP') {
      const endpoints = rec.endpoints ?? [];
      if (endpoints.length < 2) {
        findings.push(makeFinding(Severity.ERROR, 'RELATIONSHIP_ENDPOINTS', `${rec.id}: relationship needs at least two endpoints`, rec.id));
      }
      for (const ep of endpoints) {
        if (!entityIds.has(ep) && !domainIds.has(ep)) {
          findings.push(makeFinding(Severity.ERROR, 'RELATIONSHIP_ENDPOINT_UNRESOLVED', `${rec.id}: endpoint ${ep} does not resolve to an entity or domain`, rec.id));
        }
      }
    }
  }

  // Data-rules-and-controls references.
  for (const rule of records(ctx, 'REG-502')) {
    if (rule.chapter_ref && !resolves(rule.chapter_ref)) {
      findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${rule.id}: chapter_ref ${rule.chapter_ref} does not resolve`, rule.id));
    }
    for (const t of rule.traces_to ?? []) {
      if (!resolves(t)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${rule.id}: traces_to ${t} does not resolve`, rule.id));
      }
    }
    for (const d of rule.affected_domains ?? []) {
      if (!domainIds.has(d) && !isInheritedRef(d)) {
        findings.push(makeFinding(Severity.ERROR, 'BROKEN_REFERENCE', `${rule.id}: affected_domain ${d} does not resolve`, rule.id));
      }
    }
  }

  // Decision references.
  for (const dec of records(ctx, 'REG-503')) {
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
  for (const item of records(ctx, 'REG-504')) {
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
  for (const app of records(ctx, 'REG-505')) {
    const art = app.artifact_id;
    const isPackage = /^PACKAGE-5-[0-9]$/.test(art);
    const isVolume = /^VOLUME-5$/.test(art);
    const isGate = /^GATE-V5-G[0-9]$/.test(art);
    const isDecision = /^ADR-V5-[0-9]{3}$/.test(art);
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
  await runStandalone('Volume 5 cross-reference integrity', run);
}
