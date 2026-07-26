# V4-C - Package 2 Closure Record: Affiliation Domain and Application Architecture

Document ID: V4-C  
Title: Package 2 Closure Record - Affiliation Domain and Application Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 2 closure; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-024)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-C.1 Purpose and scope of this closure record

This section is normative.

This closure record consolidates Volume 4 Package 2, the **affiliation domain and application
architecture**. It records what the package established, confirms that every architecture element,
decision, fitness function, and assumption was authored as **architecture definition only**, states
the disposition of **Gate V4-G2 - Domain and Application Architecture Ready**, and freezes the
package. It authorizes no implementation, migration, executable interface, database schema,
infrastructure, procurement, framework or vendor selection, delivery sequencing, staffing, cost
plan, or master development plan. It does not claim that any architecture is implemented, and it
does not fabricate policy, security, privacy, vendor, operational, stakeholder, or executive
validation.

## V4-C.2 Inherited Package 1 and provenance lineage

This section is normative.

Package 2 was created from the corrected baseline commit `826e128` and inherits the full Package 1
lineage without further amendment to Package 1 content. The inherited provenance is: Package 1
authoring snapshot `b654aea`; Package 1 closure and freeze `8b741b9`; original Package 1 package
merge `ef47820`; Package 1 provenance-amendment authoring `6f931dc` (V4-B); provenance-amendment
merge and current baseline `826e128`. All Volume 4 inheritance references resolve to the corrected
central-registration baseline tag `central-registration-volume-3-v1.0.1`. No superseded Volume 3
interpretation and no superseded Package 1 provenance is inherited.

## V4-C.3 Application architecture, layering, and dependency rules

This section is normative.

V4-10 defines the application layers, their public surfaces, encapsulation, and the permitted
dependency directions. Dependencies flow **inward**: domain modules do not depend on transports,
databases, vendor SDKs, or deployment frameworks; external adapters cannot bypass application
authorization or domain invariants; cross-module access occurs only through controlled application
or domain contracts; and runtime composition does not redefine institutional authority. The
inward-dependency direction and the House/Button separation are expressed as fitness functions
(FIT-V4-014, FIT-V4-015, FIT-V4-016). No source-code package structure is prescribed except as a
non-binding architecture hypothesis.

## V4-C.4 Domain-module model, ownership, and transaction responsibilities

This section is normative.

V4-11 defines the core domain modules and their ownership: organization, affiliation case,
requirements and applicability, evidence, submission, lifecycle and decision, the reconciliation
boundary, activation, and authorization or policy decision (REG-401 MOD-V4-017..025). Each module
owns its invariants, its permitted commands, and its participation in governed transactions, audit,
and outbox effects. Domain policy resides only in domain modules and never in transport adapters.

## V4-C.5 Organization, jurisdiction, season, and affiliation invariants

This section is normative.

V4-11 defines the conceptual affiliation domain model - organization, club recognition, identity
match, continuity, representative authority, jurisdiction, affiliation season, affiliation case,
pathway, historical standing, affiliation status, and expiry and closure - without designing tables.
The governed invariants include: an affiliation belongs to one recognized organization and one
affiliation season; jurisdiction is explicit and governed; representative authority is
resource-specific; pathway determination is governed and auditable; historical continuity does not
silently create current-season affiliation; organization matching and affiliation activation are
distinct effects; and administrative correction does not erase governed history.

## V4-C.6 Requirements, evidence, completeness, and submission architecture

This section is normative.

V4-12 defines the domain architecture for versioned requirement sets, season, jurisdiction, and
pathway applicability, evidence requests and references, evidence provenance and restriction,
evidence replacement and supersession, acknowledgements, derived completeness, draft submissions,
final submission snapshots, and return and resubmission. Evidence binds to a specific affiliation
case, applicable requirement version, submitting actor, provenance, and effective evidence version
(CTRL-V4-013). Completeness is **derived** from authoritative requirement, response, and evidence
facts and never depends on an independently maintained completeness flag (CTRL-V4-014). A submitted
affiliation preserves the requirement and policy versions against which it was submitted. No storage
schema or object-storage implementation is defined.

