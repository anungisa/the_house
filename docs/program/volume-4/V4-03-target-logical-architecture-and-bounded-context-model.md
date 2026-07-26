# V4-03 - Target Logical Architecture and Bounded-Context Model

Document ID: V4-03  
Title: Target Logical Architecture and Bounded-Context Model  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 1 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-004)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-03.1 Purpose

This section is normative.

This chapter defines the target logical architecture: the bounded contexts (modules) of the House
platform, their owned concepts, their authority, and their permitted dependency directions. Each
module is recorded as a MOD element in REG-401. This is logical architecture, not database or table
design.

## V4-03.2 Module description model

This section is normative.

Each module is described by: its purpose; its owned concepts; its authority; the commands it
accepts; the queries it answers; the events it emits; its inbound dependencies; its outbound
dependencies; its transaction boundary; its security boundary; the data classification it holds; its
failure behaviour; and its architecture status. Package 1 records status as `TARGET_DEFINED` or
`TARGET_CONSTRAINED`.

## V4-03.3 Target bounded contexts

This section is normative.

The target House platform comprises the following bounded contexts:

- Organization registry (organizational identity and hierarchy).
- Jurisdiction and affiliation authority (who may affiliate whom, under which jurisdiction).
- Season and policy versions (seasonal policy and versioned rules).
- Requirements catalogue (versioned affiliation requirements and applicability).
- Affiliation case management (the affiliation lifecycle state machine).
- Evidence management (evidence binding, provenance, and sensitivity).
- Review and decision (reviewer assignment, review, decision, and rationale).
- Financial obligation and reconciliation status (obligation state; reconciliation with external finance).
- Activation (authoritative activation effect).
- Identity and resource authorization (authentication boundary consumption; authorization decisions).
- Communications (notifications and correspondence).
- Support and operational recovery (staff correction and recovery within governed authority).
- Audit (append-only audit of governed effects).
- Reporting and projections (derived, non-authoritative read models).
- Integration and outbox (transactional outbox and external integration).
- Configuration and feature control (versioned configuration and feature gating).

## V4-03.4 Dependency direction

This section is normative.

Dependencies flow from experience and projection toward governed authority, never the reverse. The
authority core (organization registry, jurisdiction and affiliation authority, affiliation case
management, evidence, review and decision, activation, authorization, audit) does not depend on
reporting, communications, or the Button. Reporting and projections depend on authoritative modules
but hold no governed authority. Forbidden dependency directions are expressed as a fitness function
in V4-09.

## V4-03.5 Transaction and security boundaries

This section is normative.

Each governed effect resolves within a single module's transaction boundary; cross-module
consistency is achieved through events and the transactional outbox, not through distributed
transactions. Each module declares a security boundary and the data classification it holds so that
authorization and privacy controls can be applied at the boundary. These boundaries are constrained
by CTRL elements in REG-401.
