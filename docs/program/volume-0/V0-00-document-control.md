# V0-00 - Document Control and Normative Usage

Document ID: V0-00  
Title: Volume 0 Document Control and Normative Usage  
Status: IN_REVIEW  
Version: 0.3.0  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate G0)  
Supersedes: None  
Review Cycle: Monthly until ratified, then quarterly  
Repository Path: docs/program/volume-0/

## V0-FM-01 Document control

This section is normative.

Volume 0 controls all constitutional requirements for the Central Registration Platform program and all subordinate volumes inherit its controls unless a ratified exception exists.

Associated gate: G0 (Constitutional readiness)

Related decisions (see REG-002 and Annex B for the full set DEC-V0-001..015):

- DEC-V0-001 (proposed): Affiliation is first production vertical
- DEC-V0-002 (proposed): The House is the governed production foundation, treated
  as target-platform current implementation truth (production-candidate baseline),
  not established production truth
- DEC-V0-003 (proposed): The Button is the intended client-facing operating experience
- DEC-V0-004 (proposed): Base44 is discovery and reference corpus, not production authority

Decision classes (D0..D9) referenced by principles (V0-05) and Annex B are defined
in V0-07 and are ratified in Package 2. Until then they are provisional references.

## V0-FM-02 How to use this volume

This section is normative.

Use rules:

1. Normative statements in Volume 0 bind all subsequent program volumes.
2. Registers in registers/ are living controls and may change without republishing all chapter narratives.
3. In a conflict between narrative and a ratified register record, the ratified register record governs.
4. Future volumes MUST reference Volume 0 identifiers and traceability chain rules.
5. Conflicts are resolved by source hierarchy defined in V0-10.
6. Amendments require a decision record, identified authority, and version update.

Section type interpretation:

- Normative sections contain MUST, MUST NOT, SHOULD, MAY controls.
- Explanatory sections provide context only and do not override normative controls.

## V0-FM-03 Normative language

This section is normative.

- MUST: mandatory requirement
- MUST NOT: prohibited requirement
- SHOULD: expected unless justified and approved
- MAY: permitted option

## V0-FM-04 Solo-led accountability and combined roles

This section is normative.

The program operates under a solo-led, institutionally accountable delivery model
defined in V0-07. In this model, one individual (the Accountable Program
Authority) MAY perform multiple program roles where organizational capacity
requires it. Role combination does NOT remove the obligations attached to those
roles. Decisions, assumptions, evidence, tests, and conflicts MUST remain
explicitly recorded.

The corpus MUST distinguish four role states, which are not equivalent:

- role not performed;
- role performed by the Accountable Program Authority;
- role independently reviewed;
- role organizationally approved.

Combined authority MAY authorize progression but MUST NOT be represented as
independent validation. Any claim requiring independent assurance MUST remain
conditional until the appropriate review has occurred.

## V0-FM-05 Evidence labels

This section is normative.

Every governed readiness or compliance claim MUST carry one of the controlled
evidence labels defined in V0-07 7.4: `AUTHOR-VERIFIED`, `SELF-ATTESTED`,
`AUTOMATED-EVIDENCE`, `PEER-REVIEWED`, `DOMAIN-VALIDATED`, `REVIEWED`,
`EXECUTIVE-ACCEPTED`, `INDEPENDENTLY-ASSESSED`, or `PRODUCTION-PROVEN`.

An authorization label MUST NOT be used as a substitute for `INDEPENDENTLY-ASSESSED`
where independence is materially required (privacy, security, accessibility,
French-language, legal, financial-control, disaster-recovery, or material
compliance).
- PROPOSED: not yet ratified
- DEFERRED: explicitly postponed
- SUPERSEDED: replaced and no longer authoritative

## Document status model

This section is normative.

Allowed statuses:

- DRAFT
- IN_REVIEW
- RATIFIED
- IMPLEMENTED
- VERIFIED
- SUPERSEDED
- RETIRED

IMPLEMENTED and VERIFIED are separate statuses.

## Amendment control

This section is normative.

Any constitutional change MUST include:

- change summary
- reason for change
- impacted principles, decisions, or controls
- decision authority and approval record
- effective date
- rollout or transition implications
