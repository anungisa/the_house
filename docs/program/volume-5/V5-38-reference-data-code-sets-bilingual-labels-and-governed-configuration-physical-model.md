# V5-38 - Reference Data, Code Sets, Bilingual Labels, and Governed Configuration Physical Model

Document ID: V5-38
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G4)

## V5-38.1 Purpose

This section is normative.

This chapter defines the physical model for reference data, code sets, bilingual labels, and
governed configuration. It is documentary and authorizes no implementation. The authoritative
records are in REG-501 and the governing decision is ADR-V5-039.

## V5-38.2 Reference data and code set relations

This section is normative.

Reference and code values are governed as versioned relations. Each value carries a stable,
language-neutral identifier, a governed version, and a deprecation posture with a documented
replacement. Values are deprecated rather than deleted or silently reused, so historical
records remain interpretable.

## V5-38.3 Language-neutral identifiers

This section is normative.

Code identifiers are language-neutral and are never the human-readable label itself, per
decision ADR-V5-039. Referencing a code value uses its stable identifier, so that referencing
integrity is independent of language and label wording.

## V5-38.4 Bilingual label relations

This section is normative.

Human-readable labels are held as separate governed attributes carrying English and French
values. Bilingual labels are governed and separable from the code identity, so a label can be
corrected without breaking references and both official languages are first-class.

## V5-38.5 Controlled term relations

This section is normative.

Controlled terms carry a single canonical meaning with English and French labels. A controlled
term relation binds the canonical identifier to its bilingual expression and its governed
meaning, preventing divergent interpretations of the same term.

## V5-38.6 Governed configuration relations

This section is normative.

Governed configuration — values that steer governed behaviour, such as applicability windows
or governed thresholds — is represented as versioned reference data under explicit authority,
not as free-form settings. Configuration values carry their version and governing authority so
that a change of behaviour is an auditable governed act.

## V5-38.7 Downstream constraint

This section is normative.

No downstream volume may use a human-language label as a code key, delete or silently reuse a
reference value, or hold governed configuration outside versioned, authority-bearing reference
data.
