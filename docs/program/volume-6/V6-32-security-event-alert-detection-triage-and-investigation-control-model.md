# V6-32 - Security Event, Alert, Detection, Triage, and Investigation Control Model

Document ID: V6-32
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G4)

## V6-32.1 Purpose and scope

This section is normative.

This chapter defines the control model for security events, alerts, detection,
triage, and investigation for the affiliation service. It defines the obligations
that must exist before any detection or investigation capability may be operated. It
defines a control model only. It writes no detection rule, creates no alert, defines
no monitoring threshold, and authorizes no implementation.

## V6-32.2 Events, alerts, and detection are distinct

This section is normative.

A security event is an observed occurrence in a governed system. An alert is a
signal raised from one or more events under a detection rule. Detection is the
governed capability of deriving alerts from events. These are distinct concepts: an
event is not an alert, an alert is not a confirmed problem, and detection is not
incident response. This chapter records that distinction so that no later work may
conflate raw observation with confirmed condition or with response.

## V6-32.3 Detection objectives and required context

This section is normative.

Each recognized security-event family carries a detection objective describing what
the family exists to make observable, and a required-context statement describing the
minimum governed context an alert must carry to be actionable. Where a family
protects personal data, the detection objective is constrained so that detection does
not itself become an over-collection of personal data. Detection objectives are
defined here; no detection rule is written and no objective is asserted to be met.

## V6-32.4 Triage and investigation authority

This section is normative.

Triage is the governed act of assessing an alert to decide whether it represents a
condition requiring response. Investigation is the governed act of examining a
triaged condition in depth. Each carries a named authority. Investigation authority
that grants access to governed or personal data is constrained to the minimum
necessary for the investigation and is itself a governed, auditable capability. No
triage or investigation capability is operated by this chapter.

## V6-32.5 Evidence preservation and privacy constraint

This section is normative.

Triage and investigation must preserve the evidence they rely upon with integrity,
and must operate under a privacy constraint that limits access to personal data to
the minimum necessary and prohibits inference beyond the investigative purpose.
Evidence preservation and the privacy constraint are recorded as obligations; no
evidence store is built and no investigation is conducted here.

## V6-32.6 False-positive posture and escalation to incident

This section is normative.

Each detection family records a false-positive posture describing how an unconfirmed
or erroneous alert must be dispositioned so that it neither triggers unwarranted
response nor conceals a real condition. Each records an escalation condition
describing when a triaged alert becomes a candidate incident and is handed to the
incident-classification model. Escalation to an incident is a linkage to the model
in V6-33; this chapter defines that linkage but declares no incident.

## V6-32.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It writes no detection or correlation rule,
creates no alert or monitor, sets no threshold or severity value, builds no
investigation tooling, and grants no access to any data. It makes no claim that any
event is detected, any alert is raised, or any investigation is possible. Every record
introduced by this chapter remains `authorizes_implementation: false` and
`implementation_status: NOT_IMPLEMENTED_OR_NOT_PROVEN`.
