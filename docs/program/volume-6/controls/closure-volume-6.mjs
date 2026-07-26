// Control: Volume 6 Package 1 closure projection (NON-AUTHORITATIVE).
//
// Emits deterministic JSON projections and a Markdown closure report describing
// the readiness of Package 1: Gate V6-G1 disposition, the Package 1 freeze
// coverage, and the authorization posture across the whole corpus. Non-
// authoritative: the source-controlled corpus and its recorded approvals remain
// the sole source of truth. These projections are rebuildable from the governed
// registers and authorize no implementation.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOLUME_DIR, completedGates, loadContext } from './lib.mjs';

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

function writeJson(dir, name, data) {
  writeFileSync(join(dir, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function project(ctx) {
  const approvals = records(ctx, 'REG-605');

  const gate = approvals.find((a) => a.artifact_id === 'GATE-V6-G1');
  const gateReadiness = {
    gate: 'V6-G1',
    dispositioned: Boolean(gate && gate.approval_state === 'ratified' && gate.gate_disposition),
    disposition: gate?.gate_disposition ?? null,
    completed_gates: [...completedGates(ctx)]
  };

  const freeze = approvals.find((a) => a.artifact_id === 'PACKAGE-6-1' && a.frozen);
  const freezeCoverage = {
    package_frozen: Boolean(freeze),
    frozen_artifacts: (freeze?.frozen_artifacts ?? []).map((f) => f.id),
    frozen_count: (freeze?.frozen_artifacts ?? []).length
  };

  // Package 2 gate readiness and freeze coverage (additive; present only once the
  // Package 2 gate and freeze approvals are recorded).
  const gateP2 = approvals.find((a) => a.artifact_id === 'GATE-V6-G2');
  const gateReadinessP2 = {
    gate: 'V6-G2',
    dispositioned: Boolean(gateP2 && gateP2.approval_state === 'ratified' && gateP2.gate_disposition),
    disposition: gateP2?.gate_disposition ?? null,
    closure_record: gateP2?.closure_record ?? null,
    completed_gates: [...completedGates(ctx)]
  };

  const freezeP2 = approvals.find((a) => a.artifact_id === 'PACKAGE-6-2' && a.frozen);
  const freezeCoverageP2 = {
    package_frozen: Boolean(freezeP2),
    frozen_artifacts: (freezeP2?.frozen_artifacts ?? []).map((f) => f.id),
    frozen_count: (freezeP2?.frozen_artifacts ?? []).length
  };

  // Package 3 gate readiness and freeze coverage (additive; present only once the
  // Package 3 gate and freeze approvals are recorded).
  const gateP3 = approvals.find((a) => a.artifact_id === 'GATE-V6-G3');
  const gateReadinessP3 = {
    gate: 'V6-G3',
    dispositioned: Boolean(gateP3 && gateP3.approval_state === 'ratified' && gateP3.gate_disposition),
    disposition: gateP3?.gate_disposition ?? null,
    closure_record: gateP3?.closure_record ?? null,
    completed_gates: [...completedGates(ctx)]
  };

  const freezeP3 = approvals.find((a) => a.artifact_id === 'PACKAGE-6-3' && a.frozen);
  const freezeCoverageP3 = {
    package_frozen: Boolean(freezeP3),
    frozen_artifacts: (freezeP3?.frozen_artifacts ?? []).map((f) => f.id),
    frozen_count: (freezeP3?.frozen_artifacts ?? []).length
  };

  const allRecords = [
    ...records(ctx, 'REG-601'),
    ...records(ctx, 'REG-602'),
    ...records(ctx, 'REG-603'),
    ...records(ctx, 'REG-604')
  ];
  const authorizationPosture = {
    total_records: allRecords.length,
    records_authorizing_implementation: allRecords.filter((r) => r.authorizes_implementation === true).map((r) => r.id),
    records_not_not_proven: allRecords
      .filter((r) => r.implementation_status && r.implementation_status !== 'NOT_IMPLEMENTED_OR_NOT_PROVEN')
      .map((r) => r.id)
  };

  return { gateReadiness, freezeCoverage, gateReadinessP2, freezeCoverageP2, gateReadinessP3, freezeCoverageP3, authorizationPosture };
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'closure');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'gate-readiness.json', p.gateReadiness);
  writeJson(outDir, 'freeze-coverage.json', p.freezeCoverage);
  writeJson(outDir, 'authorization-posture.json', p.authorizationPosture);
  writeJson(outDir, 'gate-readiness-package-2.json', p.gateReadinessP2);
  writeJson(outDir, 'freeze-coverage-package-2.json', p.freezeCoverageP2);
  writeJson(outDir, 'gate-readiness-package-3.json', p.gateReadinessP3);
  writeJson(outDir, 'freeze-coverage-package-3.json', p.freezeCoverageP3);

  const report = `# Volume 6 Package 1 Closure Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 6 corpus. Not a source of
> truth and not a basis for ratification. Volume 6 Package 1 authorizes no
> implementation and claims no compliance, conformance, or assurance.

## Gate V6-G1 readiness

- Dispositioned: ${p.gateReadiness.dispositioned}
- Disposition: ${p.gateReadiness.disposition ?? '(pending)'}
- Completed gates: ${p.gateReadiness.completed_gates.join(', ') || '(none)'}

## Package 1 freeze coverage

- Package frozen: ${p.freezeCoverage.package_frozen}
- Frozen artifacts: ${p.freezeCoverage.frozen_count}

## Authorization posture

- Total controlled records: ${p.authorizationPosture.total_records}
- Records authorizing implementation: ${p.authorizationPosture.records_authorizing_implementation.length} (must be 0)
- Records not marked not-implemented/not-proven: ${p.authorizationPosture.records_not_not_proven.length} (must be 0)
`;
  writeFileSync(join(outDir, 'package-1-closure-report.md'), report, 'utf8');

  const reportP2 = `# Volume 6 Package 2 Closure Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 6 corpus. Not a source of
> truth and not a basis for ratification. Volume 6 Package 2 authorizes no
> implementation and claims no compliance, conformance, or assurance.

## Gate V6-G2 readiness

- Dispositioned: ${p.gateReadinessP2.dispositioned}
- Disposition: ${p.gateReadinessP2.disposition ?? '(pending)'}
- Closure record: ${p.gateReadinessP2.closure_record ?? '(pending)'}
- Completed gates: ${p.gateReadinessP2.completed_gates.join(', ') || '(none)'}

## Package 2 freeze coverage

- Package frozen: ${p.freezeCoverageP2.package_frozen}
- Frozen artifacts: ${p.freezeCoverageP2.frozen_count}

## Authorization posture (whole corpus)

- Total controlled records: ${p.authorizationPosture.total_records}
- Records authorizing implementation: ${p.authorizationPosture.records_authorizing_implementation.length} (must be 0)
- Records not marked not-implemented/not-proven: ${p.authorizationPosture.records_not_not_proven.length} (must be 0)
`;
  writeFileSync(join(outDir, 'package-2-closure-report.md'), reportP2, 'utf8');

  const reportP3 = `# Volume 6 Package 3 Closure Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 6 corpus. Not a source of
> truth and not a basis for ratification. Volume 6 Package 3 authorizes no
> implementation and claims no compliance, conformance, or assurance.

## Gate V6-G3 readiness

- Dispositioned: ${p.gateReadinessP3.dispositioned}
- Disposition: ${p.gateReadinessP3.disposition ?? '(pending)'}
- Closure record: ${p.gateReadinessP3.closure_record ?? '(pending)'}
- Completed gates: ${p.gateReadinessP3.completed_gates.join(', ') || '(none)'}

## Package 3 freeze coverage

- Package frozen: ${p.freezeCoverageP3.package_frozen}
- Frozen artifacts: ${p.freezeCoverageP3.frozen_count}

## Authorization posture (whole corpus)

- Total controlled records: ${p.authorizationPosture.total_records}
- Records authorizing implementation: ${p.authorizationPosture.records_authorizing_implementation.length} (must be 0)
- Records not marked not-implemented/not-proven: ${p.authorizationPosture.records_not_not_proven.length} (must be 0)
`;
  writeFileSync(join(outDir, 'package-3-closure-report.md'), reportP3, 'utf8');
  return outDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = generate();
  console.log(`Volume 6 closure projections written to ${outDir}`);
}
