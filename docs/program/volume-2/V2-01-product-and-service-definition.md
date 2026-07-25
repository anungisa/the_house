# V2-01 - Product and Service Definition

Document ID: V2-01  
Title: Product and Service Definition  
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

## V2-01.1 Product statement

This section is normative.

The House v2 is the **governed system-of-record platform** for Canadian National Sport
Organization operations. Its first defined product surface is the **affiliation
service**: the governed lifecycle by which a club becomes and remains affiliated for a
season. The affiliation service is delivered through two complementary products:

- **The House** - the authoritative governed platform that owns affiliation lifecycle
  state, authority, evidence, decisions, and audit; and
- **The Button** - the guided client-facing experience through which clubs and
  administrators submit applications, view status, and act on required actions.

The House is the system of record. The Button is an experience layer over it. The
Button never independently owns governed lifecycle state.

## V2-01.2 Service definition

This section is normative.

The affiliation service is defined as the end-to-end governed journey from a club's
intent to affiliate through to an active affiliation for a season, and onward through
the governed lifecycle (suspension, reinstatement, revocation, closure) as required.
For Package 1 the defining scope is the **submit -> review -> decide -> activate** path,
consistent with the qualified first-release boundary inherited from V1-24.

The service is a governed service: every state change is executed through the
Governance Kernel, is tenant-isolated, and produces audit and, where required,
evidence. Domain paths may request transitions but never mutate governed state
directly.

## V2-01.3 Value and outcomes

This section is normative.

The product exists to produce the outcomes recorded in REG-201, summarized as:

- clubs complete affiliation through a guided experience without ambiguity
  (OUT-V2-001);
- the NSO holds a single authoritative, audited affiliation record (OUT-V2-002);
- reviewers make consistent, evidence-backed decisions (OUT-V2-003);
- member organizations gain visibility across their clubs (OUT-V2-004);
- every state change is attributable, governed, and evidenced (OUT-V2-005);
- affected parties receive clear status and required-action communication
  (OUT-V2-006); and
- external systems reconcile without becoming the system of record (OUT-V2-007).

## V2-01.4 Product surfaces and non-goals

This section is normative.

In scope for Package 1: the affiliation product definition, its service blueprint, its
stakeholders/personas/outcomes, the House/Button boundary, and the requirements and
acceptance architecture.

Non-goals for Package 1: implementation of any surface; database, API, or UI
construction; procurement; a master development plan; and any product beyond the
affiliation service. Additional products and lifecycle branches are deferred to later
packages and volumes.

## V2-01.5 Authorization posture

This section is normative.

This chapter defines the product. It authorizes no construction. Implementation and
procurement remain unauthorized, and executive organizational acceptance remains
pending at a later material-commitment gate (DEC-V2-001, DEC-V2-004).
