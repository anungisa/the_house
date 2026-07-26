# V5-44 - Authoritative Information Catalogue and Accountability Matrix

Document ID: V5-44
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G5
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G5)

## V5-44.1 Purpose

This section is normative.

This chapter produces the final authoritative catalogue of Volume 5 information domains and
their responsibilities. It is documentary and authorizes no implementation. The authoritative
domain records are the INFORMATION_DOMAIN records in REG-501. This matrix is governed by
decisions ADR-V5-047 and ADR-V5-048.

## V5-44.2 Accountability attributes per domain

This section is normative.

For every governed information domain, the accountability matrix identifies:

- domain;
- business authority;
- data owner;
- data steward;
- system-of-record authority;
- technical custodian status;
- permitted writers;
- permitted readers;
- correction authority;
- reconciliation authority;
- privacy authority;
- records authority;
- scope;
- classification;
- external dependency;
- projection relationship;
- validation status.

Each attribute resolves to fields already recorded on the governed INFORMATION_DOMAIN records in
REG-501. Every domain names a business authority, a system-of-record authority, and a data
steward; the fail-closed domain-ownership guard denies any domain lacking these.

## V5-44.3 Required separations of accountability

This section is normative.

The matrix demonstrates the following non-negotiable separations:

- stewardship does not imply business decision authority;
- custody does not imply ownership;
- finance authority does not imply affiliation authority;
- privacy authority does not imply records-disposition authority;
- external-system custody does not silently transfer institutional authority;
- The Button remains a governed consumer rather than an independent source of affiliation truth.

These separations are enforced conceptually by ADR-V5-047 (distinct responsibilities) and
ADR-V5-048 (The Button as governed consumer), and are consolidated from the Package 1 authority
matrix and the Package 3 ownership, stewardship, custody, and decision-rights model.

## V5-44.4 External dependency and projection posture

This section is normative.

Where a domain depends on an external authority, the dependency is recorded as
EXTERNAL_AUTHORITY_DATA and never granted independent House authority. Where a domain is
consumed through a projection, the projection relationship is recorded as non-authoritative.
No entry in this matrix authorizes implementation, provisioning, procurement, or the transfer of
authority to any custodian or experience layer.
