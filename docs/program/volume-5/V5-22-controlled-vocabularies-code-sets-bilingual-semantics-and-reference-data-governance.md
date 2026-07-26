# V5-22 - Controlled Vocabularies, Code Sets, Bilingual Semantics, and Reference-Data Governance

Document ID: V5-22
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G3)

## V5-22.1 Purpose

This section is normative.

This chapter governs reference data: controlled vocabularies, code sets, and their
bilingual semantics. It defines how reference values are authored, versioned, deprecated,
and retired so that historical data remains interpretable. The authoritative catalogue is
REG-501 and the authoritative rules are REG-502. This chapter authorizes no
implementation.

## V5-22.2 Reference data sets and code sets

This section is normative.

Reference data sets (REG-501, RDS-V5-001 through RDS-V5-003) and code sets (CODE-V5-003
through CODE-V5-005) are governed, versioned collections of permitted values. Each names
an authority owner and a version posture. Reference and code values conform to their
governed definitions (QUALITY-V5-011).

## V5-22.3 Controlled terms and bilingual semantics

This section is normative.

Controlled terms (REG-501, CTERM-V5-001 through CTERM-V5-004) carry a single canonical
meaning independent of any single label. User-facing reference data and controlled terms
carry both an English label and a French label; the canonical meaning is the governed
fact, and the labels are governed presentations of that meaning. A label change never
changes the canonical meaning.

## V5-22.4 Versioning, deprecation, and historical interpretation

This section is normative.

Reference and code values are versioned and, when retired, are deprecated with a
documented replacement value; they are never deleted or silently reused
(INTEG-V5-016). Every historical record retains the meaning of the reference value that
applied at its effective time. Unversioned reference-data drift is a recognized risk
(REG-504, RISK-V5-005).

## V5-22.5 External-authority reference data

This section is normative.

Where reference data originates from an external authority — for example jurisdiction,
recognition, or accounting reference data — the House holds an aligned governed copy and
never re-authors it (RULE-V5-013). External authorities remain authoritative for external
facts (REG-504, ASM-V5-005).

## V5-22.6 Downstream constraints and no authorization

This section is normative.

Downstream volumes must preserve reference-data versioning and bilingual semantics and
must not treat a House copy of external reference data as the source of truth for external
facts. No record in this chapter authorizes implementation, storage or vendor selection,
or procurement. The bilingual-completeness and reference-versioning validation obligations
are recorded in REG-504 (TEST-V5-020) and remain open until their future gates.
