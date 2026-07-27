# V8-04 - Command, Query, and Response Semantics

Document ID: V8-04
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G1)

## V8-04.1 Purpose

This section is normative.

This chapter governs the semantics of synchronous commands, synchronous queries, and their responses. It states what a command must guarantee, what a query may claim, and what a response must distinguish. It governs meaning, not the executable interface.

## V8-04.2 Command semantics

This section is normative.

Every command class names its preconditions, its result semantics, and its error semantics. A command is a request to change governed state; it may be honoured only when its named preconditions are satisfied. A command that names no preconditions or no result semantics is undefined and fails closed.

A command result distinguishes acceptance from completion. Acceptance means the request was validated and admitted; completion means the governed state change occurred. A command may never present acceptance as completion, and a consumer may never infer completion from acceptance.

## V8-04.3 Command idempotency

This section is normative.

Every command class names its idempotency requirement. A command that may be retried names the idempotency scope under which repeated submission produces no additional governed effect. A command that names no idempotency requirement fails closed and is recorded as an unresolved obligation.

## V8-04.4 Query semantics

This section is normative.

Every query class names the institutional authority or authoritative source it reads from and its staleness posture: whether it returns authoritative current state, a bounded-staleness projection, or an explicitly non-authoritative view. A query that names no authority or no staleness posture is undefined and fails closed.

A query never changes governed state and never confers authority. A consumer may not treat a query result as more authoritative than the query's named source and staleness posture permit.

## V8-04.5 Response and error distinction

This section is normative.

Every response distinguishes success, rejection, and failure. A rejection is a validated refusal to act; a failure is an inability to complete. A response may never present a rejection as a failure or a failure as a success, and a consumer may never infer a governed outcome that the response does not explicitly state.

## V8-04.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no executable command handler, query resolver, endpoint, or wire schema. Every controlled command, query, and response record remains in a not-implemented-or-not-proven posture and authorizes no construction.
