# V8-16 - Affiliation Draft and Submission Command Contracts

Document ID: V8-16
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G2)

## V8-16.1 Purpose

This section is normative.

This chapter defines the draft and submission command contracts of the affiliation domain. It defines the commands that create and revise an affiliation draft and the command that submits it for review. It defines the command classes, their preconditions, and their result and error semantics; it defines no endpoint, handler, or storage.

## V8-16.2 Draft creation command

This section is normative.

The draft-creation command establishes an affiliation application in the draft lifecycle state under the applicant authorization context. Its preconditions require a resolved applicant context, tenant scope, affiliation subject, and idempotency key. Its result semantics are accepted, rejected, or requires-approval, and its error semantics resolve to the canonical taxonomy. Repeated creation requirements bearing the same idempotency key resolve to the same draft without duplication.

## V8-16.3 Draft revision command

This section is normative.

The draft-revision command updates declared fields of an affiliation application while it remains in the draft lifecycle state. Its preconditions require the affiliation to be in draft, the acting context to be the owning applicant context, and a required-fields completeness posture appropriate to a draft. Revision never changes lifecycle state and never applies once an affiliation has left draft. A revision requested against a non-draft affiliation is rejected and mutates no governed state.

## V8-16.4 Submission command

This section is normative.

The submission command requests the governed transition from draft to submitted. It is a low-risk transition whose named guards require required-fields completeness and required-documents presence. Submission does not itself decide the affiliation; it moves the affiliation into the review pipeline under House authority. A submission whose completeness guards fail is rejected and leaves the affiliation in draft.

## V8-16.5 Command idempotency and events

This section is normative.

Every draft and submission command carries an idempotency key and resolves through the Governance Kernel idempotency discipline: a retry returns the prior result without duplicating transitions, audit events, evidence, or outbox messages. A successful submission enqueues an affiliation-submitted integration event through the transactional outbox within the same governed transition; the event is published only after commit and never as an in-transaction side effect.

## V8-16.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no endpoint, handler, controller, storage, or client, and it mutates no governed state. Every controlled affiliation record remains in a not-implemented-or-not-proven posture and authorizes no construction.
