# V0-09 - Delivery and Assurance Doctrine

Document ID: V0-09
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority; surname to be recorded in REG-001)
Associated Gate: G0
Ratification: Package 3; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable future gate (REG-006 APP-009)
Related Documents: V0-07 (decision classes and gate control), V0-10 (documentation and traceability), V0-11 (risk and exception governance)

This chapter is normative except where a subsection is marked explanatory. It
defines how The House v2 is delivered: governed iterative delivery by complete
vertical slice, concurrent design and testing, definitions of ready and done,
gate evidence requirements, defect severity handling, exception-gated risk
acceptance, release-candidate qualification, pilot-to-production progression,
rollback proof, and the controls that apply to AI-assisted implementation.

## 9.1 Purpose and scope

This subsection is normative.

The purpose of this chapter is to make delivery a governed activity rather than an
informal one. Delivery is the act of moving governed capability from intent to
operating reality. Assurance is the honest, evidenced statement of how far that
capability has actually been proven.

This chapter applies to all changes to The House v2 platform core and to every
governed vertical slice built on top of it. It does not authorize any specific
business-domain feature; it governs how any authorized feature is delivered.

## 9.2 Governed iterative delivery

This subsection is normative.

Delivery proceeds in complete vertical slices. A vertical slice is the smallest
change that delivers governed value end to end, from request through governed
lifecycle transition to durable system-of-record state and evidence.

A vertical slice is not complete until it satisfies all of the following:

1. It resolves to a versioned governance policy and, where lifecycle state
   changes, executes only through the Governance Kernel.
2. It carries tenant isolation for every tenant-owned table it touches.
3. It produces audit, evidence, and outbox artifacts consistent with its risk
   level.
4. It is idempotent for every externally retryable request.
5. It has automated tests that were written concurrently with the change.
6. It has documentation and traceability updates recorded under V0-10.

Partial slices that mutate governed state without their audit, evidence,
idempotency, or tenancy controls are prohibited.

## 9.3 Concurrent design and testing

This subsection is normative.

Design and testing are concurrent activities, not sequential phases. Tests are
authored alongside the implementation of a slice and are part of the same change.

A change that adds or alters governed behaviour without corresponding tests is not
ready for review. Tests must cover the governed invariants of the slice, including
fail-closed behaviour for unknown transitions, unknown guards, and unknown
permissions, and including idempotent retry behaviour where applicable.

## 9.4 Definition of Ready

This subsection is normative.

A change is Ready to be started when all of the following hold:

1. Its intent is recorded and traceable to an authority or decision under V0-10.
2. Its risk level and decision class (V0-07 7.5) are identified.
3. Its governed lifecycle impact is understood, including which transitions,
   guards, and permissions apply.
4. Its tenancy and isolation requirements are understood.
5. Any dependency or assumption it relies on is recorded under V0-11.
6. Its acceptance conditions are stated in a form that can be tested.

A change that is not Ready must not be started as governed work.

## 9.5 Definition of Done

This subsection is normative.

A change is Done only when all of the following hold:

1. The vertical slice is complete under 9.2.
2. Automated tests exist, pass, and were authored concurrently under 9.3.
3. Documentation and traceability are updated under V0-10.
4. The required evidence for the change's risk level exists and is honestly
   labelled under V0-07 7.4.
5. No governed control (audit, evidence, idempotency, tenancy, outbox) has been
   silently weakened.
6. Any residual risk or exception is recorded and governed under V0-11.

Authorization to merge is not evidence that a change is Done. Done is an evidenced
state, not an approval.

## 9.6 Gate types and evidence requirements

This subsection is normative.

Delivery is controlled by gates as defined in V0-07 7.6. This chapter classifies
the evidence a gate requires by the nature of the assurance being claimed.

1. Constitutional gates confirm that governance controls exist and are honestly
   labelled. Evidence may be SELF-ATTESTED or AUTHOR-VERIFIED.
