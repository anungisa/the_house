# V7-25 - Status, Task, Notification, Timeline, and Messaging Design

Document ID: V7-25
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V7-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V7-G3)

## V7-25.1 Purpose

This section is normative.

This chapter defines the design of status, task, notification, timeline, and messaging elements for the club-affiliation experience. It records design specifications in register REG-702. Every visual state retains the governed semantic source that determines its meaning.

## V7-25.2 Status design

This section is normative.

Status is designed so that received, in-review, returned-for-information, decided, active, suspended, and expired conditions are visually distinct and semantically unambiguous. A status presentation never overstates its meaning: receipt is not approval, review is not decision, payment acknowledgement is not accounting confirmation, and approval is not activation. Each status names its governed source and its prohibited inference.

## V7-25.3 Task design

This section is normative.

Tasks are designed to show what is required, who is responsible, and what the institutional consequence of action or inaction is. Task presentation distinguishes an action the club representative may take from an action reserved to governed staff. No task presentation implies authority the actor does not hold.

## V7-25.4 Notification and messaging design

This section is normative.

Notifications and messages are designed to communicate a governed change of state, a required action, or a recovery path, and to route to the authoritative record rather than to substitute for it. Messaging is bilingual-equivalent and never asserts an outcome that the governed system has not recorded. Notifications disclose sensitivity and never expose restricted evidence or financial detail inappropriately.

## V7-25.5 Timeline design

This section is normative.

Timelines are designed to present the governed history of an affiliation in order, preserving provenance for submissions, returns, corrections, decisions, financial reconciliation, activation, and standing changes. A timeline never rewrites history; superseded events remain visible. Each timeline entry names its governed semantic source and its point-in-time meaning, and stale entries disclose that they may not reflect the live authoritative state.

## V7-25.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It creates no production content, coded interface, design-system implementation, executable workflow, notification pipeline, or interface or integration contract, and no procurement, sequencing, staffing, cost, pilot, rollout, or master development plan. It defines documentary status, task, notification, timeline, and messaging design only, pending Gate V7-G3.
