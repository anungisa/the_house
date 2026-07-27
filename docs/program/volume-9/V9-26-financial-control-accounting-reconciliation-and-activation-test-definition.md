# Volume 9 — Financial Control, Accounting, Reconciliation, and Activation Test Definition

Document ID: V9-26
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G3)

## Purpose

This chapter defines the financial-control assurance obligations for obligations,
fees, acknowledgement, accounting, reconciliation, activation, and standing. It
defines what must be tested, not how any test is written or run, and authorizes no
execution, environment, provider, or tool.

## Acknowledgement is not accounting reconciliation

Payment acknowledgement is held strictly distinct from accounting confirmation and
from reconciliation. An acknowledgement of receipt does not establish that accounts
reconcile. The governed sequence — obligation, fee, exemption or waiver, provider
acknowledgement, accounting confirmation, and reconciliation — is tested as a set of
distinct determinations. Duplicate acknowledgements, delayed confirmations, and
disputes or reversals each carry governed obligations, and a reconciliation mismatch
is detected and resolved through a governed path rather than silently absorbed.

## Approval, activation, and standing

Approval is held strictly distinct from activation authorization, activation
execution, and active standing. An approval does not by itself activate, and an
activation does not by itself confer continuing standing. Activation occurs exactly
once as a governed business invariant rather than as a transport guarantee, and
active standing is a distinct determination that can lapse or be revoked
independently of the original activation.

## Decision authority

Financial test definitions preserve the governed decision authority boundaries. A
determination is judged only against the authority entitled to make it: the actor or
service that may acknowledge a payment is distinct from the authority that may
confirm accounting, and both are distinct from the authority that may authorize
activation. No financial-control obligation in this chapter asserts an accounting,
reconciliation, or control-effectiveness result; each is a documentary obligation
only.
