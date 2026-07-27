// Control: Volume 7 Package 5 integrated-closure analysis and NON-AUTHORITATIVE
// projections.
//
// Aggregates the frozen Package 1-4 coverage analyses into an integrated
// traceability, House P0 experience-coverage, downstream-handoff, and closure
// assessment for Package 5. Every generated file is a projection of the
// source-controlled corpus and is never authoritative. Package 5 consolidates
// and traces prior work; it re-opens no prior package, re-runs no validation,
// and authorizes no implementation. A record that improperly claims validation
// or implementation is a blocking ERROR; coverage gaps are non-blocking INFO
// backlog signals. This control reports readiness only; it never disposes a gate
// or a freeze.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';
import { run as runStructural } from './validate-volume-7.mjs';
import { run as runFoundation } from './foundation-volume-7.mjs';
import { run as runInteraction, analyse as analyseInteraction } from './interaction-model-volume-7.mjs';
import { run as runDesign, analyse as analyseDesign } from './design-system-volume-7.mjs';
import { run as runValidation, analyse as analyseValidation } from './validation-handoff-volume-7.mjs';

const COMPLETED_GATES = ['V7-G1', 'V7-G2', 'V7-G3', 'V7-G4', 'V7-G5'];

// House P0 findings, keyed by the phrasing carried in V7-52.
const HOUSE_P0_FINDINGS = [
  'resource-aware authorization',
  'reviewer and jurisdiction authority',
  'evidence binding',
  'affiliation lifecycle',
  'versioned requirements',
  'return and resubmission',
  'activation uniqueness',
  'fail-closed configuration',
  'outbox and publication state',
  'PostgreSQL verification',
  'composition',
  'deployment path',
  'secrets and configuration'
];

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

function bodyMentions(ctx, id, needle) {
  const ch = ctx.chapters.find((c) => c.fileId === id);
  return ch ? ch.body.includes(needle) : false;
}

// A controlled record improperly claims implementation or validation when it
// authorizes implementation or reports an implementation status other than the
// governed not-implemented-or-not-proven posture.
function claimsImplementation(record) {
  if (record.authorizes_implementation === true) return true;
  if (
    typeof record.implementation_status === 'string' &&
    record.implementation_status !== 'NOT_IMPLEMENTED_OR_NOT_PROVEN'
  ) {
    return true;
  }
  return false;
}

export function analyse(ctx) {
  const upstream = [
    ...runStructural(ctx),
    ...runFoundation(ctx),
    ...runInteraction(ctx),
    ...runDesign(ctx),
    ...runValidation(ctx)
  ];
  const blockingDefects = upstream.filter((f) => f.severity === Severity.ERROR);
  const coverageGaps = upstream.filter((f) => f.severity === Severity.INFO);

  const interaction = analyseInteraction(ctx);
  const design = analyseDesign(ctx);
  const validation = analyseValidation(ctx);

  // Records that improperly claim implementation or validation authority.
  const governedRegisters = ['REG-700', 'REG-701', 'REG-702', 'REG-703', 'REG-704', 'REG-705'];
  const improperClaims = [];
  for (const regId of governedRegisters) {
    for (const r of records(ctx, regId)) {
      if (claimsImplementation(r)) {
        improperClaims.push({ register: regId, id: r.id ?? r.artifact_id ?? '(unknown)' });
      }
    }
  }

  // House P0 coverage: each finding must be carried by the coverage matrix chapter.
  const p0Uncovered = HOUSE_P0_FINDINGS.filter((f) => !bodyMentions(ctx, 'V7-52', f));

  // Downstream handoff: every unresolved backlog item points to a downstream gate.
  const backlog = records(ctx, 'REG-704');
  const backlogWithoutDownstreamGate = backlog
    .filter((b) => b.future_blocking_gate)
    .filter((b) => COMPLETED_GATES.includes(b.future_blocking_gate))
    .map((b) => b.id);
  const backlogMissingGate = backlog.filter((b) => !b.future_blocking_gate).map((b) => b.id);

  return {
    counts: {
      chapters: ctx.chapters.length,
      blocking_defects: blockingDefects.length,
      coverage_gaps: coverageGaps.length,
      improper_claims: improperClaims.length,
      backlog: backlog.length
    },
    blocking_defects: blockingDefects.map((f) => ({ code: f.code, message: f.message, artifact: f.artifact })),
    coverage_gaps: coverageGaps.map((f) => ({ code: f.code, message: f.message, artifact: f.artifact })),
    improper_claims: improperClaims,
    house_p0: {
      total: HOUSE_P0_FINDINGS.length,
      covered: HOUSE_P0_FINDINGS.length - p0Uncovered.length,
      uncovered: p0Uncovered
    },
    downstream: {
      backlog_pointing_to_completed_gate: backlogWithoutDownstreamGate,
      backlog_missing_gate: backlogMissingGate
    },
    upstream_gaps: {
      interaction: interaction.gaps,
      design: design.gaps,
      validation: validation.gaps
    }
  };
}

