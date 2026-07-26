# V3-00 - Volume Control and Inheritance

Document ID: V3-00  
Title: Volume Control and Inheritance  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 3 Package 1 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-305 APP-V3-001)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V3-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 3 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-3/

## V3-00.1 Purpose

This section is normative.

Volume 3 defines the **business operating model** required to deliver the governed
affiliation service consistently, accountably, and sustainably. It answers a single
central question: what institutional operating model is required to deliver the
affiliation service consistently, accountably, sustainably, and with appropriate
national, PTSO, club, financial, support, privacy, and policy controls?

Volume 3 is an operating-model definition. It is **not** technical architecture, is
**not** a delivery sequence, is **not** a staffing or headcount plan, is **not** a
cost or procurement plan, and is **not** a master development plan. Volume 3
authorizes **no** runtime code, migrations, APIs, event schemas, implementation, or
procurement.

Package 1 (this package) establishes the operating-model foundation. It comprises
V3-00 through V3-07 and the Package 1 closure record V3-A, and is gated by
Gate V3-G1 (Business Operating-Model Foundation Ready).

## V3-00.2 Inheritance from Volume 0, Volume 1, and Volume 2

This section is normative.

Volume 3 proceeds from the frozen Volume 0 foundation, the **corrected Volume 1
v1.0.1 baseline**, and the **corrected Volume 2 v1.0.1 product-and-service
definition**.

Volume 2 released as v1.0.0 (tag `central-registration-volume-2-v1.0.0`, immutable)
and was subsequently corrected by a release-provenance amendment published as
`central-registration-volume-2-v1.0.1`. That amendment recorded distinct provenance
roles without collapsing them: the original Package 5 merge remains a separate role
from the released repository state, and the corrected inherited Volume 1 tag is
`central-registration-volume-1-v1.0.1`. Volume 3 inherits the corrected Volume 2
v1.0.1 state and its distinguished provenance record (REG-205 APP-V2-051,
DEC-V2-031).

Volume 3 inherits, by inheritance and without re-ratification:

- the affiliation product and service definition, pathways, and requirement-to-
  acceptance tracing established in Volume 2;
- the House/Button boundary and the governed-lifecycle authority model;
- the corrected Volume 1 qualified target operating model and first-release boundary;
- Gate V2-G5 PASS and all substantive Volume 2 findings and requirements;
- the Volume 3 authorization and the unchanged downstream restrictions: master
  development plan pending, and implementation and procurement unauthorized.

Inherited Volume 0, Volume 1, and Volume 2 artifacts remain frozen and are not
modified by Volume 3 work. References to inherited artifacts (for example V2-27,
DEC-V2-031, OUT-V2-001) are resolved by inheritance and are not re-ratified here.

## V3-00.3 Operating-model authority

This section is normative.

Volume 3 holds authority only to **define** the operating model. It records how the
affiliation service should be operated: which functions are accountable, how work
flows, how duties are separated, how money is reconciled, and how support, privacy,
and continuity are assured.

Volume 3 does not exercise, and may not be read to exercise, any of the following
authorities, which remain reserved to later volumes and to the executive material-
commitment authority:

- authorization of implementation, runtime code, migrations, APIs, or event schemas;
- definition of technical architecture;
- creation of delivery sequencing or a master development plan;
- commitment of staffing, headcount, cost, or procurement; and
- acceptance of material organizational commitments.

## V3-00.4 Governance machinery

This section is normative.

Volume 3 is governed by its own self-contained control set under
`docs/program/volume-3/`, mirroring the Volume 1 and Volume 2 frameworks but never
coupling to them:

- chapters V3-00 through V3-07 and closure record V3-A;
- registers REG-300 (corpus index), REG-301 (outcomes), REG-302 (stakeholders),
  REG-303 (requirements and acceptance), REG-304 (decisions), and REG-305
  (approvals);
- JSON Schemas and executable, non-authoritative controls that validate structure,
  schema conformance, referential integrity, and traceability.

The corpus is the authoritative record; the tooling only reports findings. The frozen
Volume 0, Volume 1, and Volume 2 corpora and their tooling are never altered by
Volume 3 work.

## V3-00.5 Amendment rules

This section is normative.

Once frozen at Package 1 closure, Volume 3 chapters are not edited in place.
Corrections and changes are recorded through the register amendment process: a
governance decision (REG-304) and an approval (REG-305) that supersede the prior
record. Change classification (editorial, non-material, material, policy, financial,
privacy, accessibility, bilingual, authority-boundary, or breaking-service-change)
determines the required evidence and whether executive acceptance is engaged.

## V3-00.6 Identifier conventions

This section is normative.

Volume 3 identifiers use the `-V3-` infix and are distinct from inherited identifiers:

- chapters `V3-NN` (numeric) and `V3-A` (closure record);
- outcomes `OUT-V3-NNN`; stakeholders `STK-V3-NNN`;
- requirements `CAP|BR|FR|NFR|UC|RULE|WF|UX|DATA|API|EVT|CTRL|TEST-V3-NNN`;
- operating measures `MEAS-V3-NN`;
- decisions `DEC-V3-NNN`; approvals `APP-V3-NNN`;
- gate `V3-G1`; package `PACKAGE-3-1`; volume artifact `VOLUME-3`.

## V3-00.7 Separation from product, architecture, delivery, and implementation

This section is normative.

Volume 3 defines operating accountability and flow only. Product definition remains
in Volume 2. Technical architecture, delivery sequencing, staffing, cost,
procurement, and implementation are outside Volume 3 and are neither defined nor
authorized here. Where Volume 3 references a product capability, it does so to place
operating accountability on it, not to redefine or to build it.
