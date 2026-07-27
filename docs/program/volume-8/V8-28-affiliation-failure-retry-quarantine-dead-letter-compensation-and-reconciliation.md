# V8-28 - Affiliation Failure, Retry, Quarantine, Dead-Letter, Compensation, and Reconciliation

Document ID: V8-28
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G3)

## V8-28.1 Purpose

This section is normative.

This chapter defines the governed handling of failure across the affiliation event and delivery plane: retry posture, quarantine, dead-letter disposition, compensation limits, and reconciliation. It defines required meanings that preserve institutional history when delivery or processing fails, and it defines no retry interval, backoff schedule, dead-letter queue, or transport mechanism.

## V8-28.2 Failure preserves history

This section is normative.

A failure in publication, delivery, or consumption never erases the governed fact that produced the event. A failed publication leaves the outbox record owed and pending; a failed consumption leaves the consumer's obligation unmet and recorded. Failure is a governed condition to be resolved, not a silent loss. No failure path discards, overwrites, or hides the authoritative affiliation record or the audit trail.

## V8-28.3 Retry posture and the publisher-failure boundary

This section is normative.

Retry is a governed posture: a transient failure is retried under a bounded, jittered discipline until it succeeds or reaches a terminal failure disposition. A publisher failure before a transport accepts an event is not a dead-letter event; it is a pending outbox record retried under governed publication. This chapter states that retries are bounded, jittered, and terminal-bounded as required meanings; it defines no interval, base delay, cap, or backoff formula, and it prescribes no timer.

## V8-28.4 Quarantine and dead-letter

This section is normative.

An event or inbound signal that cannot be processed after its governed retries is quarantined rather than dropped: it is moved to a governed holding disposition where it retains its identity, provenance, and history for authoritative resolution. A dead-letter disposition applies only after a transport has accepted an event and a downstream consumer has failed it; it is a form of quarantine at the consumer boundary. Every quarantine contract names a quarantine posture and a reconciliation dependency; a quarantine that cannot be reconciled fails closed rather than silently expiring.

## V8-28.5 Compensation limits

This section is normative.

Where a committed outcome must be counteracted, the House uses forward compensation — a new governed transition that produces a new committed outcome — never a silent rewrite of history. Compensation is limited: it cannot un-commit a governed fact, cannot delete an audit event, and cannot fabricate an outcome that never occurred. Every compensation contract names its compensation limitation, so that correction remains an auditable forward act rather than an erasure.

## V8-28.6 Reconciliation as authoritative resolution

This section is normative.

Reconciliation is the authoritative act that resolves an unresolved, failed, quarantined, or dead-lettered item against the House's governed state and records the resolved disposition. Reconciliation, not a provider signal or a consumer acknowledgement, produces the authoritative outcome. Every failure and quarantine contract names a reconciliation dependency, and every unresolved provider outcome is held until reconciliation resolves it. Reconciliation preserves history and produces a governed, evidenced result.

## V8-28.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no retry interval, backoff schedule, timer, dead-letter queue, quarantine store, compensation engine, or transport, and it changes no governed state. Every controlled Package 3 record remains in a not-implemented-or-not-proven posture and authorizes no construction.
