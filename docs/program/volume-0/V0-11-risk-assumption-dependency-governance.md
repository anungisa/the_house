# V0-11 - Risk, Assumptions, Dependencies, and Exceptions

Document ID: V0-11
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority; surname to be recorded in REG-001)
Associated Gate: G0
Ratification: Package 3; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable future gate (REG-006 APP-011)
Related Documents: V0-07 (decision classes and gates), V0-09 (delivery and exception-gated acceptance), V0-10 (traceability and validation), REG-003 (RAID register), REG-007 (exceptions register)

This chapter is normative except where a subsection is marked explanatory. It
defines the operational governance of risks, assumptions, issues, dependencies,
opportunities, and exceptions, including review dates, expiry, escalation,
remediation, gate impact, and residual-risk acceptance.

## 11.1 Purpose and scope

This subsection is normative.

Risk governance exists to make uncertainty explicit and accountable. This chapter
governs how uncertainty and deviation are recorded, reviewed, and resolved across
Volume 0 and the platform it governs. Operational records live in REG-003 (RAID) and
REG-007 (exceptions); this chapter defines the controls those registers must satisfy.

## 11.2 Governed record types

This subsection is normative.

The following record types are governed:

1. Risk - a possible future condition that would harm the program if it occurred.
2. Assumption - a condition taken as true without proof, whose falsity would harm
   the program.
3. Issue - a present condition already causing harm.
4. Dependency - a reliance on another party, system, or decision.
5. Opportunity - a possible future condition that would benefit the program.
6. Exception - an approved, time-bounded deviation from a non-constitutional
   requirement.

Each record carries a stable identifier in its namespace (V0-10 10.3), an owner, and
a status.

## 11.3 Risks

This subsection is normative.

Each risk records a title, an owner, a likelihood, an impact, a mitigation, a target
resolution, and its gate impact. A risk that bears on a gate must be visible at that
gate. An open risk with critical impact blocks the gate it bears on until mitigated
or governed by an explicit exception.

## 11.4 Assumptions and dependencies

This subsection is normative.

Each assumption and dependency records a title, an owner, a validation-due condition
or date, and the consequence if it proves false or unmet. An assumption or dependency
that is due for validation and remains unvalidated past its due condition must be
surfaced as a WARNING and escalated per 11.8.

## 11.5 Issues and opportunities

This subsection is normative.

Each issue records the present harm, its owner, and its remediation. Each opportunity
records the potential benefit and its owner. Issues that break a governed control are
critical defects under V0-09 9.7 and block gates accordingly.

## 11.6 Exceptions, waivers, and temporary bypasses

This subsection is normative.

An exception is the only sanctioned way to proceed despite an unmet non-constitutional
requirement. Every exception records:

1. A stable identifier and scope.
2. The requesting owner and the accepting authority.
3. The residual risk being accepted.
4. A start date, a review date, and an expiry date.
5. A remediation plan and the gates it affects.

An exception must never weaken a constitutional control - audit, evidence,
idempotency, tenancy, or fail-closed behaviour. A waiver or temporary bypass is a
form of exception and is governed identically. There is no unrecorded exception.

## 11.7 Review dates and expiry

This subsection is normative.

Every exception has a review date and an expiry date. On the review date the accepting
authority must reaffirm, remediate, or retire the exception. On the expiry date the
exception ceases to have force.

An expired exception must fail validation rather than remain silently active. An
exception approaching its expiry within its review window must be surfaced as a
WARNING. Continuing to rely on an expired exception is a constitutional defect.

## 11.8 Escalation and remediation

This subsection is normative.

Escalation follows the authority path in V0-07 7.8. A risk that materializes, an
assumption that proves false, a dependency that fails, or an exception that expires
without remediation is escalated to the accepting authority and, where it bears on a
gate, to that gate's control.

Remediation closes a record by removing the underlying condition, not by hiding it.
Closing a record without remediation is prohibited.

## 11.9 Gate impact

This subsection is normative.

Every governed record states its gate impact. The controls under V0-10 10.13
evaluate gate impact deterministically: open critical risks and expired active
exceptions are ERROR conditions at the gates they bear on; unvalidated assumptions
and dependencies past due are WARNING conditions.

## 11.10 Residual-risk acceptance

This subsection is normative.

Residual risk is the risk that remains after mitigation. Residual-risk acceptance is a
governed decision recorded in REG-002 and, where it permits proceeding despite an
unmet requirement, backed by an exception under 11.6. Residual-risk acceptance must
name the accepting authority and must not be implied or assumed. No residual risk is
accepted by silence.

## 11.11 Constitutional control

This subsection is normative.

This chapter is ratified under Package 3 by the Accountable Program Authority. Its
evidence basis is SELF-ATTESTED / AUTHOR-VERIFIED. It does not claim independent
validation and does not assert executive organizational acceptance. Amendments follow
the constitutional amendment control in V0-00 and are recorded in REG-002 and
REG-006.
