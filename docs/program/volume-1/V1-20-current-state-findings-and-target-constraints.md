# V1-20 - Current-State Findings and Target Constraints

Document ID: V1-20  
Title: Current-State Findings and Target Constraints  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 4 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-D, REG-108 APP-V1-030)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G4)  
Supersedes: None  
Review Cycle: Frozen at Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-20.1 Purpose

This section is normative.

This chapter consolidates the current-state findings from V1-15 through V1-19 and
converts each into a **target constraint** - something the target platform must
respect or replace. It is the third factual input to convergence, alongside the Base44
product intelligence (Package 2) and The House implementation truth (Package 3).
**Convergence itself is reserved for Package 5**; this chapter constrains it, it does
not perform it. Nothing here authorizes implementation.

Findings and contradictions are structured into
`generated/ecosystem/operating-risk-inventory.json` (REG-104 FND-034..041; REG-105
CON-012, CON-013).

## V1-20.2 Critical operating findings and the constraints they impose

This section is normative.

Seven operating findings, each linked to evidence, impose the following constraints:

1. **Ungoverned, manual affiliation process** (FND-034, high) → the target must bind
   evidence and decisions to governed transitions and must not recreate
   email/spreadsheet governance.
2. **Manual payment/fee reconciliation** (FND-035, high) → the target must implement
   explicit, automated processor-versus-ledger reconciliation (SYS-003/SYS-008), with
   the charge decision and fee policy retained in The House.
3. **Incumbent-provider migration risk** (FND-036, high) → the target must treat the
   migration as a governed, risk-bearing transition gated by a recorded cutover.
4. **No jurisdiction-aware reviewer routing** (FND-037, high) → the target must route
   review by PTSO/Curling Canada jurisdiction (converges with House FND-024).
5. **Authoritative data duplication** (FND-038, high; CON-012) → the target must
   establish a single master-data authority (Curling Canada) and retire duplicates.
6. **External authority must be preserved, not absorbed** (FND-039, medium) → the
   target must respect each external system's bounded authority.
7. **Identity role multiplicity** (FND-040, medium) → the target identity model must
   represent concurrent, jurisdiction-scoped roles without flattening.

An eighth finding, **compliance-projection gating gap** (FND-041, medium), requires the
target to project external compliance status and gate governed transitions on it.

## V1-20.3 Historical-affiliation and continuity constraint

This section is normative.

Because a population of clubs is already recognized through historical/goodwill
affiliation (V1-16; REG-101 SRC-020), the target must provide a governed
**continuity/transition** transition for existing clubs, distinct from new-applicant
bootstrap. Forcing every existing club through a new-applicant flow is an explicit
non-goal.

## V1-20.4 Registered contradictions carried into convergence

This section is normative.

Two current-state contradictions are registered and carried forward unresolved
(REG-105):

- **CON-012 (master-data authority)** - Curling Canada is the intended authority
  (POLICY_TRUTH); the incumbent provider holds it operationally today
  (STAKEHOLDER_STATEMENT). Reconciled in principle by transition policy; full
  resolution depends on migration and validation.
- **CON-013 (evidence binding)** - decisions must be governed and evidence-bound
  (POLICY_TRUTH); in practice they live in email/spreadsheets (STAKEHOLDER_STATEMENT).
  The target must wire governed evidence binding.

These contradictions are inputs to convergence, not defects to resolve inside Package 4.

## V1-20.5 The constraint set handed to Package 5

This section is normative.

The target platform, when designed in convergence (Package 5), must respect this
constraint set:

- governed, evidence-bound affiliation transitions with return-for-information and
  atomic approval;
- jurisdiction-aware reviewer routing (national/provincial);
- single master-data authority with retired duplicates;
- preserved external-system authority and explicit reconciliation boundaries;
- concurrent, jurisdiction-scoped identity roles;
- compliance projections that gate governed transitions;
- a governed continuity transition for historically affiliated clubs;
- a governed, risk-bearing incumbent migration;
- bilingual/accessibility and Canadian privacy/security obligations;
- a financially sustainable operating model (pending Hélène's validation).

Every constraint is grounded in a registered finding or ratified Volume 0 material. No
vendor or system is retained or retired here; no implementation is authorized. Package
4's role is to constrain convergence with operating reality, not to design the target.
