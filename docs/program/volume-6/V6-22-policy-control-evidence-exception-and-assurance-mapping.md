# V6-22 - Policy, Control, Evidence, Exception, and Assurance Mapping

Document ID: V6-22
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G3)

## V6-22.1 Purpose and scope

This section is normative.

This chapter defines how a compliance obligation is mapped to a control objective,
to required evidence, to an exception authority, and to an assurance requirement. It
defines the mapping structure only. It writes no executable policy, operates no
control, produces no evidence, grants no exception, and authorizes no
implementation.

## V6-22.2 Obligation-to-control mapping

This section is normative.

Every compliance obligation references a control objective that expresses the
control intent required to address the obligation. The obligation records its
authority owner, its applicability status, the evidence required to satisfy it, and
its future blocking gate. The referenced control objective records its owner, its
required evidence, and its future blocking gate. A mapping records intent and
ownership; it does not implement, configure, or operate any control.

## V6-22.3 Policy is not control operation

This section is normative.

A recorded control objective is a statement of required control intent. It is not
an executable policy, a configuration, a permission, a rule, or a running control.
The separation between an obligation, its control objective, the executable policy
that may later realize it, and the operational proof that it works is preserved at
every layer. No executable policy is authored, and no policy engine, rule, or
configuration is created by this mapping.

## V6-22.4 Evidence classes

This section is normative.

Required evidence is classified so that the maturity of each control is explicit:
control defined; design evidence required; implementation evidence required; test
evidence required; operational proof required; and independent assurance required.
A control at the control-defined stage carries no design, implementation, test,
operational, or assurance evidence, and the register records the evidence still
outstanding. No evidence class in this volume asserts that evidence exists.

## V6-22.5 Exception authority

This section is normative.

Where an obligation may be met by an exception rather than by direct control, the
exception is owned by a named exception authority, is time-bound by a recorded
expiry, and requires its own evidence. An exception is a governed disposition, not a
waiver of the obligation, and never authorizes implementation. Recording an
exception authority does not grant, approve, or extend any exception.

## V6-22.6 Assurance mapping

This section is normative.

Where an obligation requires independent validation before reliance, it maps to an
assurance requirement that records the assurance classification, the required
evidence, the responsible owner, and the future blocking gate. Independent assurance
is distinct from control definition, from implementation evidence, and from
operational proof. No assurance is claimed and no assurer is selected.

## V6-22.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It writes no executable policy, rule, or
configuration; operates no control; produces no evidence; grants, approves, or
extends no exception; and selects no assurer, auditor, or provider. Every record
introduced by this chapter remains `authorizes_implementation: false` and
`implementation_status: NOT_IMPLEMENTED_OR_NOT_PROVEN`.
