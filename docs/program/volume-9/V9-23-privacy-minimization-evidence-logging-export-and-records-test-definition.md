# Volume 9 — Privacy, Minimization, Evidence, Logging, Export, and Records Test Definition

Document ID: V9-23
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G3)

## Purpose

This chapter defines the privacy and records assurance obligations for collection,
minimization, evidence handling, logging, export, and disposition. It defines what
must be tested, not how any test is written or run, and authorizes no execution,
environment, dataset, or tool.

## Minimization

Governed reads, exports, logs, and every diagnostic trace carry only the
minimum necessary fields. Collection and purpose limitation are tested as governed
obligations, and an over-collecting read, log, trace, or export is detected and
fails closed. A read access is held distinct from an export authority: the ability
to view restricted evidence never implies the authority to export it.

## Restricted evidence, disclosure, and trace

Restricted evidence carries governed access, disclosure, logging, and trace
obligations. Access to restricted evidence requires resolved authority; disclosure
requires a governed basis; and each disclosure and trace is recorded so that it can
be reconstructed. Evidence is referenced rather than copied wherever a reference
suffices, so that restricted content is not duplicated into logs or projections.

## Records, legal hold, retention, and disposition

Records obligations include legal hold, retention dependencies, and disposition. A
legal hold suspends disposition. Retention dependencies are honoured before any
disposition occurs, and authoritative disposition is held distinct from the deletion
of a downstream projection. A disposition attempted under an active legal hold or an
unmet retention dependency is detected and fails closed.

## Privacy testing is not legal compliance

A privacy or records test outcome is held strictly distinct from a legal or
regulatory compliance determination. A passing privacy test does not by itself
establish legal compliance; the legal and compliance question is a separate
authority outside this package. No privacy or records obligation in this chapter
asserts a compliance result; each is a documentary obligation only.
