# V8-18 - Affiliation Review, Return, and Resubmission Contracts

Document ID: V8-18
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G2)

## V8-18.1 Purpose

This section is normative.

This chapter defines the review, return, and resubmission command contracts of the affiliation domain. It defines the commands that begin review, return an affiliation to the applicant for correction, and resubmit a corrected affiliation. It defines the command classes and their guards, results, and events; it defines no workflow engine, queue, or handler.

## V8-18.2 Review-start command

This section is normative.

The review-start command requests the governed transition from submitted to under-review under a reviewer authorization context. Its preconditions require the affiliation to be in submitted, a resolved reviewer scope for the affiliation's tenant and season, and a current season posture. Review-start is a low-risk transition; it moves the affiliation into active review and mutates no decision state.

## V8-18.3 Return command

This section is normative.

The return command requests the governed transition from under-review back to draft so the applicant may correct the affiliation. It is a high-risk transition: it names the deficiency, requires a resolved reviewer scope, and creates evidence metadata recording the reason for return within the same governed transition. A return never records a decision and never revokes an affiliation; it reopens the draft for correction.

## V8-18.4 Resubmission command

This section is normative.

The resubmission command requests the governed transition from draft to submitted for an affiliation that was previously returned. Its guards require required-fields completeness and required-documents presence, identical to first submission, and it resolves through the same idempotency discipline. A resubmission carries the same affiliation subject; it does not create a new affiliation and does not duplicate prior evidence.

## V8-18.5 Review events and idempotency

This section is normative.

Return and resubmission are governed transitions that enqueue their integration events through the transactional outbox within the same transaction, published only after commit. Every review command carries an idempotency key, and a retry returns the prior result without duplicating transitions, audit events, evidence, or outbox messages. Review commands never mutate governed state outside a committed governed transition.

## V8-18.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no workflow engine, queue, task runner, handler, or client, and it mutates no governed state. Every controlled affiliation record remains in a not-implemented-or-not-proven posture and authorizes no construction.
