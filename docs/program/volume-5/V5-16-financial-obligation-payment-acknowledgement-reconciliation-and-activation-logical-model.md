# V5-16 - Financial Obligation, Payment Acknowledgement, Reconciliation, and Activation Logical Model

Document ID: V5-16
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G2)

## V5-16.1 Purpose

This section is normative.

This chapter defines the logical model for financial obligations, payment
acknowledgements, accounting confirmations, reconciliation, and activation. It
preserves the distinction between acknowledgement and confirmation and between
approval and activation.

## V5-16.2 Fee obligation

This section is normative.

A fee obligation (LENT-V5-019) is the governed financial obligation arising for an
affiliation case in a season. It records what is owed as a governed fact and does not
by itself represent settlement.

## V5-16.3 Payment acknowledgement and accounting confirmation

This section is normative.

The following logical entities are distinct financial facts:

- Payment acknowledgement (LENT-V5-020): a governed acknowledgement that a payment
  action was initiated or received at the point of interaction.
- Accounting confirmation (LENT-V5-021): a governed confirmation from the authoritative
  finance system that settlement is recognized.

Payment acknowledgement does not imply accounting confirmation. The two are never
interchangeable (INTEG-V5-008, ADR-V5-012). The authoritative finance system remains
the system of record for settlement.

## V5-16.4 Reconciliation

This section is normative.

A reconciliation (LENT-V5-022) is the governed matching of an obligation to its
financial facts. A reconciliation requires both a payment acknowledgement and an
accounting confirmation (INTEG-V5-009). Partial reconciliation overstates financial
completion and is rejected.

## V5-16.5 Activation

This section is normative.

An activation (LENT-V5-023) is a governed fact distinct from an approval decision.
Approval does not by itself constitute activation (INTEG-V5-010, ADR-V5-013).
Activation follows an approval decision and satisfied financial reconciliation. A case
has at most one active activation record at a time (INTEG-V5-011).
