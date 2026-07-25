# V1-09 - Base44-to-Target Experience Translation

Document ID: V1-09  
Title: Base44-to-Target Experience Translation  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 2 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable gate (see V1-B, REG-108 APP-V1-012)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G2)  
Supersedes: None  
Review Cycle: Frozen at Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-09.1 Purpose

This section is normative.

This chapter translates qualified Base44 capabilities into their target shape
under the House architecture: which governed capabilities belong in The House
(system-of-record), which belong in The Button (experience layer), and which are
externalized. It is a translation of intent, not a design or a build authorization.
No content in this chapter authorizes construction.

## V1-09.2 Separation of authority and experience

This section is normative.

The House owns governed lifecycle, authority, tenancy, audit, evidence, consent,
and durable system-of-record data. The Button and other experience layers request
actions and render state; they never own governed lifecycle rules. Base44 blends
these concerns (client-side authority, UI-driven mutation); the translation
below deliberately re-separates them.

## V1-09.3 Capability translation map

This section is normative.

| Capability | Disposition | Target House domain | Target Button experience |
| --- | --- | --- | --- |
| CAP-001 Club Affiliation | ADAPT | AffiliationApplication (Governance Kernel) | Applicant + reviewer workspaces |
| CAP-002 Organization Registry | ADAPT | Organization / tenancy registry | Org administration surfaces |
| CAP-003 Club 360 | DEFER | Deferred | Club 360 workspace (candidate) |
| CAP-004 Membership and Households | ADAPT | Membership (post-affiliation) | Membership surfaces |
| CAP-005 Participant Identity | ADAPT | Participant identity | Profile surfaces |
| CAP-006 Compliance and Consent | ADAPT | Compliance and consent (governed evidence) | Consent/compliance surfaces |
| CAP-007 Registration | DEFER | Deferred | Registration surfaces |
| CAP-008 Payments and Fees | EXTERNALIZE | Fee governance (House) | Payment surfaces (external rails) |
| CAP-009 Support and Ticketing | EXTERNALIZE | Not House-owned | Support entry points |
| CAP-010 Knowledge and Documents | EXTERNALIZE | Not House-owned | Knowledge entry points |
| CAP-011 Analytics and Reporting | DEFER | Deferred (governed reporting) | Analytics surfaces |
| CAP-012 National Ops and Decision Governance | REBUILD | Governance Kernel | Governance admin workspaces |
| CAP-013 Event Operations | DEFER | Deferred | Event surfaces |
| CAP-014 Access and Authorization Model | REBUILD | Kernel authorization + Postgres RLS | N/A (belongs in House) |
| CAP-015 Dashboards and Navigation | CONSOLIDATE | N/A (experience) | Consolidated role workspaces |
| CAP-016 Generic Workflow Builder | RETIRE | None (prohibited pattern) | None |

## V1-09.4 Affiliation translation (first vertical)

This section is normative.

The affiliation journey (V1-07.4) translates as follows:

- Each Base44 status mutation becomes a **governed transition** through the
  Governance Kernel: `submit`, `review_start`, `approve`, `reject`, `activate`,
  and the more-information loop, with fail-closed authorization.
- High-consequence transitions (`approve`, `reject`) become **evidence-required**
  transitions, consistent with the House affiliation risk model.
- Reviewer authority (PTSO, CC) becomes a **guard** (reviewer-scope) rather than a
  reachable-screen assumption.
- Fee readiness becomes **reconciled fee state**, with payment execution
  externalized.
- Client-side RoleGate is replaced by **server-enforced authorization plus
  Postgres RLS**.

This translation restates intent; it does not design the schema, write guards, or
authorize any implementation. The first governed vertical remains
`AffiliationApplication`, to be authorized only through later volumes and gates.

## V1-09.5 What does not translate

This section is normative.

- The generic workflow builder (CAP-016) does not translate; it is RETIRE.
- Direct status mutation does not translate; it is replaced by governed
  transitions.
- Client-side, default-open authorization does not translate; it is replaced by
  fail-closed server enforcement.
- App-layer `rls` blocks do not translate as an isolation guarantee; tenancy is
  rebuilt on Postgres row-level security.

## V1-09.6 Evidence and cross-references

This section is informative.

- Capabilities and dispositions: REG-103, REG-106
- Affiliation journey: V1-07.4; REG-104 (FND-001, FND-010, FND-014)
- Authority separation: AGENTS.md, Program Constitution (SRC-003)

Nothing in this chapter authorizes construction. Implementation authorization
requires executive acceptance and a naming authorizing gate in a later volume.
