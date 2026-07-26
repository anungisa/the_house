# V6-10 - Trust-Foundation Assessment and Deterministic Controls

Document ID: V6-10
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G1)

## V6-10.1 Purpose and scope

This section is normative.

This chapter defines the deterministic, non-authoritative controls that assess the
integrity of the Volume 6 protection foundation over the source-controlled corpus.
The controls are tooling; the chapters, registers, and schemas remain the
authoritative record. The controls authorize no implementation.

## V6-10.2 Deterministic controls

This section is normative.

The Volume 6 controls validate: YAML and schema conformance of every register;
identifier uniqueness; chapter header and heading integrity; the fail-closed
protection guards (assets without owner or classification; trust boundaries without
threats; threats without preventive, detective, and corrective objectives;
authorization controls lacking resource-aware inputs; privacy purposes without
information-domain mappings, disclosure authority, or records authority; obligations
without applicability, owner, control, evidence, or gate; controls without owner,
evidence, or gate; accessibility obligations without verification; bilingual
obligations without semantic equivalence; incident families without evidence
preservation; assurance requirements without owner, evidence, classification, or
gate; exceptions without authority or expiry; validation items without owner or
gate; unresolved items pointing to completed gates); cross-reference integrity; the
implementation-authorization guard; the implementation-status guard; and the
executable-protection-leakage guard.

## V6-10.3 Foundation assessment outputs

This section is normative.

The foundation assessment produces deterministic, rebuildable projections of the
corpus: an asset and boundary catalogue; threat and abuse coverage; authorization-
input coverage; privacy purpose and domain mapping; compliance-obligation coverage;
accessibility and bilingual coverage; incident and evidence coverage; a control and
assurance backlog; and a Package 1 trust-foundation report. These projections are
non-authoritative and never a source of truth or a basis for ratification.

## V6-10.4 Fail-closed posture

This section is normative.

The controls fail closed. Any executable-protection leakage, any record that
authorizes implementation, any record whose implementation status is not
not-implemented/not-proven, and any unresolved reference is reported as an error and
blocks a clean check. This enforces, mechanically, the obligation-only scope of
Volume 6 Package 1.

## V6-10.5 Explicit non-authorizations

This section is normative.

The controls and their generated outputs authorize no implementation and assert no
compliance, conformance, operational proof, or independent assurance. They report on
the governed corpus only.