export function run(ctx) {
  const findings = [];
  const a = analyse(ctx);

  for (const claim of a.improper_claims) {
    findings.push(
      makeFinding(
        Severity.ERROR,
        'CLOSURE_RECORD_CLAIMS_IMPLEMENTATION',
        `${claim.register} record ${claim.id} claims implementation or validation authority; Package 5 authorizes none.`,
        claim.register
      )
    );
  }

  for (const id of a.downstream.backlog_pointing_to_completed_gate) {
    findings.push(
      makeFinding(
        Severity.ERROR,
        'CLOSURE_BACKLOG_POINTS_TO_COMPLETED_GATE',
        `Backlog item ${id} points to a completed gate; every unresolved item needs a downstream destination.`,
        'REG-704'
      )
    );
  }

  if (a.house_p0.uncovered.length > 0) {
    findings.push(
      makeFinding(
        Severity.INFO,
        'HOUSE_P0_COVERAGE_GAP',
        `House P0 findings without experience coverage: ${a.house_p0.uncovered.join(', ')}`,
        'V7-52'
      )
    );
  }

  if (a.counts.coverage_gaps > 0) {
    findings.push(
      makeFinding(
        Severity.INFO,
        'INTEGRATED_COVERAGE_GAP_SUMMARY',
        `Integrated closure aggregates ${a.counts.coverage_gaps} upstream coverage-gap signal(s) across Packages 1-4.`,
        'REG-700'
      )
    );
  }

  return findings;
}

export function generate(ctx = loadContext()) {
  const a = analyse(ctx);
  const outDir = join(VOLUME_DIR, 'generated', 'final-closure');
  mkdirSync(outDir, { recursive: true });

  const write = (name, payload) =>
    writeFileSync(join(outDir, name), JSON.stringify(payload, null, 2) + '\n', 'utf8');

  write('integrated-traceability.json', {
    non_authoritative: true,
    chapters: a.counts.chapters,
    blocking_defects: a.counts.blocking_defects,
    coverage_gaps: a.counts.coverage_gaps,
    upstream_gaps: a.upstream_gaps
  });

  write('house-p0-coverage.json', {
    non_authoritative: true,
    total: a.house_p0.total,
    covered: a.house_p0.covered,
    uncovered: a.house_p0.uncovered,
    findings: HOUSE_P0_FINDINGS
  });

  write('downstream-handoff.json', {
    non_authoritative: true,
    backlog: a.counts.backlog,
    backlog_pointing_to_completed_gate: a.downstream.backlog_pointing_to_completed_gate,
    backlog_missing_gate: a.downstream.backlog_missing_gate
  });

  write('closure-assessment.json', {
    non_authoritative: true,
    disposition_candidate: 'EXPERIENCE_AND_SERVICE_DESIGN_DEFINITION_COMPLETE',
    blocking_defects: a.counts.blocking_defects,
    improper_claims: a.counts.improper_claims,
    house_p0_uncovered: a.house_p0.uncovered.length,
    ready: a.counts.blocking_defects === 0 && a.counts.improper_claims === 0 && a.house_p0.uncovered.length === 0
  });

  return { outDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Integrated closure coverage', run);
}
