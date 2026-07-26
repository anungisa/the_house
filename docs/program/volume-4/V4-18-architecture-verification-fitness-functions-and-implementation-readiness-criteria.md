# V4-18 - Architecture Verification, Fitness Functions, and Implementation-Readiness Criteria

Document ID: V4-18  
Title: Architecture Verification, Fitness Functions, and Implementation-Readiness Criteria  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 2 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-023)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-18.1 Purpose and scope

This section is normative.

This chapter expands the Package 1 fitness-function catalogue (V4-09, REG-403) into a detailed
verification model for the affiliation domain and application architecture, and maps the known House
P0 findings to target architecture and verification. It is architecture definition. Package 2 does
**not** implement any verification; it specifies what later engineering evidence must prove.

## V4-18.2 Verification families

This section is normative.

The verification model covers the following families:

- module dependency direction;
- House/Button authority separation;
- transport-to-domain isolation;
- resource-aware authorization;
- jurisdiction isolation;
- assigned-reviewer enforcement;
- evidence binding;
- versioned requirement applicability;
- derived completeness;
- valid lifecycle transitions;
- decision-authority enforcement;
- transaction/audit/outbox atomicity;
- activation idempotency;
- no production no-op dependencies;
- configuration completeness;
- composition-root completeness;
- PostgreSQL behavioural verification;
- projection rebuild;
- deployment-path composition;
- control-to-test traceability.

## V4-18.3 Fitness-function classification

This section is normative.

Each fitness function is classified by the kind of later engineering evidence it will require:

```
DEFINED_NOT_IMPLEMENTED
STATIC_VERIFICATION_CANDIDATE
UNIT_VERIFICATION_CANDIDATE
POSTGRES_INTEGRATION_CANDIDATE
CONTRACT_VERIFICATION_CANDIDATE
COMPOSITION_VERIFICATION_CANDIDATE
DEPLOYMENT_PATH_VERIFICATION_CANDIDATE
OPERATIONAL_PROOF_REQUIRED
```

Every fitness function in REG-403 remains `implemented: false` and `authorizes_implementation: false`.
A classification names the kind of evidence a later volume must produce; it does not assert that the
evidence exists.

## V4-18.4 House P0 architecture carry-forward

This section is normative.

The known House P0 findings are mapped to target architecture and verification. Each item is resolved
**architecturally** in this volume and remains `DEFINED_NOT_IMPLEMENTED` (or an equivalent candidate
classification) for verification:

1. resource-aware authorization - V4-15; verified by resource-aware authorization and jurisdiction
   isolation fitness functions.
2. assigned reviewer and jurisdiction - V4-13, V4-15; verified by assigned-reviewer enforcement and
   jurisdiction isolation.
3. evidence binding - V4-12; verified by the evidence-binding fitness function.
4. production dependency completeness - V4-17; verified by no-production-no-op and composition-root
   completeness.
5. affiliation lifecycle operations - V4-13, V4-14; verified by valid-lifecycle-transition and
   decision-authority enforcement.
6. versioned requirements - V4-12; verified by versioned-requirement-applicability.
7. return and resubmission - V4-12, V4-13; verified by lifecycle-transition verification.
8. atomic authoritative activation - V4-16; verified by transaction/audit/outbox atomicity and
   activation idempotency.
9. fail-closed configuration - V4-14, V4-17; verified by configuration-completeness.
10. real outbox publication - V4-16, V4-17; verified by no-production-no-op dependencies.
11. PostgreSQL behavioural tests - V4-16; verified by PostgreSQL behavioural verification.
12. production composition tests - V4-17; verified by composition-root completeness.
13. deployment-path tests - V4-17; verified by deployment-path composition.
14. secret and environment configuration consumed by entry points - V4-17; verified by
    configuration-completeness.

Architecture resolution is not implementation closure. Each finding retains a
`DEFINED_NOT_IMPLEMENTED` (or equivalent) verification posture until later engineering evidence
proves it.

## V4-18.5 Implementation-readiness criteria

This section is normative.

The verification model states, for each family, the later engineering evidence that would demonstrate
implementation readiness (for example: static analysis of dependency direction, PostgreSQL
integration tests for atomicity, composition tests for dependency completeness, deployment-path tests
for real production composition). Package 2 records these as criteria to be met downstream; it does
not meet them and does not authorize the construction that would meet them.

## V4-18.6 Boundaries

This section is normative.

This chapter defines verification architecture. It authors no tests, selects no test framework, and
produces no verification results. No statement in this chapter is evidence that any fitness function
passes; the fitness functions are defined, not executed.
