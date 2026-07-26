# V4-35 - Architecture Decision, Exception, Debt, and Evolution Governance

Document ID: V4-35  
Title: Architecture Decision, Exception, Debt, and Evolution Governance  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 4 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-048)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G4)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-35.1 Purpose and scope

This section is normative.

This chapter defines how the architecture remains controlled after implementation begins in a later
phase (ARCH-V4-035, CTRL-V4-037, ADR-V4-038). It defines governance for architecture decisions,
exceptions, technical and control debt, deprecation, supersession, and architecture-health reporting.
It is **architecture definition only**: it records no active exception and no accepted debt as fact.

## V4-35.2 Decision and review governance

This section is normative.

Architecture decision records (ADRs) are created and reviewed under the Accountable Program Authority.
The governance distinguishes material from non-material change: material change requires architectural
review and a new or superseding ADR, while non-material change is recorded without reopening a gate.
Superseded decisions are retained, not deleted, so that the decision history remains auditable.

## V4-35.3 Exception and debt record model

This section is normative.

Each exception or debt item is recorded, for downstream governance, with: identifier; affected
architecture element; reason; risk; compensating control; owner; approval authority; created date;
expiry or review point; evidence; remediation condition; and status. Exception categories include
exception request, temporary exception, and permanent deviation; debt categories include technical
debt, control debt, security debt, and privacy debt.

## V4-35.4 Governing rules

This section is normative.

The required rules are:

- Architecture exceptions **never** implicitly authorize product scope.
- Expired exceptions **fail** governance review (CTRL-V4-037; FIT-V4-062).
- Temporary no-op dependencies **cannot** become production defaults (constrains V4-25; FIT-V4-056).
- Control debt remains **visible** and is not silently closed.
- Architecture documentation and runtime reality are periodically reconciled (FIT-V4-063).
- An "implemented" status requires evidence.

## V4-35.5 Architecture-health reporting

This section is normative.

Architecture-health reporting summarizes open exceptions, debt, expiries, and documentation-to-reality
drift for governance review. Reporting is a governance obligation, not an implementation, and does not
by itself change any architecture element. Remediation ownership is explicit, and remediation
conditions are recorded so that closure is evidence-based rather than assumed.

## V4-35.6 Non-authorizations

This section is normative.

This chapter authorizes no implementation and records no active exception or accepted debt as fact. It
approves no deviation, defines no live no-op, and claims no reconciliation of documentation to a
running system. Governance is defined, not executed. Every element it introduces carries
`authorizes_implementation: false`.