## V4-C.7 Review, decision, reconciliation, activation, and correction architecture

This section is normative.

V4-13 defines the authoritative affiliation lifecycle and its transition rules across the governed
state families, from draft through submission, assignment, review, return and resubmission,
escalation, decision, approval awaiting reconciliation, activation, expiry, and closure. Each state
defines entry conditions, permitted actors and commands, exit transitions, invariant checks,
required evidence, audit effect, integration effect, correction posture, and recovery behaviour.
Review recommendation, governed decision, financial reconciliation, activation authorization,
activation execution, administrative correction, and governed-decision reconsideration are held
distinct; approval does not itself imply that reconciliation or authoritative activation has
occurred.

## V4-C.8 Application-service, command, query, and error model

This section is normative.

V4-14 defines the responsibilities of the principal affiliation application services - from
recognizing or establishing an organization through opening seasonal affiliation, determining
pathway, calculating applicable requirements, saving responses, binding evidence, submitting,
assigning reviewers, returning, resubmitting, escalating, recording decisions, updating
reconciliation status, authorizing and executing activation, recovering failed activation,
correcting administrative information, and closing or expiring affiliation. Each application
operation identifies its authorization, transaction, idempotency, audit, and error semantics
(REG-401 SVC-V4-012..023).

## V4-C.9 Resource-aware authorization architecture

This section is normative.

V4-15 defines resource-aware authorization that **defaults to deny** and **fails closed** on missing
identity, resource, jurisdiction, or assignment inputs (CTRL-V4-011, CTRL-V4-012). Authorization
incorporates identity, resource, jurisdiction, assignment, action, lifecycle state, and evidence
sensitivity. Jurisdiction isolation and assigned-reviewer enforcement are expressed as fitness
functions (FIT-V4-017, FIT-V4-018, FIT-V4-019). Identity is consumed from an external provider whose
claim shape is recorded as an assumption (ASM-V4-009).

## V4-C.10 Transaction, idempotency, outbox, and projection architecture

This section is normative.

V4-16 defines the transaction, concurrency, idempotency, outbox, projection, retry, and recovery
boundaries. Governed state, audit, and required outbox records commit atomically (CTRL-V4-015).
Authoritative activation is protected against duplicate effects as an **exactly-once activation
effect** guaranteed by an idempotency key (CTRL-V4-016), which is not a universal distributed
exactly-once delivery guarantee. Projections derive from authoritative state, can be rebuilt, and
never become the source of governed authority (ADR-V4-017). PostgreSQL behavioural verification,
atomicity, activation idempotency, and projection rebuild are expressed as fitness functions
(FIT-V4-025, FIT-V4-026, FIT-V4-030, FIT-V4-031).

## V4-C.11 Composition, configuration, and dependency-completeness architecture

This section is normative.

V4-17 defines the production composition root, adapter boundaries, configuration governance, and
dependency completeness. Production composition **fails closed** on any missing required dependency
or configuration and no required port resolves to a production no-op, including outbox publication
(CTRL-V4-017, CTRL-V4-018). Required configuration and secrets must be consumed by actual entry
points. Composition-root completeness, no-production-no-op, configuration completeness, and the
deployment-path composition are expressed as fitness functions (FIT-V4-027, FIT-V4-028, FIT-V4-029,
FIT-V4-032). No infrastructure is provisioned and no framework or vendor is selected.

## V4-C.12 Architecture verification model and House P0 carry-forward

This section is normative.

V4-18 defines the architecture verification model, the fitness-function families, and the
implementation-readiness criteria. The fourteen known House P0 findings are each carried forward and
mapped to a defined verification, and every verification remains `DEFINED_NOT_IMPLEMENTED`. Every
fitness function in REG-403 carries `implemented: false`, `authorizes_implementation: false`, and
verification status FITNESS_FUNCTION_DEFINED, and each Package 2 fitness function additionally
records a verification class and, where applicable, its House P0 reference. No fitness function is
executed and no verification result is claimed in Package 2.

