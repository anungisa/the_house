# V4-17 - Composition, Configuration, Adapters, and Dependency-Completeness Architecture

Document ID: V4-17  
Title: Composition, Configuration, Adapters, and Dependency-Completeness Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 2 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-022)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-17.1 Purpose and scope

This section is normative.

This chapter defines the target composition model: how the application and worker runtimes assemble
their required adapters, how configuration is governed, and how dependency completeness is verified.
It is architecture definition. It does not select a dependency-injection framework, provision
infrastructure, or author executable configuration.

## V4-17.2 Composed dependencies

This section is normative.

The composition model assembles, at minimum, the following for the application and worker runtimes:

- application runtime;
- worker runtime;
- repositories;
- object/evidence storage;
- authorization service;
- clock and identifier services;
- outbox publisher;
- notification adapter;
- payment and accounting adapters;
- identity adapter;
- analytics and projection adapters;
- audit;
- observability;
- feature and policy configuration.

Each is bound to a port at the composition root; domain modules never compose their own adapters.

## V4-17.3 Dependency-completeness constraints

This section is normative.

- **production composition fails when a required dependency is absent** - there is no silent
  degradation of governed behaviour;
- **required integrations have no production no-op implementation** - a no-op publisher, no-op audit,
  or no-op authorization is not a valid production binding;
- **optional capabilities are explicitly classified as optional** - only capabilities marked optional
  may be absent in production;
- **adapter replacement cannot alter domain authority** - substituting an adapter changes mechanism,
  not governed authority;
- **feature controls cannot bypass policy, authorization, or invariants** - a feature flag never
  disables a governed control.

## V4-17.4 Configuration governance

This section is normative.

Configuration is governed:

- **secrets and environment configuration are consumed by actual entry points** - configuration that
  is declared but never consumed by a real entry point is not evidence of a working dependency;
- **configuration has provenance, validation, effective scope, and audit** - each configuration value
  has a known origin, is validated, has a defined scope, and its changes are audited;
- production configuration that is incomplete fails closed (see V4-14 `CONFIGURATION_INCOMPLETE`).

## V4-17.5 Test versus production composition

This section is normative.

Test composition is **distinguishable** from production composition. Test adapters (in-memory
repositories, fake clocks, capturing publishers) are valid only in test composition and are never a
production binding for a required integration. The distinction is explicit, so that a test double
cannot silently satisfy a production dependency-completeness check.

## V4-17.6 Dependency-completeness verification

This section is normative.

The architecture requires a dependency-completeness verification: a check that, for a given
deployment path, every required port has a valid production adapter and every required configuration
value is consumed. This is specified here as a target; it is defined as a fitness function (see
V4-18) and is not implemented in this package. The verification is defined without selecting a
dependency-injection framework.

## V4-17.7 Boundaries

This section is normative.

This chapter defines composition and configuration architecture conceptually. It does not select a
framework, provision environments, define secret stores, or author configuration files; those are
downstream of Gate V4-G2 and subject to the deployment-topology assumption recorded in REG-404.
