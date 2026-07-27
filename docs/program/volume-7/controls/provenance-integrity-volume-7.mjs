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
//
// The control is read-only and register-driven. It reads REG-700 (corpus index)
// and REG-705 (approvals) from the loaded context.

import { Severity, makeFinding, runStandalone } from './lib.mjs';

function approvals(ctx) {
  return ctx.registers?.['REG-705']?.doc?.records ?? [];
}

function corpusRows(ctx) {
  return ctx.registers?.['REG-700']?.doc?.records ?? [];
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
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStandalone('Provenance & gate-chronology integrity', run);
}
