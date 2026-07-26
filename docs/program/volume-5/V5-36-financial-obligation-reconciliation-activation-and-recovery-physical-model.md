# V5-36 - Financial Obligation, Reconciliation, Activation, and Recovery Physical Model

Document ID: V5-36
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G4)

## V5-36.1 Purpose

This section is normative.

This chapter defines the physical model for fee obligations, payment acknowledgement,
accounting confirmation, reconciliation, activation, and recovery. It is documentary and
authorizes no implementation. The authoritative records are in REG-501 and the governing
decisions are ADR-V5-036 and ADR-V5-037.

## V5-36.2 Fee obligation relations

This section is normative.

A fee obligation is a governed relation binding an affiliation case and a season to an amount
due under a governed authority. The obligation carries a financial-status classification and
is the anchor to which financial facts refer.

## V5-36.3 Separation of financial facts

This section is normative.

Payment acknowledgement, accounting confirmation, reconciliation, decision, and activation are
physically distinct facts recorded under separated authorities, per financial fact and
authority separation rule INTEG-V5-025 and decision ADR-V5-036. No relation conflates
acknowledgement with confirmation, or approval with activation. A payment acknowledgement
records that a payment was received; an accounting confirmation records that finance authority
confirmed settlement; these are never the same row.

## V5-36.4 Reconciliation relations

This section is normative.

Reconciliation is a governed relation that records the alignment of internal financial facts
with the named authoritative accounting source. Reconciliation preserves the authority
boundary and resolves conflicts only to the named conflict authority; it never silently
overwrites a financial fact.

## V5-36.5 Activation relations and uniqueness

This section is normative.

Activation is a distinct governed effect recording that an affiliation is active for a case
and season. Exactly one authoritative activation effect exists per affiliation case and
season, enforced by a uniqueness constraint, per authoritative activation uniqueness rule
INTEG-V5-026 and decision ADR-V5-037. Superseded activations are preserved rather than
deleted, so activation history is complete.

## V5-36.6 Recovery relations

This section is normative.

Recovery — the reversal or clawback of an activation or financial effect — is represented as a
governed relation that references what it reverses and records its authority and evidence.
Recovery never mutates the original fact in place; it appends a governed reversing fact.

## V5-36.7 Downstream constraint

This section is normative.

No downstream volume may conflate financial facts, grant activation before authoritative
confirmation, permit more than one active activation per case and season, or implement
recovery as a destructive update.
