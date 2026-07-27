// Control: Volume 6 release-assurance and downstream-routing integrity
// (NON-AUTHORITATIVE).
//
// Validates that every Volume 6 readiness, P0-evidence, and handoff record that
// carries an explicit single-volume downstream assignment routes to the canonical
// Volume 7-12 program responsibility, and that its blocking gate matches that
// volume's canonical gate. The canonical map is:
//
//   Volume 7  - Experience and service design
//   Volume 8  - APIs, events, integrations, and external contracts
//   Volume 9  - Quality and master test definition
//   Volume 10 - Delivery and release planning
//   Volume 11 - Operations, migration, adoption, and operational assurance
//   Volume 12 - Gate, release, and acceptance evidence
//
// Downstream-routing corrections introduced by the V6-K release-assurance and
// downstream-routing amendment are recorded ADDITIVELY on each affected record as
// `corrected_downstream_volume`, `corrected_target_package_or_volume`,
// `corrected_future_blocking_gate`, `routing_correction_ref`, and
// `routing_correction_note`. The original (frozen) `downstream_volume`,
// `target_package_or_volume`, and `future_blocking_gate` are never overwritten;
// they are preserved as superseded history. This control validates the EFFECTIVE
// (corrected-or-original) routing so the released baseline is internally consistent
// with the established Volume 7-12 program structure.
//
// This control is governance tooling only. It authorizes no implementation and
// asserts no operational, release, or assurance outcome; a passing check proves
// only routing consistency of the source-controlled corpus.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, REPO_ROOT, loadContext, makeFinding, runStandalone } from './lib.mjs';

// Canonical Volume 7-12 program responsibilities, canonical gate prefix (or exact
// gate for Volume 12), and the set of foreign-responsibility phrases that must NOT
// describe a record assigned to that volume. Phrases are matched case-insensitively
// against the effective target string.
export const CANONICAL_MAP = Object.freeze({
  'Volume 7': {
    responsibility: 'Experience and service design',
    gate: 'V7-G',
    forbidden: ['physical design', 'api contract', 'operational proof', 'independent validation', 'release assurance', 'routine operations']
  },
  'Volume 8': {
    responsibility: 'APIs, events, integrations, and external contracts',
    gate: 'V8-G',
    forbidden: ['logical and physical design', 'physical data design', 'physical design', 'operational proof', 'routine operations']
  },
  'Volume 9': {
    responsibility: 'Quality and master test definition',
    gate: 'V9-G',
    forbidden: ['operational proof', 'release planning', 'independent validation', 'release assurance']
  },
  'Volume 10': {
    responsibility: 'Delivery and release planning',
    gate: 'V10-G',
    forbidden: ['operational proof', 'security operations', 'independent validation', 'independent assurance', 'records validation', 'final release assurance', 'routine operations']
  },
  'Volume 11': {
    responsibility: 'Operations, migration, adoption, and operational assurance',
    gate: 'V11-G',
    forbidden: ['final release assurance', 'release assurance', 'independent validation', 'independent assurance', 'acceptance evidence', 'routine operations']
  },
  'Volume 12': {
    responsibility: 'Gate, release, and acceptance evidence',
    gate: 'EXEC-MCG',
    forbidden: ['routine operations', 'physical design']
  }
});

// Governance checks that constitute the governed release path (Volume 0 through
// Volume 6). The V6-K amendment requires each to be run during the release pass
// and extends continuous integration to execute all of them.
const INHERITED_VOLUME_CHECKS = Object.freeze([
  { volume: 'Volume 0', script: 'governance:check' },
  { volume: 'Volume 1', script: 'governance:check:v1' },
  { volume: 'Volume 2', script: 'governance:check:v2' },
  { volume: 'Volume 3', script: 'governance:check:v3' },
  { volume: 'Volume 4', script: 'governance:check:v4' },
  { volume: 'Volume 5', script: 'governance:check:v5' },
  { volume: 'Volume 6', script: 'governance:check:v6' }
]);

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

function effectiveVolume(r) {
  return r.corrected_downstream_volume ?? r.downstream_volume ?? null;
}

function effectiveGate(r) {
  return r.corrected_future_blocking_gate ?? r.future_blocking_gate ?? null;
}

function effectiveTarget(r) {
  return r.corrected_target_package_or_volume ?? r.target_package_or_volume ?? '';
}

// Text a routing assertion is classified against. A corrected record is judged
// solely by its authoritative corrected target. An uncorrected record is judged
// by its target together with its title and statement, so a semantic misroute
// expressed in prose (for example, "operational proof" named in a title) is caught
// even when the target string alone reads cleanly.
function classificationText(r) {
  if (r.routing_correction_ref) {
    return r.corrected_target_package_or_volume ?? r.target_package_or_volume ?? '';
  }
  return [r.target_package_or_volume, r.title, r.statement].filter(Boolean).join(' ');
}

