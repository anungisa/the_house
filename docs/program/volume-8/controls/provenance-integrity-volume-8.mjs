// Control: Volume 8 provenance-integrity enforcement (deterministic, NON-AUTHORITATIVE).
//
// Proves, from the source-controlled Volume 8 corpus alone, that each package's
// recorded provenance is coherent and role-correct. It evaluates the authoritative
// provenance record(s) - the REG-805 approval(s) carrying a
// provenance_role_classification block - against twelve fail-closed conditions and
// emits deterministic projections. It never disposes a gate or confers ratification.
//
// A package's authoritative provenance record is the latest (governance-amendment)
// approval that carries provenance_role_classification. Earlier records (for example
// an initial post-merge amendment that mis-assigned a commit role) remain as
// preserved historical records and are superseded, not reopened.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Severity, VOLUME_DIR, loadContext, makeFinding, runStandalone } from './lib.mjs';

const PLACEHOLDER_RE = /(PENDING|UNKNOWN|TBD|PLACEHOLDER|UNRESOLVED)/i;

export function isPlaceholder(value) {
  return typeof value === 'string' && PLACEHOLDER_RE.test(value);
}

// Role-classification keys that carry commit/tag identifiers (excludes prose /
// bookkeeping keys so free text is never mistaken for a placeholder).
const RC_COMMIT_KEYS = Object.freeze([
  'source_baseline',
  'substantive_authoring',
  'closure_and_freeze',
  'pre_merge_provenance_binding',
  'original_package_merge',
  'provenance_amendment_authoring',
  'provenance_amendment_merge',
  'inherited_release_tag'
]);

// Scan only commit/tag-bearing fields for unresolved placeholders (package_provenance
// keys ending in _commit plus the role-classification commit keys). Prose fields such
// as `note` are never scanned.
function placeholderFields(rc, pp) {
  const found = [];
  for (const [k, v] of Object.entries(pp)) {
    if (k.endsWith('_commit') && isPlaceholder(v)) found.push(`pp.${k}=${v}`);
  }
  for (const k of RC_COMMIT_KEYS) {
    if (isPlaceholder(rc[k])) found.push(`rc.${k}=${rc[k]}`);
  }
  return found;
}

function approvals(ctx) {
  return ctx.registers?.['REG-805']?.doc?.records ?? [];
}

// The commit-binding fields of a package_provenance block that must be resolved
// (non-placeholder) for a completed gate. The forward-referencing amendment fields
// are validated separately by role classification, not as gate-readiness bindings.
const REQUIRED_BINDING_FIELDS = Object.freeze([
  'authoring_commit',
  'closure_authored_commit',
  'closure_effective_commit',
  'freeze_commit',
  'gate_effective_commit',
  'provenance_binding_commit'
]);

function gateApproval(ctx) {
  return approvals(ctx).find((a) => /^GATE-V8-G[0-9]$/.test(a.artifact_id ?? '') && a.approval_state === 'ratified' && a.gate_disposition);
}

function freezeApproval(ctx, freezeArtifact) {
  return approvals(ctx).find((a) => a.artifact_id === freezeArtifact && a.approval_state === 'ratified' && a.frozen === true);
}

function closureApproval(ctx) {
  return approvals(ctx).find((a) => a.closure_record === true && a.approval_state === 'ratified');
}

