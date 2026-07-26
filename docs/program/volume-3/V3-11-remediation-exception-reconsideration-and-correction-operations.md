# V3-11 - Remediation, Exception, Reconsideration, and Correction Operations

Document ID: V3-11  
Title: Remediation, Exception, Reconsideration, and Correction Operations  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 3 Package 2 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-305 APP-V3-016)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V3-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 3 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-3/

## V3-11.1 Purpose

This section is normative.

This chapter defines how the operating model handles remediation, exceptions,
reconsideration, and correction. It separates these into distinct categories so that each
is handled under its own authority, evidence, audit expectation, and escalation, and so
that none silently substitutes for a governed lifecycle decision (BR-V3-010, CAP-V3-011).
It authorizes no implementation.

## V3-11.2 Correction and exception categories

This section is normative.

The following seven categories are distinct. A case is classified into exactly one
category for a given issue, and its category determines its authority (FR-V3-012,
CTRL-V3-011):

- **Applicant remediation** - the applicant corrects or completes evidence.
- **Operational exception** - an operating deviation resolved within operating authority.
- **Policy exception** - a deviation requiring a policy-authority decision.
- **Administrative correction** - a non-governed operating-record correction.
- **Decision reconsideration** - reconsideration or appeal of a governed decision.
- **Data-quality correction** - correction of a data record that is not a governed
  decision.
- **Incident recovery** - recovery from a service incident (V3-13).

## V3-11.3 Applicant remediation

This section is normative.

Applicant remediation handles missing or expired evidence and returns for information
(V3-10). The applicant supplies corrected evidence; the case re-enters at review
(RULE-V3-002 inherited). Authority to accept remediated evidence rests with the reviewer
within eligibility; repeated failure to remediate holds or escalates the case.

## V3-11.4 Operational exception

This section is normative.

An operational exception handles contradictory records, unresolved jurisdiction, and
temporary continuation within operating authority. It is resolved by the accountable
operating function and escalates to National Operations or the responsible PTSO where it
cannot be resolved. It does not decide policy and does not record a governed decision.

## V3-11.5 Policy exception

This section is normative.

A policy exception handles policy-exception requests, pathway disputes, and
representative-authority disputes that require a policy determination. It is decided by
the Compliance and Policy Function or the responsible jurisdictional authority
(RULE-V3-009). A reviewer may apply an existing policy but may not create exception
policy.

## V3-11.6 Administrative correction

This section is normative.

An administrative correction fixes a non-governed operating record (for example, a
mistyped contact field). It is performed within operating authority and recorded. An
administrative correction shall not alter a governed decision; a change to a governed
decision is a decision reconsideration, not an administrative correction (RULE-V3-012).

## V3-11.7 Decision reconsideration

This section is normative.

Decision reconsideration handles reconsideration and appeal of a governed decision,
including refusal and withdrawal outcomes. It is decided by the decision authority for
that decision through the governance kernel (V3-02); it is not an administrative edit
(RULE-V3-012). Reconsideration produces a governed outcome and an audit record.

## V3-11.8 Data-quality correction

This section is normative.

A data-quality correction fixes historical-record errors and duplicate-activation data
that are not themselves governed decisions. It is performed within operating authority
with recorded evidence. Where a data-quality issue affects a governed decision or a
financial obligation, it escalates to decision reconsideration or financial exception
handling (V3-12).

## V3-11.9 Incident recovery

This section is normative.

Incident recovery handles recovery from service incidents such as duplicate activation,
notification failure, or interrupted processing (V3-13). It restores correct operating
state and records the recovery. A duplicate-activation incident is recovered without
activating the affiliation a second time (RULE-V3-010, CTRL-V3-012).

## V3-11.10 Refusal, withdrawal, and continuation

This section is normative.

Refusal and withdrawal are governed outcomes handled through decision reconsideration
where reconsidered. Temporary continuation is an operational exception granted within
operating authority pending resolution and does not confer permanent standing.

## V3-11.11 Category authority and audit

This section is normative.

Each category records its authority, evidence, and audit expectation and escalates to its
category authority (CTRL-V3-011, NFR-V3-004). No category substitutes for a governed
lifecycle decision; governed changes occur only through the governance kernel (V3-02,
BR-V3-010).

## V3-11.12 Validation status

This section is normative.

The remediation, exception, reconsideration, and correction operations are author-asserted
and carry policy and operational validation pending. Policy exceptions require validation
with the Compliance and Policy Function; reconsideration authority requires validation
with National Operations (Rich) and jurisdictional authorities. Pending validation blocks
only the affected category or rule. Unresolved assumptions are recorded in V3-15.
