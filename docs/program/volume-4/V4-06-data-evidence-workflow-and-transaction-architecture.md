# V4-06 - Data, Evidence, Workflow, and Transaction Architecture

Document ID: V4-06  
Title: Data, Evidence, Workflow, and Transaction Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 1 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-007)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-06.1 Purpose

This section is normative.

This chapter defines the target data, evidence, workflow, and transaction architecture: the governed
concepts, how evidence binds to requirements, how completeness is derived, and how transitions
preserve state, audit, and outbox consistency. Data and evidence concepts are recorded as DATA
elements in REG-401; transaction and workflow constraints as CTRL elements. This is conceptual data
architecture, not physical schema or table design.

## V4-06.2 Governed concepts

This section is normative.

The architecture identifies the following governed concepts: organizational identity; seasonal
affiliation; versioned requirements; requirement applicability; evidence binding; evidence
provenance; derived completeness; submissions; workflow transitions; review requests; decisions;
reconciliation status; activation; administrative corrections; audit; and projections. Each is a
DATA element with a data classification.

## V4-06.3 Evidence binding and provenance

This section is normative.

Evidence is bound to a **specific requirement and a specific affiliation**; unbound or ambiguously
bound evidence does not satisfy a requirement. Every evidence object carries provenance (origin,
submitter, time, and integrity metadata). Completeness is **derived** from authoritative facts about
bound evidence and satisfied requirements; it is never a directly editable field.

## V4-06.4 Workflow transitions

This section is normative.

Workflow transitions are validated atomically: a transition either fully applies (state change,
evidence effects, audit append, outbox enqueue) within one transaction, or it does not apply at all.
A transition that fails validation, authorization, or completeness leaves governed state unchanged.
Every decision records the acting identity, the authority under which it was made, the evidence
relied upon, the rationale, and the governing policy version.

## V4-06.5 Administrative corrections

This section is normative.

Administrative corrections operate within governed authority and do not silently rewrite governed
history. A correction is itself a governed, audited effect that preserves the prior authoritative
record; it does not overwrite audit or evidence provenance. Corrections that would alter a
governed decision follow the governed transition path, not a direct data edit.

## V4-06.6 Transaction and projection consistency

This section is normative.

Transaction boundaries preserve state, audit, and outbox consistency: the governed state change, the
audit append, and the outbox enqueue are committed together. Projections are **reconstructable** from
authoritative facts and events; a lost or rebuilt projection can be regenerated without loss of
governed truth. Projections are never the authoritative record. These constraints are expressed as
fitness functions in V4-09.
