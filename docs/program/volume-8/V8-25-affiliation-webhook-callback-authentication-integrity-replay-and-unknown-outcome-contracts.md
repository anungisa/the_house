# V8-25 - Affiliation Webhook, Callback, Authentication, Integrity, Replay, and Unknown-Outcome Contracts

Document ID: V8-25
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G3)

## V8-25.1 Purpose

This section is normative.

This chapter defines the governed contracts for inbound webhooks and provider callbacks: their authentication, integrity, replay-protection, scope, idempotency, and unknown-outcome obligations, and the distinction between provider acknowledgement and authoritative reconciliation. It defines required meanings and defines no endpoint, signature algorithm, header, or provider integration.

## V8-25.2 Webhooks and callbacks as untrusted inbound signals

This section is normative.

A webhook delivery and a provider callback are inbound signals from an external party across a trust boundary. They are untrusted by default: a signal is admitted only when it authenticates as a trusted caller and passes integrity verification, and it fails closed otherwise. An inbound signal is never authoritative on arrival; it is evidence that the House must authenticate, verify, scope, and reconcile before it changes any governed meaning.

## V8-25.3 Authentication and integrity

This section is normative.

Every webhook and callback contract carries an authentication requirement that identifies the caller as a specific trusted provider, and an integrity requirement that verifies the signal was not altered in transit. A signal that fails authentication or integrity is rejected and fails closed; it produces no governed change and no acknowledgement of acceptance. Authentication and integrity are required meanings recorded in the contract-requirement register; this chapter names no signature scheme, key format, or credential mechanism.

## V8-25.4 Replay protection and idempotency

This section is normative.

Every webhook and callback contract carries a replay-protection dependency and an idempotency requirement. A replayed or duplicated inbound signal must not produce a duplicate governed effect: the same provider outcome, delivered more than once, resolves to one governed result. Replay protection distinguishes a genuine re-delivery from a fabricated replay, and idempotency ensures repeated admitted signals converge on one outcome. These are required meanings; this chapter defines no nonce store, window, or keying mechanism.

## V8-25.5 Acknowledgement is not reconciliation

This section is normative.

The House may return an acknowledgement that an inbound signal was received and accepted for processing. That acknowledgement is not reconciliation: it confirms receipt, not that the provider's asserted outcome has become the authoritative House outcome. Reconciliation is the separate governed act by which the House resolves the signal against its own authoritative state and records the reconciled result. Acknowledgement never substitutes for reconciliation, and a provider's signal never becomes authoritative merely because it was acknowledged.

## V8-25.6 Unknown provider outcomes

This section is normative.

When a provider outcome is unknown, ambiguous, or unverifiable, the outcome remains unresolved and fails closed until reconciliation resolves it. An unknown outcome is never optimistically treated as success and never silently treated as failure; it is held as unresolved and driven to a reconciled disposition. Every callback contract carries an unknown-outcome posture and a reconciliation dependency, so that no unresolved provider outcome can leak into governed affiliation state as if it were settled.

## V8-25.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no endpoint, route, signature algorithm, header, credential, nonce store, or provider integration, and it changes no governed state. Every controlled Package 3 record remains in a not-implemented-or-not-proven posture and authorizes no construction.
