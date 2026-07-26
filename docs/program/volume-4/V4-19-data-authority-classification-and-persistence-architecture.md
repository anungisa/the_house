# V4-19 - Data Authority, Classification, and Persistence Architecture

Document ID: V4-19  
Title: Data Authority, Classification, and Persistence Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 3 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-028)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G3)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-19.1 Purpose and scope

This section is normative.

This chapter defines architecture-level data authority, classification, and persistence boundaries
for the affiliation domain and its supporting information. It identifies, for each information
domain, the authoritative module and record, its permitted writers and readers, its classification,
its tenant or jurisdiction scope, and its transaction, correction, audit, retention, projection, and
external-reconciliation dependencies. It is **architecture definition only**: it authors no physical
schema, no migration, no DDL, no storage-vendor selection, and no approved retention schedule, and
it claims no implemented persistence.

## V4-19.2 Information domains and authoritative ownership

This section is normative.

The following information domains are governed, each with a singular authoritative owning module
(DATA-V4-015): organizations; representative authority; jurisdictions; seasons; policy and
requirement versions; affiliation cases; responses and evidence references; submissions; review
activity; decisions; financial obligations and reconciliation status; activation; communications;
support; audit; and projections and reporting. For each information domain the architecture
identifies its authoritative module, authoritative record, permitted writers, permitted readers,
classification, tenant or jurisdiction scope, transaction requirement, correction authority, audit
expectation, retention-status dependency, projection relationship, external-reconciliation
dependency, and validation status. Authoritative ownership is **singular and explicit**
(ARCH-V4-019); no information domain has two competing sources of governed truth.

## V4-19.3 Classification and access control

This section is normative.

Every information domain carries a data classification that governs access, logging, retention, and
transfer (NFR-V4-017). Classification is an architectural input to the resource-aware authorization
decision defined in V4-15 and to the observability and export boundaries defined in V4-24 and V4-26.
Restricted and sensitive classes require explicit authorization for read, export, and log inclusion.
Classification does not by itself assert an approved retention schedule; retention remains governed
by the records and privacy policy and is recorded as an assumption (REG-404).

## V4-19.4 Tenant and jurisdiction scope

This section is normative.

Tenant-owned and jurisdiction-scoped information is bound to an explicit tenant or jurisdiction
context. Cross-jurisdiction access **fails closed** (CTRL-V4-019): a read or write whose tenant or
jurisdiction context is missing, ambiguous, or mismatched is denied rather than defaulted. This
preserves the jurisdiction isolation established in Volume 4 Package 2 at the persistence boundary.

## V4-19.5 Projections and derived data

This section is normative.

Projections, read models, search indexes, reporting views, and Button-facing data are **derived from
House authority** and never become sources of governed truth (constrains V4-22). External-system data
is treated according to its assigned authority: where an external system is authoritative (for
example a payment or accounting ledger), the House records reconciliation status only and does not
assert the external authoritative record. The projection relationship and external-reconciliation
dependency of each information domain are recorded in the data-authority map (DATA-V4-015).

## V4-19.6 Non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no physical schema, table, column, index, ORM
mapping, or migration; provisions no storage; selects no vendor; and approves no retention schedule.
It claims no implemented persistence and fabricates no privacy, security, or operational validation.
Every element it introduces carries `authorizes_implementation: false`.
