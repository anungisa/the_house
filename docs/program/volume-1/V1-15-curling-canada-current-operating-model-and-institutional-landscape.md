# V1-15 - Curling Canada Current Operating Model and Institutional Landscape

Document ID: V1-15  
Title: Curling Canada Current Operating Model and Institutional Landscape  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 4 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-D, REG-108 APP-V1-025)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G4)  
Supersedes: None  
Review Cycle: Frozen at Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-15.1 Purpose and the truth-classification discipline

This section is normative.

This chapter qualifies Curling Canada's **current** operating model and institutional
landscape: who does what, where authority resides, and which manual controls and
systems support day-to-day operations. It is the first of the Package 4 chapters,
whose central question is: *what is Curling Canada's actual current operating model,
which systems and manual controls support it, where does authority reside, and what
constraints must the target platform respect or replace?*

Package 4 does not generate facts from absence. Every current-state statement carries
one of nine **truth classifications**, and the classification governs how much weight
the statement may bear:

- **POLICY_TRUTH** - established by ratified policy (e.g. Volume 0 doctrine);
- **OPERATIONAL_TRUTH** - how the organization actually operates today;
- **IMPLEMENTATION_TRUTH** - demonstrated behaviour of a built system;
- **CONTRACTUAL_TRUTH** - established by a contract or commercial term;
- **VENDOR_CLAIM** - asserted by a vendor, not independently confirmed;
- **OBSERVED_EVIDENCE** - directly observed artifact;
- **STAKEHOLDER_STATEMENT** - asserted by a stakeholder, pending validation;
- **ASSUMPTION** - a working assumption, explicitly unverified;
- **UNRESOLVED_CONTRADICTION** - two sources conflict and are not yet reconciled.

Where a statement is grounded in ratified Volume 0 material it is POLICY_TRUTH; where
it describes current practice not yet validated by clubs, Member Associations, or
Curling Canada staff it is STAKEHOLDER_STATEMENT pending validation. **Formal policy
is distinguished from actual practice throughout.** Current practice is never treated
as automatically desirable.

## V1-15.2 The institutional tiers and where authority resides

This section is normative.

The Canadian curling ecosystem operates across four authority tiers (REG-101 SRC-016,
SRC-017, SRC-021; generated authority-matrix.json):

1. **National - Curling Canada (AUTH-NATIONAL).** Holds national policy, national
   program standards, the national fee framework, executive acceptance authority, and
   - under the target platform - the system-of-record intent for club, affiliation,
   and participant master data. It does not hold provincial/territorial internal
   governance or club internal operations. *POLICY_TRUTH (Volume 0 V0-06).*
2. **Provincial/Territorial - Member Associations / PTSOs (AUTH-PROVINCIAL).** Hold
   jurisdiction over their member clubs, provincial requirements and fees, and
   provincial review of club affiliation. They do not hold national master-data
   authority and cannot override national governed decisions. *POLICY_TRUTH.*
3. **Club - curling centres (AUTH-CLUB).** Hold club-level operations, local
   membership administration, submission of affiliation and renewal, and local
   facility and roster reality. They hold no provincial or national policy authority.
   *POLICY_TRUTH.*
4. **Individual (AUTH-INDIVIDUAL).** People hold several concurrent roles (member,
   volunteer, coach, official, administrator) across clubs and PTSOs. Role
   multiplicity must not collapse into a single coarse permission bucket.
   *OPERATIONAL_TRUTH pending validation.*

These tiers are the authority spine the target platform must respect. Provincial
jurisdiction and the individual's concurrent roles are recurring constraints
(REG-104 FND-039, FND-040).

## V1-15.3 Formal policy versus actual operating practice

This section is normative.

A defining feature of the current operating model is the gap between formal policy and
actual practice. In principle, affiliation is a governed decision reserved to the
correct authority tier. In practice (REG-101 SRC-020, STAKEHOLDER_STATEMENT pending
validation):

- reviewer assignment is ad hoc, without jurisdiction-aware routing;
- decisions and evidence are exchanged over email and stored in shared files and
  spreadsheets, outside any governed store;
- reconciliation across systems is manual;
- a population of clubs is already recognized through historical or goodwill
  affiliation and continuity, and does not pass through a full new-applicant flow.

This chapter records the gap; it does not endorse the practice. The manual, email- and
spreadsheet-mediated reality is a current-state **weakness** (REG-104 FND-034) that the
target must replace, not reproduce.

## V1-15.4 Departments, roles, and named accountabilities

This section is normative.

The current model depends on named human accountabilities that the qualification must
respect when it later reaches stakeholder validation (REG-101 SRC-019,
STAKEHOLDER_STATEMENT pending validation):

- **Finance (Helene)** - fee economics, payment reconciliation, accounting truth;
  relevant to the payment and reconciliation constraints (REG-104 FND-035).
- **Compliance/policy (Jen)** - education, certification, and accreditation status;
  relevant to the compliance-projection constraint (REG-104 FND-041).
- **Program leadership (Rich, Nolan)** - pilot cohort and executive acceptance.
- **Accountable Program Authority (Aubert Nungisa)** - owns this qualification.

Stakeholder validation is pending and blocks only the affected claim, not the package.
No stakeholder statement in this chapter is represented as an approval.

## V1-15.5 What this chapter establishes for the target

This section is normative.

The target platform must:

- respect the four authority tiers and their boundaries (do not centralize provincial
  jurisdiction; do not flatten individual role multiplicity);
- replace email/spreadsheet-mediated governance with governed, evidence-bound
  transitions;
- treat the historical/goodwill affiliation population under a governed continuity
  policy rather than forcing every existing club to behave as a new applicant.

These become target constraints in V1-20. This chapter authorizes no implementation.
