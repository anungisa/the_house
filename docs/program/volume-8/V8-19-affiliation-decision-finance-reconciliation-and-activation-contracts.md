# V8-19 - Affiliation Decision, Finance, Reconciliation, and Activation Contracts

Document ID: V8-19
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G2)

## V8-19.1 Purpose

This section is normative.

This chapter defines the decision, finance, reconciliation, and activation command contracts of the affiliation domain. It defines the commands that record an affiliation decision, register the fee obligation and its settlement, reconcile settlement against the obligation, and activate an approved affiliation. It defines the command classes and their high-risk guards; it defines no payment processor, ledger, or provider integration.

## V8-19.2 Decision command

This section is normative.

The decision command requests the governed transition from under-review to approved or to rejected under a reviewer authorization context. It is a high-risk transition: it requires a resolved reviewer scope, the absence of open compliance flags, and evidence. Approval and rejection each create evidence metadata recording the disposition within the same governed transition. A decision requested without a resolved reviewer scope fails closed and mutates no governed state.

## V8-19.3 Finance obligation and reconciliation

This section is normative.

The finance-and-reconciliation record is a logical resource holding the affiliation fee obligation and its settlement state. The fee obligation is registered as a governed fact of the affiliation, not as a payment instruction. Reconciliation is the governed comparison of recorded settlement against the registered obligation; it resolves to accept, reject, or quarantine semantics consistent with the Package 1 exchange and reconciliation doctrine. Reconciliation records evidence of settlement state and never moves money.

## V8-19.4 Fees-paid guard and activation

This section is normative.

The activation command requests the governed transition from approved to active. It is a high-risk transition whose named guards require the affiliation to be approved, the fee obligation to be settled, and the season to be current. The fees-paid guard resolves against the reconciled finance record, not against an external processor. An activation whose fees-paid or season guard fails is rejected and leaves the affiliation approved but inactive.

## V8-19.5 Decision events and idempotency

This section is normative.

Decision, reconciliation, and activation are governed transitions that enqueue their integration events through the transactional outbox within the same transaction, published only after commit. Each command carries an idempotency key, and a retry returns the prior result without duplicating transitions, decisions, evidence, audit events, or outbox messages. A decision is expressed only by the House authority and only through a committed governed transition.

## V8-19.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no payment processor, ledger, banking integration, settlement mechanism, or provider connection, and it mutates no governed state. It moves no money and issues no charge. Every controlled affiliation record remains in a not-implemented-or-not-proven posture and authorizes no construction.
