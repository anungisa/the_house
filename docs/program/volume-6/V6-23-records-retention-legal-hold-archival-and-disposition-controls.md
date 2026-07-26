# V6-23 - Records, Retention, Legal-Hold, Archival, and Disposition Controls

Document ID: V6-23
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G3)

## V6-23.1 Purpose and scope

This section is normative.

This chapter defines the records-management control model for the affiliation
service: the requirement for a records authority, the dependency of retention on
that authority, the precedence of legal hold over disposition, and the controlled
nature of archival and disposition. It defines controls only. It sets no retention
period, schedules no disposition, deletes nothing, and authorizes no
implementation.

## V6-23.2 Records authority

This section is normative.

Governed records of the affiliation service are subject to a records authority that
owns the retention schedule, the disposition schedule, and the archival posture. No
retention period, disposition timing, or archival decision is set in this volume.
The control requires that a validated records authority exist and own these
schedules before any retention, archival, or disposition behaviour may be
authorized. Recording this control neither creates a schedule nor sets a period.

## V6-23.3 Retention depends on records authority

This section is normative.

Retention of a governed record is permitted only under a retention schedule approved
by the records authority. Until that schedule is validated, retention status is
recorded as pending, and no record may be retained or disposed of on the strength of
this volume. Retention is never inferred from the absence of a schedule.

## V6-23.4 Legal hold supersedes disposition

This section is normative.

A legal hold, when placed by the accountable authority, supersedes any disposition
schedule for the records within its scope. While a hold is in force, disposition of
held records is prohibited regardless of any retention or disposition schedule. The
control records the precedence of hold over disposition; it places no hold, scopes no
hold, and releases no hold.

## V6-23.5 Archival and disposition are controlled

This section is normative.

Archival and disposition are governed actions that require a disposition authority,
recorded deletion evidence, and, where a provider holds records, a provider-records
dependency that must be validated before reliance. Disposition produces evidence of
what was disposed of and under what authority. No archival or disposition action is
authorized, scheduled, or performed by this chapter, and no deletion is executed.

## V6-23.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It sets no retention period, schedules no
archival or disposition, places or releases no legal hold, deletes no record, selects
no records provider, and configures no schedule or workflow. Every record introduced
by this chapter remains `authorizes_implementation: false` and `implementation_status:
NOT_IMPLEMENTED_OR_NOT_PROVEN`.