## V4-C.13 Unresolved architecture assumptions

This section is normative.

Unresolved architecture assumptions and risks are held in REG-404. Package 2 records assumptions for
final domain-boundary validation, policy and workflow variants, the evidence-storage contract, the
PostgreSQL concurrency posture, identity-provider claims, payment and accounting acknowledgement
semantics, projection recovery, outbox operational ownership, deployment topology, and numeric
quality targets (ASM-V4-005..014), together with the associated risks (RISK-V4-004..007). Each
assumption and risk has a named owner and a future resolution gate. No assumption is silently
resolved, and no assumption is treated as validated fact in Package 2.

## V4-C.14 No claim of implemented architecture

This section is normative.

No document in Package 2 claims that the architecture is implemented. Every architecture element,
decision, fitness function, and assumption carries `authorizes_implementation: false`, and the
Volume 4 structural control enforces this fail-closed. No runtime application code, migration,
executable API or event, database schema, infrastructure, framework or vendor selection, procurement
authorization, delivery sequencing, staffing plan, cost plan, or master development plan is created,
and no policy, security, privacy, vendor, operational, stakeholder, or executive validation is
fabricated.

## V4-C.15 Gate V4-G2 disposition - Domain and Application Architecture Ready

This section is normative.

Gate V4-G2 - Domain and Application Architecture Ready is dispositioned
**DOMAIN_AND_APPLICATION_ARCHITECTURE_READY**. The gate is recorded in REG-405 (APP-V4-025) with its
conditions. Each condition is satisfied by Package 2 as follows.

1. Package 1 provenance is unambiguous (V4-C.2; REG-405 APP-V4-013, APP-V4-014).
2. Application layers and dependency directions are controlled (V4-10; V4-C.3).
3. Core domain modules, ownership, and transaction responsibilities are defined (V4-11; V4-C.4).
4. Organization, jurisdiction, season, and affiliation invariants are defined (V4-11; V4-C.5).
5. Versioned requirements, evidence binding, derived completeness, submission, return, and resubmission are architecturally defined (V4-12; V4-C.6).
6. Review, decision, reconciliation, activation, correction, expiry, and closure transitions are defined (V4-13; V4-C.7).
7. Principal application services have authorization, transaction, idempotency, audit, and error semantics (V4-14; V4-C.8).
8. Authorization incorporates identity, resource, jurisdiction, assignment, action, lifecycle, and evidence sensitivity (V4-15; V4-C.9).
9. Transaction, outbox, projection, retry, and recovery boundaries are defined (V4-16; V4-C.10).
10. Authoritative activation is protected against duplicate effects (V4-16; V4-C.10).
11. Production composition and configuration fail closed (V4-17; V4-C.11).
12. Required integrations cannot silently resolve to production no-ops (V4-17; V4-C.11).
13. Architecture verification covers the known House P0 findings (V4-18; V4-C.12).
14. Unresolved assumptions have owners and future gates (REG-404; V4-C.13).
15. No artifact claims that the architecture is implemented (V4-C.14).
16. No runtime code, migration, executable contract, infrastructure, procurement, delivery sequence, or master development plan is created (V4-C.1, V4-C.14).
17. Package 2 receives line-level review and a separate freeze commit (V4-C.16).

## V4-C.16 Package 3 authorization and freeze

This section is normative.

Passing Gate V4-G2 authorizes the commencement of **Volume 4 Package 3** as the next architecture
package. It authorizes no implementation, migration, executable interface, database schema,
infrastructure, procurement, framework or vendor selection, delivery sequencing, staffing, cost
plan, or master development plan. Package 2 is frozen at closure (REG-405 APP-V4-026, PACKAGE-4-2).
The closure record and the nine chapters V4-10 through V4-18 are the frozen artifacts. Package 2 was
authored in one commit and closed and frozen in a separate commit, giving the package line-level
review and an independent freeze commit. Changes to frozen Package 2 content require the recorded
amendment process.
