# V1-16 - Current Club-Affiliation Process End to End

Document ID: V1-16  
Title: Current Club-Affiliation Process End to End  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 4 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-D, REG-108 APP-V1-026)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G4)  
Supersedes: None  
Review Cycle: Frozen at Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-16.1 Purpose and method

This section is normative.

This chapter traces the **current** club-affiliation process end to end, so the target
governed lifecycle can be designed against operating reality rather than a diagram.
The trace is structured deterministically by the `qualification:ecosystem` tooling
into `generated/ecosystem/process-inventory.json` and
`generated/ecosystem/affiliation-current-state-report.md` from the controlled input
(REG-101 SRC-019, SRC-020). Each step records its actor, accountable authority, system
used, manual artifact, data created, evidence retained, decision, handoff, service
delay, known exception, failure mode, authoritative source, and reconciliation
requirement.

Unless a step restates a ratified Volume 0 authority boundary, every step is a
**STAKEHOLDER_STATEMENT pending club/PTSO/Curling Canada validation** (REG-104 FND-034,
FND-037). Current practice is not treated as automatically desirable.

## V1-16.2 The historical and goodwill affiliation baseline

This section is normative.

Before the step trace: a population of clubs is already recognized through historical
or goodwill affiliation and continuity (REG-101 SRC-020, STAKEHOLDER_STATEMENT pending
validation). The target platform must not force every existing club to behave as a
brand-new applicant; a governed **continuity/transition** transition for existing clubs
is required, distinct from new-applicant bootstrap. This is a hard target constraint
(V1-20), not an incidental detail.

## V1-16.3 The traced steps (current state)

This section is normative.

The current process comprises twelve steps (process-inventory.json). Each is a
current-state statement pending validation:

1. **Club identification or creation** - club administrator; incumbent provider or
   manual; failure mode: duplicate or mismatched club identity.
2. **Prior affiliation and continuity review** - PTSO/Curling Canada; failure mode:
   treating a continuing club as a brand-new applicant.
3. **Seasonal requirements determination** - Curling Canada/PTSO; failure mode:
   applying the wrong season's ruleset (versioned requirements needed).
4. **Fee determination** - Curling Canada finance/PTSO; national and provincial
   components; failure mode: incorrect fee or split.
5. **Supporting evidence submission** - club administrator; email or provider uploads;
   failure mode: evidence not bound to the decision and lost in email.
6. **PTSO interaction and review** - PTSO reviewer; failure mode: no assigned
   reviewer, ad hoc assignment (no jurisdiction routing).
7. **Curling Canada review** - CC reviewer; failure mode: coarse role authority; any
   reviewer can act on any file (aligns with House FND-024).
8. **Corrections and follow-up** - over email; failure mode: no governed
   return-for-information/resubmission loop.
9. **Payment and reconciliation** - finance (Helene); processor and ledger; failure
   mode: reconciliation gaps between processor and ledger.
10. **Approval** - Curling Canada authority; failure mode: approval not atomically tied
    to fee/evidence state.
11. **Club status and downstream recognition** - CC/PTSO/downstream; failure mode:
    inconsistent status across systems.
12. **Ongoing compliance** - compliance (Jen); Sideline/accreditation projections;
    failure mode: compliance flags not enforced at governed transitions.

## V1-16.4 Cross-cutting failure modes

This section is normative.

Across the twelve steps the trace surfaces four recurring failure modes, each an
input to a target constraint (REG-104):

- **Ungoverned evidence and decisions** (steps 5, 8; FND-034, CON-013) - decisions and
  evidence live in email and spreadsheets, unbound to a governed transition.
- **No jurisdiction-aware routing** (steps 6, 7; FND-037) - reviewer assignment is ad
  hoc; converges with House implementation finding FND-024.
- **Manual reconciliation** (step 9; FND-035) - processor-versus-ledger reconciliation
  is manual.
- **Non-atomic approval** (step 10) - approval is not atomically bound to fee and
  evidence state.

## V1-16.5 What this chapter establishes for the target

This section is normative.

The target governed affiliation lifecycle must:

- bind evidence and decisions to governed transitions (retire email/spreadsheet
  governance);
- support a governed return-for-information and resubmission loop;
- route review by PTSO/Curling Canada jurisdiction;
- make approval atomic with fee and evidence state;
- provide a governed continuity transition for historically affiliated clubs.

These are recorded as constraints in V1-20. This chapter authorizes no implementation.
