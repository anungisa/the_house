# V5-00 - Volume Control, Inheritance, and Data-Definition Authority

Document ID: V5-00
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G1)

## V5-00.1 Purpose and scope

This section is normative.

This chapter establishes control of Volume 5, Package 1 — the Data Governance
and Conceptual Information Foundation of The House v2. Volume 5 defines the
governed meaning, ownership, quality, classification, and lineage of information.
It does not design, provision, or authorize any physical data store, logical
schema, migration, pipeline, integration, or infrastructure.

Volume 5 Package 1 is a data-definition package. Its authority is limited to
conceptual and governance semantics. Construction is authorized only later,
through the governed gate sequence, once the validation obligations recorded in
this package are satisfied.

## V5-00.2 Inheritance from Volumes 0 through 4

This section is normative.

Volume 5 inherits, without modification, the frozen Volume 0 foundation and the
released baselines of Volumes 1 through 4. The inherited architecture baseline is
the corrected Volume 4 release, published as `central-registration-volume-4-v1.0.1`.

The corrected baseline is significant: the original Volume 4 release provenance
was amended by the Volume 4 release-provenance amendment (V4-K), which distinguished
the source snapshot, closure freeze, original package merge, provenance amendment,
release merge, release tag object, release tag target commit, and inherited baseline
tag. Volume 5 treats `central-registration-volume-4-v1.0.1` as its authoritative
architecture inheritance and does not rely on the superseded released-state
interpretation.

Inherited artifacts (Volume 0 through Volume 4 chapters, registers REG-0xx through
REG-4xx, decisions, approvals, gates, and released volume tags) are resolved by
inheritance. Volume 5 does not restate or alter them.

## V5-00.3 Data-definition authority

This section is normative.

Volume 5 holds data-definition authority for The House v2: the authority to define
what information means, who owns it, how it is classified, and how its quality and
lineage are governed. Data-definition authority is distinct from:

- business authority — the institutional authority accountable for a domain of
  information and its governed decisions;
- data stewardship — responsibility for the quality and correct maintenance of
  information within a domain;
- system-of-record authority — the authority designated as the governed source of
  truth for a class of information; and
- technical custody — the operational holding or hosting of data.

These four are separate facts. Volume 5 records them explicitly and never conflates
them. Custody never confers business ownership; stewardship never confers governed
decision authority; storage location never determines authority.

## V5-00.4 Controlled identifiers

This section is normative.

Volume 5 introduces the following controlled identifier families. Each is unique
within its register and resolves through the Volume 5 controls:

- `DOMAIN-V5-NNN` — information domains (REG-501);
- `ENTITY-V5-NNN` — conceptual entities (REG-501);
- `REL-V5-NNN` — conceptual relationships (REG-501);
- `DATA-V5-NNN` — derived data products (REG-501);
- `CLASS-V5-NNN` — classifications (REG-501);
- `RULE-V5-NNN` — data doctrine rules (REG-502);
- `QUALITY-V5-NNN` — data quality dimensions (REG-502);
- `LINEAGE-V5-NNN` — lineage rules (REG-502);
- `CTRL-V5-NNN` — governance controls (REG-502);
- `ADR-V5-NNN` — data decisions (REG-503);
- `ASM-V5-NNN`, `RISK-V5-NNN`, `EXC-V5-NNN`, `TEST-V5-NNN` — assumptions, risks,
  exceptions, and validation backlog items (REG-504);
- `APP-V5-NNN` — approvals (REG-505); and
- `V5-NN` / `V5-A` — chapters and the closure record (REG-500).

## V5-00.5 Amendment rules

This section is normative.

Ratified Volume 5 artifacts are immutable at their released version. Corrections are
made only by a new, higher-versioned artifact or a narrow provenance amendment that
supersedes a precisely scoped interpretation while preserving all prior records.
Amendments never erase governed history and never reopen frozen substantive content.

Package 1 is closed by its closure record (V5-A) and frozen by an explicit freeze
approval. After freeze, changes to Package 1 require the recorded amendment process.

## V5-00.6 Governance controls

This section is normative.

The Volume 5 controls (CTRL-V5-001 through CTRL-V5-006) validate this corpus and
fail closed on: an information domain without named authorities; an unresolved
entity or relationship reference; a quality or correction rule without a correction
authority; a derived product or lineage rule without a source; any record that
authorizes implementation; and any physical, DDL, or migration artifact appearing
in a chapter or register. These controls are non-authoritative tooling; the
source-controlled corpus remains the authoritative record.

## V5-00.7 No-implementation prohibition

This section is normative.

No Volume 5 record authorizes implementation. Every record in every Volume 5
register asserts `authorizes_implementation: false`. Volume 5 Package 1 creates no
physical table, column, key, index, data store, or logical schema; no data
definition language or migration; no object-relational mapping; no executable
pipeline, import, or export; no infrastructure provisioning; no storage, database,
analytics, or integration vendor selection; no retention schedule or deletion rule
in the absence of approved records-policy authority; no procurement; no delivery
sequencing; and no staffing, cost, or master development plan. Volume 5 makes no
claim that data governance, privacy compliance, migration readiness, or data
quality is implemented. Such authorizations arise only downstream through the
governed gate sequence.
