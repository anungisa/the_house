# V8-15 - Affiliation Evidence, Attestation, and Completeness Contracts

Document ID: V8-15
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G2)

## V8-15.1 Purpose

This section is normative.

This chapter defines the evidence, attestation, and completeness contracts of the affiliation domain. It states what evidence an affiliation must carry, what an attestation asserts, and what completeness means for submission and decision. It defines the contracts only; it defines no document store, upload mechanism, or file format.

## V8-15.2 Evidence contract

This section is normative.

The affiliation evidence set is a logical resource that holds the attestations and required documents an affiliation depends on. Evidence is classified under the Package 1 data-classification doctrine; restricted evidence carries the privacy and logging constraints of that doctrine and is never disclosed in responses or errors. Each governed high-risk affiliation transition names the evidence it requires, consistent with the Governance Kernel evidence obligations.

## V8-15.3 Attestation semantics

This section is normative.

An attestation is a governed assertion by a named actor that a stated fact holds for an affiliation subject. Each attestation resolves to an acting authority, an affiliation subject, and the fact asserted. Attestations are append-only records of assertion; an attestation is never silently altered or removed. A high-risk transition that depends on an attestation fails closed when the required attestation is absent.

## V8-15.4 Completeness contract

This section is normative.

Completeness is the condition that an affiliation carries every required field, attestation, and document for the transition being requested. Completeness is evaluated by named guards, not by free-form judgement. Required-fields completeness and required-documents presence are distinct completeness guards, each with an explicit failure message. A transition whose completeness guard fails is rejected and mutates no governed state.

## V8-15.5 Evidence and lifecycle alignment

This section is normative.

Evidence and completeness obligations align with affiliation lifecycle risk. Low-risk transitions such as draft creation and submission require completeness of declared fields. High-risk transitions such as decision and activation require evidence, attestation, and completeness together. Evidence metadata for a high-risk transition is created within the same governed transition that records the decision, never afterward as a side effect.

## V8-15.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no document store, upload path, file format, virus scan, or storage engine, and it mutates no governed state. Every controlled affiliation record remains in a not-implemented-or-not-proven posture and authorizes no construction.
