# V7-17 - Decision, Financial, Reconciliation, Activation, Standing, and Expiry Interaction Model

Document ID: V7-17
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V7-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V7-G2)

## V7-17.1 Purpose

This section is normative.

This chapter specifies the interaction model for governed decision, financial confirmation, reconciliation, activation, standing, and expiry. It records the relevant command, query, and status-message records in register REG-702 and the decision, finance, and activation views in register REG-701.

## V7-17.2 Financial confirmation

This section is normative.

Reading obligation, acknowledgement, and reconciliation status expresses a restricted finance query intent. A payment acknowledgement is not an accounting confirmation. Recording accounting confirmation expresses a finance command intent to the House finance function and never decides affiliation.

## V7-17.3 Reconciliation

This section is normative.

Resolving a reconciliation mismatch expresses a distinct finance command intent. Reconciliation resolution does not decide affiliation and does not by itself activate standing. Payment, accounting confirmation, and activation timing are presented as distinct steps.

## V7-17.4 Activation, standing, and expiry

This section is normative.

Authorizing activation expresses a governed command intent that depends on a governed approval and on financial dependencies being satisfied. Approval does not by itself constitute activation, execution, or active standing. Standing and expiry are read through query intents against authoritative House data, and the interaction discloses when activation is pending remaining dependencies.

## V7-17.5 Explicit non-authorizations

This section is normative.

This chapter does not authorize production user interface, executable workflows, interface or integration contracts, final visual design, branded mockups, design tokens, production content, translations, procurement, staffing, cost commitments, pilots, rollout, or a master plan. It defines documentary interaction behaviour only, pending Gate V7-G2.
