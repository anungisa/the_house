# V2-03 - House and Button Product Boundary

Document ID: V2-03  
Title: House and Button Product Boundary  
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

## V2-03.1 Boundary principle

This section is normative.

The House is the **authoritative governed platform and system of record**. The Button is
a **guided client-facing experience** over it. The boundary is binding: The Button
requests actions; The House adjudicates and owns the resulting governed state. The
Button never independently owns, adjudicates, or mutates governed lifecycle state.
This principle is recorded as DEC-V2-002.

## V2-03.2 What The House owns

This section is normative.

The House exclusively owns:

- affiliation lifecycle state and all governed transitions (executed only through the
  Governance Kernel);
- authorization and reviewer authority;
- decision records, rationale, and evidence;
- append-only audit and transition history;
- tenant isolation and governed data authority; and
- the transactional outbox and any external side effects arising from governed
  transitions.

## V2-03.3 What The Button provides

This section is normative.

The Button provides:

- guided submission of affiliation applications;
- presentation of current status and required actions;
- communication of status changes to affected parties; and
- collection of applicant input for transmission to The House.

The Button holds no authoritative state. Any state it displays is a projection of the
authoritative House record. Any action it initiates is a **request** that The House
validates and governs.

## V2-03.4 Boundary rules

This section is normative.

The boundary is enforced by these rules:

1. Governed lifecycle transitions occur only in The House through the kernel
   (NFR-V2-001).
2. A Button-primary stakeholder may not hold governed authority (enforced by the
   governance control; see REG-202 and the structural check).
3. The Button submits requests; it does not write governed state.
4. Every state change surfaced to The Button originates from a governed House
   transition with audit and, where required, evidence (OUT-V2-005, NFR-V2-002).
5. External systems (STK-V2-008) reconcile into The House record and never become the
   system of record (OUT-V2-007, CAP-V2-005).

## V2-03.5 Consequence for requirements

This section is normative.

Every requirement in REG-203 is tagged with its product (House, Button, Both, or
Neither). Requirements that govern lifecycle state are House and are marked
`governed_by_kernel`. Button requirements are experience requirements that depend on
House authority and never assert governed ownership. This tagging is the mechanism by
which the boundary is kept verifiable.
