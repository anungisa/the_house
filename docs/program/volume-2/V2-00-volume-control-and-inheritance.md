# V2-00 - Volume Control and Inheritance

Document ID: V2-00  
Title: Volume Control and Inheritance  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 1 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-008)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-00.1 Purpose

This section is normative.

Volume 2 defines the **product and service definition** for the governed affiliation
service of The House v2. It answers what the product is, who it serves, what outcomes
it must produce, where the boundary between The House and The Button lies, and how
requirements trace to acceptance. Volume 2 is **not** implementation sequencing, is
**not** a master development plan, and authorizes **no** runtime code, migrations,
APIs, implementation, or procurement.

Package 1 (this package) establishes the product-definition foundation. It comprises
V2-00 through V2-05 and the Package 1 closure record V2-A, and is gated by
Gate V2-G1 (Product-Definition Foundation Ready).

## V2-00.2 Inheritance from Volume 1

This section is normative.

Volume 2 proceeds from the **corrected Volume 1 v1.0.1 baseline**. Volume 1 v1.0.0
released the qualified target definition; the v1.0.1 release-provenance amendment
(V1-G) corrected a temporal provenance defect in the whole-volume freeze metadata
without changing any substantive Volume 1 finding, disposition, or gate result.
Volume 2 inherits:

- the qualified affiliation target operating model and first-release boundary (V1-24);
- the current-state findings and target constraints (V1-20);
- the data-flow, authority and reconciliation model (V1-18);
- the House governance-kernel, authorization, workflow and evidence qualification (V1-12);
- the conditional Volume 2 authorization recorded in DEC-V1-029; and
- the unchanged downstream posture: master development plan pending, implementation
  and procurement unauthorized, and executive organizational acceptance pending.

Inherited Volume 0 and Volume 1 artifacts remain frozen and are not modified by
Volume 2 work. References to inherited artifacts (for example V1-24, DEC-V1-029) are
resolved by inheritance and are not re-ratified here.

## V2-00.3 Governance machinery

This section is normative.

Volume 2 is governed by its own self-contained control set under
`docs/program/volume-2/`, mirroring the Volume 1 framework but never coupling to it:

- chapters V2-00 through V2-05 and closure record V2-A;
- registers REG-200 (corpus index), REG-201 (outcomes), REG-202 (stakeholders and
  personas), REG-203 (requirements and acceptance), REG-204 (decisions), and
  REG-205 (approvals);
- JSON schemas enforcing each register;
- controls that validate structural/schema conformance and cross-reference and
  traceability integrity, aggregated by `npm run governance:check:v2`.

The Markdown chapters, YAML registers, JSON schemas, and control scripts are the
authoritative record. Generated reports are non-authoritative projections.

## V2-00.4 Scope control and prohibitions

This section is normative.

Package 1 is bounded to product and service definition. The following are prohibited
in Volume 2 Package 1 and are recorded as fail-closed constraints:

- no runtime code, migrations, or APIs;
- no implementation or construction authorization;
- no procurement authorization;
- no master development plan;
- no fabricated stakeholder, domain, or executive validation. Where validation has not
  occurred, records carry `stakeholder_validation_pending` and are not asserted as
  validated.

## V2-00.5 Package 1 gate

This section is normative.

Package 1 completes at **Gate V2-G1 - Product-Definition Foundation Ready** (defined in
V2-A) upon satisfaction of its ten conditions. Gate V2-G1 PASS records product
definition only; it authorizes no implementation and leaves executive acceptance
pending.
