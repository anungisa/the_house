# V6-25 - Accessibility Requirement, User-Need, and Workflow Model

Document ID: V6-25
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G3)

## V6-25.1 Purpose and scope

This section is normative.

This chapter defines the accessibility control model for the affiliation service in
terms of user needs and the governed workflows that must remain accessible to them.
It defines accessibility requirements and their verification dependency only. It
builds no interface, claims no conformance, runs no test, and authorizes no
implementation.

## V6-25.2 User-need model

This section is normative.

Accessibility is expressed as user needs held by people with disabilities and by
people relying on assistive technology: the need to perceive service content, to
operate service controls, to understand service meaning, and to complete governed
workflows without exclusion. Each accessibility obligation records the user need it
protects and the workflow it affects. The user-need model frames requirements; it
implements no accommodation and asserts no capability.

## V6-25.3 Workflow accessibility

This section is normative.

Accessibility requirements attach to governed workflows — the end-to-end tasks a
user must complete — rather than to isolated interface elements. A workflow is
accessible only when a user with the relevant need can complete it and reach the same
governed outcome. This chapter identifies the affected workflows and the required
behaviour; it constructs no workflow and validates no outcome.

## V6-25.4 Requirements carry a verification method

This section is normative.

Every accessibility obligation records a verification method and an
operational-proof dependency so that conformance can be tested later by an
independent authority. A recorded verification method describes how conformance
would be validated; it does not perform validation and does not assert that any
success criterion is met.

## V6-25.5 Accessibility is defined by user need and task flow

This section is normative.

Accessibility is determined by whether a user with a given need can complete a
governed task, not by the presence of individual interface features. Feature
presence is never treated as conformance, and conformance is never inferred from
design intent. Conformance requires independent verification evidence recorded under
a future gate.

## V6-25.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It builds no interface or component, runs
no test, claims no accessibility conformance, and selects no tool or assessor. Every
record introduced by this chapter remains `authorizes_implementation: false` and
`implementation_status: NOT_IMPLEMENTED_OR_NOT_PROVEN`.
