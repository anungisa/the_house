# V6-K - Volume 6 Release-Assurance and Downstream-Routing Amendment

Document ID: V6-K
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G5
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G5)

## V6-K.1 Purpose

This section is normative.

This is an additive release-assurance amendment to the released Volume 6 baseline
`central-registration-volume-6-v1.0.0`. Volume 6 is substantively complete and its
protection, privacy, compliance, accessibility, bilingual-equivalence, resilience,
and assurance definition is accepted. This amendment corrects two release-quality
issues so that the released baseline is internally consistent with the established
Volume 7 through Volume 12 program structure before any substantive Volume 7 work
begins:

- several machine-readable readiness, House P0 evidence, and handoff records routed
  downstream work to a volume whose canonical responsibility does not match the
  work described; and
- the recorded release pass demonstrated Volume 6 validation and lint but did not
  evidence the inherited Volume 1 through Volume 5 governance validation, and the
  continuous-integration governance workflow exercised only the earliest volumes.

This amendment resolves both issues additively. It supersedes incorrect downstream
destinations without overwriting frozen records, adds a deterministic
routing-integrity control, records the inherited-volume validation as part of the
governed release path, and extends the continuous-integration governance workflow
to the currently supported Volume 0 through Volume 6 checks. It authorizes no
implementation.

## V6-K.2 Scope of amendment

This section is normative.

This amendment adds one new chapter (V6-K), two decision records (ADR-V6-058 and
ADR-V6-059), one approval record (APP-V6-074), one deterministic control
(`release-assurance-volume-6.mjs`) with its non-authoritative generated
projections, additive routing-correction fields on seven previously frozen REG-604
records, five additive JSON Schema properties on the REG-604 schema, one new
package script, and one extension of the continuous-integration governance
workflow.

This amendment preserves, unchanged and in force:

- V6-I (Volume 6 completion and release-freeze record) and V6-J (Package 5
  provenance amendment);
- the Gate V6-G5 disposition
  (SECURITY_PRIVACY_COMPLIANCE_ACCESSIBILITY_AND_TRUST_DEFINITION_COMPLETE);
- the Package 5 freeze (PACKAGE-6-5, APP-V6-071);
- the whole-volume freeze (VOLUME-6, APP-V6-072);
- the original Package 5 lineage recorded in V6-J;
- the immutable released tag `central-registration-volume-6-v1.0.0`, which is not
  moved; and
- every implementation, executable-policy, monitoring, runbook, procurement,
  provider-selection, staffing, cost, pilot, rollout, launch, and master-plan
  restriction recorded in Volume 6.

No frozen substantive obligation, control objective, threat, right, decision, or
disposition is altered. The correction is confined to downstream-routing metadata
and release-assurance tooling.

## V6-K.3 Canonical Volume 7 to Volume 12 responsibility map

This section is normative.

The controlling program responsibility map for the remaining volumes is:

- Volume 7 governs experience and service design.
- Volume 8 governs APIs, events, integrations, and external contracts.
- Volume 9 governs quality and master test definition.
- Volume 10 governs delivery and release planning.
- Volume 11 governs operations, migration, adoption, and operational assurance.
- Volume 12 governs gate, release, and acceptance evidence.

Each volume has a canonical governance gate. Volume 7 through Volume 11 use the
gate identifiers V7-G, V8-G, V9-G, V10-G, and V11-G respectively. Volume 12 uses
the executive material-commitment gate EXEC-MCG. A downstream routing assertion is
consistent only when the assigned volume and its blocking gate agree, and when the
work described belongs to that volume's canonical responsibility rather than to
another volume's. This map is the authoritative reference for the routing-integrity
control in V6-K.5.

## V6-K.4 Downstream-routing corrections

This section is normative.

The following corrections are recorded additively on the affected REG-604 records.
Each record's original (frozen) downstream volume, target, and blocking gate are
preserved as superseded history; the corrected destination is recorded alongside in
the `corrected_downstream_volume`, `corrected_target_package_or_volume`,
`corrected_future_blocking_gate`, `routing_correction_ref`, and
`routing_correction_note` fields. No original value is overwritten.

- TEST-V6-037: superseded destination Volume 8 logical and physical design;
  corrected destination Volume 8 APIs, events, integrations, and provider
  contracts. Volume 8 governs external and provider contracts, not logical and
  physical data design.
- TEST-V6-039: superseded destination Volume 10 operational proof (gate V10-G1);
  corrected destination Volume 11 operations and operational proof (gate V11-G1).
  Operational proof resolves through Volume 11.
- TEST-V6-040: superseded destination Volume 11 independent assurance (gate
  V11-G1); corrected destination Volume 12 release assurance and independent
  validation (gate EXEC-MCG). Independent assurance resolves at the Volume 12
  release-assurance boundary.
- TEST-V6-044: superseded destination Volume 10 records validation (gate V10-G1);
  corrected destination Volume 11 records, retention, archival, and disposition
  operations (gate V11-G1).

The House P0 evidence items TEST-V6-032, TEST-V6-033, and TEST-V6-034 are
reconciled to the separate downstream boundaries:

- TEST-V6-032 (behavioural verification against the real data platform) resolves
  implementation and behavioural testing through Volume 9.
