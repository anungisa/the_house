# V1-07 - Base44 Capability Qualification

Document ID: V1-07  
Title: Base44 Capability Qualification  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 2 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable gate (see V1-B, REG-108 APP-V1-010)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G2)  
Supersedes: None  
Review Cycle: Frozen at Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-07.1 Purpose

This section is normative.

This chapter normalizes the Base44 corpus into a fixed set of capabilities, one
per real capability rather than one per screen, and records a proposed disposition
for each. Dispositions here are program decisions about how a capability should be
treated; per the Volume 1 operating rule and Gate V1-G1, no disposition in this
chapter authorizes construction. All dispositions and their authorization state
are recorded in REG-106, where every Package 2 decision sets
`authorizes_implementation: false`.

## V1-07.2 Disposition discipline

This section is normative.

No Base44 capability is dispositioned ADOPT or RETAIN. This is a deliberate,
evidence-based conclusion, not an omission:

- ADOPT (take as-is) is disqualified because the prototype's authority and
  enforcement architecture is unsafe for production (see V1-08).
- RETAIN (keep as a production-candidate foundation) applies to The House
  assessment (Package 3), not to Base44.

The dispositions used are therefore ADAPT, CONSOLIDATE, REBUILD, DEFER,
EXTERNALIZE, and RETIRE. This conclusion is itself recorded as a finding
(FND-019) and is a headline output of Package 2.

## V1-07.3 Normalized capabilities and dispositions

This section is normative. Each capability record carries name, description,
observed value, target House domain, target Button experience, disposition,
production risk, and evidence rating in REG-103. Summarized here:

| ID | Capability | Disposition | Production risk | Rating |
| --- | --- | --- | --- | --- |
| CAP-001 | Club Affiliation | ADAPT | high | E2 |
| CAP-002 | Organization Registry | ADAPT | high | E2 |
| CAP-003 | Club 360 / Club Success | DEFER | unknown | E1 |
| CAP-004 | Membership and Households | ADAPT | medium | E2 |
| CAP-005 | Participant Identity | ADAPT | medium | E2 |
| CAP-006 | Compliance and Consent | ADAPT | high | E2 |
| CAP-007 | Registration | DEFER | medium | E1 |
| CAP-008 | Payments and Fees | EXTERNALIZE | critical | E2 |
| CAP-009 | Support and Ticketing | EXTERNALIZE | low | E1 |
| CAP-010 | Knowledge and Documents | EXTERNALIZE | low | E1 |
| CAP-011 | Analytics and Reporting | DEFER | medium | E1 |
| CAP-012 | National Operations and Decision Governance | REBUILD | high | E2 |
| CAP-013 | Event Operations | DEFER | low | E1 |
| CAP-014 | Access and Authorization Model | REBUILD | critical | E3 |
| CAP-015 | Dashboards and Navigation Surfaces | CONSOLIDATE | medium | E2 |
| CAP-016 | Generic Workflow Builder | RETIRE | high | E2 |

Disposition rationale for each capability is recorded in REG-106 (QD-001..016).
The first governed vertical is CAP-001 (Club Affiliation), whose target is the
existing House `AffiliationApplication` domain governed by the Governance Kernel.

## V1-07.4 Deep assessment: the affiliation journey

This section is normative.

Because CAP-001 is the first production vertical, its end-to-end journey is
assessed step by step. For each step the assessment records what the user sees,
the state change, where enforcement occurs, whether the change is atomic, what
authority is assumed, what evidence is retained, failure paths, and the
retain/adapt/rebuild call. The evidence basis is SRC-004 (Application entity),
SRC-005 (functions), SRC-006 (access), and SRC-008 (routes/pages).

**Step 1 - Applicant submits an affiliation application.**
- Sees: an application form (new affiliation, renewal, or transfer).
- State change: an Application record is created with status `submitted`.
- Enforcement: client-side route guard only; the creating function does not check
  permission server-side (EV-003).
- Atomic: single record write; no transactional envelope around related evidence.
- Authority assumed: the client is trusted to gate who may submit.
- Evidence retained: the record itself; no immutable submission audit event.
- Failure paths: partial/invalid submissions are handled in the UI, not guarded
  server-side.
- Call: **ADAPT the concept; REBUILD the mechanism.** The submission concept is
  sound; submission must become a governed transition with server-side
  authorization and an audit event.

**Step 2 - PTSO review.**
- Sees: a review queue; approve/return actions.
- State change: status moves to `ptso_review` then `ptso_approved` (or
  `more_info_needed`).
- Enforcement: the review action mutates status directly; no transition guard and
  no reviewer-scope check server-side (only 2/99 functions check permission).
- Atomic: direct status write; no linked decision evidence in the same
  transaction.
- Authority assumed: whoever reaches the screen may act; `asServiceRole` is common
  (EV-014).
- Evidence retained: status value only; no immutable reviewer decision record.
- Failure paths: `more_info_needed` returns the application; the loop is
  modelled, which is valuable product intelligence.
- Call: **ADAPT the tiered-review concept; REBUILD as a guarded transition** with
  `ACTOR_HAS_REVIEWER_SCOPE`-style guards and evidence capture.

**Step 3 - Curling Canada review and decision.**
- Sees: a national review queue; approve/reject.
- State change: `cc_review` -> `approved` or `rejected`.
- Enforcement: same direct-mutation pattern; approval is high-consequence yet has
  no server-side authority check or evidence requirement.
- Atomic: no; decision, audit, and any downstream effect are not one transaction.
- Authority assumed: national approval authority is not enforced in code.
- Evidence retained: status only; a high-risk approval retains no immutable
  evidence object.
- Call: **ADAPT the concept; REBUILD as a high-risk governed transition** that
  requires evidence (consistent with the House affiliation risk model where
  approve/reject are evidence-required).

**Step 4 - Fees and activation.**
- Sees: a fee/payment step (Stripe) and activation of the club affiliation.
- State change: payment flags (for example, `annual_fee_paid`) and progression to
  an active state.
- Enforcement: payment readiness is a boolean flag on the Application, not a
  reconciled processor state (CON-004; FND-014).
- Atomic: no reconciliation between the flag and the external processor.
- Authority assumed: the flag is trusted as truth.
- Call: **EXTERNALIZE payment execution; ADAPT fee governance** so fee state is
  reconciled against the processor rather than asserted by a flag.

**Step 5 - Transition into Club 360 / ongoing club life.**
- Sees: a club success/health surface after affiliation.
- State change: none well-evidenced; the Club 360 substance is thin (FND-018).
- Call: **DEFER.** Insufficient evidence to qualify; revisit after the affiliation
  and registry spine exist.

**Journey conclusion.** The affiliation *journey design* is the single most
valuable product asset in the corpus and is dispositioned ADAPT. The affiliation
*mechanism* - direct status mutation, client-side authority, no per-transition
evidence, no atomic envelope - is dispositioned REBUILD and must be delivered
through the Governance Kernel. The product concept is retained; the prototype
mechanism is rejected.

## V1-07.5 Evidence and cross-references

This section is informative.

- Capabilities: REG-103 (CAP-001..016)
- Dispositions: REG-106 (QD-001..016), all `authorizes_implementation: false`
- Journey evidence: REG-102 (EV-003, EV-006, EV-007, EV-014), SRC-004/005/006/008
- Findings: REG-104 (FND-001, FND-010, FND-014, FND-018, FND-019)

No capability qualified in this chapter is declared production-authoritative, and
nothing here authorizes application development from Package 2 alone.
