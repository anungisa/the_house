# V5-21 - Master, Reference, Transactional, Evidentiary, and Derived-Data Classification Model

Document ID: V5-21
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G3)

## V5-21.1 Purpose

This section is normative.

This chapter defines the classification of governed data by its role in The House
system of record. It distinguishes master data, reference data, transactional data,
lifecycle history, evidentiary data, audit data, derived data, analytical data,
external-authority data, and transitional data. The classification governs how each
data class is authored, versioned, stewarded, retained, and disclosed. The authoritative
catalogue is REG-501 and the authoritative rules are REG-502. This chapter authorizes
no implementation.

## V5-21.2 Data classes

This section is normative.

The governed data classes are:

- master data — the authoritative record of a real entity such as an organization,
  club, provincial or territorial sport organization, or person;
- reference data — governed, versioned code sets and controlled vocabularies that give
  meaning to other data;
- transactional data — governed operational records such as affiliation cases, fee
  obligations, and payment acknowledgements;
- lifecycle history — the append-only record of state transitions and corrections;
- evidentiary data — evidence metadata and decision records held under custody rules;
- audit data — the immutable record of who did what and when;
- derived data — non-authoritative projections computed from governed sources;
- analytical data — aggregate, non-authoritative outputs used for reporting;
- external-authority data — governed copies of facts owned by an external authority;
  and
- transitional data — data in intake, staging, or migration that is not yet governed.

## V5-21.3 Master data

This section is normative.

Each master data set (REG-501, MDS-V5-001 through MDS-V5-005) names exactly one
authority owner and one steward. Authority and stewardship are distinct: the authority
owner is accountable for correctness of meaning; the steward maintains the record. A
person is distinct from an authenticated account, from an organization membership, from
a representative authority, from a reviewer assignment, and from a finance authority; no
master data set may collapse these into one identity.

## V5-21.4 Reference and transactional data

This section is normative.

Reference data is versioned and never silently changed; its governance is defined in
V5-22. Transactional data records governed operational facts and preserves the
distinctions established in Volume 5 Package 2, including payment acknowledgement versus
accounting confirmation and affiliation approval versus activation authorization versus
activation execution.

## V5-21.5 Evidentiary, audit, and lifecycle data

This section is normative.

Evidentiary data, audit data, and lifecycle history are append-only and are held under
the custody, evidence, and temporal-truth rules of Packages 1 and 2. They may be
corrected only by governed supersession, never by silent overwrite.

## V5-21.6 Derived, analytical, and external-authority data

This section is normative.

Derived and analytical data are non-authoritative projections and never become a
competing source of truth (RULE-V5-014). External-authority data is held as an aligned
governed copy and is never given independent House authority (RULE-V5-013). Transitional
data carries no governed authority until it is validated and promoted.

## V5-21.7 Downstream constraints and no authorization

This section is normative.

The classification constrains downstream volumes: logical and physical design must
preserve the class boundaries; derived and analytical data must remain non-authoritative
with lineage preserved; and external facts must retain their external authority. No
record in this chapter authorizes implementation, physical design, storage or vendor
selection, retention approval, or procurement. The classification validation obligation
is recorded in REG-504 (TEST-V5-019) and remains open until its future gate.
