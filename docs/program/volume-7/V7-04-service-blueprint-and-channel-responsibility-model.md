# V7-04 - Service Blueprint and Channel-Responsibility Model

Document ID: V7-04
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V7-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V7-G1)

## V7-04.1 Purpose

This section is normative.

This chapter defines the service blueprint and channel-responsibility model for the club-affiliation service. The blueprint is recorded in register REG-701 and maps visible Button interactions, House application and domain responsibilities, staff review activities, finance activities, support activities, provider and external-system interactions, evidence and records responsibilities, notifications, and failure and recovery handoffs.

## V7-04.2 Frontstage and backstage

This section is normative.

The frontstage comprises the Button interactions that collect input and present status, actions, reasons, consequences, and recovery. The backstage comprises the House application and domain responsibilities that hold authoritative state and perform governed transitions. The frontstage never becomes the source of truth.

## V7-04.3 Staff, finance, support, and provider responsibilities

This section is normative.

Staff review activities are performed by jurisdiction and national reviewers. Finance activities confirm financial and reconciliation dependencies. Support activities assist users. Provider and external-system interactions exchange information with parties outside The House. Each responsibility is scoped so that it cannot substitute for a governed affiliation decision.

## V7-04.4 Separation invariants

This section is normative.

The blueprint preserves the following separation invariants: a Button interaction is not House authority; support assistance is not decision authority; financial confirmation is not an affiliation decision; and provider acknowledgement is not institutional truth. These invariants hold across every stage and every channel.

## V7-04.5 Evidence, notifications, and recovery handoffs

This section is normative.

Evidence and records responsibilities remain governed by House authority and the records function. Notifications present required actions and status accurately. Failure and recovery handoffs preserve authority boundaries and route users to the correct authoritative destination.

## V7-04.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It creates no final visual design, production content, coded interface, design-system implementation, or executable workflow, and no procurement, sequencing, staffing, cost, pilot, rollout, or master development plan. Every controlled record remains in a not-implemented-or-not-proven posture.
