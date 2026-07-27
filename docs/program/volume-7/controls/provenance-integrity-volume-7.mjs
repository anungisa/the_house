// Control: deterministic provenance and gate-chronology integrity for Volume 7.
//
// Fails closed on three governance defects that a lifecycle record can encode:
//
//   1. PROVENANCE_SOURCE_CONFLATION — a recorded source baseline equal to the
//      authoring commit while the branch base differs (the source baseline was
//      conflated with the authoring result).
//   2. GATE_EFFECTIVE_PREDATES_FREEZE — a passed gate whose effective commit
//      predates completion of a required freeze (the gate was dispositioned as
//      fully effective before its freeze condition was satisfied).
//   3. CLOSURE_NEXT_PACKAGE_DISPOSITION_MISSING — a closure record that omits the
//      bounded next-package disposition for the following package.
//   4. PACKAGE_CLOSED_WITHOUT_FREEZE — a package dispositioned as closed at its
//      gate while a required freeze condition remains unmet.
//   5. CLOSURE_EFFECTIVE_COMMIT_MISSING — a separation-enforced closure with no
//      recorded closure effective commit bound to the package freeze.
//   6. CLOSURE_EFFECTIVE_MISMATCH — a closure or gate effective commit that
//      differs from the required package freeze commit.
//   7. CLOSURE_TBD_AFTER_GATE_COMPLETED — unresolved-at-gate effective-date
//      wording when the named gate is already completed, unless the record
//      explicitly distinguishes documentary from implementation effectiveness.
//   8. AUTHORING_CLOSURE_NOT_SEPARATED — a package whose substantive authoring
//      commit equals its closure authoring commit without a recorded historical
//      sequence exception. The substantive authoring commit must not introduce
//      the closure chapter, gate disposition, or freeze approval; the closure
//      and gate effective commits must equal the package freeze commit; and a
//      recorded historical sequence exception remains visible and does not
//      satisfy the future separation requirement for later packages.
//
// From Package 3 onward the closure artifact, gate disposition, and freeze must
// be recorded separately from substantive authoring; earlier packages that were
// already reconciled by their own governance amendments are grandfathered.
//
// The control is read-only and register-driven. It reads REG-700 (corpus index)
// and REG-705 (approvals) and the parsed chapters from the loaded context.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, completedGates, loadContext, makeFinding, runStandalone } from './lib.mjs';

// The separation discipline (closure/gate/freeze committed apart from authoring)
// is enforced from Package 3 (Gate V7-G3) onward. Earlier packages that were
// already reconciled by their own governance amendments are grandfathered.
const ENFORCE_SEPARATION_FROM = 3;

function approvals(ctx) {
  return ctx.registers?.['REG-705']?.doc?.records ?? [];
}

function corpusRows(ctx) {
  return ctx.registers?.['REG-700']?.doc?.records ?? [];
}

function gateNumber(id) {
  const m = /^GATE-V7-G([0-9])$/.exec(id ?? '');
  return m ? Number(m[1]) : null;
}

function packageNumber(id) {
  const m = /^PACKAGE-7-([0-9])$/.exec(id ?? '');
  return m ? Number(m[1]) : null;
}

function isHistoricalException(value) {
  return /HISTORICAL_SEQUENCE_EXCEPTION_RECORDED|^RECORDED$/.test(String(value ?? '').trim().toUpperCase());
}

function normalizeGate(g) {
  return String(g ?? '').replace(/^GATE-/, '');
}

// Index authoring-versus-closure separation records by the freeze artifact.
function separationIndex(ctx) {
  const map = new Map();
  for (const a of approvals(ctx)) {
    const s = a.authoring_closure_separation;
    if (s?.freeze_artifact) map.set(s.freeze_artifact, { approval: a, separation: s });
  }
  return map;
}

// Index the freeze commit declared by each frozen freeze artifact.
function freezeCommitIndex(ctx) {
  const map = new Map();
  for (const a of approvals(ctx)) {
    if (a.frozen !== true) continue;
    const commit = a.package_provenance?.freeze_commit ?? a.package_provenance?.closure_freeze_commit;
    if (commit) map.set(a.artifact_id, commit);
  }
  return map;
}

