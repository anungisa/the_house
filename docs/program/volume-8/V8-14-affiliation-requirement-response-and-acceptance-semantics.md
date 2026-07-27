# V8-14 - Affiliation Requirement, Response, and Acceptance Semantics

Document ID: V8-14
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G2)

## V8-14.1 Purpose

This section is normative.

This chapter defines the requirement, response, and acceptance semantics shared by affiliation commands. It states what a well-formed affiliation requirement must carry, what result and error semantics a response must express, and what acceptance means for the domain. It defines semantics only; it defines no message body, field encoding, or status code.

## V8-14.2 Requirement semantics

This section is normative.

Every affiliation command requirement resolves to a named command class and carries the context elements that class requires: the acting authority, the tenant scope, the affiliation subject, and an idempotency key. A requirement that omits a required context element is not well formed and is refused before evaluation. Requirement semantics inherit the Package 1 command-class doctrine without relaxation.

## V8-14.3 Result semantics

This section is normative.

Every affiliation command expresses deterministic result semantics: accepted, rejected, or requires-approval. An accepted result reflects a committed governed transition. A rejected result reflects a failed guard or an unmet precondition and mutates no governed state. A requires-approval result reflects a transition held for a decision authority and mutates no governed state until the decision is recorded. No affiliation command expresses a result outside this set.

## V8-14.4 Error semantics

This section is normative.

Affiliation command and query failures resolve to the Package 1 canonical error taxonomy. Each failure carries a canonical code and a user-safe semantic, and it respects the privacy and logging constraints of the data-classification doctrine. Error semantics never disclose restricted evidence, internal state, or another tenant's data. An affiliation failure that cannot resolve to a canonical code fails closed as an internal error.

## V8-14.5 Acceptance semantics

This section is normative.

Acceptance in the affiliation domain means a committed, idempotent governed transition recorded in affiliation lifecycle state with its audit and evidence obligations satisfied. Acceptance is expressed only by the House authority and only through a governed transition. A response that reports acceptance without a committed transition is invalid. Repeated requirements bearing the same idempotency key resolve to the same acceptance without duplicating state or evidence.

## V8-14.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no message body, field name, encoding, status code, or client, and it mutates no governed state. Every controlled affiliation record remains in a not-implemented-or-not-proven posture and authorizes no construction.
