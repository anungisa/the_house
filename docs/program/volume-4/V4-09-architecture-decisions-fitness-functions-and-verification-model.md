# V4-09 - Architecture Decisions, Fitness Functions, and Verification Model

Document ID: V4-09  
Title: Architecture Decisions, Fitness Functions, and Verification Model  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 1 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-010)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-09.1 Purpose

This section is normative.

This chapter defines the target architecture-decision model and the fitness-function model that will
verify architectural conformance. Architecture decisions are recorded as ADR elements in REG-402;
fitness functions as FIT elements in REG-403. Fitness functions are **specified** here; they are not
implemented in Package 1.

## V4-09.2 Architecture-decision model

This section is normative.

Each architecture decision (ADR) records: the decision; the context; the options considered; the
selected posture; the rationale; the constraints; the consequences; the risks; the evidence; the
validation status; the supersession rule; and `authorizes_implementation: false`. Decisions are
design-authority decisions accepted by the Accountable Program Authority; none constitutes executive
acceptance or implementation authorization.

## V4-09.3 Fitness-function model

This section is normative.

Each fitness function (FIT) records an intent, an invariant it protects, an evaluation form, the
architectural elements it traces to, its verification status, and `implemented: false`. Fitness
functions are the mechanism by which architectural conformance will later be verified continuously;
their implementation is authorized downstream, not by this package.

## V4-09.4 Required fitness functions

This section is normative.

The architecture specifies fitness functions for, at minimum: forbidden dependency direction;
House and Button authority separation; default-deny authorization; tenant and jurisdiction isolation;
transaction and outbox consistency; evidence binding; versioned rules; absence of production no-op
dependencies; configuration completeness; API and event contract compatibility; control-to-test
coverage; accessibility and bilingual-equivalence requirements; and architecture-to-requirement
traceability.

## V4-09.5 Verification model

This section is normative.

Verification distinguishes: specification (recorded in this package); fitness-function definition
(an executable invariant, defined downstream); validation (evidence that an invariant holds); and
implementation (the built system). Package 1 reaches specification and, for the invariants above,
`FITNESS_FUNCTION_DEFINED` in form only. No document in this package claims that any fitness function
is executing, that any invariant is validated, or that the architecture is implemented.

## V4-09.6 No implementation authorization

This section is normative.

Nothing in this chapter authorizes implementation, procurement, infrastructure provisioning, delivery
sequencing, staffing, cost, or the master development plan. Those authorizations are reserved to later
governed gates and to executive acceptance at a material-commitment gate.
