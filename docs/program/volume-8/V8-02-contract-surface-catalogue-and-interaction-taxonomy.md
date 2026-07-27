# V8-02 - Contract-Surface Catalogue and Interaction Taxonomy

Document ID: V8-02
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G1)

## V8-02.1 Purpose

This section is normative.

This chapter establishes the contract-surface catalogue and the interaction taxonomy: the governed vocabulary that names every kind of contract surface the platform may define and every kind of interaction those surfaces may carry. It governs classification, not construction.

## V8-02.2 Interaction taxonomy

This section is normative.

Every interaction the platform defines must be classified as exactly one interaction type from the governed set: synchronous command, synchronous query, internal module contract, domain event, integration event, notification event, audit event, webhook, provider callback, file import, file export, batch exchange, migration exchange, reporting feed, or analytics feed. An interaction whose type cannot be named must fail closed and must not be defined.

The interaction type determines which downstream obligations apply. A command carries different obligations than a query; an event carries different obligations than a webhook; an exchange carries different obligations than a feed. No interaction may borrow the weaker obligations of another type to escape its own.

## V8-02.3 Contract-surface kinds

This section is normative.

A contract surface is classified as one of the governed surface kinds: a contract surface, a producer, a consumer, a trust boundary, a provider context, or an authorization context. Each surface names the interaction type it carries, the institutional authority that owns it, and the authoritative source of the data it conveys.

## V8-02.4 Catalogue completeness discipline

This section is normative.

Every contract surface defined by a later package must be entered in the catalogue before it may be defined further. A surface absent from the catalogue is undefined and fails closed. The catalogue is additive: surfaces are added and superseded, never silently removed.

## V8-02.5 Ownership and source requirements

This section is normative.

Every catalogued contract surface must name an institutional authority and an authoritative source. Every catalogued producer and consumer must name an owner or institutional authority and the interaction type it participates in. A surface that names neither authority nor source fails closed and is recorded as an unresolved obligation.

## V8-02.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It publishes no endpoint, wire schema, or transport, and it builds no producer or consumer. Every controlled catalogue record remains in a not-implemented-or-not-proven posture and authorizes no construction.
