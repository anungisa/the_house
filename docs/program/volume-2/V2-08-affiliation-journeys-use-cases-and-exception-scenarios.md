# V2-08 - Affiliation Journeys, Use Cases, and Exception Scenarios

Document ID: V2-08  
Title: Affiliation Journeys, Use Cases, and Exception Scenarios  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 2 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-012)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-08.1 Purpose and method

This section is normative.

This chapter defines the controlled use cases of the affiliation service. Each use case
is defined with thirteen attributes: Actor, Trigger, Preconditions, Authority, Normal
flow, Alternate flow, Exception flow, Evidence, State effect, Notification, Audit
expectation, Postcondition, and Acceptance references. The service is defined by its use
cases including alternate and exception paths; it is not reduced to happy-path user
stories. Each use case maps to a UC-level requirement in REG-203.

## V2-08.2 Principal journeys

This section is normative.

The use cases compose into principal journeys: the applicant journey (recognize, open,
determine pathway, confirm representatives, complete requirements, upload evidence,
submit, resubmit); the reviewer journey (route, review, return, decide, escalate); the
administrative journey (resolve jurisdiction, correct errors, handle non-standard
clubs); the financial-boundary journey (reconcile fees); and the support and
communication journey (notify, expose status, support handoff).

## V2-08.3 Use case UC-V2-004 - Recognize an existing club

This section is normative.

- Actor: National Affiliation Administrator (STK-V2-009).
- Trigger: an existing club engages the service for a season.
- Preconditions: the club exists in the ecosystem and is not yet recognized in the House
  record.
- Authority: House governed recognition capability (CAP-V2-006).
- Normal flow: resolve identity; establish recognition; record recognized state.
- Alternate flow: partial identity match routed for confirmation.
- Exception flow: identity conflict blocks recognition and is routed to review.
- Evidence: recognition basis recorded.
- State effect: club recognized (governed transition).
- Notification: administrator confirmation.
- Audit expectation: recognition event and audit record.
- Postcondition: club is recognized and eligible to affiliate.
- Acceptance references: TEST-V2-004.

## V2-08.4 Use case UC-V2-005 - Establish a new club

This section is normative.

- Actor: National Affiliation Administrator (STK-V2-009).
- Trigger: a new organization seeks recognition.
- Preconditions: no existing recognition; jurisdiction resolvable or assignable.
- Authority: House governed recognition capability (CAP-V2-006).
- Normal flow: capture identity; assign jurisdiction; establish recognition.
- Alternate flow: jurisdiction ambiguous, routed for assignment (UC-V2-011).
- Exception flow: duplicate organization detected, blocked and reviewed.
- Evidence: recognition request and basis.
- State effect: new club recognized.
- Notification: administrator and representative confirmation.
- Audit expectation: recognition event and audit record.
- Postcondition: new club recognized.
- Acceptance references: TEST-V2-004.

## V2-08.5 Use case UC-V2-006 - Open seasonal affiliation

This section is normative.

- Actor: Club Administrator (STK-V2-004) or Administrator (STK-V2-009).
- Trigger: the affiliation window opens for a season.
- Preconditions: club recognized; season defined and current.
- Authority: House seasonal affiliation capability (CAP-V2-009).
- Normal flow: create a seasonal affiliation in draft for the current season.
- Alternate flow: prior-season affiliation exists and informs continuity.
- Exception flow: season not current, opening blocked.
- Evidence: none at opening.
- State effect: affiliation created in draft.
- Notification: applicant acknowledgement.
- Audit expectation: affiliation-opened audit record.
- Postcondition: a draft affiliation exists for the season.
- Acceptance references: TEST-V2-008 (single active affiliation).

## V2-08.6 Use case UC-V2-007 - Determine applicable pathway

This section is normative.

