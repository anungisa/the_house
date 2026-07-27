# V7-26 - Reviewer, Finance, Support, Privacy, and Administrative Workbench Design

Document ID: V7-26
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V7-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V7-G3)

## V7-26.1 Purpose

This section is normative.

This chapter defines the design of the governed staff workbenches for the club-affiliation experience: reviewer, finance, support, privacy, and administrative-correction. It records workbench component specifications in register REG-701 and preserves the authority-separation model established in Package 2.

## V7-26.2 Authority separation is preserved in design

This section is normative.

Reviewer, finance, support, privacy, and administrative-correction authorities remain distinct in design. No workbench design merges these authorities, and no workbench presents an action that its authority does not hold. The reviewer workbench does not present finance authority, the finance workbench does not present review authority, support presents neither, the privacy function is distinct from all task authorities, and administrative correction is distinct from decision authority. Each workbench design names its authority posture, its authority constraints, and its prohibited actions.

## V7-26.3 Reviewer and finance workbench design

This section is normative.

The reviewer workbench is designed to present completeness, evidence provenance, and eligibility for recommendation, and it distinguishes a review recommendation from a governed decision. The finance workbench is designed to present fee status and reconciliation, and it distinguishes a payment acknowledgement from an accounting confirmation. Neither workbench presents authority reserved to the other.

## V7-26.4 Support, privacy, and administrative-correction design

This section is normative.

The support workbench is designed to assist without acquiring governed authority; it can guide, locate, and route, but it cannot decide, approve, activate, or alter governed records. The privacy and records function is designed to serve disclosure, retention, and correction of personal information under its own authority and never as a task shortcut. Administrative correction is designed to record a governed correction with provenance and never to substitute for a decision.

## V7-26.5 Shared workbench conventions

This section is normative.

All workbench designs share conventions for queue and case presentation, evidence review, status meaning, accessibility, and bilingual equivalence, so that governed staff experience consistent meaning across functions. Every workbench design discloses the sensitivity of the information it presents and never exposes restricted information beyond the authority of its operator.

## V7-26.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It creates no production content, coded interface, design-system implementation, executable workflow, access-control implementation, or interface or integration contract, and no procurement, sequencing, staffing, cost, pilot, rollout, or master development plan. It defines documentary governed staff workbench design only, pending Gate V7-G3.
