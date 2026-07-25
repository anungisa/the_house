# V1-03 - Capability Disposition Standard

Document ID: V1-03  
Title: Capability Disposition Standard  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 1 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable gate (see V1-A, REG-108 APP-V1-004)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G1)  
Supersedes: None  
Review Cycle: Monthly until Volume 1 closes  
Repository Path: docs/program/volume-1/

## V1-03.1 Purpose

This section is normative.

This document defines the closed vocabulary of dispositions that may be assigned to
a qualified capability. A disposition expresses the target treatment of a
capability; it does not, by itself, authorize the work it implies.

## V1-03.2 Disposition vocabulary

This section is normative.

Every qualification decision in REG-106 assigns exactly one of the following eight
dispositions:

1. **ADOPT** — take the capability substantially as-is into the target platform
   because it is fit, safe, and aligned. Minimal change.
2. **ADAPT** — keep the capability's intent and much of its substance but modify it
   to meet governance, architecture, or operating requirements.
3. **CONSOLIDATE** — merge two or more overlapping or duplicated capabilities into a
   single authoritative capability, eliminating redundancy.
4. **RETAIN** — a production-candidate implementation that can remain with bounded
   hardening. The capability is materially sound and stays, subject to a defined,
   limited set of hardening actions.
5. **REBUILD** — a required capability whose present implementation is unsuitable.
   The need is real; the current build is not fit and must be reconstructed.
6. **DEFER** — a capability whose disposition cannot yet be responsibly decided;
   explicitly postponed with a recorded reason and revisit condition.
7. **EXTERNALIZE** — a capability better satisfied by an external platform or
   service than by building or retaining it internally.
8. **RETIRE** — a capability that should not exist in the target; removed, with its
   removal justified and recorded.

## V1-03.3 RETAIN versus REBUILD

This section is normative.

RETAIN and REBUILD both apply to required capabilities. They are distinguished by
the fitness of the present implementation, established by evidence:

- RETAIN requires evidence that the present implementation is materially sound and
  that the remaining risk can be closed by bounded hardening.
- REBUILD is assigned when the capability is needed but its present implementation
  is unsuitable — for example, prototype behaviour, architectural accident,
  hardcoded assumptions, or unmet production-readiness requirements.

Neither disposition may be assigned on recency or authorship. Both require a rated
evidentiary basis (V1-04) and supporting findings (REG-104).

## V1-03.4 Evidentiary basis and non-authorization

This section is normative.

A disposition of ADOPT or RETAIN requires evidence at or above the threshold defined
in V1-04 for reliance. A disposition never authorizes implementation on its own: the
`authorizes_implementation` field of a qualification decision may be set true only
when the decision is executive-accepted and names an authorizing gate (V1-00.4,
REG-106 control).

## V1-03.5 Closed vocabulary

This section is normative.

The disposition vocabulary is closed. Introducing a new disposition value requires
an amendment to this document under the governed amendment process. The schema for
REG-106 enforces the closed set.
