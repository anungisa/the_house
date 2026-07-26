# V4-31 - Test Architecture, Verification Environments, and Engineering-Evidence Model

Document ID: V4-31  
Title: Test Architecture, Verification Environments, and Engineering-Evidence Model  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 4 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-044)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G4)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-31.1 Purpose and scope

This section is normative.

This chapter defines the complete future test architecture, the verification environments, and the
engineering-evidence model (ARCH-V4-031, CTRL-V4-033, ADR-V4-031). It defines test classes, their
units of verification, permitted and prohibited test doubles, data restrictions, evidence produced,
pass/fail authority, downstream gate, and operational-proof dependency. It is **architecture
definition only**: no test is implemented, and no verification result is claimed.

## V4-31.2 Test classes

This section is normative.

The test architecture defines the following classes: `STATIC_ARCHITECTURE`, `UNIT`, `DOMAIN_CONTRACT`,
`APPLICATION_SERVICE`, `POSTGRES_INTEGRATION`, `ADAPTER_CONTRACT`, `API_CONTRACT`, `EVENT_CONTRACT`,
`COMPOSITION_ROOT`, `DEPLOYMENT_PATH`, `SECURITY`, `PRIVACY`, `ACCESSIBILITY`, `BILINGUAL_EQUIVALENCE`,
`PERFORMANCE`, `RESILIENCE`, `BACKUP_RESTORE`, `CONTINUITY`, and `ACCEPTANCE_TRACEABILITY`. Each class
is defined but not implemented; each maps to a downstream gate and, where relevant, to an
operational-proof dependency.

## V4-31.3 Class record model

This section is normative.

Each test class is recorded, for downstream governance, with: purpose; unit under verification;
environment; permitted test doubles; prohibited test doubles; data restrictions; evidence produced;
pass/fail authority; downstream gate; and operational-proof dependency. Data restrictions forbid the
use of unminimized production personal or restricted data in verification environments, consistent
with the privacy architecture in Package 3 (CTRL-V4-026).

## V4-31.4 Proof limitations

This section is normative.

The test architecture makes the limits of each verification explicit (CTRL-V4-033):

- SQLite or in-memory behaviour **cannot** prove PostgreSQL behaviour; PostgreSQL behaviour requires
  `POSTGRES_INTEGRATION` against PostgreSQL (FIT-V4-053).
- Unit tests **cannot** prove production composition; composition requires `COMPOSITION_ROOT`
  verification (FIT-V4-054).
- Configuration review **cannot** prove restore; restore requires `BACKUP_RESTORE` evidence.
- Mocked outbox publication **cannot** prove operational delivery; delivery requires
  `DEPLOYMENT_PATH` and operational proof (FIT-V4-055).
- Static accessibility review **cannot** prove accessible task completion.
- Architecture fitness functions are **separate** from product acceptance tests.

## V4-31.5 Verification environments and evidence

This section is normative.

Verification environments are separated from production and from one another by fidelity class, and
production composition remains distinct from test composition (constrains V4-28, V4-25). Each test
class produces defined evidence with a named pass/fail authority. Architecture fitness functions
(REG-403) verify structural and compositional invariants and are recorded separately from product
acceptance and traceability verification. No environment is provisioned and no evidence is fabricated.

## V4-31.6 Non-authorizations

This section is normative.

This chapter authorizes no implementation. It writes no test, provisions no verification environment,
selects no test framework or runner, and claims no coverage, pass, or proof. Test classes and their
proof limitations are defined, not executed. Every element it introduces carries
`authorizes_implementation: false`.