2. Verification gates confirm that automated checks pass. Evidence must be
   automated and reproducible.
3. Validation gates confirm that domain owners have exercised the capability.
   Evidence must be domain-validated and attributed.
4. Independent assurance gates confirm that a party independent of the author has
   assessed the capability. Evidence must be independently assessed and must not
   be self-attested.

A gate must not accept a stronger evidence label than the evidence actually
supports. Overstated assurance is a constitutional defect.

## 9.7 Defect severity

This subsection is normative.

Defects are classified by severity so that gate impact is deterministic.

1. Critical defects break a governed control, corrupt system-of-record state,
   cross a tenant boundary, or defeat idempotency. Critical defects block all
   gates and cannot be exception-waived into production.
2. Major defects break intended capability but not a governed control. Major
   defects block validation and production gates until resolved or governed by an
   explicit, time-bounded exception under V0-11.
3. Minor defects are cosmetic or non-governed. Minor defects do not block gates
   but must be recorded.

Severity is assigned honestly. Reclassifying a critical defect to avoid a gate is a
constitutional defect.

## 9.8 Exception-gated risk acceptance

This subsection is normative.

Where a change cannot fully satisfy a non-constitutional requirement, delivery may
proceed only through an explicit exception recorded under V0-11 and REG-007.

An exception must name the accepting authority, the scope, the residual risk, a
review date, and an expiry date. An exception must never weaken a constitutional
control (audit, evidence, idempotency, tenancy, fail-closed behaviour). An expired
exception must fail validation rather than remain silently active.

## 9.9 Release-candidate qualification

This subsection is normative.

A change becomes a release candidate only when it is Done under 9.5, passes all
verification gates under 9.6, carries no open critical or major defect except
under a valid exception, and has a proven rollback path under 9.11.

A release candidate is a qualified state, not a schedule milestone.

## 9.10 Pilot-to-production progression

This subsection is normative.

Capability progresses from constitutional readiness to verification to pilot
validation to production. Pilot validation confirms that domain owners can exercise
the capability in a controlled setting; it does not by itself establish national
policy or independent production assurance.

Production progression requires the evidence appropriate to its gate under 9.6 and
must not infer independent assurance from pilot participation alone.

## 9.11 Rollback and recovery proof

This subsection is normative.

Every production-bound change must have a proven rollback or recovery path. Proof
means the path has been exercised, not merely described. Recovery of governed state
must preserve audit continuity and must not fabricate or discard evidence.

A change without proven rollback is not a release candidate.

## 9.12 AI-assisted implementation controls

This subsection is normative.

AI-assisted implementation is permitted and governed. It does not relax any control
in this chapter. Specifically:

1. AI-assisted changes are subject to the same Definition of Ready, Definition of
   Done, testing, evidence, and gate rules as any other change.
2. AI-assisted changes must not weaken or delete tests to achieve a passing state.
   Weakening tests to pass a gate is a constitutional defect.
3. AI-assisted changes must not silently alter governed controls, authority
   classifications, ratification records, or freeze baselines.
4. Accountability for an AI-assisted change rests with the human authority who
   accepts it, not with the tool.

## 9.13 Prohibition on weakening assurance

This subsection is normative.

No delivery activity may weaken assurance to achieve throughput. In particular, it
is prohibited to delete or weaken tests, downgrade defect severity, overstate an
evidence label, extend or ignore an expired exception, or bypass a fail-closed
control in order to pass a gate. Any such act is a constitutional defect and blocks
the affected gate.

## 9.14 Constitutional control

This subsection is normative.

This chapter is ratified under Package 3 by the Accountable Program Authority. Its
evidence basis is SELF-ATTESTED / AUTHOR-VERIFIED. It does not claim independent
validation and does not assert executive organizational acceptance. Amendments
follow the constitutional amendment control in V0-00 and are recorded in REG-002
and REG-006.
