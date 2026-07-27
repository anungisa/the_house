# V6-33 - Incident Classification, Command, Containment, and Decision-Authority Control Model

Document ID: V6-33
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G4)

## V6-33.1 Purpose and scope

This section is normative.

This chapter defines the control model for incident classification, incident command,
containment, closure, and the decision authority governing an incident. It defines the
obligations that must exist before any incident-response capability may be operated. It
defines a control model only. It writes no incident-response procedure, defines no
severity thresholds, appoints no responder, and authorizes no implementation.

## V6-33.2 Incident classification

This section is normative.

An incident is an escalated, confirmed condition requiring governed response. Each
recognized incident class carries a classification authority accountable for
assigning it and a classification-method status describing that no severity scale or
threshold is defined in this volume. Classification determines which obligations apply
to an incident; it does not itself contain, resolve, or close the incident. No incident
is declared or classified by this chapter.

## V6-33.3 Incident command and decision authority

This section is normative.

Each incident class names an incident-command status describing who is accountable for
directing the response and a decision authority accountable for governed decisions
taken during the incident. The authority to direct the technical response to an incident
is distinct from the authority to accept business consequences of that incident, which
is governed separately in V6-37. No command function is stood up here.

## V6-33.4 Containment and evidence preservation

This section is normative.

Each incident class carries a containment objective describing what must be limited or
isolated to stop ongoing harm, and an evidence-preservation obligation requiring that
the state relevant to the incident be preserved with integrity before and during
containment. Containment is defined as an objective; no containment action is taken and
no evidence store is built by this chapter.

## V6-33.5 Privacy and records authority during incidents

This section is normative.

An incident may implicate personal data or governed records. Each incident class records
a privacy-authority dependency and a records-authority dependency requiring that any
handling of personal data or governed records during an incident occur under the
authority that owns them, under minimum-necessary access. These dependencies are recorded
as pending validation; no authority is exercised here.

## V6-33.6 Closure and post-incident review

This section is normative.

Each incident class carries a closure authority accountable for confirming that the
incident may be closed and a post-incident-review obligation requiring that a governed
review follow closure. An incident is not closed by the absence of alerts; closure
requires a decision by the named authority supported by evidence. This chapter defines
closure and review as obligations and performs neither.

## V6-33.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It writes no incident-response runbook or
playbook, defines no severity scale, threshold, response-time target, or escalation
timer, appoints no responder or commander, and takes no containment or closure action.
It makes no claim of incident readiness or response capability. Every record introduced
by this chapter remains `authorizes_implementation: false` and `implementation_status:
NOT_IMPLEMENTED_OR_NOT_PROVEN`.
