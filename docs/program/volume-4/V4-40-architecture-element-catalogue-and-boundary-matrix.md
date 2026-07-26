# V4-40 - Architecture-Element Catalogue and Boundary Matrix

Document ID: V4-40  
Title: Architecture-Element Catalogue and Boundary Matrix  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 5 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-057)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G5)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 5 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-40.1 Purpose and scope

This section is normative.

This chapter defines the authoritative catalogue of architecture elements and the boundary matrix that
makes dependency direction and authority ownership inspectable (ARCH-V4-038). The catalogue consolidates
the elements recorded across Packages 1 through 4 in REG-401; it does not prescribe physical source
directories, module file layouts, frameworks, or deployment topology, and it authorizes no
implementation.

## V4-40.2 Element families

This section is normative.

The catalogue organizes architecture elements into the following families: system boundary; bounded
context; module; application service; port; adapter; authoritative data domain; projection; integration
boundary; trust boundary; runtime responsibility; configuration authority; observability
responsibility; and continuity responsibility. Each family expresses a distinct kind of authority or
responsibility and is mapped onto the REG-401 element kinds (ARCH, MOD, SVC, DATA, API, EVT, CTRL, NFR,
DEP) without introducing new physical structure.

## V4-40.3 Element descriptor

This section is normative.

For each catalogued element, the boundary matrix records: identifier; purpose; authority owned;
permitted dependencies; forbidden dependencies; commands; queries; events; data classification;
transaction boundary; trust boundary; operational owner status; verification coverage; and validation
status. The descriptor is a projection over the ratified REG-401 records and the domain, service, data,
integration, and control chapters; it changes none of them.

## V4-40.4 Dependency direction and authority ownership

This section is normative.

The boundary matrix makes the inward dependency rule inspectable: domain modules depend on no transport,
persistence framework, vendor SDK, deployment framework, or UI; application services may not bypass
authorization or governed invariants; adapters own no governed lifecycle authority; and projections are
non-authoritative reads. Forbidden dependencies are recorded explicitly so that reverse or cyclic
dependency direction is detectable. Every element resolves to exactly one authority owner, and no
element owns authority that belongs to another boundary.

## V4-40.5 Physical-structure exclusion

This section is normative.

The catalogue expresses logical elements, boundaries, and dependency direction. It does not name
source directories, packages, namespaces, repositories, build targets, or deployment units, and it does
not select any framework, library, runtime, or cloud service. Physical realization is a downstream
concern governed by future gates.

## V4-40.6 Non-authorizations

This section is normative.

This chapter authorizes no implementation, executable test, physical schema, migration, executable
contract, infrastructure, technology or vendor selection, procurement, delivery sequencing, staffing,
cost plan, pilot, rollout, or master development plan, and fabricates no validation. Every catalogued
element carries `authorizes_implementation: false`.
