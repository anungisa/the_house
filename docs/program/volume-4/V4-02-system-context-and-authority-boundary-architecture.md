# V4-02 - System Context and Authority-Boundary Architecture

Document ID: V4-02  
Title: System Context and Authority-Boundary Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 1 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-003)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-02.1 Purpose

This section is normative.

This chapter defines the target system context: the House platform, the Button experience surface,
and the external systems and actors with which the platform integrates, together with the authority
boundary at each edge. Each boundary is recorded as a DEP element in REG-401 and, where it carries
governed authority segregation, is constrained by a CTRL element.

## V4-02.2 Boundary description model

This section is normative.

Each system-context boundary is described by: the system or actor; the authority it owns; the
information it supplies; the information it consumes; the commands it is permitted to issue;
the acknowledgements it returns; its failure modes; its reconciliation mechanism; its privacy
classification; its continuity expectation; and its contract-validation status. In Package 1 all
contract-validation statuses are `TARGET_DEFINED` or `TARGET_ASSUMED`; no contract is validated.

## V4-02.3 The House platform

This section is normative.

The House is the governed system of record. It owns organizational identity, jurisdiction and
affiliation authority, seasonal policy versions, the requirements catalogue, affiliation case
lifecycle, evidence, review and decision, financial-obligation reconciliation status, activation,
authorization, audit, and the outbox. It supplies authoritative projections and events; it consumes
requests from the Button and acknowledgements from external systems; it fails closed when authority,
tenant, jurisdiction, or configuration cannot be established.

## V4-02.4 The Button experience surface

This section is normative.

The Button is a guided experience and projection surface. It owns no governed authority. It supplies
user-originated requests and consumes authoritative projections. Permitted commands are limited to
requesting governed actions the House authorizes. The Button never mutates governed state directly
and never becomes a second source of governed truth.

## V4-02.5 External systems and actors

This section is normative.

The target context includes, at minimum, the following external boundaries, each retaining only its
assigned authority: identity provider (authentication); payment processor (payment authority);
accounting or ledger system (financial system of record); existing registration systems and Curling
I/O (registration data of record where assigned); learning and accreditation systems; communication
providers; analytics consumers; document and evidence storage services; PTSO systems; and the
transitional manual process where an automated boundary is not yet available. For each, authority,
supplied and consumed information, permitted commands, acknowledgements, failure modes,
reconciliation, privacy classification, continuity expectation, and contract-validation status are
recorded as DEP elements in REG-401.

## V4-02.6 Authority-segregation invariant

This section is normative.

No external system's assigned authority may be silently absorbed by the House, and the House's
governed authority may not be delegated to the Button. Financial authority (payment capture,
ledger posting) remains with the assigned financial systems; the House records only reconciliation
status, never the authoritative financial ledger. This invariant is expressed as a CTRL element and
as a fitness function in V4-09.
