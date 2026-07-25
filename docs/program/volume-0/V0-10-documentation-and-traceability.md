# V0-10 - Documentation, Traceability, and Source Control

Document ID: V0-10
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority; surname to be recorded in REG-001)
Associated Gate: G0
Ratification: Package 3; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable future gate (REG-006 APP-010)
Related Documents: V0-06 (authority doctrine and source truth), V0-07 (evidence labels), V0-09 (delivery), V0-11 (RAID and exception governance)

This chapter is normative except where a subsection is marked explanatory. It
defines the documentation and source-control regime for Volume 0: the artifact
hierarchy, identifier namespaces, document statuses, versioning, source hierarchy
and truth classifications, reference syntax, traceability requirements, ratification
and freeze semantics, amendment and supersession rules, handling of generated
documents, and the machine validation that enforces these rules.

## 10.1 Purpose and scope

This subsection is normative.

Governance is only real if it is traceable. This chapter makes the governance corpus
a controlled, machine-validatable body of record. It applies to all Volume 0
chapters, annexes, and registers, and to the schemas and controls that validate them.

## 10.2 Artifact hierarchy

This subsection is normative.

The governance corpus is organized in a fixed hierarchy:

1. Volume 0 chapters (V0-00 through V0-12) hold normative doctrine.
2. Volume 0 annexes (V0-A through V0-G and beyond) hold closure records and
   supporting constitutional records.
3. Registers (REG-000 through REG-008) hold machine-readable control records.
4. Schemas define the required shape of each register.
5. Controls are the executable validators that enforce these rules.

A record's place in this hierarchy determines its authority. A register record must
not contradict the chapter that governs its domain.

## 10.3 Identifier namespaces

This subsection is normative.

Identifiers are namespaced and stable. The reserved namespaces are:

1. `V0-NN` and `V0-X` for chapters and annexes.
2. `REG-NNN` for registers.
3. `DEC-V0-NNN` for governance decisions.
4. `APP-NNN` for approval records.
5. `STK-NNN` for stakeholders.
6. `SRC-NNN` for source-authority records.
7. `OUT-NNN` for measures.
8. `RISK-NNN`, `ASM-NNN`, `DEP-NNN`, `ISS-NNN`, `OPP-NNN` for RAID records.
9. `EXC-NNN` for exceptions.

Identifiers are unique within their namespace and are never reused after
retirement. Duplicate identifiers are a constitutional defect.

## 10.4 Document statuses

This subsection is normative.

Every chapter, annex, and register carries exactly one status:

1. `DRAFT` - authored but not proposed for ratification.
2. `IN_REVIEW` - under active review or living register maintenance.
3. `RATIFIED` - accepted by the Accountable Program Authority with a valid
   approval record.
4. `SUPERSEDED` - replaced by a later ratified version.
5. `WITHDRAWN` - removed from force.

A `RATIFIED` status is valid only when supported under 10.9. A status that is not
supported by its required records is a constitutional defect.

## 10.5 Versioning

This subsection is normative.

Chapters, annexes, and registers use semantic versions `MAJOR.MINOR.PATCH`.

1. Pre-ratification drafts use `0.x.y`.
2. Ratification sets the version to `1.0.0`.
3. A constitutional amendment to a ratified artifact increments `MAJOR`.
4. A non-normative correction to a ratified artifact increments `PATCH`.
5. Living registers increment `MINOR` as records are added or refined and reach
   `1.0.0` only when their domain is ratified.

The version recorded in a ratified chapter must equal the version recorded for that
chapter in the corpus index (REG-000).

## 10.6 Source hierarchy and truth classifications

This subsection is normative.

Sources of truth are classified in REG-005 under the authority doctrine of V0-06.
Every source carries a single authority level and a single classification. The
classification determines what the source is authoritative for and what it is not
authoritative for.

No document may treat a reporting source, a reference case, or a temporary
transition platform as an authoritative system of record. Authority conflicts
between sources are a constitutional defect.

## 10.7 Reference syntax and truth classifications of statements

This subsection is normative.

References between records use the canonical identifier of the target (for example
`V0-07`, `REG-005`, `DEC-V0-012`, `APP-008`). A reference must resolve to an
existing record; an unresolved reference is a constitutional defect.

Statements in the corpus are classified by truth basis using the evidence labels of
V0-07 7.4. A statement must not carry a stronger label than its evidence supports.

## 10.8 Traceability requirements

This subsection is normative.

Every governed artifact must be traceable:

1. Every ratified chapter must be indexed in REG-000 with a matching version.
2. Every ratification must trace to an approval record in REG-006.
3. Every governance decision in REG-002 must reference the artifacts it affects.
4. Every risk, assumption, dependency, and exception must reference the artifact or
   gate it bears on.

A break in any required traceability chain is a constitutional defect.

## 10.9 Ratification semantics

This subsection is normative.

A chapter or annex is validly `RATIFIED` only when all of the following hold:

1. It records an owner and an approver, or - for an annex ratified as part of a
   package - the covering package approval records the accountable approver.
2. There exists an approval record in REG-006, in state `ratified`, whose
   `artifact_id` is the artifact or whose `scope` includes the artifact, and which
   is not withdrawn or expired.
3. Its version equals the version recorded for it in the corpus index.
4. Its evidence label is one of the permitted labels and does not imply independent
   validation that has not occurred.

A `RATIFIED` status that fails any of these conditions is a false ratification and a
constitutional defect.

## 10.10 Freeze semantics

This subsection is normative.

A package is frozen when its closure record is ratified. A frozen package must have a
closure record, a closure decision in REG-002, an approval record in REG-006, a
recorded base commit, and a stated amendment process.

While a package is frozen, the ratified version of each artifact in its scope is
fixed. Any change to a frozen artifact's version requires an amendment under 10.11.

## 10.11 Constitutional amendments and supersession

This subsection is normative.

A ratified artifact is changed only by a constitutional amendment. An amendment
must record the amendment identifier and reason as a decision in REG-002, the
affected artifact, the resulting new version, the accepting authority, and an
updated closure record where the artifact belongs to a frozen package.

Supersession replaces an artifact with a later ratified version; the superseded
artifact is marked `SUPERSEDED` and remains in the record. A superseded artifact must
not be referenced as current.

## 10.12 Generated documents

This subsection is normative.

Generated documents - including control reports, and any DOCX or PDF renderings -
are non-authoritative projections of the source-controlled corpus. The
source-controlled Markdown chapters, YAML registers, JSON schemas, and control
scripts are the authoritative record. A generated artifact must never be treated as a
source of truth and must not be the basis of a ratification.

## 10.13 Machine validation requirements

This subsection is normative.

The rules of this chapter are enforced by executable controls. At minimum the
controls must validate schema conformance of every register, identifier uniqueness,
cross-reference integrity, ratification integrity, authority integrity, exception
expiry, and frozen-package amendment integrity.

The controls classify findings as ERROR, WARNING, or INFO. A false ratification, a
broken reference, an expired active exception, a duplicate identifier, and an
authority conflict are ERROR conditions. Unresolved future validation that is not yet
gate-required is a WARNING. The controls are run locally and in continuous
integration for changes to the governance corpus.

## 10.14 Constitutional control

This subsection is normative.

This chapter is ratified under Package 3 by the Accountable Program Authority. Its
evidence basis is SELF-ATTESTED / AUTHOR-VERIFIED. It does not claim independent
validation and does not assert executive organizational acceptance. Amendments follow
the constitutional amendment control in V0-00 and are recorded in REG-002 and
REG-006.
