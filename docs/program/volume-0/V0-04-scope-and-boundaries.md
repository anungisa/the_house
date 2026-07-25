# V0-04 - Scope and Boundaries

Document ID: V0-04
Status: RATIFIED
Version: 1.0.0
Ratification: Package 1 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable gate (see V0-E, REG-006 APP-005)
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: G0

This chapter is normative except where a subsection is marked explanatory.

## Purpose

Prevent uncontrolled expansion by separating what the program may eventually do
from what the first release will actually deliver, and by defining the first
production flow as a complete business outcome.

## 4.1 Scope layering

This subsection is normative.

Scope MUST be expressed in explicitly separated layers. A capability appearing in
a broader layer does NOT authorize its implementation in a narrower layer.

1. Total program horizon
2. Minimum national operating capability (MNOC)
3. Club-affiliation vertical
4. Pilot scope
5. First production release
6. Later delivery waves
7. External execution systems

### 4.1.1 Total program horizon

The eventual program horizon MAY include:

- organizational registry
- club affiliation
- participant identity
- household and guardian relationships
- membership
- central registration capabilities
- evidence and documents
- compliance status
- fees and payments
- governed workflows
- club self-service
- PTSO workspaces
- Curling Canada administration
- support and knowledge
- analytics and operational visibility
- governed integrations

The horizon is a direction of travel. It MUST NOT be read as authorization to
build these capabilities in parallel (see PR-020).

### 4.1.2 Minimum national operating capability (MNOC)

The MNOC is the smallest capability set that lets Curling Canada and PTSOs operate
a governed national function in production. For the first release, the MNOC is the
complete club-affiliation outcome defined in 4.5, including authoritative
organization activation.

### 4.1.3 Club-affiliation vertical

The affiliation vertical is the first complete production capability. Its full
definition is in 4.5. It MUST be delivered end-to-end before broad horizontal
expansion.

### 4.1.4 Pilot scope

The pilot delivers the affiliation vertical to a limited, representative cohort
(see V0-08). Pilot cohort size and composition are TBD and MUST be defined in the
research and pilot plans, not assumed here.

### 4.1.5 First production release

The first production release is the affiliation vertical, hardened to release
requirements (bilingual parity, accessibility, privacy, security, operability),
delivered through controlled, reversible stages (PR-012, PR-013).

### 4.1.6 Later delivery waves

Membership, registration, payments, participant continuity, analytics, and broader
integrations are later waves. They are DEFERRED until the affiliation vertical is
proven in production.

### 4.1.7 External execution systems

Competition, learning, accreditation, and payment execution systems are external
systems. Their role MUST be classified per 4.6 and V0-06; they are not in-scope for
replacement in the first release.

## 4.2 First production flow

Normative statement:

Club affiliation MUST be the first production vertical slice, including activation
into the authoritative organization registry.

Rationale:

- establishes authoritative organization identity;
- sets jurisdiction and governance relationships;
- delivers bounded national value early;
- provides the foundation for later membership and registration capabilities.

## 4.3 Explicit exclusions from first release

Excluded from the first production release unless separately approved and recorded
in REG-002:

- competition-management replacement;
- full learning-management replacement;
- full accreditation replacement;
- high-performance athlete systems;
- broadcast and fan-engagement systems;
- unrestricted multi-sport commercialization;
- broad AI decision automation;
- complete historical participant migration prior to the affiliation pilot;
- wholesale adoption of all Base44 routes.

## 4.4 Capability boundary rule

Every proposed capability MUST be classified as exactly one of:

- owned
- shared
- observed
- integrated
- delegated
- deferred
- retired

A prototype screen or route does not establish program scope automatically. New
capability adoption MUST follow the scope-change process in 4.7.

## 4.5 Complete affiliation outcome (constitutional definition)

This subsection is normative and defines what "affiliation delivered" means. The
affiliation vertical is NOT satisfied by an application form, an approval endpoint,
a state machine, or an admin screen alone.

The minimum complete affiliation outcome is:

An authorized club representative can establish or confirm the club, complete
applicable requirements, submit evidence, undergo the correct jurisdictional
review, respond to identified deficiencies, receive a governed decision, and, when
approved, have the club activated exactly once as an authoritative organization.

Required elements:

- APPLICANT AUTHORITY: only an authorized representative may act for the club;
- REQUIREMENTS: applicable affiliation requirements are presented and evaluated;
- EVIDENCE: required documents/evidence are submitted and bound to the decision;
- JURISDICTIONAL REVIEW: the correct PTSO/national authority reviews the case;
- RETURN AND RESUBMISSION: deficiencies can be returned and corrected;
- GOVERNED DECISION: approval or rejection is a governed, evidenced transition;
- EXACTLY-ONCE ACTIVATION: approval activates the club exactly once as an
  authoritative organization, with no duplicate creation on retry.

Exactly-once activation MUST be enforced through the governed delivery controls
(idempotent activation), consistent with the platform governance kernel model.

## 4.6 External system classification

Each external platform MUST be classified as one of:

- authoritative provider;
- execution plane;
- synchronization partner;
- projection source;
- reporting source;
- temporary transition system.

Classifications are recorded in REG-005.

## 4.7 Scope-change process

This subsection is normative.

Any change to ratified scope MUST:

- be raised as a decision record in REG-002 with the appropriate decision class;
- identify affected outcomes, principles, and delivery waves;
- be approved by the authority defined in V0-07;
- update this chapter and REG-000 on ratification.

No capability enters a narrower scope layer without an approved decision.
