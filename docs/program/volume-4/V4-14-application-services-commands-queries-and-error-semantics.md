# V4-14 - Application Services, Commands, Queries, and Error Semantics

Document ID: V4-14  
Title: Application Services, Commands, Queries, and Error Semantics  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 2 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-019)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-14.1 Purpose and scope

This section is normative.

This chapter defines the responsibilities of the application services that realize the principal
affiliation use cases, and the architecture-level error taxonomy that governs their failure
semantics. It is architecture definition. It does not author executable APIs, transport bindings, or
transport-specific status codes.

## V4-14.2 Principal application operations

This section is normative.

The application layer provides, at minimum, the following governed operations:

- recognize or establish an organization;
- establish representative authority;
- open seasonal affiliation;
- determine or confirm pathway;
- calculate applicable requirements;
- save responses;
- bind or replace evidence;
- submit;
- assign or reassign reviewer;
- return for information;
- resubmit;
- escalate;
- record decision;
- update reconciliation status;
- authorize activation;
- execute activation;
- recover failed activation;
- correct administrative information;
- close or expire affiliation.

## V4-14.3 Operation description form

This section is normative.

Each application operation is specified against a controlled form:

```
Operation
Actor
Authorization input
Command or query
Preconditions
Domain modules involved
Transaction boundary
Idempotency requirement
Audit effect
Outbox effect
Error classes
Recovery path
Result
```

State-changing operations are commands; read operations are queries. Every command passes through
authorization (V4-15), the transaction boundary (V4-16), invariant checks (V4-11, V4-13), and audit
and outbox participation.

## V4-14.4 Idempotency at the application boundary

This section is normative.

Commands that produce authoritative effects declare an idempotency requirement: a repeated command
with the same idempotency key does not produce a duplicate authoritative effect (see V4-16). This is
a governed property of the operation, not an incidental transport behaviour.

## V4-14.5 Architecture-level error taxonomy

This section is normative.

Operation failures are classified against an architecture-level error taxonomy:

```
AUTHENTICATION_REQUIRED
AUTHORIZATION_DENIED
RESOURCE_SCOPE_UNRESOLVED
JURISDICTION_UNRESOLVED
ASSIGNMENT_REQUIRED
INVALID_STATE_TRANSITION
INVARIANT_VIOLATION
CONCURRENCY_CONFLICT
DUPLICATE_COMMAND
EVIDENCE_NOT_ACCEPTABLE
RECONCILIATION_REQUIRED
DEPENDENCY_UNAVAILABLE
CONFIGURATION_INCOMPLETE
RECOVERY_REQUIRED
```

These classes are transport-independent. Each operation declares which error classes it can produce
and the recovery path for each. Unresolved authorization, resource scope, or jurisdiction fails
closed rather than defaulting to permit.

## V4-14.6 Error-handling posture

This section is normative.

- `DUPLICATE_COMMAND` is a safe, idempotent outcome, not a governed failure of state.
- `CONCURRENCY_CONFLICT` requires reload and retry; it never silently overwrites governed state.
- `RECONCILIATION_REQUIRED` and `RECOVERY_REQUIRED` denote governed intermediate states with defined
  recovery paths, not terminal errors.
- `DEPENDENCY_UNAVAILABLE` and `CONFIGURATION_INCOMPLETE` fail closed; a required dependency or
  configuration that is absent stops the operation rather than degrading governed behaviour.

## V4-14.7 Boundaries

This section is normative.

This chapter does not define transport-specific status codes, executable request or response
schemas, or wire formats. The mapping of these architecture error classes to transport responses is
deferred to a later integration volume.
