# V4-01 - Architecture Mandate, Principles, and Quality Attributes

Document ID: V4-01  
Title: Architecture Mandate, Principles, and Quality Attributes  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 1 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-002)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-01.1 Architecture mandate

This section is normative.

The target architecture must implement the affiliation service and the governed platform beneath
it as a **modular monolith by default**: explicit bounded contexts with independent domain
boundaries deployed initially as a single governed application, with seams that permit later
extraction only where a governed decision justifies it. Domain boundaries are defined
independently of deployment topology. Microservices are not a default and are not authorized by
this package.

## V4-01.2 House and Button separation

This section is normative.

The House is the governed authority and lifecycle kernel: it owns governed state, lifecycle
transitions, evidence, audit, and the authoritative record. The Button is a guided experience and
projection surface: it requests actions and renders projections but does not own governed lifecycle
rules or governed state. External systems retain the authority explicitly assigned to them by the
inherited operating model. This separation is an architectural invariant, expressed as a fitness
function in V4-09.

## V4-01.3 Architecture principles

This section is normative.

The target architecture is governed by the following principles (recorded as ARCH elements in
REG-401):

- Modular monolith by default; bounded contexts independent of deployment.
- House owns governed authority and lifecycle; Button is a guided experience and projection surface.
- External systems retain only their assigned authority; the platform does not silently assume it.
- Authorization is resource-, role-, and jurisdiction-aware, and defaults to deny.
- Defence in depth; fail-closed on missing authority, tenant, jurisdiction, or configuration.
- Evidence has provenance; governed decisions bind actor, authority, evidence, rationale, and policy version.
- Policy and requirements are versioned; governed effects resolve to a policy version.
- Commands are idempotent; governed effects are exactly-once through transactional state control.
- Integration uses a transactional outbox; external side effects occur only after commit.
- Workflow is auditable and reconstructable; projections are derived, never authoritative.
- Integration contracts are explicit, versioned, and owned.
- Operations are observable and recoverable.
- Experiences are bilingual-equivalent and accessible.
- Personal data is minimized and classified.
- Infrastructure is defined as code; the supply chain is secured.

## V4-01.4 Quality attributes

This section is normative.

The target architecture is evaluated against the following quality-attribute categories (recorded
as NFR elements in REG-401 with `quality_attributes`):

SECURITY, PRIVACY, AVAILABILITY, RESILIENCE, RECOVERABILITY, PERFORMANCE, SCALABILITY,
AUDITABILITY, ACCESSIBILITY, BILINGUAL_EQUIVALENCE, OPERABILITY, MAINTAINABILITY, PORTABILITY, and
INTEROPERABILITY.

Package 1 defines these categories and the architectural posture required to satisfy them. It does
**not** fabricate numeric targets, service-level objectives, capacity figures, or latency budgets;
those are established with evidence at later gates and are recorded here as
`VALIDATION_PENDING` where a measurable target is required.

## V4-01.5 Principle conflicts and precedence

This section is normative.

Where principles conflict, governed-authority integrity, fail-closed security, privacy
minimization, and auditability take precedence over convenience, performance, and delivery speed.
Any exception to a principle must be recorded as an EXC record in REG-404 with an owner and a
resolution gate; principles are not silently weakened.