// Evaluate a single authoritative provenance record. Returns { checks, summary }.
export function evaluateRecord(ctx, record) {
  const rc = record.provenance_role_classification ?? {};
  const pp = record.package_provenance ?? {};
  const checks = [];
  const add = (n, title, ok, detail) => checks.push({ n, title, satisfied: ok, detail });

  const sourceBaseline = rc.source_baseline ?? pp.source_baseline_commit;
  const authoring = rc.substantive_authoring ?? pp.authoring_commit;
  const closureFreeze = rc.closure_and_freeze ?? pp.freeze_commit;
  const binding = rc.pre_merge_provenance_binding ?? pp.provenance_binding_commit;
  const amendmentAuthoring = rc.provenance_amendment_authoring ?? pp.provenance_amendment_authoring_commit;
  const amendmentMerge = rc.provenance_amendment_merge ?? pp.provenance_amendment_merge_commit;
  const freezeArtifact = record.requires_freeze_artifact ?? rc.package ?? 'PACKAGE-8-1';

  // 1. Source baseline must differ from substantive authoring (authoring produced a distinct commit).
  add(1, 'Source baseline differs from substantive authoring', Boolean(sourceBaseline && authoring && sourceBaseline !== authoring),
    `source_baseline=${sourceBaseline} authoring=${authoring}`);

  // 2. Substantive authoring must differ from closure/freeze (genuine authoring-closure separation).
  add(2, 'Substantive authoring differs from closure and freeze', Boolean(authoring && closureFreeze && authoring !== closureFreeze),
    `authoring=${authoring} closure_and_freeze=${closureFreeze}`);

  // 3. Closure effectiveness equals the freeze commit.
  add(3, 'Closure effective commit equals freeze commit', Boolean(pp.closure_effective_commit && pp.freeze_commit && pp.closure_effective_commit === pp.freeze_commit),
    `closure_effective=${pp.closure_effective_commit} freeze=${pp.freeze_commit}`);

  // 4. Gate effectiveness equals the freeze commit.
  add(4, 'Gate effective commit equals freeze commit', Boolean(pp.gate_effective_commit && pp.freeze_commit && pp.gate_effective_commit === pp.freeze_commit),
    `gate_effective=${pp.gate_effective_commit} freeze=${pp.freeze_commit}`);

  // 5. The required freeze artifact exists and is ratified/frozen.
  const freeze = freezeApproval(ctx, freezeArtifact);
  add(5, 'Required freeze artifact exists and is frozen', Boolean(freeze), `freeze_artifact=${freezeArtifact}`);

  // 6. No unresolved provenance placeholder in the authoritative record.
  const placeholderValues = placeholderFields(rc, pp);
  add(6, 'No unresolved provenance placeholder', placeholderValues.length === 0, `placeholders=${placeholderValues.join(',') || 'none'}`);

  // 7. A completed gate is not ready while a required commit binding is unresolved.
  const gate = gateApproval(ctx);
  const unresolvedBindings = REQUIRED_BINDING_FIELDS.filter((f) => pp[f] !== undefined && isPlaceholder(pp[f]));
  const gateBindingUnresolved = gate ? [gate.effective_commit, gate.gate_effective_commit].filter((v) => isPlaceholder(v)) : [];
  add(7, 'Completed gate has no unresolved required binding', unresolvedBindings.length === 0 && gateBindingUnresolved.length === 0,
    `unresolved=${[...unresolvedBindings, ...gateBindingUnresolved].join(',') || 'none'}`);

  // 8. The pre-merge provenance-binding commit is not represented as a provenance-amendment commit.
  const bindingConflated =
    (amendmentAuthoring && binding && amendmentAuthoring === binding) ||
    (pp.provenance_amendment_commit && binding && pp.provenance_amendment_commit === binding && !pp.provenance_binding_commit);
  add(8, 'Provenance-binding commit not conflated with an amendment commit', !bindingConflated,
    `binding=${binding} amendment_authoring=${amendmentAuthoring}`);

  // 9. A post-merge amendment records its own authoring and merge commits.
  add(9, 'Post-merge amendment records authoring and merge commits',
    Boolean(amendmentAuthoring && amendmentMerge && !isPlaceholder(amendmentAuthoring) && !isPlaceholder(amendmentMerge)),
    `amendment_authoring=${amendmentAuthoring} amendment_merge=${amendmentMerge}`);

  // 10. The closure carries a bounded next-package authorization.
  const closure = closureApproval(ctx);
  add(10, 'Closure carries bounded next-package authorization', Boolean(closure && typeof closure.next_package_disposition === 'string' && closure.next_package_disposition.trim().length > 0),
    `closure=${closure?.id ?? 'none'}`);

  // 11. Documentary effectiveness is not inferred as implementation/operational effectiveness.
  const edc = record.effective_date_clarification ?? closure?.effective_date_clarification ?? {};
  const impl = String(edc.implementation_effective_date ?? '');
  const documentaryNotImplementation = /not applicable|no implementation|distinct from/i.test(impl);
  add(11, 'Documentary effectiveness not treated as implementation effectiveness', documentaryNotImplementation,
    `implementation_effective_date=${impl || '(missing)'}`);

  // 12. No record authorizes implementation (whole register, fail-closed).
  const anyAuthorizesImpl = approvals(ctx).some((a) => a.authorizes_implementation !== false);
  add(12, 'No record authorizes implementation', !anyAuthorizesImpl);

  const failed = checks.filter((c) => !c.satisfied);
  return {
    record: record.id,
    package: freezeArtifact,
    roles: { sourceBaseline, authoring, closureFreeze, binding, originalMerge: rc.original_package_merge ?? pp.original_package_merge_commit, amendmentAuthoring, amendmentMerge, inheritedTag: rc.inherited_release_tag ?? pp.inherited_baseline_tag },
    checks,
    failed
  };
}

