# V4-39 - Integrated Target-Architecture Baseline

Document ID: V4-39  
Title: Integrated Target-Architecture Baseline  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 5 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-056)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G5)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 5 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-39.1 Purpose and scope

This section is normative.

This chapter consolidates the architecture established across Volume 4 Packages 1 through 4 into a
single integrated target-architecture baseline (ARCH-V4-037). It is **consolidation only**: it
restates and connects architecture already ratified in V4-00 through V4-38 and does not introduce any
unsupported architectural choice merely to make the corpus appear complete. It authorizes no
implementation, physical schema, migration, executable contract, infrastructure, technology or vendor
selection, procurement, delivery sequencing, staffing, cost plan, pilot, rollout, or master
development plan, and it claims no implemented, secured, accredited, restored, or operationally proven
capability.

## V4-39.2 Baseline coverage

This section is normative.

The integrated baseline covers, without altering, the following architecture established in Packages 1
through 4: system context and House and Button authority separation (V4-02); bounded contexts and
inward dependency direction (V4-03, V4-10); the affiliation domain and lifecycle (V4-04, V4-11, V4-13);
application services, commands, queries, and error semantics (V4-14); resource-aware authorization
(V4-05, V4-15); evidence architecture (V4-06, V4-21); transaction, concurrency, idempotency, and
outbox consistency (V4-16); persistence and PostgreSQL integrity (V4-19, V4-20); read-model
projections, search, and analytics (V4-22); integration contracts, messaging, and reconciliation
(V4-07, V4-23); security, privacy, cryptography, secrets, and trust services (V4-24); runtime,
environments, deployment, and configuration (V4-08, V4-25); observability, resilience, backup,
restore, and recovery (V4-26); engineering standards and controls (V4-28, V4-30); verification and
test architecture (V4-18, V4-31); migration and coexistence (V4-32); and architecture evolution
(V4-33, V4-35).

## V4-39.3 Material architecture capability record

This section is normative.

For each material architecture capability, the integrated baseline records a controlled capability
descriptor covering: architecture capability; business constraint inherited; owning module or
boundary; authority; inputs; outputs; dependencies; transaction posture; security and privacy posture;
failure behaviour; verification requirement; unresolved assumption; future blocking gate; and
implementation status. The descriptor is a consolidation view over the ratified chapters and the
architecture-element catalogue (V4-40); it introduces no new authority and no new capability. Every
capability descriptor carries an implementation status of NOT_IMPLEMENTED_OR_NOT_PROVEN.

## V4-39.4 House and Button authority separation

This section is normative.

The baseline preserves the separation established in V4-02 and V4-05: the House is the governed
system-of-record and sole authority over lifecycle state, decisions, evidence, and financial posture;
the Button is an experience layer that may request actions and display governed state through
controlled contracts and projections but owns no governed lifecycle authority. Displayed status is not
governed state, and Button access does not imply House authority.

## V4-39.5 Consolidation integrity

This section is normative.

The baseline does not resolve any unresolved assumption, does not upgrade any `BASELINE_PENDING`
quality target to a fabricated value, and does not reclassify any fitness function as implemented. Where
Packages 1 through 4 left a question open, the integrated baseline records it as open and refers it to
the architecture-readiness register (V4-46) and the downstream-handoff matrix (V4-47). Consolidation
must never be represented as implementation, operational proof, or independent assurance.

## V4-39.6 Non-authorizations

This section is normative.

This chapter authorizes no implementation, executable test, physical schema, migration, executable API
or event, integration contract, infrastructure provisioning, approved technology stack, vendor or
cloud-service selection, procurement, delivery sequencing, staffing, cost plan, pilot, rollout, launch,
or master development plan, and it fabricates no policy, contractual, security, privacy, operational,
stakeholder, vendor, or executive validation. Every architecture element carries
`authorizes_implementation: false`.