- Actor: System on behalf of the service.
- Trigger: seasonal affiliation opened.
- Preconditions: recognition and prior-affiliation status known.
- Authority: House pathway determination capability (CAP-V2-010).
- Normal flow: evaluate status and outstanding conditions; select continuity, renewal,
  or new pathway.
- Alternate flow: borderline status routed to review rather than presumed.
- Exception flow: indeterminate status blocks auto-determination and routes to an
  administrator.
- Evidence: determination basis recorded.
- State effect: pathway recorded on the affiliation.
- Notification: applicant informed of the pathway and requirements.
- Audit expectation: pathway-determination audit record.
- Postcondition: an applicable pathway is set.
- Acceptance references: none defined in this package.

## V2-08.7 Use case UC-V2-008 - Confirm authorized representatives

This section is normative.

- Actor: Club Authorized Representative (STK-V2-012) and Administrator (STK-V2-009).
- Trigger: pathway requires representative confirmation.
- Preconditions: club recognized.
- Authority: House representative authority capability (CAP-V2-007).
- Normal flow: confirm or update representatives and their authority.
- Alternate flow: representative change requires re-confirmation.
- Exception flow: an unauthorized actor is prevented from acting (RULE-V2-008).
- Evidence: authorization basis recorded.
- State effect: representatives confirmed.
- Notification: representative confirmation.
- Audit expectation: representative-confirmation audit record.
- Postcondition: authorized representatives are current.
- Acceptance references: TEST-V2-005.

## V2-08.8 Use case UC-V2-009 - Complete season requirements

This section is normative.

- Actor: Club Administrator (STK-V2-004).
- Trigger: pathway and requirements applied.
- Preconditions: versioned requirements for the season are applied.
- Authority: House requirement application capability (CAP-V2-011).
- Normal flow: complete each applicable requirement.
- Alternate flow: some requirements carried from a prior season under continuity.
- Exception flow: a requirement is not applicable and is recorded as such.
- Evidence: requirement responses and bound evidence.
- State effect: requirement completeness progresses.
- Notification: outstanding-requirement reminders.
- Audit expectation: requirement-completion audit records.
- Postcondition: requirements are complete or explicitly outstanding.
- Acceptance references: TEST-V2-006.

## V2-08.9 Use case UC-V2-010 - Upload or replace evidence

This section is normative.

- Actor: Club Administrator (STK-V2-004).
- Trigger: a requirement needs supporting evidence.
- Preconditions: an open application with an evidence-bearing requirement.
- Authority: House evidence capability (CAP-V2-012).
- Normal flow: upload evidence and bind it to the requirement.
- Alternate flow: replace or supersede prior evidence (FR-V2-013).
- Exception flow: required documents absent blocks submission (RULE-V2-004).
- Evidence: the uploaded artifact and its binding metadata.
- State effect: evidence bound to the application.
- Notification: upload confirmation.
- Audit expectation: EvidenceBound event and audit record.
- Postcondition: current evidence is bound.
- Acceptance references: TEST-V2-006.

## V2-08.10 Use case UC-V2-011 - Resolve or assign jurisdiction

This section is normative.

- Actor: National Affiliation Administrator (STK-V2-009).
- Trigger: jurisdiction is unresolved for a club.
- Preconditions: club recognized or under recognition.
- Authority: House jurisdiction capability (CAP-V2-008).
- Normal flow: resolve the jurisdiction from club attributes.
- Alternate flow: assign jurisdiction manually where rules are ambiguous.
- Exception flow: contested jurisdiction routed to member-organization coordination.
- Evidence: jurisdiction basis recorded.
- State effect: jurisdiction set on the club and affiliation.
- Notification: member-organization visibility.
- Audit expectation: jurisdiction-assignment audit record.
- Postcondition: exactly one jurisdiction is set (BR-V2-006).
- Acceptance references: none defined in this package.

## V2-08.11 Use case UC-V2-012 - Assign or route to a jurisdictional reviewer

This section is normative.