function gateMatches(volumeEntry, gate) {
  if (!gate) return false;
  if (volumeEntry.gate === 'EXEC-MCG') return gate === 'EXEC-MCG';
  return gate.startsWith(volumeEntry.gate);
}

// Classify a single (volume, targetText, gate) routing assertion. Returns the
// array of finding codes it violates ([] when consistent). Pure and deterministic;
// used both for real records and for the anti-pattern self-test.
export function classifyRouting(volume, targetText, gate) {
  const codes = [];
  const entry = CANONICAL_MAP[volume];
  if (!entry) {
    codes.push('ROUTING_UNKNOWN_VOLUME');
    return codes;
  }
  const text = String(targetText ?? '').toLowerCase();
  for (const phrase of entry.forbidden) {
    if (text.includes(phrase)) {
      codes.push('ROUTING_FOREIGN_RESPONSIBILITY');
      break;
    }
  }
  if (!gateMatches(entry, gate)) {
    codes.push('ROUTING_GATE_MISMATCH');
  }
  return codes;
}

// Deterministic anti-pattern self-test. The control MUST flag each canonical
// misroute example from the directive; any example it fails to flag is a
// control-integrity error.
const SELF_TEST_CASES = Object.freeze([
  { volume: 'Volume 8', target: 'Volume 8 physical data design', gate: 'V8-G1', label: 'Volume 8 described as physical data design' },
  { volume: 'Volume 10', target: 'Volume 10 security operations', gate: 'V10-G1', label: 'Volume 10 described as security operations' },
  { volume: 'Volume 11', target: 'Volume 11 final release assurance', gate: 'V11-G1', label: 'Volume 11 described as final release assurance' },
  { volume: 'Volume 12', target: 'Volume 12 routine operations', gate: 'EXEC-MCG', label: 'Volume 12 described as routine operations' }
]);

function selfTest() {
  const findings = [];
  for (const c of SELF_TEST_CASES) {
    const codes = classifyRouting(c.volume, c.target, c.gate);
    if (codes.length === 0) {
      findings.push(
        makeFinding(
          Severity.ERROR,
          'ROUTING_SELFTEST_FAILED',
          `routing-integrity self-test did not flag canonical misroute: ${c.label}`,
          c.volume
        )
      );
    }
  }
  return findings;
}

export function run(ctx) {
  const findings = [...selfTest()];
  for (const r of records(ctx, 'REG-604')) {
    const volume = effectiveVolume(r);
    if (!volume) continue;
    const entry = CANONICAL_MAP[volume];
    if (!entry) {
      findings.push(
        makeFinding(Severity.ERROR, 'ROUTING_UNKNOWN_VOLUME', `${r.id}: downstream volume "${volume}" is not in the canonical Volume 7-12 map`, r.id)
      );
      continue;
    }
    const codes = classifyRouting(volume, classificationText(r), effectiveGate(r));
    for (const code of codes) {
      if (code === 'ROUTING_FOREIGN_RESPONSIBILITY') {
        findings.push(
          makeFinding(
            Severity.ERROR,
            code,
            `${r.id}: routed to ${volume} (${entry.responsibility}) but its description names another volume's responsibility: "${classificationText(r)}"`,
            r.id
          )
        );
      } else if (code === 'ROUTING_GATE_MISMATCH') {
        findings.push(
          makeFinding(
            Severity.ERROR,
            code,
            `${r.id}: routed to ${volume} but blocking gate "${effectiveGate(r)}" is not that volume's canonical gate (${entry.gate === 'EXEC-MCG' ? 'EXEC-MCG' : `${entry.gate}x`})`,
            r.id
          )
        );
      }
    }
  }
  return findings;
}

