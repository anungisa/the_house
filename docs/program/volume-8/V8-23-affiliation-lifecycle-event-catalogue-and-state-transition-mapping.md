# V8-23 - Affiliation Lifecycle Event Catalogue and State-Transition Mapping

Document ID: V8-23
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G3)

## V8-23.1 Purpose

This section is normative.

This chapter catalogues the affiliation lifecycle events and maps each event to the governed transition that produces it. It builds directly on the affiliation lifecycle state machine and transition catalogue defined in Volume 8 Package 1 and the affiliation logical contracts defined in Package 2. It defines which committed transitions produce which events; it defines no emission mechanism, schedule, or transport.

## V8-23.2 One committed transition, defined events

This section is normative.

Every affiliation lifecycle event is produced by exactly one governed transition that has committed. An event names its triggering transition; an event whose triggering transition cannot be named fails closed and is not defined. No event is produced by an uncommitted, rejected, or pending transition, and no event is produced outside the governance kernel that owns affiliation state.

## V8-23.3 Lifecycle event catalogue

This section is normative.

The catalogue defines an affiliation event for each governed lifecycle outcome, including: affiliation submitted, affiliation review started, affiliation approved, affiliation rejected, affiliation activated, affiliation suspended, affiliation reinstated, affiliation revoked, affiliation closed, and affiliation archived. Each catalogued event corresponds to a committed transition in the affiliation state machine and records the same authoritative outcome the kernel committed. The catalogue adds no lifecycle state and no transition; it names the events that report the transitions already governed.

## V8-23.4 State-transition mapping

This section is normative.

Each catalogued event maps to its triggering transition by that transition's governed name: submitted to submit, review started to review-start, approved to approve, rejected to reject, activated to activate, suspended to suspend, reinstated to reinstate, revoked to revoke, closed to close, and archived to archive. The mapping is one-directional: a committed transition may produce its event, but an event never authorizes, replays, or re-drives a transition. The authoritative record remains the committed transition; the event is its faithful report.

## V8-23.5 Risk alignment and evidence

This section is normative.

The event catalogue aligns with the risk classification of its triggering transitions. Events reporting high-risk transitions — approval, rejection, suspension, reinstatement, revocation, closure, and archival — inherit the evidence discipline of those transitions and reference, but never embed, the governed evidence recorded by the kernel. Events reporting low-risk transitions carry no elevated evidence obligation. No event weakens, replaces, or bypasses the evidence obligations defined for its transition.

## V8-23.6 Delivery posture of lifecycle events

This section is normative.

Every catalogued lifecycle event is defined as an at-least-once, transactional-outbox event: its durable internal record is written in the same committed transaction as the transition it reports, and its publication is attempted afterward. No lifecycle event is defined as fire-and-forget, and none presumes exactly-once transport. The distinction between at-least-once transport and exactly-once business effect is governed in the outbox and delivery-semantic chapter and is not restated as a transport guarantee here.

## V8-23.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no emitter, scheduler, topic, queue, broker, or transport, it adds no lifecycle state or transition, and it changes no governed state. Every controlled Package 3 record remains in a not-implemented-or-not-proven posture and authorizes no construction.