- TEST-V6-033 (composed production verification) resolves real operational proof
  through Volume 11.
- TEST-V6-034 (deployment-path verification) resolves deployment-path and
  release-planning concerns through Volume 10.

For all three, real operational proof resolves through Volume 11, and final release
evidence and independent assurance resolve through Volume 12. Their original Volume
10 operational-proof destinations are preserved as superseded history.

## V6-K.5 Routing-integrity control

This section is normative.

A deterministic, non-authoritative control (`release-assurance-volume-6.mjs`)
validates every REG-604 record that carries an explicit single-volume downstream
assignment against the canonical map in V6-K.3. For each such record the control
evaluates the effective (corrected-or-original) destination, requiring that the
assigned volume's blocking gate matches the canonical gate for that volume and that
the work described does not name another volume's canonical responsibility. The
control fails on misroutes such as Volume 8 described as physical data design,
Volume 10 described as security operations, Volume 11 described as final release
assurance, and Volume 12 described as routine operations, and it carries a
deterministic self-test asserting that each such canonical misroute is flagged. The
control is wired into `governance:check:v6`, so a routing regression fails the
Volume 6 governance check. It emits the non-authoritative projections
`canonical-volume-responsibility-map.json`, `downstream-routing-analysis.json`,
`inherited-volume-validation-results.json`, and `release-assurance-report.md` under
the generated release-assurance directory. These projections are rebuildable from
the source-controlled corpus and authorize nothing.

## V6-K.6 Inherited-volume validation and release assurance

This section is normative.

The governed release path for this amendment runs the inherited Volume 1 through
Volume 5 governance checks together with the Volume 6 check and the repository lint,
so the released baseline is validated against the whole current governance corpus
and not the Volume 6 corpus alone. This is a release-assurance discipline. It is not
evidence that any inherited volume was defective, and a passing governance check
asserts only source-controlled corpus consistency; it makes no operational, release,
conformance, or assurance claim. Any generated timestamp-only churn produced by the
validation pass is reverted so that only substantive changes are recorded.

## V6-K.7 Continuous-integration governance coverage

This section is normative.

The continuous-integration governance workflow is extended so the governed release
path executes the currently supported Volume 0 through Volume 6 governance checks
rather than stopping at the earliest volumes. This change is governance tooling
only. It does not modify runtime application code, does not deploy, requires no
secrets, contacts no external service, and does not imply that a successful workflow
run proves operational control implementation, security certification, privacy
compliance, or accessibility conformance.

## V6-K.8 Release provenance

This section is normative.

This amendment branches from the immutable released tag
`central-registration-volume-6-v1.0.0` and is recorded as follows:

- Base commit: the mainline merge commit that the tag
  `central-registration-volume-6-v1.0.0` identifies.
- On this amendment's mainline merge, after green continuous integration, a new
  annotated tag `central-registration-volume-6-v1.0.1` is published on the
  amendment merge commit. The tag `central-registration-volume-6-v1.0.0` is not
  moved and remains the pointer to the original released state.
- The still-empty downstream branch
  `docs/volume-7-experience-and-service-design` is recreated from
  `central-registration-volume-6-v1.0.1` so that substantive Volume 7 work begins
  only from the corrected baseline.

This amendment does not create, move, or pre-record its own future merge or tag
object; those are recorded in the amendment's own commit history and mainline merge,
consistent with the Package 1 through Package 5 provenance discipline.

## V6-K.9 Preservation

This section is normative.

This amendment preserves: the Gate V6-G5 disposition; the Volume 7 authorization;
the Package 5 freeze (PACKAGE-6-5); the whole-volume freeze (VOLUME-6); V6-I and
V6-J unchanged; the original Package 5 lineage; the immutable
`central-registration-volume-6-v1.0.0` tag; every Volume 6 trust, protection,
identity, authorization, privacy, records, disclosure, compliance, accessibility,
bilingual, accommodation, incident, vulnerability, notification, resilience,
recovery, continuity, provider-assurance, and control-assurance obligation and
register record; and every implementation, executable-policy, monitoring, runbook,
incident-procedure, recovery-automation, infrastructure, integration, procurement,
provider-selection, delivery-sequence, cost, staffing, pilot, rollout, launch, and
master-plan prohibition. It authorizes no implementation.

## V6-K.10 Explicit non-authorizations

This section is normative.

This amendment authorizes no implementation. It reaches no legal conclusion and
makes no compliance, conformance, accessibility, bilingual-validation,
operational-readiness, control-effectiveness, verified-restore, continuity-readiness,
provider-assurance, or independent-assurance claim. It creates no executable policy,
identity or access configuration, cryptographic configuration, runbook, monitoring
rule, incident procedure, recovery automation, infrastructure, integration, or
workflow, and it modifies no runtime application code. It sets no recovery-time,
recovery-point, availability, response-time, staffing, or cost commitment. It
selects no provider, vendor, technology, or assurance body and signs no contract. It
authorizes no procurement, delivery sequencing, pilot, rollout, or launch and
creates no master development plan. It does not move the released tag, does not
reopen frozen substantive Volume 6 content, and does not author substantive Volume 7
content.
