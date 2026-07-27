# V7-41 - Experience Issue, Exception, Remediation, and Retest Model

Document ID: V7-41
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V7-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V7-G4)

## V7-41.1 Purpose

This section is normative.

This chapter defines how issues found during experience validation are recorded, dispositioned, remediated, and retested. It defines the model only. It records no issue against any real evaluation and closes nothing.

## V7-41.2 Issue lifecycle

This section is normative.

An experience issue moves through a governed lifecycle: raised, triaged, dispositioned, remediated, and retested, and finally closed or accepted as a governed exception. Each transition names who may perform it and what evidence it requires. Issues are recorded as governed backlog items with owners and forward gates; they are not held informally and are not resolved silently.

## V7-41.3 No issue closes on a design-file change alone

This section is normative.

The model states the central rule that no issue closes solely because a design file changed. A change to a specification is a proposed remediation, not a resolution. An issue closes only when the remediation is retested under the family that raised it and the retest produces the qualifying evidence. This rule prevents an issue from being marked resolved by edit while the underlying experience remains unproven.

## V7-41.4 Exception treatment

This section is normative.

Where an issue cannot be remediated within scope, it may be accepted as a governed exception only by the named authority, only with an expiry or an explicit approval reference, and only with the residual risk recorded. An exception is never an informal waiver: it names what is not being fixed, who accepted that, and when it must be revisited. The model defines exception treatment as definition only and accepts no exception.

## V7-41.5 Retest discipline

This section is normative.

Every remediation names its retest rule: the family that must re-evaluate it, the evidence the retest must produce, and the environment in which the retest must occur. A retest re-exercises the governed task and its path classes, including failure and recovery, rather than confirming only that the specific defect appears fixed. Regression is guarded by re-evaluating the affected scenarios, not by assumption.

## V7-41.6 Traceability of issues

This section is normative.

Every issue traces to the scenario, validation family, or handoff artifact that raised it and to the governed obligation it concerns, so that no issue is orphaned and no obligation is quietly abandoned. The model records issue, exception, and retest items in register REG-704 with owners and forward gates. Package 4 defines this model; it exercises none of it.

## V7-41.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It raises no real issue, remediates nothing, and closes nothing. It creates no production user interface, production content, validated translation, coded interface, design-system implementation, executable workflow, or interface or integration contract, and no procurement, sequencing, staffing, cost, pilot, rollout, or master development plan. Every controlled record remains in a not-implemented-or-not-proven posture.