- Actor: System and Administrator (STK-V2-009).
- Trigger: an application is submitted.
- Preconditions: application complete and jurisdiction resolved.
- Authority: House routing capability (CAP-V2-014).
- Normal flow: place the application in the jurisdiction's review queue.
- Alternate flow: load-balanced or specialist routing within the jurisdiction.
- Exception flow: no available reviewer triggers escalation (UC-V2-016).
- Evidence: routing basis recorded.
- State effect: application queued for review.
- Notification: reviewer queue notification.
- Audit expectation: routing audit record.
- Postcondition: application is assigned for review.
- Acceptance references: none defined in this package.

## V2-08.12 Use case UC-V2-013 - Review evidence

This section is normative.

- Actor: Reviewer (STK-V2-006).
- Trigger: application in the reviewer's queue.
- Preconditions: reviewer holds reviewer scope for the jurisdiction.
- Authority: House review capability (CAP-V2-016).
- Normal flow: examine requirements and bound evidence against policy.
- Alternate flow: request internal clarification before deciding.
- Exception flow: open compliance flags block approval (RULE-V2-005).
- Evidence: review notes recorded.
- State effect: review progresses toward decision.
- Notification: none until decision or return.
- Audit expectation: review-activity audit record.
- Postcondition: the application is ready for decision or return.
- Acceptance references: none defined in this package.

## V2-08.13 Use case UC-V2-014 - Return application for information

This section is normative.

- Actor: Reviewer (STK-V2-006).
- Trigger: information is missing or insufficient.
- Preconditions: application under review.
- Authority: House return capability (CAP-V2-015).
- Normal flow: return the application stating the specific information required
  (BR-V2-010).
- Alternate flow: partial return for a single deficient requirement.
- Exception flow: repeated returns trigger escalation.
- Evidence: return reason recorded.
- State effect: application returned to the applicant.
- Notification: applicant return notification with required actions.
- Audit expectation: AffiliationReturnedForInformation event and audit record.
- Postcondition: the applicant knows exactly what is required.
- Acceptance references: TEST-V2-007.

## V2-08.14 Use case UC-V2-015 - Resubmit after return

This section is normative.

- Actor: Club Administrator (STK-V2-004).
- Trigger: a returned application is addressed.
- Preconditions: the required information has been provided.
- Authority: House resubmission capability (CAP-V2-015).
- Normal flow: resubmit the application for continued review.
- Alternate flow: resubmit with superseding evidence.
- Exception flow: resubmission still incomplete is returned again.
- Evidence: updated responses and evidence.
- State effect: application returns to review.
- Notification: reviewer re-queue notification.
- Audit expectation: resubmission audit record.
- Postcondition: the application is back under review.
- Acceptance references: TEST-V2-007.

## V2-08.15 Use case UC-V2-016 - Escalate or reassign a review

This section is normative.

- Actor: National Affiliation Administrator (STK-V2-009).
- Trigger: reviewer unavailability, conflict, or delay.
- Preconditions: an application in review or queued.
- Authority: House routing capability (CAP-V2-014).
- Normal flow: reassign the application to another authorized reviewer.
- Alternate flow: escalate to a senior reviewer.
- Exception flow: no eligible reviewer routes to national handling.
- Evidence: escalation basis recorded.
- State effect: review reassigned.
- Notification: affected reviewers notified.
- Audit expectation: escalation/reassignment audit record.
- Postcondition: the application has an accountable reviewer.
- Acceptance references: none defined in this package.

## V2-08.16 Use case UC-V2-017 - Record approval

This section is normative.

- Actor: Reviewer (STK-V2-006).
- Trigger: review complete and conditions satisfied.
- Preconditions: reviewer scope; no open compliance flags; fees reconciled where
  applicable.
- Authority: House decision capability (CAP-V2-016).
- Normal flow: record approval with rationale and evidence; activation follows
  (UC-V2-003).