// Index closure-effective bindings by the freeze artifact they close against.
function closureBindingIndex(ctx) {
  const map = new Map();
  for (const a of approvals(ctx)) {
    const b = a.closure_binding;
    const freezeArtifact = b?.freeze_artifact ?? a.requires_freeze_artifact;
    const closureEffective = b?.closure_effective_commit ?? a.closure_effective_commit;
    if (freezeArtifact && closureEffective) {
      map.set(freezeArtifact, {
        approval: a,
        binding: b ?? null,
        closureAuthored: b?.closure_authored_commit ?? null,
        closureEffective,
        gateEffective: b?.gate_effective_commit ?? a.gate_effective_commit ?? null,
        chronologyException: b?.chronology_exception ?? a.chronology_exception ?? null
      });
    }
  }
  return map;
}

// Defect 1: source baseline conflated with the authoring commit.
function checkSourceConflation(ctx, findings) {
  for (const a of approvals(ctx)) {
    const p = a.package_provenance;
    if (!p) continue;
    const source = p.source_baseline_commit;
    const authoring = p.authoring_commit;
    const branchBase = p.branch_base_commit;
    if (!source || !authoring) continue;
    if (source === authoring && branchBase && branchBase !== source) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'PROVENANCE_SOURCE_CONFLATION',
          `Source baseline ${source} equals the authoring commit while the branch base ${branchBase} differs`,
          a.id
        )
      );
    }
  }
}

// Defect 2: a passed gate whose effective commit predates freeze completion.
function checkGateChronology(ctx, findings) {
  // Index the freeze commit declared by each frozen freeze artifact.
  const freezeCommitByArtifact = new Map();
  for (const a of approvals(ctx)) {
    if (a.frozen !== true) continue;
    const commit = a.package_provenance?.freeze_commit ?? a.package_provenance?.closure_freeze_commit;
    if (commit) freezeCommitByArtifact.set(a.artifact_id, commit);
  }

  for (const a of approvals(ctx)) {
    if (!/^GATE-V7-G[0-9]$/.test(a.artifact_id ?? '')) continue;
    if (a.approval_state !== 'ratified' || !a.gate_disposition) continue;
    const required = a.requires_freeze_artifact;
    if (!required) continue; // gate declares no freeze dependency
    const effective = a.effective_commit;
    if (!effective) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'GATE_EFFECTIVE_COMMIT_MISSING',
          `Ratified gate ${a.artifact_id} requires freeze ${required} but declares no effective commit`,
          a.id
        )
      );
      continue;
    }
    const freezeCommit = freezeCommitByArtifact.get(required);
    if (!freezeCommit) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'GATE_FREEZE_ARTIFACT_MISSING',
          `Gate ${a.artifact_id} requires freeze artifact ${required}, which declares no freeze commit`,
          a.id
        )
      );
      continue;
    }
    if (effective !== freezeCommit) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'GATE_EFFECTIVE_PREDATES_FREEZE',
          `Gate ${a.artifact_id} effective commit ${effective} does not match the required freeze commit ${freezeCommit}; the gate cannot be effective before its freeze is complete`,
          a.id
        )
      );
    }
  }
}

// Defect 3: a closure record that omits the bounded next-package disposition.
function checkClosureDisposition(ctx, findings) {
  const approvalByArtifact = new Map(approvals(ctx).map((a) => [a.artifact_id, a]));
  for (const row of corpusRows(ctx)) {
    if (!/closure record/i.test(row.title ?? '')) continue;
    const ap = approvalByArtifact.get(row.id);
    if (!ap) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'CLOSURE_APPROVAL_MISSING',
          `Closure record ${row.id} has no approval record`,
          row.id
        )
      );
      continue;
    }
    if (!ap.next_package_disposition || !String(ap.next_package_disposition).trim()) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'CLOSURE_NEXT_PACKAGE_DISPOSITION_MISSING',
          `Closure record ${row.id} omits a bounded next-package disposition`,
          row.id
        )
      );
    }
  }
}

export function run(ctx) {
  const findings = [];
  checkSourceConflation(ctx, findings);
  checkGateChronology(ctx, findings);
  checkClosureDisposition(ctx, findings);
  checkClosureFreezeChronology(ctx, findings);
  checkAuthoringClosureSeparation(ctx, findings);
  checkEffectiveDateWording(ctx, findings);
  return findings;
}

