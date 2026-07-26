# V5-24 - Data-Quality Rule Lifecycle, Measurement, Exception, and Remediation Governance

Document ID: V5-24
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G3)

## V5-24.1 Purpose

This section is normative.

This chapter governs the lifecycle of data-quality rules: how a quality rule is defined,
measured, excepted, and remediated. It defines quality as a governed concept, not an
implemented mechanism. The authoritative rules are REG-502 and the authoritative backlog
is REG-504. This chapter authorizes no implementation and defines no executable quality
rule.

## V5-24.2 Quality dimensions

This section is normative.

Governed data quality is expressed across dimensions including validity, completeness,
consistency, and uniqueness. Package 3 defines quality rules for reference-data validity
(QUALITY-V5-011), master-data completeness (QUALITY-V5-012), reconciliation consistency
(QUALITY-V5-013), and identity uniqueness (QUALITY-V5-014). Each names a correction
authority.

## V5-24.3 Quality-rule lifecycle

This section is normative.

A quality rule progresses through definition, measurement, exception where warranted, and
remediation. A rule defines a detection concept and a correction type; it does not
prescribe an executable check. Measurement establishes a baseline status and a target
status without asserting that either has been achieved.

## V5-24.4 Exceptions

This section is normative.

A failing quality rule may be granted a time-bounded exception by a named exception
authority; permanent silent waivers are not permitted (REG-504, EXC-V5-003). Each
exception names an exception authority and an exception expiry, after which the exception
escalates to the accountable program authority. An exception never authorizes
implementation and never claims that quality has been achieved.

## V5-24.5 Remediation

This section is normative.

Remediation resolves a quality failure through governed correction and retains correction
evidence. Correction is by governed process or supersession, never by silent overwrite.
Downstream impact is recorded so that dependent data is re-validated after correction.

## V5-24.6 Downstream constraints and no authorization

This section is normative.

Downstream volumes must implement quality measurement and remediation only against the
governed rules and must enforce exception expiry. No record in this chapter authorizes
implementation of executable quality rules, tooling selection, or procurement. The
quality-lifecycle validation obligations remain open in REG-504 until their future gates.