- Alternate flow: conditional approval pending a boundary signal.
- Exception flow: attempt to approve without scope is denied (BR-V2-009).
- Evidence: decision rationale and evidence (high-risk transition).
- State effect: application approved, then activated exactly once (BR-V2-011).
- Notification: applicant approval notification.
- Audit expectation: approval and activation audit records.
- Postcondition: the affiliation is active for the season.
- Acceptance references: TEST-V2-008.

## V2-08.17 Use case UC-V2-018 - Record refusal

This section is normative.

- Actor: Reviewer (STK-V2-006).
- Trigger: conditions cannot be satisfied.
- Preconditions: reviewer scope; review complete.
- Authority: House decision capability (CAP-V2-016).
- Normal flow: record refusal with rationale and evidence.
- Alternate flow: refusal with a defined path to reapply.
- Exception flow: attempt to refuse without scope is denied.
- Evidence: refusal rationale and evidence (high-risk transition).
- State effect: application refused; no activation.
- Notification: applicant refusal notification with reasons.
- Audit expectation: AffiliationRefused event and audit record.
- Postcondition: the affiliation is not active; reasons are recorded.
- Acceptance references: none defined in this package.

## V2-08.18 Use case UC-V2-019 - Reconcile fees

This section is normative.

- Actor: Fee Reconciliation Steward (STK-V2-011) and external system (STK-V2-008).
- Trigger: an external fee-paid signal is received.
- Preconditions: an application requiring fee reconciliation.
- Authority: House fee-reconciliation boundary capability (CAP-V2-017).
- Normal flow: reconcile the signal to the application as fees-paid.
- Alternate flow: partial or deferred payment recorded as outstanding.
- Exception flow: unmatched signal quarantined for administrative handling.
- Evidence: the reconciliation record and source reference.
- State effect: fee status updated; no accounting authority assumed (BR-V2-013).
- Notification: applicant fee-status update.
- Audit expectation: FeeReconciled event and audit record.
- Postcondition: fee status reflects the boundary signal.
- Acceptance references: TEST-V2-009.

## V2-08.19 Use case UC-V2-020 - Notify affected parties

This section is normative.

- Actor: System on behalf of the service.
- Trigger: a status change or required action occurs.
- Preconditions: a recipient with a notification preference and language.
- Authority: Button notification capability (CAP-V2-019).
- Normal flow: produce a notification in the recipient's official language.
- Alternate flow: reminder and escalation notifications.
- Exception flow: delivery failure recorded and retried.
- Evidence: notification record.
- State effect: none to governed lifecycle; notification logged.
- Notification: this use case is the notification.
- Audit expectation: notification audit record.
- Postcondition: the recipient is informed.
- Acceptance references: TEST-V2-011.

## V2-08.20 Use case UC-V2-021 - Expose status and required actions

This section is normative.

- Actor: Club Administrator (STK-V2-004).
- Trigger: the applicant checks the application.
- Preconditions: an application exists.
- Authority: Button status capability (CAP-V2-020).
- Normal flow: present current status and outstanding required actions.
- Alternate flow: present historical status and decisions.
- Exception flow: no application yet presents the pathway entry.
- Evidence: none (read path).
- State effect: none.
- Notification: none.
- Audit expectation: access consistent with privacy control (CTRL-V2-003).
- Postcondition: the applicant knows status and next actions.
- Acceptance references: none defined in this package.

## V2-08.21 Use case UC-V2-022 - Correct an administrative error

This section is normative.

- Actor: National Affiliation Administrator (STK-V2-009).
- Trigger: an administrative error is identified on a record.
- Preconditions: a governed record with a correctable error.
- Authority: House administrative-correction capability (CAP-V2-021).
- Normal flow: apply a governed correction with rationale.
- Alternate flow: correction requiring a superseding decision is routed accordingly.
- Exception flow: a correction that would bypass a governed decision is blocked
  (BR-V2-012).