// Defect 8: substantive authoring must be committed separately from the package
// closure chapter, gate disposition, and freeze approval. A recorded historical
// sequence exception remains visible and does not satisfy the future separation
// requirement. Closure-effective and gate-effective commits must equal the
// required package freeze commit.
function checkAuthoringClosureSeparation(ctx, findings) {
  for (const a of approvals(ctx)) {
    const s = a.authoring_closure_separation;
    if (!s || !s.freeze_artifact) continue;
    const n = packageNumber(s.freeze_artifact);
    if (n === null || n < ENFORCE_SEPARATION_FROM) continue;
    const exception =
      isHistoricalException(s.sequence_disposition) ||
      isHistoricalException(s.chronology_exception) ||
      isHistoricalException(a.chronology_exception);
    const same =
      s.substantive_authoring_commit &&
      s.closure_authored_commit &&
      s.substantive_authoring_commit === s.closure_authored_commit;
    if (same && !exception) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'AUTHORING_CLOSURE_NOT_SEPARATED',
          `Package ${s.freeze_artifact} substantive authoring commit ${s.substantive_authoring_commit} equals the closure authoring commit; the closure, gate disposition, and freeze must be committed separately from substantive authoring, and no historical sequence exception is recorded`,
          a.id
        )
      );
    } else if (same && exception) {
      findings.push(
        makeFinding(
          Severity.INFO,
          'AUTHORING_CLOSURE_HISTORICAL_EXCEPTION',
          `Package ${s.freeze_artifact} recorded a historical sequence exception at commit ${s.substantive_authoring_commit}; the exception remains visible and does not satisfy the future separation requirement (future_separation_required=${s.future_separation_required !== false})`,
          a.id
        )
      );
    }
    if (s.closure_effective_commit && s.freeze_commit && s.closure_effective_commit !== s.freeze_commit) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'SEPARATION_CLOSURE_EFFECTIVE_MISMATCH',
          `Package ${s.freeze_artifact} closure effective commit ${s.closure_effective_commit} does not match the freeze commit ${s.freeze_commit}`,
          a.id
        )
      );
    }
    if (s.gate_effective_commit && s.freeze_commit && s.gate_effective_commit !== s.freeze_commit) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'SEPARATION_GATE_EFFECTIVE_MISMATCH',
          `Package ${s.freeze_artifact} gate effective commit ${s.gate_effective_commit} does not match the freeze commit ${s.freeze_commit}`,
          a.id
        )
      );
    }
  }
}

// Defects 4-6: closure-versus-freeze chronology for separation-enforced gates.
function checkClosureFreezeChronology(ctx, findings) {
  const freezeIdx = freezeCommitIndex(ctx);
  const closureIdx = closureBindingIndex(ctx);
  for (const a of approvals(ctx)) {
    const n = gateNumber(a.artifact_id);
    if (n === null) continue;
    if (a.approval_state !== 'ratified' || !a.gate_disposition) continue;
    if (n < ENFORCE_SEPARATION_FROM) continue; // earlier packages grandfathered
    const freezeArtifact = a.requires_freeze_artifact;
    if (!freezeArtifact) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'PACKAGE_CLOSED_WITHOUT_FREEZE',
          `Gate ${a.artifact_id} is dispositioned but declares no required freeze artifact`,
          a.id
        )
      );
      continue;
    }
    const freezeCommit = freezeIdx.get(freezeArtifact);
    if (!freezeCommit) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'PACKAGE_CLOSED_WITHOUT_FREEZE',
          `Gate ${a.artifact_id} is dispositioned while the required freeze ${freezeArtifact} is not frozen or declares no freeze commit`,
          a.id
        )
      );
      continue;
    }
    const closure = closureIdx.get(freezeArtifact);
    if (!closure) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'CLOSURE_EFFECTIVE_COMMIT_MISSING',
          `No closure approval declares a closure effective commit bound to freeze ${freezeArtifact} for gate ${a.artifact_id}`,
          a.id
        )
      );
      continue;
    }
    if (closure.closureEffective !== freezeCommit) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'CLOSURE_EFFECTIVE_MISMATCH',
          `Closure effective commit ${closure.closureEffective} for freeze ${freezeArtifact} does not match the freeze commit ${freezeCommit}`,
          closure.approval.id
        )
      );
    }
    if (closure.gateEffective && closure.gateEffective !== freezeCommit) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'CLOSURE_EFFECTIVE_MISMATCH',
          `Gate effective commit ${closure.gateEffective} for freeze ${freezeArtifact} does not match the freeze commit ${freezeCommit}`,
          closure.approval.id
        )
      );
    }
  }
}

