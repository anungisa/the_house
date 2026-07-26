# V5-04 - Affiliation, Season, Policy, Requirement, and Evidence Conceptual Model

Document ID: V5-04
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G1)

## V5-04.1 Purpose

This section is normative.

This chapter defines the conceptual model of the affiliation lifecycle and the
information it governs: the affiliation case and its pathway; the season envelope;
versioned policy and requirements; responses, evidence, and submission snapshots;
review, decision, reconciliation, and activation. It designs no physical structure
and authorizes no implementation. It is consistent with the inherited Affiliation
Application lifecycle governed by the Governance Kernel.

## V5-04.2 Affiliation case and pathway

This section is normative.

An affiliation case (DOMAIN-V5-006) binds exactly one recognized organization
(ENTITY-V5-001) to a season and a pathway (REL-V5-001). The pathway
(DOMAIN-V5-007) determines which applicable requirement versions govern the case.
An organization may hold many cases across seasons; a case belongs to exactly one
organization.

## V5-04.3 Season envelope

This section is normative.

A season (DOMAIN-V5-005) is the temporal envelope for governed affiliation records.
Each case is scoped to a single season. Season definition is authoritative and
national; season uniqueness and boundary rules are validated by TEST-V5-006.

## V5-04.4 Policy and requirement versioning

This section is normative.

Policy and requirement definitions (DOMAIN-V5-008) are versioned. Each governed
response records the applicable policy and requirement versions that governed it
(LINEAGE-V5-002). Applicability is fixed at the relevant time and is not silently
re-based when a later version is published. Versioning obligations are validated by
TEST-V5-007.

## V5-04.5 Responses, evidence, and submission snapshots

This section is normative.

Responses and acknowledgements (DOMAIN-V5-009) are recorded against applicable
requirement versions. Evidence metadata (DOMAIN-V5-010) describes submitted
evidence; evidence binary references (DOMAIN-V5-011) point to an external object
store while business authority remains with The House. A submission snapshot
(DOMAIN-V5-012) preserves the applicable versions and submitted facts at submission
time and is immutable and append-only (LINEAGE-V5-004).

## V5-04.6 Review, decision, reconciliation, and activation

This section is normative.

Review and assignment (DOMAIN-V5-013) governs reviewer activity; an assigned
reviewer is distinct from the reviewer role (REL-V5-005). A decision
(DOMAIN-V5-014) is a governed outcome. Activation (DOMAIN-V5-019) is a distinct
governed state, separate from the decision that authorized it. Financial
information — fee obligation (DOMAIN-V5-015), payment acknowledgement
(DOMAIN-V5-016), accounting confirmation (DOMAIN-V5-017), and reconciliation
(DOMAIN-V5-018) — is scoped to explicit finance authority (REL-V5-006).

## V5-04.7 Invariants

This section is normative.

The following conceptual invariants bind downstream design:

- A case has exactly one organization and one season.
- Applicable versions are fixed at submission and preserved in the snapshot.
- A decision is not the same fact as activation.
- Financial-status information is scoped to explicit finance authority.
- Evidence provenance is preserved when evidence is replaced (LINEAGE-V5-003).
