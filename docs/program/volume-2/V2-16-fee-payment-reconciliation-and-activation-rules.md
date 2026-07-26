# V2-16 - Fee, Payment, Reconciliation, and Activation Rules

Document ID: V2-16  
Title: Fee, Payment, Reconciliation, and Activation Rules  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 3 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-023)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G3)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-16.1 Purpose

This section is normative.

This chapter defines the boundary between fee policy, payment execution, accounting, and
lifecycle activation. Fee policy, payment execution, and accounting are separate
authorities; the affiliation service holds fee obligation and reconciliation status only
(REG-203 BR-V2-021, NFR-V2-015). This chapter is rule definition and authorizes no
implementation and invents no fee amounts.

## V2-16.2 Fee determination

This section is normative.

The fee determination rule (RULE-V2-021) resolves fee obligation from the fee policy
owner, season, jurisdiction, pathway, exemptions, waivers, adjustments, and applicable
taxes, with versioning, effective dates, and auditability. Fee amounts are set by the Fee
and Reconciliation Policy Authority (Helene) and are not invented here. Fee policy is
recorded as FINANCIAL_VALIDATION_PENDING.

## V2-16.3 Payment and accounting boundary

This section is normative.

The authority boundary is fixed as follows:

- **The House** - fee obligation and reconciliation status only.
- **Payment processor** - transaction execution and processor result.
- **Accounting system** - ledger authority and financial recognition.
- **Operations** - exception investigation and reconciliation.

No lifecycle component asserts ledger or payment-execution authority (REG-203 CTRL-V2-011).

## V2-16.4 Reconciliation and activation

This section is normative.

The reconciliation-before-activation rule (RULE-V2-022) requires that activation proceed
only when fee conditions are satisfied or explicitly waived and reconciliation status is
confirmed at the boundary. The exactly-once activation rule (RULE-V2-023) requires that
activation:

- follows governed approval;
- satisfies applicable fee conditions or explicit waiver;
- satisfies accounting/reconciliation conditions;
- has no unresolved blocking exception;
- is authorized;
- is processed idempotently;
- produces one authoritative activation result;
- records audit and notification;
- projects downstream.

## V2-16.5 Activation outcomes

This section is normative.

The following activation-related outcomes are separately defined:

- approved but awaiting reconciliation;
- active;
- activation failed;
- activation pending recovery;
- activation reversed under authorized correction;
- affiliation expired or closed.

Reversal occurs only under authorized correction (REG-203 CTRL-V2-012, TEST-V2-024).

## V2-16.6 Unresolved validations

This section is normative.

Fee amounts, exemption and waiver policy, tax treatment, and the reconciliation contract
and boundary are recorded as FINANCIAL_VALIDATION_PENDING with owner Helene (STK-V2-013)
and a future affiliation fee and reconciliation validation gate. Pending validation blocks
only the affected rule.

## V2-16.7 Authorization posture

This section is normative.

This chapter defines fee, payment-boundary, reconciliation, and activation rules only. It
authorizes no implementation, no procurement, no payment integration design, and no
technical architecture. All referenced rules in REG-203 carry
`authorizes_implementation: false`.
