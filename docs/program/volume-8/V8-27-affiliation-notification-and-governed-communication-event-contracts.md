# V8-27 - Affiliation Notification and Governed Communication-Event Contracts

Document ID: V8-27
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G3)

## V8-27.1 Purpose

This section is normative.

This chapter defines the governed contracts for affiliation notifications and communication events: the messages the House owes to people about affiliation outcomes. It defines audience, disclosure authority, minimum-necessary content, bilingual and accessibility obligations, and the distinction between generating a notification and delivering it. It defines required meanings and defines no channel, template, or delivery mechanism.

## V8-27.2 Notifications as governed communication events

This section is normative.

A notification is a governed communication event triggered by a committed affiliation outcome. It is not a lifecycle event and never carries authoritative lifecycle state; it is a governed communication about an outcome that has already committed. Every notification names the outcome that triggers it and the audience it addresses. A notification that cannot name its triggering outcome and audience fails closed and is not defined.

## V8-27.3 Audience and disclosure authority

This section is normative.

Every notification contract names its audience and its disclosure authority: who is entitled to receive the communication and under whose authority the disclosed content may be shared with that audience. A notification is never sent to an audience its disclosure authority does not admit. Disclosure authority governs content, so that a notification to a broad audience carries only what that audience is entitled to know.

## V8-27.4 Minimum-necessary content

This section is normative.

Every notification carries only the minimum content necessary for its purpose and audience. Content minimization is required: a notification states the governed outcome and the recipient's next step without exposing internal detail, restricted evidence, or information beyond the audience's entitlement. A notification that would require content beyond the minimum necessary fails closed pending a narrower definition. Minimum-necessary content is a required meaning, not a template.

## V8-27.5 Bilingual and accessibility obligations

This section is normative.

Every notification carries an English semantic and a French semantic of equivalent meaning, and an accessibility requirement ensuring the communication is perceivable by its audience. Bilingual equivalence is a content obligation of the House as a Canadian national-sport-organization platform: neither language is a partial or lesser rendering of the other. A notification that cannot state equivalent English and French meaning, or that cannot meet its accessibility requirement, fails closed and is not defined.

## V8-27.6 Generation is not delivery

This section is normative.

Generating a notification is distinct from delivering it. The House governs the generation of a correct, minimum-necessary, bilingual notification; delivery across a channel is a separate, at-least-once, transactional-outbox concern that carries its own duplication tolerance. A notification is not considered delivered because it was generated, and delivery evidence is recorded separately from the governed generation. This chapter defines the generation contract and defines no channel, provider, template, or delivery guarantee.

## V8-27.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no channel, template, provider, message body, or delivery mechanism, and it changes no governed state. Every controlled Package 3 record remains in a not-implemented-or-not-proven posture and authorizes no construction.
