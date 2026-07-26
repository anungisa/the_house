# V4-28 - Engineering Architecture Standards and Module-Governance Model

Document ID: V4-28  
Title: Engineering Architecture Standards and Module-Governance Model  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 4 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-041)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G4)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-28.1 Purpose and scope

This section is normative.

This chapter defines the engineering architecture standards and the module-governance model that
later implementation work must respect. It records, for each standard, the rule that constrains
future code without writing that code: repository-level architecture boundaries, module ownership and
public surfaces, dependency direction, transport and infrastructure-adapter isolation, shared-kernel
restrictions, cross-module contracts, command and query boundaries, domain-event ownership,
configuration ownership, test seams, generated-code boundaries, deprecation, and architecture
documentation obligations. It is **architecture definition only** (ARCH-V4-028, MOD-V4-026): it
authors no runtime source, prescribes no final source-directory names, and selects no framework or
build tool. Every element it introduces carries `authorizes_implementation: false`.

## V4-28.2 Layering and dependency direction

This section is normative.

The engineering model preserves the Package 2 application layering (ARCH-V4-010) and the Package 1
modular-monolith posture (ARCH-V4-001). Dependency direction is inward toward the domain and **fails
closed** against forbidden directions (CTRL-V4-031). The required engineering rules are:

- **Domain modules** must not depend on transports, persistence frameworks, vendor SDKs, deployment
  frameworks, or user-interface concerns.
- **Application services** may orchestrate domain modules and controlled ports but may not bypass
  authorization or domain invariants.
- **Adapters** implement ports and translate external semantics but do not own governed lifecycle
  authority.
- **The Button** uses controlled application contracts and projections and does not write governed
  persistence directly.

These rules are architectural constraints for downstream verification (FIT-V4-049, FIT-V4-050); they
are not asserted to be implemented or enforced by any existing build.

## V4-28.3 Module ownership and public surfaces

This section is normative.

Each module has a single owning bounded context, an explicit public surface, and a hidden interior
(MOD-V4-026, ADR-V4-030). Cross-module interaction occurs only through published contracts, commands,
queries, and domain events; reaching into a module's interior is a forbidden dependency
(CTRL-V4-031). A module owns its domain events and does not publish another module's events. Public
surfaces are minimal, versioned conceptually, and subject to the compatibility rules defined in V4-33.

## V4-28.4 Transport, adapter, and shared-kernel isolation

This section is normative.

Transport concerns (HTTP, messaging, scheduling) and infrastructure adapters (persistence, storage,
identity, secrets) are isolated behind ports and never leak their semantics into the domain
(ARCH-V4-028). A shared kernel, if used, is restricted to stable, dependency-free primitives and may
not accumulate domain logic, transport knowledge, or vendor coupling. Generated code lives behind an
explicit boundary and is never hand-edited in place; its generation source and boundary are recorded.

## V4-28.5 Command, query, configuration, and test-seam governance

This section is normative.

Commands and queries are separated at the application boundary, and governed state changes flow only
through the Governance Kernel and application services established in Volume 4 Packages 1 and 2.
Configuration ownership is explicit: each module declares the configuration it consumes, and
production configuration completeness is a downstream verification concern (FIT-V4-054). Test seams
are defined so that domain and application logic are verifiable without transports or live
infrastructure, while production composition remains distinct from test composition (constrains
V4-31).

## V4-28.6 Standard record model

This section is normative.

Each engineering standard is recorded, for downstream governance, with: standard; purpose; affected
layer or module; permitted pattern; forbidden pattern; verification method; exception authority;
evidence required; future blocking gate; and implementation status. Implementation status for every
standard in this chapter is **defined, not implemented**. The verification methods named here are
architecture-defined fitness functions (REG-403), not executed checks, and the exception authority is
the architecture governance defined in V4-35.

## V4-28.7 Non-authorizations

This section is normative.

This chapter authorizes no implementation. It writes no runtime module, no framework configuration,
and no build pipeline; it prescribes no final source-directory names; and it selects no language
runtime, framework, linter, or build tool. It claims no enforced boundary and fabricates no
verification result. Every element it introduces carries `authorizes_implementation: false`.
