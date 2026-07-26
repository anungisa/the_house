# V5-01 - Data Doctrine, Principles, and Governance Model

Document ID: V5-01
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G1)

## V5-01.1 Purpose

This section is normative.

This chapter states the data doctrine of The House v2: the durable principles that
govern how information is owned, trusted, corrected, and protected. The doctrine
binds every downstream data volume. It defines governance meaning only and does not
authorize any physical realization.

## V5-01.2 Data principles

This section is normative.

The following twelve principles are governing. Each corresponds to a doctrine rule
recorded in REG-502.

1. Institutional authority precedes storage location (RULE-V5-001). Authority over
   information is determined by governance, not by where data resides.
2. Authoritative ownership is singular and explicit (RULE-V5-002). Each information
   domain has exactly one explicit authoritative owner.
3. Stewardship does not automatically confer decision authority (RULE-V5-003). A
   steward manages quality; governed decisions require distinct authority.
4. Technical custody does not confer business ownership (RULE-V5-004). Holding or
   hosting data grants no business ownership of it.
5. Projections remain non-authoritative (RULE-V5-005). Read models, reports, and
   analytics are never sources of governed truth.
6. Externally sourced information retains provenance (RULE-V5-006). Imported facts
   retain their source and transformation lineage.
7. Uncertainty is represented rather than erased (RULE-V5-007). Ambiguous data is
   modelled explicitly, not silently resolved.
8. Corrections preserve governed history (RULE-V5-008). Corrections supersede; they
   never erase prior governed history.
9. Data minimization applies at all boundaries (RULE-V5-009). Minimization applies
   at collection, query, export, logging, and analytics.
10. Bilingual and accessibility obligations apply to governed data (RULE-V5-010).
    Governed definitions and supporting content honour bilingual equivalence and
    accessibility.
11. Retention and destruction depend on approved policy (RULE-V5-011). Retention and
    deletion rules require records-policy authority, deferred beyond this package.
12. Evidence of implementation precedes operational claims (RULE-V5-012). Controls
    are not described as operational until implementation evidence exists.

## V5-01.3 Governance responsibilities

This section is normative.

The data governance model assigns distinct responsibilities:

- Business authority owns the meaning and governed decisions of a domain.
- System-of-record authority is the designated governed source of truth.
- Data stewardship maintains quality, corrects defects, and preserves lineage.
- Custody operates and hosts data on behalf of the business authority.

Responsibilities are recorded per domain in REG-501. No single party may silently
combine authority, stewardship, and custody without explicit governed record.

## V5-01.4 Relationship to the Governance Kernel

This section is normative.

The data doctrine is consistent with the inherited Governance Kernel: governed
lifecycle transitions remain the sole authority for state change, and data
definitions here never introduce a competing mechanism for mutating governed
state. Data corrections are governed operations, not direct mutations.

## V5-01.5 Downstream binding

This section is normative.

These principles bind all later data volumes. Logical design (Volume 8), testing
(Volume 9), migration (Volume 10), and records policy (Volume 11) must conform to
this doctrine. Any conflict is resolved in favour of the doctrine until the doctrine
is amended through the recorded process.
