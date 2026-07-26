# V5-02 - Information Domain Catalogue and Authority Matrix

Document ID: V5-02
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G1)

## V5-02.1 Purpose

This section is normative.

This chapter catalogues the governed information domains of The House v2 and states
the authority matrix for each. The authoritative catalogue is REG-501; this chapter
is its governing narrative. Every information domain names an explicit business
authority, a system-of-record authority, and a data steward. A domain without those
authorities fails the authority-ownership control (CTRL-V5-001).

## V5-02.2 Information domains

This section is normative.

The following twenty-five governed information domains are catalogued
(DOMAIN-V5-001 through DOMAIN-V5-025):

- Party and organization: Organization and Club (DOMAIN-V5-001); Organization
  Recognition and Continuity (DOMAIN-V5-002); Representative Authority
  (DOMAIN-V5-003).
- Scope and calendar: Jurisdiction (DOMAIN-V5-004); Season (DOMAIN-V5-005).
- Affiliation core: Affiliation Case (DOMAIN-V5-006); Pathway (DOMAIN-V5-007);
  Policy and Requirement Versions (DOMAIN-V5-008); Responses and Acknowledgements
  (DOMAIN-V5-009).
- Evidence and submission: Evidence Metadata (DOMAIN-V5-010); Evidence Binary
  References (DOMAIN-V5-011); Submission Snapshots (DOMAIN-V5-012).
- Review and decision: Review and Assignment (DOMAIN-V5-013); Decision
  (DOMAIN-V5-014); Activation (DOMAIN-V5-019).
- Finance: Fee Obligation (DOMAIN-V5-015); Payment Acknowledgement
  (DOMAIN-V5-016); Accounting Confirmation (DOMAIN-V5-017); Reconciliation
  (DOMAIN-V5-018).
- Service context: Communications (DOMAIN-V5-020); Support (DOMAIN-V5-021).
- Records and assurance: Administrative Corrections (DOMAIN-V5-022); Audit
  (DOMAIN-V5-023).
- Derived: Projections (DOMAIN-V5-024); Analytics and Exports (DOMAIN-V5-025).

## V5-02.3 Authority matrix

This section is normative.

Each domain records four distinct authority facts:

- Business authority — the institution accountable for the domain's governed
  meaning and decisions. For most affiliation domains this is The House; for
  recognition, jurisdiction, season, policy, and national accounting context it is
  Curling Canada.
- System-of-record authority — the designated governed source of truth. For most
  domains this is The House. For Evidence Binary References (DOMAIN-V5-011),
  Payment Acknowledgement (DOMAIN-V5-016), and Accounting Confirmation
  (DOMAIN-V5-017) the system-of-record authority is external, while business
  authority remains with The House or Curling Canada.
- Data steward — the role responsible for quality and correct maintenance.
- Technical custody — recorded as pending logical design; custody never confers
  business ownership.

The matrix also records permitted writers, permitted readers, jurisdiction scope,
classification, correction authority, reconciliation dependency, retention-policy
status (pending records-policy authority), and projection relationship for each
domain.

## V5-02.4 External system-of-record boundaries

This section is normative.

Where a system-of-record authority is external, The House retains business
authority and preserves the provenance of imported facts. External custody is a
custody fact only; it does not transfer governed ownership. These boundaries are
recorded as constrained and carry validation obligations (EXC-V5-001, EXC-V5-002,
TEST-V5-012) resolved downstream.

## V5-02.5 Retention posture

This section is normative.

Every domain records retention-policy status as pending an approved records-policy
authority. This chapter sets no retention schedule and no deletion rule. Retention
and deletion depend on RULE-V5-011 and are deferred to the records-policy authority
(Volume 11), tracked by TEST-V5-009 and TEST-V5-010.
