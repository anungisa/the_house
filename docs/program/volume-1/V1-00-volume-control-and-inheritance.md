# V1-00 - Volume Control and Inheritance

Document ID: V1-00  
Title: Volume 1 Control and Inheritance  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 1 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable gate (see V1-A, REG-108 APP-V1-001)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G1)  
Supersedes: None  
Review Cycle: Monthly until Volume 1 closes, then quarterly  
Repository Path: docs/program/volume-1/

## V1-00.1 Purpose of Volume 1

This section is normative.

Volume 1 — Current-State Qualification and Repository Convergence — establishes the
factual ground on which the product, architecture, test estate, and eventual master
development plan will be built.

Its purpose is to determine, with recorded evidence:

- what exists;
- what is authoritative;
- what is reusable;
- what must be redesigned;
- what must be retired.

Volume 1 reconciles four distinct realities:

1. Curling Canada operating reality;
2. Base44 product and experience intelligence;
3. The House production-candidate implementation;
4. External platforms, data sources, policies, and dependencies.

Volume 1 does **not** implement product functionality and does **not** author the
master development plan. It qualifies; it does not construct.

## V1-00.2 Inheritance from Volume 0

This section is normative.

Volume 1 inherits, unchanged, all controls ratified in Volume 0 (the Program
Constitution), frozen at tag `central-registration-volume-0-v1.0.0` (merge commit
`d897b13`).

Inherited controls include, without limitation:

- the governance and decision-rights model (V0-07), including decision classes
  D0–D9 and the evidence-label vocabulary;
- the product, repository, and authority doctrine (V0-06): The House is the
  system-of-record production-candidate; The Button is the experience layer;
  Base44 is reference/product evidence, not production authority;
- the delivery and assurance doctrine (V0-09);
- the documentation and traceability doctrine (V0-10);
- the risk, assumption, and dependency governance (V0-11);
- append-only audit, immutable evidence, idempotency, tenancy/RLS, and
  fail-closed posture.

Volume 1 must not weaken any inherited control. Where Volume 1 needs an exception,
it must be recorded as a governed exception, not applied silently.

## V1-00.3 Volume 0 freeze preservation

This section is normative.

Volume 0 remains frozen. Volume 1 work:

- must not modify any file under `docs/program/volume-0/`;
- must not alter Volume 0 registers, schemas, chapters, or controls;
- operates from a branch taken from the merged and tagged baseline, not from any
  unmerged feature branch.

Any change to a frozen Volume 0 artifact requires a constitutional amendment under
the V0-00 control and is out of scope for Volume 1.

## V1-00.4 Volume 1 authority and non-authorization rule

This section is normative.

Volume 1 findings, capability inventories, and qualification decisions are
assessment products. They do not, by themselves, authorize implementation,
procurement, migration, or production change.

Authorization to construct requires a subsequent, explicitly gated decision with
executive organizational acceptance where required (V0-07). This rule is enforced
by the qualification-authorization control (REG-106 guard): a qualification
decision may set `authorizes_implementation` true only when it is
`executive_accepted` and names an authorizing gate.

## V1-00.5 Volume 1 structure

This section is normative.

Volume 1 is delivered in five packages:

1. Package 1 — Qualification framework and source control (this package);
2. Package 2 — Base44 repository qualification;
3. Package 3 — The House implementation qualification;
4. Package 4 — Current ecosystem and operating reality;
5. Package 5 — Convergence and target disposition.

Package 1 creates the machinery that governs the assessment. Substantive
qualification of any source does not begin in Package 1.

The Package 1 corpus comprises:

- V1-00 Volume Control and Inheritance (this document);
- V1-01 Qualification Methodology;
- V1-02 Source and Evidence Model;
- V1-03 Capability Disposition Standard;
- V1-04 Current-State Evidence Quality Standard;
- registers REG-100 (corpus index), REG-101 (sources), REG-102 (evidence),
  REG-103 (capabilities), REG-104 (findings), REG-105 (contradictions),
  REG-106 (qualification decisions), REG-107 (governance decisions),
  REG-108 (approvals);
- JSON Schemas and executable controls that validate the corpus.

## V1-00.6 Governance toolchain

This section is normative.

Volume 1 is validated by executable controls under
`docs/program/volume-1/controls/`, run via `npm run governance:check:v1`. The
controls mirror the Volume 0 governance framework (schema conformance, identifier
uniqueness, cross-reference integrity, ratification integrity, freeze integrity)
and are self-contained so that the frozen Volume 0 corpus and tooling are never
coupled to Volume 1 assessment work.

Every Volume 1 register is schema-governed. The control report at
`docs/program/volume-1/generated/governance-control-report.md` is a
non-authoritative projection; the Markdown chapters, YAML registers, JSON schemas,
and control scripts are the authoritative record.

## V1-00.7 Associated gate

This section is normative.

Associated gate: V1-G1 (Qualification System Ready). Gate V1-G1 is defined in
V1-01 and its disposition is recorded in REG-107 (DEC-V1-006) and REG-108
(APP-V1-006).

Related decisions (see REG-107): DEC-V1-001 (inheritance), DEC-V1-006 (Gate V1-G1).
