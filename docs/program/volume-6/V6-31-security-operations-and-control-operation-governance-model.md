# V6-31 - Security-Operations and Control-Operation Governance Model

Document ID: V6-31
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G4)

## V6-31.1 Purpose and scope

This section is normative.

This chapter opens Package 4 of Volume 6 by defining the security-operations and
control-operation governance model for the affiliation service. It defines the
obligations that must exist before any monitoring, detection, incident response,
recovery, resilience, or assurance capability may be operated. It defines a
control model only. It stands up no security-operations function, writes no
runbook, configures no monitoring rule, and authorizes no implementation.

## V6-31.2 Security operation as a governed obligation

This section is normative.

Every control defined in Volume 6 that must be operated over time is a governed
control with a defined obligation to operate it. A control that is defined but has
no owner accountable for operating it, no evidence that establishes it is operating,
and no validation status is not an operating control. This chapter records that a
control's definition and a control's operation are distinct governance facts, and
that a definition alone confers no operational effect and no assurance.

## V6-31.3 Control-operation ownership

This section is normative.

Every operable control must name a control owner accountable for its definition and
a control-operator status describing whether an operator accountable for running it
exists. Where no operator is yet appointed, the operator status is recorded as
pending under a future volume, and the control is treated as defined but not
operated. Ownership of a control's operation is distinct from ownership of the
obligation the control serves and from any future authority to implement it.

## V6-31.4 Failure posture of operated controls

This section is normative.

Every operable control carries a failure posture describing how it must behave when
it cannot operate correctly: fail closed, fail safe, degrade visibly, or escalate
for manual decision. A control whose failure posture is not defined must not be
relied upon. Where an operated control protects governed authorization, tenant
isolation, evidence integrity, or consent, its failure posture must be fail closed
unless a named authority records a different posture with evidence. No posture in
this chapter is asserted to be implemented or validated.

## V6-31.5 Dependency on monitoring, escalation, review, and assurance

This section is normative.

An operated control depends on the ability to detect that it is failing, to escalate
that failure to an accountable authority, to review its operation over time, and to
subject its operation to independent assurance. Each operable control records these
dependencies as pending until the corresponding capability is defined and validated
under a future gate. Recording a dependency is not a claim that the dependency is
satisfied.

## V6-31.6 Compensating controls

This section is normative.

Where a defined control cannot yet be operated, the governance model permits a
compensating-control requirement to be recorded so that the residual exposure is
visible and owned. A compensating-control requirement is a statement that some
alternative protection must exist and be validated before the exposure is accepted;
it is not itself a control, is not asserted to be in place, and confers no assurance.

## V6-31.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It establishes no security-operations
team, staffing model, or on-call rotation; writes no runbook or operating procedure;
configures no monitoring, alerting, or detection rule; selects no tool or provider;
sets no availability, response-time, or staffing target; and makes no claim that any
control is operating or effective. Every record introduced by this chapter remains
`authorizes_implementation: false` and `implementation_status:
NOT_IMPLEMENTED_OR_NOT_PROVEN`.
