# V5-26 - Identity Resolution, Duplicate Management, Merge, Split, and Survivorship Model

Document ID: V5-26
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G3)

## V5-26.1 Purpose

This section is normative.

This chapter governs identity resolution: how suspected duplicate records are detected,
managed, merged, split, and reconciled through survivorship, without corrupting governed
identity. The authoritative catalogue is REG-501 and the authoritative rules are REG-502.
This chapter authorizes no implementation and defines no executable matching mechanism.

## V5-26.2 Similarity is not identity

This section is normative.

Similarity between records is advisory evidence of possible duplication; it is never
identity. Automated matching is advisory unless validated by a steward with evidence.
Governed master records denote distinct real entities; suspected duplicates are governed as
issues, not silently merged (QUALITY-V5-014). Over-merging on similarity is a recognized
risk (REG-504, RISK-V5-004).

## V5-26.3 Duplicate management

This section is normative.

A suspected duplicate is raised as a data issue (REG-501, DISS-V5-001 and DISS-V5-002) with
an issue classification and a resolution authority. The issue records the compared records
and the evidence considered. Person, authenticated account, membership, representative
authority, reviewer assignment, and finance authority remain distinct and are never merged
across those boundaries.

## V5-26.4 Merge, split, and survivorship

This section is normative.

A merge combines records determined to denote the same real entity; a split separates
records incorrectly combined. Both are evidence-based decisions made by the resolution
authority and retain evidence. Survivorship determines which attribute values survive a
merge, preserving authoritative source and lineage. A merge or split never discards
lifecycle history or audit data.

## V5-26.5 Downstream constraints and no authorization

This section is normative.

Downstream volumes must treat automated matching as advisory, require evidence for merge or
split, and preserve identity separation. No record in this chapter authorizes implementation
of a matching engine, tooling selection, or automated merging. The identity-resolution
validation obligation remains open in REG-504 until its future gate.
