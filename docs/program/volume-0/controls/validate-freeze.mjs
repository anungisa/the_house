// Control: freeze and amendment integrity for frozen Volume 0 packages.
//
// A frozen package must have a closure record, a closure decision, an approval,
// a recorded base commit, and a stated amendment process. Once frozen, any change
// to an artifact's ratified version requires a matching amendment decision.

import { Severity, makeFinding, runStandalone } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

export function run(ctx) {
  const findings = [];
  const approvals = records(ctx, 'REG-006');
  const decisions = records(ctx, 'REG-002');
  const chapterIds = new Set(ctx.chapters.map((c) => c.fileId));
  const corpusVersion = new Map(records(ctx, 'REG-000').map((r) => [r.id, r.version]));

  const amendments = new Map();
  for (const d of decisions) {
    if (d.amends) amendments.set(d.amends, d);
  }

  const packageApprovals = approvals.filter(
    (a) => /^PACKAGE-[0-9]$/.test(a.artifact_id) && a.approval_state === 'ratified'
  );

  for (const app of packageApprovals) {
    if (!app.closure_record || !chapterIds.has(app.closure_record)) {
      findings.push(
        makeFinding(Severity.ERROR, 'FREEZE_NO_CLOSURE', `${app.id} (${app.artifact_id}): frozen package lacks a valid closure record`, app.id)
      );
    } else {
      const closureDecision = decisions.find((d) => (d.evidence_refs ?? []).includes(app.closure_record));
      if (!closureDecision) {
        findings.push(
          makeFinding(Severity.WARNING, 'FREEZE_NO_DECISION', `${app.id}: no closure decision in REG-002 references ${app.closure_record}`, app.id)
        );
      }
    }

    if (app.frozen === true) {
      if (!app.base_commit) {
        findings.push(makeFinding(Severity.ERROR, 'FREEZE_NO_BASE_COMMIT', `${app.id}: frozen package lacks a recorded base commit`, app.id));
      }
      if (!app.amendment_process) {
        findings.push(makeFinding(Severity.ERROR, 'FREEZE_NO_AMENDMENT_PROCESS', `${app.id}: frozen package lacks a stated amendment process`, app.id));
      }
      if (!Array.isArray(app.frozen_artifacts) || app.frozen_artifacts.length === 0) {
        findings.push(makeFinding(Severity.ERROR, 'FREEZE_NO_ARTIFACT_SNAPSHOT', `${app.id}: frozen package lacks a frozen-artifact version snapshot`, app.id));
      } else {
        for (const fa of app.frozen_artifacts) {
          const current = corpusVersion.get(fa.id);
          if (current && current !== fa.version && !amendments.has(fa.id)) {
            findings.push(
              makeFinding(
                Severity.ERROR,
                'FROZEN_AMENDMENT_MISSING',
                `${fa.id}: frozen at ${fa.version} but corpus shows ${current} with no amendment decision`,
                app.id
              )
            );
          }
        }
      }
    } else {
      findings.push(
        makeFinding(Severity.WARNING, 'FREEZE_METADATA_ABSENT', `${app.id}: package approval has no freeze metadata (frozen flag unset)`, app.id)
      );
    }
  }

  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runStandalone('Volume 0 freeze and amendment integrity', run);
}
