# V4-11 - Organization, Jurisdiction, Season, and Affiliation Domain Model

Document ID: V4-11  
Title: Organization, Jurisdiction, Season, and Affiliation Domain Model  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 2 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-016)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-11.1 Purpose and scope

This section is normative.

This chapter defines the conceptual domain model for the affiliation lifecycle: the organization,
jurisdiction, season, and affiliation concepts, their owning modules, their invariants, and their
governed authority. It is a conceptual model. It does not design database tables, physical schemas,
or object-storage layouts, and it does not author executable contracts.

## V4-11.2 Domain concept description form

This section is normative.

Each domain concept is described against a controlled form:

```
Concept
Owning module
Identity
Lifecycle
Invariants
Authority
Permitted commands
Observable outcomes
Dependencies
Correction rules
Audit expectations
Validation status
```

Every concept in this chapter carries validation status TARGET_DEFINED or TARGET_CONSTRAINED; no
concept is claimed to be implemented, and none authorizes implementation.

## V4-11.3 Core domain concepts

This section is normative.

The affiliation domain comprises the following concepts, each owned by a named target module (see
V4-03 and REG-401):

- **Organization** - a recognized entity that may hold affiliation; owned by the Organization module.
- **Club recognition** - the governed act and standing by which an organization is recognized within
  a jurisdiction; owned by the Organization module.
- **Organization identity match** - the governed determination that an applying party corresponds to
  a known organization; a distinct effect from activation.
- **Organization continuity** - the governed linkage of an organization's historical standing across
  seasons; owned by the Organization module.
- **Representative authority** - the resource-specific authority of a person to act for an
  organization; owned by the Identity and Authorization contexts.
- **Jurisdiction** - the explicit governed scope (for example provincial or territorial) within which
  recognition, requirements, and decisions apply.
- **Affiliation season** - the governed time-bounded cycle to which an affiliation belongs.
- **Affiliation case** - the governed unit of work for one organization's affiliation in one season;
  owned by the Affiliation module.
- **Pathway** - the governed classification that determines applicable requirements for a case.
- **Historical standing** - the recorded prior affiliation history of an organization.
- **Affiliation status** - the authoritative lifecycle state of an affiliation case (see V4-13).
- **Expiry and closure** - the governed end-of-life outcomes of an affiliation case.

## V4-11.4 Concept ownership and identity

This section is normative.

Every concept has exactly one owning module that guarantees its invariants. Identity of each concept
is governed and stable: an organization, a season, and an affiliation case each have a durable
identity independent of any transport or projection. Cross-concept references use governed identity,
not transport or presentation identifiers.

## V4-11.5 Governed invariants

This section is normative.

The domain model holds the following invariants:

- an affiliation case belongs to exactly one recognized organization and exactly one affiliation
  season;
- jurisdiction is explicit and governed for every case; it is never inferred silently;
- representative authority is resource-specific: authority over one organization does not confer
  authority over another;
- pathway determination is governed and auditable, not an incidental side effect;
- historical continuity does not silently create a current-season affiliation; a new season requires
  a governed new case;
- organization identity match and affiliation activation are distinct governed effects and are never
  conflated;
- administrative correction adjusts recorded information under governed authority but does not erase
  governed history.

## V4-11.6 Authority, commands, and observable outcomes

This section is normative.

For each concept the model records its governed authority (which domain owns state change), its
permitted commands (the governed operations that may change it), and its observable outcomes (the
audit and projection effects that make its state visible). Commands are realized through application
services (see V4-14); no concept changes state except through a governed command subject to
authorization and invariant checks.

## V4-11.7 Correction rules and audit expectations

This section is normative.

Each concept defines correction rules: what may be corrected, by whom, and with what audit effect.
Correction is a governed, audited act that preserves prior history; it is distinct from a lifecycle
transition and never rewrites the historical record. Every concept declares its audit expectations,
so that governed changes and corrections are observable and attributable.

## V4-11.8 Dependencies and validation status

This section is normative.

Each concept declares its dependencies on other concepts and on inherited Volume 0 to 3 definitions.
The final validation of domain boundaries - whether the module boundaries drawn here survive detailed
design - is an open assumption owned for resolution at a future gate (see REG-404). No concept in
this chapter is asserted to be implemented.