function readPackageScripts() {
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

export function project(ctx) {
  const scripts = readPackageScripts();

  const canonicalMap = Object.entries(CANONICAL_MAP).map(([volume, e]) => ({
    volume,
    responsibility: e.responsibility,
    canonical_gate: e.gate === 'EXEC-MCG' ? 'EXEC-MCG' : `${e.gate}x`,
    foreign_responsibility_phrases: e.forbidden
  }));

  const routed = records(ctx, 'REG-604')
    .filter((r) => effectiveVolume(r))
    .map((r) => {
      const volume = effectiveVolume(r);
      const corrected = Boolean(r.routing_correction_ref);
      const violations = classifyRouting(volume, classificationText(r), effectiveGate(r));
      return {
        id: r.id,
        kind: r.kind,
        effective_downstream_volume: volume,
        effective_target: effectiveTarget(r),
        effective_gate: effectiveGate(r),
        corrected: corrected,
        original_downstream_volume: corrected ? (r.downstream_volume ?? null) : null,
        original_target: corrected ? (r.target_package_or_volume ?? null) : null,
        original_gate: corrected ? (r.future_blocking_gate ?? null) : null,
        routing_correction_ref: r.routing_correction_ref ?? null,
        violations
      };
    });

  const byVolume = {};
  for (const r of routed) {
    byVolume[r.effective_downstream_volume] = (byVolume[r.effective_downstream_volume] ?? 0) + 1;
  }

  const corrections = routed.filter((r) => r.corrected);
  const violating = routed.filter((r) => r.violations.length > 0);

  const inheritedVolumeValidation = INHERITED_VOLUME_CHECKS.map((c) => ({
    volume: c.volume,
    script: c.script,
    command: `npm run ${c.script}`,
    defined: Boolean(scripts[c.script]),
    part_of_governed_release_path: true,
    executed_in_ci: true
  })).concat([
    { volume: 'All', script: 'lint', command: 'npm run lint', defined: Boolean(scripts.lint), part_of_governed_release_path: true, executed_in_ci: true }
  ]);

  const selfTestFindings = selfTest();

  return {
    canonicalMap,
    routingAnalysis: {
      total_routed_records: routed.length,
      by_effective_volume: byVolume,
      corrections_applied: corrections.length,
      corrected_records: corrections,
      violating_records: violating,
      all_records: routed
    },
    inheritedVolumeValidation: {
      note: 'Enumerates the Volume 0-6 governance checks and lint that constitute the governed release path. Non-authoritative; actual pass/fail is recorded by running each command during the release pass and in continuous integration.',
      checks: inheritedVolumeValidation
    },
    selfTestPassed: selfTestFindings.length === 0,
    violations: violating.length
  };
}

function writeJson(dir, name, data) {
  writeFileSync(join(dir, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function generate(ctx = loadContext()) {
  const p = project(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'release-assurance');
  mkdirSync(outDir, { recursive: true });
  writeJson(outDir, 'canonical-volume-responsibility-map.json', p.canonicalMap);
  writeJson(outDir, 'downstream-routing-analysis.json', p.routingAnalysis);
  writeJson(outDir, 'inherited-volume-validation-results.json', p.inheritedVolumeValidation);

  const report = `# Volume 6 Release-Assurance and Downstream-Routing Report (NON-AUTHORITATIVE)

Generated: ${new Date().toISOString()}

> Generated projection of the source-controlled Volume 6 corpus. Not a source of
> truth and not a basis for ratification. The V6-K release-assurance and
> downstream-routing amendment corrects downstream-volume routing additively: it
> preserves every frozen record and its original (superseded) destination and adds
> the corrected destination alongside. It moves no gate, changes no freeze, and
> authorizes no implementation. A passing check proves only that the corpus is
> internally consistent with the canonical Volume 7-12 program structure; it makes
> no operational, release, conformance, or assurance claim.

## Canonical Volume 7-12 responsibility map

${p.canonicalMap.map((e) => `- ${e.volume} (gate ${e.canonical_gate}): ${e.responsibility}`).join('\n')}

## Downstream-routing integrity

- Records with an explicit single-volume assignment: ${p.routingAnalysis.total_routed_records}
- Routing corrections applied (V6-K): ${p.routingAnalysis.corrections_applied}
- Records violating the canonical map: ${p.violations} (must be 0)
- Anti-pattern self-test passed: ${p.selfTestPassed ? 'yes' : 'NO'}

### Records by effective downstream volume

${Object.entries(p.routingAnalysis.by_effective_volume).sort().map(([v, n]) => `- ${v}: ${n}`).join('\n')}

### Corrections applied

${p.routingAnalysis.corrected_records.length === 0 ? '- (none)' : p.routingAnalysis.corrected_records.map((r) => `- ${r.id}: ${r.original_downstream_volume} (${r.original_target}) -> ${r.effective_downstream_volume} (${r.effective_target}); gate ${r.original_gate} -> ${r.effective_gate}`).join('\n')}

## Inherited-volume validation (governed release path)

${p.inheritedVolumeValidation.note}

${p.inheritedVolumeValidation.checks.map((c) => `- ${c.volume}: \`${c.command}\`${c.defined ? '' : ' (SCRIPT MISSING)'}`).join('\n')}
`;
  writeFileSync(join(outDir, 'release-assurance-report.md'), report, 'utf8');
  return { outDir, violations: p.violations, selfTestPassed: p.selfTestPassed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ctx = loadContext();
  const { outDir, violations, selfTestPassed } = generate(ctx);
  console.log(`Volume 6 release-assurance projections written to ${outDir}`);
  console.log(`  Routing violations: ${violations} (must be 0)`);
  console.log(`  Anti-pattern self-test passed: ${selfTestPassed ? 'yes' : 'NO'}`);
  await runStandalone('Volume 6 release-assurance and downstream-routing integrity', run);
}
