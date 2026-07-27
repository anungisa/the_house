# V7-12 - Representative Authority, Account, Organization, and Club-Identity Interaction Model

Document ID: V7-12
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V7-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V7-G2)

## V7-12.1 Purpose

This section is normative.

This chapter specifies the interaction model for establishing a session, selecting an organization, confirming club identity, establishing a new club candidate, and confirming representative authority. It records the command and query intents in register REG-702 and the surfaces, views, flows, and form sections in register REG-701.

## V7-12.2 Session establishment

This section is normative.

Establishing a session expresses a command intent to the House identity and session authority. Authentication credentials are handled by the identity function and are never presented as governed truth by the Button. Account-state problems fail closed and route to a support-assisted recovery path without exposing internal detail.

## V7-12.3 Organization selection and club identity

This section is normative.

Organization selection expresses a command intent constrained to organizations the account is authorized for. Confirming club identity expresses a distinct command intent against the House club-identity authority. When no existing club is recognized, establishing a new club candidate is a distinct command intent that is separate from affiliation itself, and duplicate organizations are surfaced through a recognition path without restricted disclosure.

## V7-12.4 Representative authority

This section is normative.

Representative authority is modelled distinctly from organization identity. Confirming representative or delegated authority expresses a command intent to the House representative-authority function. Missing, pending, expired, or revoked authority fails closed with a clear reason and a recovery route. A representative may act for an organization only through a distinct, verifiable authority.

## V7-12.5 Status and standing queries

This section is normative.

Reading affiliation status and standing expresses a query intent against authoritative live House data. Status queries never assert a decision the House has not made and never present the Button as the source of truth.

## V7-12.6 Explicit non-authorizations

This section is normative.

This chapter does not authorize production user interface, executable workflows, interface or integration contracts, final visual design, branded mockups, design tokens, production content, translations, procurement, staffing, cost commitments, pilots, rollout, or a master plan. It defines documentary interaction behaviour only, pending Gate V7-G2.
