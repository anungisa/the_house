# V8-08 - Data Classification, Privacy, and Message Constraints

Document ID: V8-08
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G1)

## V8-08.1 Purpose

This section is normative.

This chapter governs the classification of data carried by contracts, the privacy constraints that classification imposes, and the message constraints that keep restricted information out of inappropriate surfaces. It governs constraint, not the executable payload or storage.

## V8-08.2 Classification vocabulary

This section is normative.

Every value a contract conveys is classified as exactly one of the governed classifications: public, internal-operational, personal information, restricted evidence, financial status, privileged administration, audit and security, secrets and configuration, or migration and quarantine. A value whose classification cannot be named fails closed and must not be conveyed.

Each classification carries a sensitivity level. Sensitivity determines the minimum privacy constraint a surface must satisfy before it may carry the value.

## V8-08.3 Privacy constraints

This section is normative.

Every contract that conveys personal, restricted, financial, audit, or secret classification names an explicit privacy constraint: the rule stating who may receive the value, under what authorization, and what inference is prohibited. Access to a value confers no authority to disclose it further. A contract that conveys restricted classification without a named privacy constraint fails closed.

## V8-08.4 Message-surface constraints

This section is normative.

Restricted, audit, secret, and financial classifications must not be carried in error messages, notification bodies, webhook payloads to external parties, reporting feeds, or analytics feeds unless the surface names an explicit privacy constraint authorizing it. A message surface conveys the least information necessary and never leaks a restricted value into a lower-classification channel.

## V8-08.5 Minimization and prohibited inference

This section is normative.

Every contract conveys the minimum data necessary for its named purpose. No contract may convey a value merely because it is available, and no consumer may infer a prohibited fact from the presence, absence, or shape of a conveyed value. Prohibited inferences are named where a value could otherwise be used to derive restricted knowledge.

## V8-08.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It builds no payload, redaction, encryption, or storage mechanism. Every controlled classification and privacy record remains in a not-implemented-or-not-proven posture and authorizes no construction.