// Defect 7: unresolved-at-gate effective-date wording after the gate is complete.
function checkEffectiveDateWording(ctx, findings) {
  const done = completedGates(ctx);
  const clarifiedGates = new Set();
  for (const a of approvals(ctx)) {
    const c = a.effective_date_clarification;
    if (c?.gate && c?.documentary_definition_effective_commit && c?.implementation_effective_date) {
      clarifiedGates.add(normalizeGate(c.gate));
    }
  }
  for (const ch of ctx.chapters ?? []) {
    const m = /TBD \(Gate (V7-G[0-9])\)/.exec(ch.body ?? '');
    if (!m) continue;
    const gate = m[1];
    const num = Number(gate.slice(-1));
    if (num < ENFORCE_SEPARATION_FROM) continue; // earlier packages grandfathered
    if (!done.has(gate)) continue; // gate not yet completed — wording is acceptable
    if (!clarifiedGates.has(gate)) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'CLOSURE_TBD_AFTER_GATE_COMPLETED',
          `Chapter ${ch.fileId} uses unresolved-at-gate wording for completed gate ${gate} without a documentary-versus-implementation effectiveness clarification`,
          ch.fileId
        )
      );
    }
  }
}

// Non-authoritative deterministic chronology projection, one record per package
// that declares a closure-effective binding.
export function generate(ctx = loadContext()) {
  const closureIdx = closureBindingIndex(ctx);
  const freezeIdx = freezeCommitIndex(ctx);
  const clarByGate = new Map();
  for (const a of approvals(ctx)) {
    const c = a.effective_date_clarification;
    if (c?.gate) clarByGate.set(normalizeGate(c.gate), c);
  }
  const packages = [];
  for (const [freezeArtifact, closure] of closureIdx) {
    const gate = normalizeGate(closure.binding?.gate ?? '');
    const clar = clarByGate.get(gate) ?? null;
    packages.push({
      freeze_artifact: freezeArtifact,
      closure_artifact: closure.binding?.closure_artifact ?? null,
      gate: closure.binding?.gate ?? null,
      closure_authored_commit: closure.closureAuthored,
      closure_effective_commit: closure.closureEffective,
      freeze_commit: freezeIdx.get(freezeArtifact) ?? null,
      gate_effective_commit: closure.gateEffective,
      chronology_exception: closure.chronologyException,
      documentary_definition_effective_commit: clar?.documentary_definition_effective_commit ?? null,
      implementation_effective_date: clar?.implementation_effective_date ?? null,
      production_adoption_date: clar?.production_adoption_date ?? null,
      operational_effective_date: clar?.operational_effective_date ?? null
    });
  }
  const outDir = join(VOLUME_DIR, 'generated', 'provenance');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'package-chronology.json'),
    JSON.stringify(
      { note: 'NON-AUTHORITATIVE projection of closure/freeze chronology and effective-date clarifications.', packages },
      null,
      2
    ) + '\n',
    'utf8'
  );
  const sepIdx = separationIndex(ctx);
  const separations = [];
  for (const [freezeArtifact, entry] of sepIdx) {
    const s = entry.separation;
    const same = s.substantive_authoring_commit && s.closure_authored_commit && s.substantive_authoring_commit === s.closure_authored_commit;
    const exception = isHistoricalException(s.sequence_disposition) || isHistoricalException(s.chronology_exception) || isHistoricalException(entry.approval.chronology_exception);
    separations.push({
      freeze_artifact: freezeArtifact,
      approval: entry.approval.id,
      substantive_authoring_commit: s.substantive_authoring_commit ?? null,
      closure_authored_commit: s.closure_authored_commit ?? null,
      closure_effective_commit: s.closure_effective_commit ?? null,
      freeze_commit: s.freeze_commit ?? null,
      gate_effective_commit: s.gate_effective_commit ?? null,
      provenance_binding_commit: s.provenance_binding_commit ?? null,
      authoring_closure_separation: same ? (exception ? 'NOT_SATISFIED_HISTORICALLY' : 'NOT_SATISFIED') : 'SATISFIED',
      chronology_exception: exception ? 'RECORDED' : null,
      future_separation_required: s.future_separation_required !== false
    });
  }
  writeFileSync(
    join(outDir, 'authoring-closure-separation.json'),
    JSON.stringify(
      { note: 'NON-AUTHORITATIVE projection of authoring-versus-closure commit separation and recorded historical sequence exceptions.', separations },
      null,
      2
    ) + '\n',
    'utf8'
  );
  return { packages: packages.length, separations: separations.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Provenance & gate-chronology integrity', run);
}
