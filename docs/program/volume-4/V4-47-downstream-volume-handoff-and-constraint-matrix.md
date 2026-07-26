# V4-47 - Downstream-Volume Handoff and Constraint Matrix

Document ID: V4-47  
Title: Downstream-Volume Handoff and Constraint Matrix  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 5 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-064)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G5)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 5 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-47.1 Purpose and scope

This section is normative.

This chapter defines the precise handoffs and constraints from Volume 4 to the remaining volumes
(ARCH-V4-044, CTRL-V4-040). It states what each downstream volume inherits as an architectural
constraint. Architecture order is not delivery order: nothing in this matrix authorizes implementation,
sequences delivery, or commits a schedule.

## V4-47.2 Volume 5 - Data

This section is normative.

Volume 5 inherits: authoritative information ownership; conceptual identities and relationships; tenant
and jurisdiction integrity; evidence provenance; correction authority; retention dependencies;
projections as non-authoritative; and reconciliation requirements. Volume 5 defines the data model
within these constraints; it may not relocate authoritative ownership or grant authority to projections.

## V4-47.3 Volume 6 - Security, privacy, compliance, accessibility, and trust

This section is normative.

Volume 6 inherits: resource-aware authorization; sensitive-evidence controls; service identity; secrets
and cryptography; privacy minimization; audit; assurance evidence; and accessibility and bilingual
architecture obligations. Volume 6 produces security and privacy validation evidence; until it does, the
security and privacy architecture remains unproven.

## V4-47.4 Volume 7 - Experience

This section is normative.

Volume 7 inherits: Button and House authority separation; governed-state versus displayed-status
separation; required-action semantics; error and recovery behaviour; privacy-aware display; and
bilingual and accessible interaction requirements. Volume 7 may not confer governed authority on the
experience layer or represent displayed status as governed state.

## V4-47.5 Volume 8 - APIs, events, and integrations

This section is normative.

Volume 8 inherits: contract authority; ownership; versioning; idempotency; authentication;
reconciliation; retries; replay; external authority; and anti-corruption boundaries. Volume 8 defines
executable contracts within these constraints; external systems receive no governed decision authority.

## V4-47.6 Volume 9 - Quality and master testing

This section is normative.

Volume 9 inherits: fitness functions; future test classes; PostgreSQL verification; composition and
deployment-path verification; resilience and restore proof; and architecture-to-requirement
traceability. Volume 9 produces verification evidence; Volume 4 fitness functions remain unimplemented
until it does.

## V4-47.7 Volumes 10 and 11

This section is normative.

Volumes 10 and 11 inherit constraints concerning: delivery planning; migration execution;
infrastructure; release evidence; operations; continuity; adoption; and implementation readiness.
Volume 4 defines the constraints on these activities; it does not plan, sequence, provision, or execute
them.

## V4-47.8 Architecture order is not delivery order

This section is normative.

The order in which Volume 4 defined architecture (data, then security, then experience, then
integration, then quality, then delivery) is a definition order and must not be interpreted as a
delivery sequence, a dependency schedule, or a release plan. Delivery sequencing is a downstream
decision governed by future gates. Every downstream constraint in this matrix has an identified
destination volume.

## V4-47.9 Non-authorizations

This section is normative.

This chapter authorizes no implementation, executable test, physical schema, migration, executable
contract, infrastructure, technology or vendor selection, procurement, delivery sequencing, staffing,
cost plan, pilot, rollout, or master development plan, and fabricates no validation. Every element
carries `authorizes_implementation: false`.
