# V1-19 - Commercial, Contractual, Transition, and Sustainability Constraints

Document ID: V1-19  
Title: Commercial, Contractual, Transition, and Sustainability Constraints  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 4 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-D, REG-108 APP-V1-029)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G4)  
Supersedes: None  
Review Cycle: Frozen at Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-19.1 Purpose and evidentiary caution

This section is normative.

This chapter captures the commercial, contractual, transition, and sustainability
constraints the target platform must respect. It is structured into
`generated/ecosystem/contract-constraint-inventory.json` from the controlled input
(REG-101 SRC-019) and the ratified Volume 0 migration risk (SRC-018, Volume 0
REG-003).

These constraints are the least directly evidenced material in Package 4. Commercial
terms are **CONTRACTUAL_TRUTH pending vendor validation**; economics are ASSUMPTION or
VENDOR_CLAIM pending financial validation. **Hélène's financial validation is relevant
when the material is review-ready; its absence blocks only the affected claim, not the
package.** No commercial figure is asserted as confirmed.

## V1-19.2 Contractual and transition constraints

This section is normative.

Seven constraints are registered (contract-constraint-inventory.json; REG-104 FND-036):

- **CST-REGPROVIDER (incumbent registration provider)** - data-export rights,
  termination/transition conditions, and renewal windows govern the migration
  timeline; migration off the incumbent is a recorded Volume 0 program risk
  (REG-003). *CONTRACTUAL_TRUTH pending vendor validation.*
- **CST-PAYMENTS (payment economics)** - per-transaction processor economics and
  settlement timing affect fee policy and sustainability. *CONTRACTUAL_TRUTH pending
  Hélène's financial validation.*
- **CST-AZURE (infrastructure cost drivers)** - Azure/infrastructure operating and
  implementation costs are sustainability drivers to be modeled. *ASSUMPTION pending
  validation.*
- **CST-BILINGUAL (bilingual and accessibility)** - bilingual (EN/FR) and
  accessibility obligations are mandatory for a national Canadian NSO and constrain
  every stakeholder-facing surface. *POLICY_TRUTH pending validation.*
- **CST-PRIVACY (privacy and security)** - Canadian privacy obligations govern
  personal data; security and data-residency requirements constrain hosting and
  integration. *POLICY_TRUTH pending validation.*
- **CST-PILOT (pilot and rollout)** - a named pilot PTSO/club cohort is a Volume 0
  condition; national rollout depends on pilot acceptance and migration readiness.
  *POLICY_TRUTH pending validation.*
- **CST-VENDORAPI (external API availability)** - Curling I/O, Sideline, accreditation,
  accounting, and payment APIs must provide the flows the target depends on.
  *VENDOR_CLAIM pending vendor validation.*

## V1-19.3 Sustainability and the migration constraint

This section is normative.

Two constraints dominate sustainability. First, **migration off the incumbent
registration provider** (CST-REGPROVIDER, REG-104 FND-036) is a high-risk data
transition governed by data-export rights and a recorded cutover trigger; the
incumbent is authoritative only during transition and must not silently persist or
lapse. Second, **operating economics** (CST-PAYMENTS, CST-AZURE) determine whether the
target is financially sustainable for Curling Canada; these require Hélène's financial
validation before any figure is treated as confirmed.

## V1-19.4 Unresolved constraints

This section is normative.

Package 4 explicitly records that the following remain **unresolved pending
validation** and must not be treated as settled:

- exact incumbent-provider data-export and termination terms;
- per-transaction payment economics and settlement timing;
- Azure/infrastructure cost envelope;
- external API availability and rate limits.

Recording a constraint as unresolved satisfies Gate V1-G4's requirement that
contractual/transition constraints be captured **or explicitly unresolved**. Nothing
here is fabricated to fill a gap.

## V1-19.5 What this chapter establishes for the target

This section is normative.

The target platform must:

- treat the incumbent migration as a governed, risk-bearing data transition;
- respect bilingual/accessibility and Canadian privacy/security obligations as
  mandatory constraints on every surface;
- model operating economics for sustainability, pending Hélène's validation;
- confirm external API availability before depending on it.

These become constraints in V1-20. Migration approach is deferred to convergence
(REG-106 QD-035). This chapter authorizes no implementation.
