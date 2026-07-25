# V2-05 - Requirements and Acceptance Architecture

Document ID: V2-05  
Title: Requirements and Acceptance Architecture  
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

## V2-05.1 Purpose

This section is normative.

This chapter defines the requirements and acceptance architecture for the affiliation
service: the traceability spine that connects stakeholder outcomes to acceptance
criteria. It establishes the identifier chain, the tracing rules, and the acceptance
model, and it seeds a representative, end-to-end traced set for the affiliation service
in REG-203. It does not exhaustively enumerate every requirement, and it authorizes no
implementation.

## V2-05.2 Requirement identifier chain

This section is normative.

Every requirement is placed on a single ordered chain. A child requirement traces to
one or more parents that precede it on the chain:

`OUT -> CAP -> BR -> FR -> NFR -> UC -> RULE -> WF -> UX -> DATA -> API -> EVT -> CTRL -> TEST`

| Level | Meaning |
| --- | --- |
| OUT | Stakeholder outcome (REG-201) |
| CAP | Capability |
| BR | Business rule/requirement |
| FR | Functional requirement |
| NFR | Non-functional requirement |
| UC | Use case |
| RULE | Guard-level business rule |
| WF | Workflow |
| UX | Experience surface |
| DATA | Data concept |
| API | Interface concept |
| EVT | Domain event |
| CTRL | Governance control |
| TEST | Acceptance criterion |

Outcomes (OUT) live in REG-201; the remaining levels live in REG-203. Chain order is
enforced by the cross-reference control: a requirement may only trace to a level that
precedes its own.

## V2-05.3 Traceability rules

This section is normative.

1. Every REG-203 requirement declares its `level` and traces to at least one preceding
   parent (`traces_to`).
2. Traceability may reference inherited Volume 1 artifacts where the parent originates
   upstream; such references are resolved by inheritance.
3. Every requirement declares `authorizes_implementation: false`; the structural control
   fails closed if any requirement asserts implementation authorization.
4. Governed requirements declare `governed_by_kernel: true`, tying them to the House
   authority boundary (V2-03).
5. Acceptance is expressed at the TEST level; requirements that carry acceptance link to
   TEST records via `acceptance_ref`.

## V2-05.4 Acceptance architecture

This section is normative.

Acceptance criteria are recorded as TEST-level requirements (REG-203) that state the
observable condition under which a requirement is satisfied. For the affiliation service
the seeded acceptance criteria are:

- TEST-V2-001 - a complete submission creates a submitted application through the kernel
  with audit;
- TEST-V2-002 - a reviewer without scope cannot record a decision (denied, no mutation);
  and
- TEST-V2-003 - approval activates the affiliation with evidence and audit, only through
  governed transitions.

These acceptance criteria are definitions. They are not automated tests and authorize no
test implementation; they specify what a future, separately authorized implementation
must satisfy.

## V2-05.5 Representative traced example

This section is normative.

The following end-to-end trace demonstrates the architecture for the submit path:

`OUT-V2-001 -> CAP-V2-002 -> BR-V2-001 -> FR-V2-001 -> NFR-V2-003 -> UC-V2-001 ->
RULE-V2-001 -> WF-V2-001 -> UX-V2-001 -> DATA-V2-001 -> API-V2-001 -> EVT-V2-001 ->
CTRL-V2-001 -> TEST-V2-001`

Additional traces for the review, decision, and activation paths are recorded in
REG-203. The seeded set is representative and sufficient to demonstrate the architecture
end to end; later packages extend it.

## V2-05.6 Authorization posture

This section is normative.

This architecture defines requirements and acceptance. It authorizes no construction,
no test implementation, and no procurement. Implementation authorization is reserved to
a later, separately gated decision with executive acceptance.
