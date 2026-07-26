# V6-24 - Financial, Decision, Auditability, and Segregation-of-Duties Compliance Controls

Document ID: V6-24
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G3)

## V6-24.1 Purpose and scope

This section is normative.

This chapter defines the financial-control and segregation-of-duties control model
for the affiliation service: the separation of financial authority from affiliation
decision authority, the auditability of financially relevant decisions, and the
required-approval and permitted-actor structure that enforces segregation. It defines
controls only. It moves no money, sets no fee, grants no authority, and authorizes no
implementation.

## V6-24.2 Financial and affiliation authority are separated

This section is normative.

The authority to make or confirm a financial determination is separated from the
authority to make an affiliation lifecycle decision. A single actor may not both
originate a financially relevant action and approve the affiliation outcome that
depends on it. The control records the separation of these authorities; it grants no
authority to any actor and configures no permission.

## V6-24.3 Segregation of duties

This section is normative.

Financially relevant control objectives record a permitted actor, a prohibited
actor, a segregation rule, and a required approval. The segregation rule expresses
which combinations of origination and approval are prohibited to one actor. The
required approval expresses the independent approval that must precede a controlled
outcome. These are control definitions; they assign no role, grant no capability, and
enforce nothing at runtime.

## V6-24.4 Auditability of decisions

This section is normative.

Financially relevant decisions must be auditable: the decision authority, the inputs
relied upon, and the approval that authorized the outcome must be recorded so that the
decision can be independently reviewed. Auditability is a control requirement expressed
here; no audit log, journal, or record store is created, and no decision is made or
recorded by this chapter.

## V6-24.5 No financial operation is authorized

This section is normative.

Nothing in this chapter sets a fee, invoices, collects, refunds, reconciles, or moves
any funds, and nothing authorizes such operation. Financial operation, if any, is
defined and authorized only under future gates with its own evidence, and is out of
scope for this control model.

## V6-24.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It sets no fee, moves no funds, makes or
records no decision, grants no authority, assigns no role, and configures no approval
or permission. Every record introduced by this chapter remains
`authorizes_implementation: false` and `implementation_status:
NOT_IMPLEMENTED_OR_NOT_PROVEN`.
