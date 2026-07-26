# V6-16 - Restricted Evidence, Document Access, Sharing, Disclosure, and Export Controls

Document ID: V6-16
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G2)

## V6-16.1 Purpose and scope

This section is normative.

This chapter defines heightened control objectives for restricted evidence,
document access, sharing, disclosure, and export. It grants no evidence access,
creates no sharing link, and authorizes no disclosure or export.

## V6-16.2 Restricted-evidence access

This section is normative.

Restricted evidence and its metadata (ASSET-V6-004) are governed by a
restricted-evidence control objective (CTRL-V6-027) that imposes access heightened
above ordinary authorization. Restricted-evidence access is need-to-know, purpose-
bound, time-limited, decision-linked, and fully logged. Restricted evidence is not
ordinary data.

## V6-16.3 Sharing, disclosure, and export

This section is normative.

Controlled sharing, disclosure to third parties, and export are governed by a
disclosure-and-export control objective (CTRL-V6-028). Every disclosure or export
requires a lawful purpose, a disclosure authority, a recipient scope, an expiry, and
a complete access and disclosure record. Unauthorized export and exfiltration
(ABUSE-V6-002) is addressed by these obligations as governed intent.

## V6-16.4 Access and disclosure record

This section is normative.

Every restricted-evidence access, share, disclosure, and export produces an
integrity-protected access and disclosure record. The record preserves who, what,
when, why, under whose authority, and for how long. The record is itself protected
and is subject to the privacy purpose recorded in V6-17.

## V6-16.5 Per-operation attributes

This section is normative.

For each restricted-evidence operation the model records: evidence class; access
authority; need-to-know basis; purpose; decision linkage; time limit; recipient
scope; disclosure authority; export authority; logging requirement; retention
dependency; and future verification. These are recorded in REG-602 and as an
obligation (OBL-V6-003).

## V6-16.6 Explicit non-authorizations

This section is normative.

This chapter grants no evidence access, creates no share or export mechanism, and
authorizes no disclosure. It records restricted-evidence, disclosure, and export
control objectives and their attributes only. Future validation (TEST-V6-009) must
prove heightened access and complete disclosure recording before any implementation
claim.
