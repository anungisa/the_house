# V8-34 - Import Intake, Validation, Acceptance, Rejection, Quarantine, and Partial-Success Contracts

Document ID: V8-34
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G4)

## V8-34.1 Purpose

This section is normative.

This chapter defines the import lifecycle and the acceptance, rejection, quarantine, and partial-success contracts that govern it. It states how received content is evaluated and what governed consequences follow. It authorizes no importer, transformation, or executable validation, and it changes no governed state.

## V8-34.2 The import lifecycle

This section is normative.

The governed import lifecycle proceeds through explicit stages:

```
Received
→ authenticated
→ integrity checked
→ structurally evaluated
→ semantically evaluated
→ authority evaluated
→ accepted, partially accepted, rejected, or quarantined
→ reconciled
```

Each stage is a governed boundary that content must pass before the next. Content that fails a stage does not silently advance. Reaching a later stage never retroactively confers the properties of an earlier one.

## V8-34.3 Attributes recorded for each import family

This section is normative.

For every import family the governed record defines the source authority, the expected content, the validation classes, the acceptance authority, the reject conditions, the quarantine conditions, the partial-success posture, the duplicate posture, the unknown-record posture, the identity-resolution dependency, the correction and resubmission posture, the evidence produced, the authoritative-state consequence, and the reconciliation requirement. An import family that names no acceptance authority, no reject and quarantine conditions, or no authoritative-state consequence fails closed and is not defined.

## V8-34.4 Rejected and quarantined records remain non-authoritative

This section is normative.

Rejected and quarantined records remain non-authoritative. A rejected record produces no governed state; a quarantined record is held pending reconciliation and produces no governed state while held. Neither a rejection nor a quarantine is a silent discard: both are recorded as governed outcomes with evidence. The original exchange record is preserved, and correction does not erase it.

## V8-34.5 Accepted structure does not prove business validity

This section is normative.

Acceptance of the structure of an import does not prove the business validity of its content. Structural acceptance confirms that records are well-formed; it does not confirm that they carry authorized institutional meaning. Partial success must be explicit: when some records are accepted and others are rejected or quarantined, the outcome names exactly which records reached which disposition. Unsupported values remain visible and are never silently coerced into a supported value.

## V8-34.6 Imports cannot silently create governed authority

This section is normative.

An import cannot silently create representative, reviewer, finance, or decision authority. Importing a record that asserts a role or standing does not confer that role or standing; the governed authority to grant it remains internal and is exercised through the governed lifecycle, not through file intake. Every import declares its authoritative-state consequence explicitly, and the default consequence for unauthorized content is no governed effect.

## V8-34.7 No claim of import capability

This section is normative.

Nothing in this chapter asserts that any import is implemented, executed, validated, or accepted. The import lifecycle and its contracts are documentary. Every controlled record is in a not-implemented-or-not-proven posture.

## V8-34.8 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no importer, transformation, adapter, or executable validation; it selects no format or transfer mechanism; and it changes no governed state. Every controlled Package 4 record remains in a not-implemented-or-not-proven posture and authorizes no construction.
