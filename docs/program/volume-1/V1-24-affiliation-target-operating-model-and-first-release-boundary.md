# V1-24 - Affiliation Target Operating Model and First-Release Boundary

Document ID: V1-24  
Title: Affiliation Target Operating Model and First-Release Boundary  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 5 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-E, REG-108 APP-V1-037)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G5)  
Supersedes: None  
Review Cycle: Frozen at Package 5 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-24.1 Purpose

This section is normative.

This is the decisive convergence chapter. It defines the **affiliation target operating
model** and answers the second half of the central question: *what is the smallest
legitimate first affiliation release?* The target flow is structured into
`generated/convergence/affiliation-target-flow.json`; the release boundary into
`generated/convergence/first-release-boundary.json`.

Nothing in this chapter authorizes implementation. It defines the target and its
boundary; construction remains reserved for a later material-commitment gate.

## V1-24.2 The affiliation target operating model

This section is normative.

The target affiliation flow is a governed, fifteen-step model. The House owns every
governed lifecycle transition; The Button presents the guided experience but never owns
governed state:

1. Recognize existing club and historical continuity (continuity confirmation pathway).
2. Confirm organization and jurisdiction (organization registry + jurisdiction
   resolution).
3. Open seasonal affiliation (Governance Kernel creates the affiliation `entity_state`).
4. Determine applicable versioned requirements (`policy_version`-anchored resolution).
5. Complete required information (guided capture; governed persistence).
6. Upload and bind evidence (`evidence_object` metadata + scan/quarantine).
7. Determine fees (House fee policy computes amounts owed).
8. Submit (governed, idempotent submit transition).
9. Route to the correct reviewer (reviewer routing rebuilt from jurisdiction).
10. Review and return for information where necessary (return-for-information
    transition).
11. Resubmit (resubmit transition).
12. Record governed decision (kernel decision transition + audit + evidence).
13. Reconcile payment and accounting (payment-reconciliation boundary; processor
    executes, accounting is ledger).
14. Activate affiliation exactly once (idempotent activation; outbox exactly-once).
15. Expose authoritative status in The Button and integrations (read projection; Button
    presents, House owns).

## V1-24.3 Governed transition pathways

This section is normative.

The target model supports three governed transition pathways so that the existing club
population — many recognized through historical/goodwill affiliation — is treated
correctly rather than forced through a new-applicant process:

1. **Continuity confirmation** — for an existing recognized club with satisfactory
   historical standing. Governed treatment: confirm continuity; do not force through the
   new-applicant process. Unresolved: eligibility rules pending operational validation
   (Jen).
2. **Renewal with remediation** — for an existing club with missing, outdated, or
   conflicting evidence. Governed treatment: renew with targeted remediation via
   return-for-information. Unresolved: remediation thresholds pending operational
   validation.
3. **New affiliation** — for a new or materially reconstituted organization. Governed
   treatment: the full governed affiliation process. Unresolved: reconstitution criteria
   pending operational validation.

The continuity pathway is how the historical/goodwill population is represented; it is
required for Gate V1-G5 condition 8.

## V1-24.4 First-release affiliation boundary

This section is normative.

The smallest legitimate first affiliation release includes exactly the following, and
nothing more:

- club recognition or establishment
- jurisdiction resolution
- seasonal affiliation creation
- versioned requirements
- evidence binding
- submission
- resource-aware authorization
- assigned reviewer routing
- return and resubmission
- governed decision
- payment-reconciliation boundary
- exactly-once activation
- Button status and required-action view
- notifications
- audit and operational visibility

## V1-24.5 Explicit exclusions

This section is normative.

The following are explicitly **excluded** from the first release until the affiliation
vertical is proven:

- unrelated horizontal expansion until this vertical is proven
- full billing / invoicing beyond the payment-reconciliation boundary
- accreditation/learning authoring (external systems of record retained)
- analytics/reporting platform build (projection only)
- support tooling replacement
- additional domain modules outside the affiliation vertical

## V1-24.6 Resource-aware authorization note

This section is normative.

The first release includes resource-aware authorization because Package 3 found the
House permission model to be role-based and **not** resource-aware (REG-104 FND-023).
This is recorded here as a target requirement of the first release, not as an
authorization to build it. No implementation, procurement, or master development plan is
authorized by this chapter.
