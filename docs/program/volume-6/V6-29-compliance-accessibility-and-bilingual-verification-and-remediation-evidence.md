# V6-29 - Compliance, Accessibility, and Bilingual Verification and Remediation Evidence

Document ID: V6-29
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G3)

## V6-29.1 Purpose and scope

This section is normative.

This chapter defines the verification and remediation evidence model for compliance,
accessibility, and bilingual-equivalence controls: how a defect is classified, what
remediation evidence and retest are required, and what reviewer qualification is
needed before a conformance claim may be made. It defines the evidence model only. It
runs no verification, remediates no defect, and authorizes no implementation.

## V6-29.2 Verification evidence

This section is normative.

Every compliance, accessibility, or bilingual control that requires validation records
a verification method and the assurance classification of the evidence required.
Verification evidence is produced by a qualified reviewer under a future gate. The
model records what verification is required and by whom; it performs no verification
and asserts no result.

## V6-29.3 Defect classification and remediation

This section is normative.

Where verification would find a defect, the model records a defect classification, the
remediation evidence that would be required to resolve it, and the retest requirement
that must pass before the defect is considered closed. Remediation is evidence-bearing
and is never assumed. This chapter defines the remediation structure; it classifies no
actual defect and performs no remediation.

## V6-29.4 Remediation requires retest

This section is normative.

A defect is not resolved by a remediation action alone; it is resolved only when a
retest, performed to the same verification standard, passes and its evidence is
recorded. No defect is closed on assertion, and no remediation is accepted without
retest evidence.

## V6-29.5 Reviewer qualification and conformance claims

This section is normative.

A conformance claim requires validated verification evidence produced by a reviewer
whose qualification is recorded and appropriate to the control being validated. Until
such evidence exists, the control is recorded as pending and no compliance,
accessibility, or bilingual conformance is claimed. Conformance claims require
evidence; they are never made on design intent or on the presence of a control.

## V6-29.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It runs no verification, classifies no
actual defect, performs no remediation, retests nothing, selects no reviewer or
assessor, and claims no conformance. Every record introduced by this chapter remains
`authorizes_implementation: false` and `implementation_status:
NOT_IMPLEMENTED_OR_NOT_PROVEN`.