function authoritativeRecords(ctx) {
  return approvals(ctx).filter((a) => a.provenance_role_classification && typeof a.provenance_role_classification === 'object');
}

export function run(ctx) {
  const findings = [];
  const records = authoritativeRecords(ctx);
  if (records.length === 0) {
    findings.push(makeFinding(Severity.ERROR, 'PROVENANCE_RECORD_MISSING', 'No REG-805 approval carries a provenance_role_classification block', 'REG-805'));
    return findings;
  }
  for (const rec of records) {
    const result = evaluateRecord(ctx, rec);
    for (const c of result.failed) {
      findings.push(makeFinding(Severity.ERROR, 'PROVENANCE_INTEGRITY_VIOLATION', `${result.record}: condition ${c.n} failed - ${c.title} (${c.detail ?? ''})`, result.record));
    }
  }
  return findings;
}

export function generate(ctx = loadContext()) {
  const records = authoritativeRecords(ctx);
  const results = records.map((r) => evaluateRecord(ctx, r));
  const outDir = join(VOLUME_DIR, 'generated', 'provenance');
  mkdirSync(outDir, { recursive: true });

  const primary = results[0];
  const roles = primary?.roles ?? {};

  const chronology = {
    package: primary?.package ?? null,
    inherited_release_tag: roles.inheritedTag ?? null,
    sequence: [
      { role: 'SOURCE_BASELINE', commit: roles.sourceBaseline ?? null },
      { role: 'SUBSTANTIVE_AUTHORING', commit: roles.authoring ?? null },
      { role: 'CLOSURE_GATE_AND_FREEZE', commit: roles.closureFreeze ?? null },
      { role: 'PRE_MERGE_PROVENANCE_BINDING', commit: roles.binding ?? null },
      { role: 'ORIGINAL_PACKAGE_MERGE', commit: roles.originalMerge ?? null },
      { role: 'PROVENANCE_AMENDMENT_AUTHORING', commit: roles.amendmentAuthoring ?? null },
      { role: 'PROVENANCE_AMENDMENT_MERGE', commit: roles.amendmentMerge ?? null }
    ],
    historical_sequence_exception: primary ? (records[0].provenance_role_classification.historical_sequence_exception ?? 'NONE') : 'UNKNOWN'
  };

  const sep = primary?.checks.find((c) => c.n === 2);
  const authoringClosureSeparation = {
    package: primary?.package ?? null,
    substantive_authoring: roles.authoring ?? null,
    closure_and_freeze: roles.closureFreeze ?? null,
    distinct: Boolean(roles.authoring && roles.closureFreeze && roles.authoring !== roles.closureFreeze),
    authoring_closure_separation: sep?.satisfied ? 'SATISFIED' : 'VIOLATED'
  };

  const c3 = primary?.checks.find((c) => c.n === 3);
  const c4 = primary?.checks.find((c) => c.n === 4);
  const gateFreezeEffectiveness = {
    package: primary?.package ?? null,
    closure_effective_equals_freeze: Boolean(c3?.satisfied),
    gate_effective_equals_freeze: Boolean(c4?.satisfied),
    gate_freeze_effectiveness: c3?.satisfied && c4?.satisfied ? 'SATISFIED' : 'VIOLATED'
  };

  const c8 = primary?.checks.find((c) => c.n === 8);
  const roleClassification = {
    package: primary?.package ?? null,
    classification: {
      [roles.binding ?? 'unknown']: 'PRE_MERGE_PROVENANCE_BINDING',
      [roles.amendmentAuthoring ?? 'unknown']: 'V8_B_PROVENANCE_AMENDMENT_AUTHORING',
      [roles.amendmentMerge ?? 'unknown']: 'V8_B_PROVENANCE_AMENDMENT_MERGE'
    },
    binding_not_conflated_with_amendment: Boolean(c8?.satisfied),
    role_classification: c8?.satisfied ? 'SATISFIED' : 'VIOLATED'
  };

  const placeholderCheck = primary?.checks.find((c) => c.n === 6);
  const placeholderList = (placeholderCheck?.detail ?? '').replace(/^placeholders=/, '');
  const placeholderCount = placeholderCheck?.satisfied || placeholderList === 'none' ? 0 : placeholderList.split(',').filter(Boolean).length;

  writeFileSync(join(outDir, 'package-chronology.json'), JSON.stringify(chronology, null, 2) + '\n', 'utf8');
  writeFileSync(join(outDir, 'authoring-closure-separation.json'), JSON.stringify(authoringClosureSeparation, null, 2) + '\n', 'utf8');
  writeFileSync(join(outDir, 'gate-freeze-effectiveness.json'), JSON.stringify(gateFreezeEffectiveness, null, 2) + '\n', 'utf8');
  writeFileSync(join(outDir, 'provenance-role-classification.json'), JSON.stringify(roleClassification, null, 2) + '\n', 'utf8');

  const allFailed = results.flatMap((r) => r.failed);
  const now = new Date().toISOString();
  const md = `# Volume 8 Package 1 Provenance-Integrity Report (NON-AUTHORITATIVE)

Generated: ${now}

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 8 corpus. It proves provenance coherence deterministically; it confers no
> ratification and authorizes no implementation.

## Result

- authoring_closure_separation: ${authoringClosureSeparation.authoring_closure_separation}
- gate_freeze_effectiveness: ${gateFreezeEffectiveness.gate_freeze_effectiveness}
- placeholder_count: ${placeholderCount}
- role_classification: ${roleClassification.role_classification}
- historical_sequence_exception: ${chronology.historical_sequence_exception}
- integrity: ${allFailed.length === 0 ? 'SATISFIED' : 'VIOLATED'}

## Commit lineage

| Role | Commit |
| --- | --- |
${chronology.sequence.map((s) => `| ${s.role} | ${s.commit ?? '(none)'} |`).join('\n')}
| INHERITED_RELEASE_TAG | ${chronology.inherited_release_tag ?? '(none)'} |

## Role classification

| Commit | Classification |
| --- | --- |
${Object.entries(roleClassification.classification).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Conditions

${results.map((r) => `### ${r.record} (${r.package})\n\n${r.checks.map((c) => `- ${c.satisfied ? 'PASS' : 'FAIL'} ${c.n}: ${c.title}`).join('\n')}`).join('\n\n')}
`;
  writeFileSync(join(outDir, 'package-1-provenance-integrity-report.md'), md, 'utf8');

  return { outDir, violations: allFailed.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
  runStandalone('Provenance-integrity', run);
}
