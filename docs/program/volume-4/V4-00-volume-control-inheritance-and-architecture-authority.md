# V4-00 - Volume 4 Control, Inheritance, and Architecture Authority

Document ID: V4-00  
Title: Volume 4 Control, Inheritance, and Architecture Authority  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 1 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-001)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-00.1 Purpose and volume scope

This section is normative.

Volume 4 defines the **target architecture and engineering constraints** required to implement
the affiliation service and the surrounding governed platform, while preserving the authority,
operating, assurance, privacy, financial, accessibility, and continuity boundaries established by
Volumes 0 through 3. Package 1 is the **architecture and engineering foundation**. It is
architecture definition only. It is **not** software implementation, migration authoring, sprint
planning, procurement, infrastructure provisioning, delivery sequencing, staffing, cost planning,
or the master development plan.

## V4-00.2 Inheritance baseline

This section is normative.

Volume 4 inherits, without reopening:

- the frozen Volume 0 governance foundation;
- the corrected Volume 1 v1.0.1 qualification baseline (tag `central-registration-volume-1-v1.0.1`);
- the corrected Volume 2 v1.0.1 product-and-service definition (tag `central-registration-volume-2-v1.0.1`);
- the corrected Volume 3 v1.0.1 business operating model (tag `central-registration-volume-3-v1.0.1`, including the V3-F release-provenance amendment).

Volume 4 authoring proceeds from the corrected Volume 3 v1.0.1 baseline. Where a Volume 4
architecture element depends on an inherited requirement, decision, operating constraint, or
authority boundary, it references the inherited identifier rather than restating or altering it.

## V4-00.3 Architecture authority

This section is normative.

Volume 4 holds **architecture-definition authority** only. It describes what must be built and the
constraints under which it must be built. It does not authorize construction. Authority to
implement, procure, provision infrastructure, sequence delivery, staff, or commit cost is reserved
to downstream governed gates and to the executive acceptance authority at a later
material-commitment gate. Every Volume 4 requirement, architecture element, decision, and fitness
function carries `authorizes_implementation: false`, enforced fail-closed by the Volume 4 controls.

## V4-00.4 Decision classification

This section is normative.

Volume 4 uses the inherited decision-class vocabulary. Architecture decisions in this package are
recorded as design-authority decisions (class D1 or D2) accepted by the Accountable Program
Authority. No Volume 4 decision constitutes executive organizational acceptance (class D0), which
remains pending at a later material-commitment gate.

## V4-00.5 Target-versus-implemented distinction

This section is normative.

Every architectural statement in Volume 4 describes a **target** posture. No Volume 4 document may
claim that any architecture is implemented, deployed, provisioned, or validated in production. The
architecture-status vocabulary (`TARGET_DEFINED`, `TARGET_CONSTRAINED`, `TARGET_ASSUMED`,
`TARGET_DEFERRED`) and the verification-status vocabulary (`SPECIFIED`,
`FITNESS_FUNCTION_DEFINED`, `VALIDATION_PENDING`, `IMPLEMENTATION_PENDING`) keep this distinction
explicit and machine-checkable.

## V4-00.6 Amendment, supersession, and evidence standards

This section is normative.

Volume 4 uses the inherited amendment and supersession discipline: ratified artifacts are not
edited in place after freeze; corrections are made through recorded superseding approvals and, for
release metadata, through narrow provenance amendments. Evidence labels are self-attested or
author-verified in Package 1; no independent security, privacy, operational, stakeholder, vendor,
or executive validation is claimed or fabricated. Independent assessment and executive acceptance
occur at later, explicitly named gates.

## V4-00.7 Registers and controls

This section is normative.

Volume 4 is governed by the register set REG-400 (corpus index), REG-401 (architecture elements:
ARCH, MOD, SVC, DATA, API, EVT, CTRL, NFR, DEP), REG-402 (architecture decisions: ADR), REG-403
(fitness functions: FIT), REG-404 (assumptions, risks, and exceptions: ASM, RISK, EXC), and
REG-405 (approvals). Non-authoritative controls (`governance:check:v4`, `governance:report:v4`,
`governance:trace:v4`, `governance:closure:v4`) validate structural, schema, reference, and
authorization integrity and emit projections. The Markdown chapters, YAML registers, JSON schemas,
and control scripts are the authoritative record.
