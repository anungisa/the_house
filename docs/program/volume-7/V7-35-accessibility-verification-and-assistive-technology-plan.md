# V7-35 - Accessibility Verification and Assistive-Technology Plan

Document ID: V7-35
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V7-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V7-G4)

## V7-35.1 Purpose

This section is normative.

This chapter defines the accessibility verification plan for the club-affiliation experience and the assistive-technology evaluation it requires. It defines the plan only. No accessibility verification is performed by Package 4, and no conformance claim is made.

## V7-35.2 Objective and scope

This section is normative.

The objective is to verify that the governed experience meets its accessibility obligations for keyboard and focus operation, semantic structure, form instruction, error prevention and recovery, status announcement, evidence interaction, authentication and recovery, time-sensitive tasks, and alternate formats. The scope is the accessibility obligations recorded in the frozen corpus and the complete-state specifications of Package 3. Accessibility verification is a distinct family; it does not evaluate usability, bilingual equivalence, or visual finality.

## V7-35.3 The evidence ladder and its boundaries

This section is normative.

The plan distinguishes four kinds of evidence and forbids their conflation. An automated static scan detects a bounded class of defects and proves only the absence of those defects. A manual expert inspection judges conformance criteria that automation cannot reach. An assistive-technology evaluation observes the experience operated through the assistive technologies participants actually use. Complete evidence combines these under qualified judgement. None of the lower rungs is sufficient on its own: a passed static scan is not a conformance claim, a manual inspection is not an assistive-technology evaluation, and no partial evidence establishes conformance. The plan fails closed where complete evidence is absent.

## V7-35.4 Assistive-technology coverage

This section is normative.

The plan names the assistive technologies the evaluation must cover, including screen readers, keyboard-only operation, magnification, and alternate input, and it names the governed tasks each must be able to complete. Evaluation covers the complete-state set, including error, denied, conflict, stale, degraded, interrupted, and recovery states, so that accessibility is verified in failure and recovery rather than only in the default state.

## V7-35.5 Qualification, environment, and defect treatment

This section is normative.

The plan names the qualification required of evaluators, the representative environment in which evaluation is conducted, and how defects are recorded as governed backlog items with owners and forward gates. A corrected artifact is re-evaluated under a named retest rule. No defect is closed on the basis of a design-file change alone, and no conformance claim is recorded from an incomplete evidence set.

## V7-35.6 Acceptance authority and future gate

This section is normative.

The plan names the acceptance authority empowered to accept accessibility verification results and the forward gate at which acceptance may occur, distinct from the authors of the experience. Package 4 defines who may accept accessibility evidence and when; it accepts none and asserts no conformance.

## V7-35.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It runs no scan, performs no inspection or assistive-technology evaluation, and makes no conformance claim. It creates no production user interface, production content, validated translation, coded interface, design-system implementation, executable workflow, or interface or integration contract, and no procurement, sequencing, staffing, cost, pilot, rollout, or master development plan. Every controlled record remains in a not-implemented-or-not-proven posture.
