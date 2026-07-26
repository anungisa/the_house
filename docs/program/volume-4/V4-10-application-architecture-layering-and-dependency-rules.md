# V4-10 - Application Architecture, Layering, and Dependency Rules

Document ID: V4-10  
Title: Application Architecture, Layering, and Dependency Rules  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 2 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-015)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-10.1 Purpose and scope

This section is normative.

This chapter defines the internal application architecture of the House: the layers, the permitted
dependency directions, the module public surfaces, and the composition seams that realize the
affiliation lifecycle while preserving the institutional authority defined in Volumes 0 through 3.
It is architecture definition only. It does not prescribe a source-code package structure, a
dependency-injection framework, a database design, an executable API, or an infrastructure topology.
Where a concrete arrangement is named, it is a non-binding architecture hypothesis and is labelled
as such.

## V4-10.2 Layered architecture

This section is normative.

The target application architecture is a layered architecture with a single permitted inward
dependency direction:

```
Experience and transport adapters
  -> application services
    -> domain modules
      -> ports
        <- infrastructure adapters (implement ports)
```

- **Experience and transport adapters** translate external protocols and experiences (including the
  Button and staff surfaces) into application-service commands and queries. They own no governed
  state and no domain policy.
- **Application services** orchestrate use cases: they resolve authorization inputs, load resources,
  open transaction boundaries, invoke domain modules, and record audit and outbox effects. They own
  orchestration, not domain invariants.
- **Domain modules** own domain concepts, invariants, lifecycle rules, and domain policy. They
  depend only on ports and on other domain contracts, never on transports, persistence, vendor
  SDKs, or deployment frameworks.
- **Ports** are the abstract contracts (interfaces) through which domain and application code express
  their need for persistence, evidence storage, authorization decisions, clocks, identifiers,
  publication, and external systems.
- **Infrastructure adapters** implement ports against concrete technologies. They are the only layer
  permitted to depend on external technologies, and they never contain domain policy.

## V4-10.3 Permitted dependency direction

This section is normative.

Dependencies point inward toward the domain. Transport and infrastructure adapters depend on
application and domain contracts; domain modules depend on nothing outward. The forbidden-dependency
direction - a domain module depending on a transport, a database, a vendor SDK, or a deployment
framework - is prohibited and is expressed as an architecture fitness function (see V4-18 and
REG-403). Composition of concrete adapters happens only at the composition root (see V4-17), never
inside domain modules.

## V4-10.4 Module public surfaces and encapsulation

This section is normative.

Each domain module exposes a controlled public surface - a set of commands, queries, and domain
contracts - and keeps its internal model encapsulated. Cross-module access occurs only through those
controlled application or domain contracts; no module reaches into another module's internal state.
A module's public surface is the boundary at which invariants are guaranteed; internal types are not
shared across module boundaries.

## V4-10.5 Command and query entry points

This section is normative.

Application services present explicit command entry points (state-changing use cases) and query
entry points (read use cases). Commands are the only path to governed state change and always pass
through authorization, invariant checks, and the transaction boundary. Queries do not mutate
governed state. Read projections (see V4-16) may serve queries but never define governed authority.

## V4-10.6 Domain-policy ownership and infrastructure isolation

This section is normative.

Domain policy - invariants, lifecycle transitions, applicability, completeness derivation, and
decision authority - is owned exclusively by domain modules. Infrastructure concerns - persistence
mechanics, serialization, transport, and vendor integration - are isolated behind ports and
implemented only in infrastructure adapters. Runtime composition wires adapters to ports but does
not redefine institutional authority.

## V4-10.7 External-adapter boundaries

This section is normative.

External systems (identity, payment and accounting, notification, evidence storage, analytics) are
reached only through ports implemented by external adapters. External adapters cannot bypass
application authorization or domain invariants: an external call that would change governed state is
expressed as a command through an application service, subject to the same authorization and
invariant checks as any other actor. The Button, as a transport and experience surface, does not
directly mutate persistence or governed lifecycle state.

## V4-10.8 Transaction, audit, and outbox participation

This section is normative.

Transactions are initiated by application services at command entry, not by transports or by domain
modules. Within a single unit of work, governed state change, audit records, and required outbox
records commit atomically (detailed in V4-16). Domain modules express effects; application services
bind those effects to the transaction and to audit and outbox participation.

## V4-10.9 Projection boundaries and testing seams

This section is normative.

Projections (read models) are derived from authoritative state and are updated through controlled
projection boundaries; they are never a source of governed authority. Ports provide the testing
seams that allow application and domain behaviour to be verified against substitutable adapters. Test
composition is distinguishable from production composition (see V4-17), and the substitution of a
test adapter never alters domain authority.

## V4-10.10 Non-binding structural hypotheses

This section is normative.

Any concrete source-code package layout, module folder structure, or interface naming referenced in
this volume is a non-binding architecture hypothesis. It illustrates the target layering and does
not constrain later engineering, which may realize the same architecture through different concrete
structures provided the dependency rules and boundaries in this chapter are preserved.