- Evidence: correction rationale and prior value.
- State effect: record corrected through a governed transition.
- Notification: affected parties notified where material.
- Audit expectation: AffiliationCorrected event and audit record.
- Postcondition: the record is corrected and fully attributable.
- Acceptance references: TEST-V2-010.

## V2-08.22 Use case UC-V2-023 - Handle a withdrawn club

This section is normative.

- Actor: National Affiliation Administrator (STK-V2-009).
- Trigger: a club withdraws.
- Preconditions: a recognized or affiliated club.
- Authority: House non-standard lifecycle capability (CAP-V2-031).
- Normal flow: transition the club to a withdrawn state through governed transitions.
- Alternate flow: withdrawal mid-season with active affiliation handled explicitly.
- Exception flow: withdrawal with outstanding obligations routed for resolution.
- Evidence: withdrawal basis recorded.
- State effect: governed withdrawal.
- Notification: member organization and participants informed.
- Audit expectation: audit and evidence records.
- Postcondition: the club's withdrawn state is authoritative.
- Acceptance references: TEST-V2-013.

## V2-08.23 Use case UC-V2-024 - Handle a dormant club

This section is normative.

- Actor: National Affiliation Administrator (STK-V2-009).
- Trigger: a club becomes dormant (no affiliation for one or more seasons).
- Preconditions: a recognized club without current affiliation.
- Authority: House non-standard lifecycle capability (CAP-V2-031).
- Normal flow: mark the club dormant while preserving recognition.
- Alternate flow: reactivation on renewed affiliation.
- Exception flow: prolonged dormancy routed for member-organization review.
- Evidence: dormancy basis recorded.
- State effect: governed dormant state.
- Notification: member-organization visibility.
- Audit expectation: audit records.
- Postcondition: dormancy is authoritative and reversible.
- Acceptance references: TEST-V2-013.

## V2-08.24 Use case UC-V2-025 - Handle a merged club

This section is normative.

- Actor: National Affiliation Administrator (STK-V2-009).
- Trigger: two clubs merge.
- Preconditions: two recognized clubs.
- Authority: House non-standard lifecycle capability (CAP-V2-031).
- Normal flow: record the merge and the surviving recognized entity.
- Alternate flow: merge with active affiliations reconciled to one.
- Exception flow: conflicting obligations routed for resolution.
- Evidence: merge basis and lineage recorded.
- State effect: governed merge with preserved lineage.
- Notification: affected parties informed.
- Audit expectation: audit and evidence records.
- Postcondition: a single surviving recognized entity with lineage.
- Acceptance references: TEST-V2-013.

## V2-08.25 Use case UC-V2-026 - Handle a reconstituted club

This section is normative.

- Actor: National Affiliation Administrator (STK-V2-009).
- Trigger: a club reconstitutes under a new identity or governance.
- Preconditions: a prior recognized club.
- Authority: House non-standard lifecycle capability (CAP-V2-031).
- Normal flow: record reconstitution and link to prior lineage.
- Alternate flow: reconstitution treated as new affiliation where required.
- Exception flow: disputed continuity routed for review.
- Evidence: reconstitution basis and lineage recorded.
- State effect: governed reconstitution with lineage.
- Notification: affected parties informed.
- Audit expectation: audit and evidence records.
- Postcondition: the reconstituted club is authoritative with lineage.
- Acceptance references: TEST-V2-013.

## V2-08.26 Coverage statement

This section is normative.

This chapter defines twenty-six controlled use cases (UC-V2-001 through UC-V2-026)
covering applicant, reviewer, administrative, financial-boundary, and support journeys,
including alternate and exception paths. Coverage completeness is a Gate V2-G2 condition
(V2-B). Use cases whose eligibility or measure depends on unresolved policy or
stakeholder validation are recorded as such and carried forward, not fabricated.

## V2-08.27 Authorization posture

This section is normative.

This chapter defines use cases at a product level only. It authorizes no implementation,
no procurement, and no master development plan.
