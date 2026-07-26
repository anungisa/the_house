# V4-12 - Requirements, Applicability, Evidence, Completeness, and Submission Architecture

Document ID: V4-12  
Title: Requirements, Applicability, Evidence, Completeness, and Submission Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 2 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-017)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-12.1 Purpose and scope

This section is normative.

This chapter defines the domain architecture for versioned requirements, their applicability,
evidence handling and provenance, derived completeness, and submission. It is architecture
definition. It does not define storage schemas, object-storage implementation, or executable
interfaces.

## V4-12.2 Versioned requirement sets and requirement versions

This section is normative.

Requirements are organized into **versioned requirement sets**. A requirement set has ordered,
immutable **requirement versions**: once a requirement version is in effect it is never mutated in
place; a change produces a new version. This preserves the ability to determine, for any affiliation
case, exactly which requirement version governed it.

## V4-12.3 Applicability

This section is normative.

Requirement applicability is governed and derived from authoritative facts:

- **season and jurisdiction applicability** - which requirement versions apply for a given season and
  jurisdiction;
- **pathway applicability** - which requirement versions apply for a determined pathway;
- **organization classifications** - which requirement versions apply for an organization's governed
  classification.

Applicability is computed, not asserted per case, so that identical circumstances yield identical
applicable requirements.

## V4-12.4 Evidence requests, references, and provenance

This section is normative.

For each applicable requirement, the architecture defines **evidence requests** (what is required),
**evidence references** (governed pointers to submitted evidence), and **evidence provenance** (who
submitted it, when, and its origin). Restricted evidence is classified by sensitivity and its access
is governed (see V4-15). Evidence is never anonymous or unattributed.

## V4-12.5 Evidence binding invariant

This section is normative.

Evidence is bound to a specific governed context. The binding invariant is:

```
Evidence is bound to:
  affiliation case
  + applicable requirement version
  + submitting actor
  + provenance
  + effective evidence version
```

Evidence bound under one requirement version is not silently reinterpreted under a different version;
a change of applicable requirement version requires the binding to be re-evaluated.

## V4-12.6 Evidence replacement, supersession, validity, and expiry

This section is normative.

Evidence may be **replaced** or **superseded** under governed authority; superseded evidence remains
in the audited history and is not erased. Evidence has **validity and expiry**: expired evidence is
no longer acceptable for completeness. **Acknowledgements** (governed attestations) are a form of
response and are themselves bound to the requirement version and submitting actor.

## V4-12.7 Derived completeness

This section is normative.

Completeness is **derived** from authoritative requirement, response, and evidence facts. It is a
computed determination over applicable requirement versions, valid responses, and acceptable
evidence. Completeness must not depend on an independently maintained completeness flag; there is no
authoritative "complete" boolean that can drift from the underlying facts.

## V4-12.8 Submission architecture

This section is normative.

The submission model distinguishes:

- **draft submissions** - in-progress responses that may change;
- **final submission snapshots** - the governed capture, at submission, of the requirement versions,
  policy versions, responses, and evidence bindings against which the case was submitted;
- **return and resubmission** - the governed return of a submitted case for further information and
  its resubmission.

A submitted affiliation preserves the requirement and policy versions against which it was submitted,
so that later requirement changes do not retroactively alter what was submitted. Return and
resubmission produce a new governed submission snapshot without destroying the prior one.

## V4-12.9 Boundaries

This section is normative.

This chapter defines conceptual architecture only. It does not define physical storage schemas,
object-storage layout, retention mechanics, or executable evidence-transfer interfaces; those are
deferred to later data, security, and integration volumes and to the evidence-storage contract
assumption recorded in REG-404.
