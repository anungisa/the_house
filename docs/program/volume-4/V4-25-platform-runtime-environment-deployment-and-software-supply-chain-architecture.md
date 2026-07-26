# V4-25 - Platform Runtime, Environment, Deployment, and Software-Supply-Chain Architecture

Document ID: V4-25  
Title: Platform Runtime, Environment, Deployment, and Software-Supply-Chain Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 3 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-034)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G3)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-25.1 Purpose and scope

This section is normative.

This chapter defines the target platform runtime, environment, deployment, and software-supply-chain
architecture: the application and worker runtimes, PostgreSQL, evidence storage, messaging, identity,
secrets, configuration, observability, build, artifacts, deployment environments, infrastructure as
code, software dependencies, container or package integrity, and release evidence. It provisions no
infrastructure, selects no vendor or cloud service, and authorizes no procurement.

## V4-25.2 Environment classes

This section is normative.

The environment classes are LOCAL_DEVELOPMENT, CONTROLLED_TEST, INTEGRATION, STAGING, PRODUCTION, and
RECOVERY (DEP-V4-021). For each environment the architecture defines intended purpose, data
restrictions, identity posture, integration posture, secret handling, configuration authority,
deployment evidence, permitted test classes, and prohibited uses. Environment promotion does not
constitute business authorization (NFR-V4-020).

## V4-25.3 Production and test composition separation

This section is normative.

Production composition differs **explicitly** from test composition (ARCH-V4-025, ADR-V4-026).
Production-required services cannot resolve to test doubles or no-ops (CTRL-V4-027): a production
composition that lacks a required real dependency fails closed, consistent with the
dependency-completeness posture of V4-17. Test doubles are confined to non-production environment
classes.

## V4-25.4 Software supply chain and artifact provenance

This section is normative.

Artifacts are reproducible and traceable to source, and dependency and image provenance is retained
(CTRL-V4-028, ADR-V4-028). Software dependencies and container or package integrity are governed so
that released artifacts can be traced to their source and their provenance evidence retained. Release
evidence accompanies each promotion.

## V4-25.5 Infrastructure-as-code boundary and non-authorizations

This section is normative.

Infrastructure changes require controlled definitions; the architecture defines that infrastructure
is expressed as reviewed infrastructure-as-code, and it authors none. No infrastructure is
provisioned, no cloud service or vendor is selected, and no procurement is authorized in this
package. This chapter authorizes no implementation and every element it introduces carries
`authorizes_implementation: false`.
