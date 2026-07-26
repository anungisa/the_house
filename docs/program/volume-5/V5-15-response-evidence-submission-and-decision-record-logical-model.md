# V5-15 - Response, Evidence, Submission, and Decision-Record Logical Model

Document ID: V5-15
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G2)

## V5-15.1 Purpose

This section is normative.

This chapter defines the logical model for responses, evidence metadata, submission
snapshots, and decision records. It preserves the custody boundary between governed
metadata and external evidence content.

## V5-15.2 Response

This section is normative.

A response (LENT-V5-015) is the governed answer to an applicable requirement version
for an affiliation case. A response satisfies only the requirement version applicable
to the case at its relevant time (INTEG-V5-004).

## V5-15.3 Evidence metadata and custody boundary

This section is normative.

Evidence metadata (LENT-V5-016) binds to the response and requirement version it
supports. The evidence binary content remains external to the governed record; only
governed metadata is held within the model (INTEG-V5-005). Unbound or internalized
evidence breaks the custody boundary and is rejected. This preserves the evidence
custody exception EXC-V5-001.

## V5-15.4 Submission snapshot

This section is normative.

A submission is captured as an immutable snapshot (SNAP-V5-001) representing the
governed responses and evidence as known at submission time. A snapshot is never
edited after capture; resubmission creates a new snapshot (INTEG-V5-006, ADR-V5-011).

## V5-15.5 Decision record

This section is normative.

A decision record (LENT-V5-018) records the governed outcome of a case review. A
review outcome has exactly one active decision record; superseding decisions preserve
prior decisions (INTEG-V5-007). Decision records are governed facts and are corrected
only by supersession.
