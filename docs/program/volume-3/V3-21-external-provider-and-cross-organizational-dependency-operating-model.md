# V3-21 - External-Provider and Cross-Organizational Dependency Operating Model

Document ID: V3-21  
Title: External-Provider and Cross-Organizational Dependency Operating Model  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 3 Package 3 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-305 APP-V3-030)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V3-G3)  
Supersedes: None  
Review Cycle: Frozen at Volume 3 Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-3/

## V3-21.1 Purpose

This section is normative.

This chapter defines the business operating relationship with external and adjacent
services (CAP-V3-021, OUT-V3-021, FR-V3-021). It does not select vendors, authorize
procurement, or assert unverified contractual capabilities (BR-V3-020, BR-V3-025). It
authorizes no implementation.

## V3-21.2 Relevant dependencies

This section is normative.

The following dependencies are in scope:

- Payment processor (STK-V3-014).
- Accounting system (STK-V3-015).
- Identity services (STK-V3-019).
- Registration provider (STK-V3-019).
- Curling I/O where applicable (STK-V3-019).
- Document or knowledge services (STK-V3-019).
- Communications delivery (STK-V3-019).
- Analytics and reporting (STK-V3-019).
- Accreditation and learning platforms (STK-V3-019).
- PTSO-operated systems (STK-V3-002).
- Manual spreadsheets, files, and email controls during transition.

## V3-21.3 Dependency operating template

This section is normative.

Each dependency is defined by the following fields:

```
Business function
Dependency owner
External authority
Information exchanged
Operating trigger
Expected acknowledgement
Failure mode
Manual fallback
Reconciliation
Escalation
Evidence retained
Continuity implication
Contractual validation status
Transition question
```

## V3-21.4 Authority boundary

This section is normative.

An external provider executes a business function but never holds governed affiliation
authority; on failure the recorded manual fallback and reconciliation apply and governed
authority is retained by the accountable function (RULE-V3-017, CTRL-V3-025). Contractual
capabilities are recorded as validation-pending until verified.

## V3-21.5 Reconciliation and continuity

This section is normative.

Every dependency records a reconciliation approach and a continuity implication. Financial
dependencies reconcile within the financial operating boundary (V3-12); dependency
failures are handled as incidents under incident and continuity governance (V3-23).

## V3-21.6 Validation status

This section is normative.

The dependency definitions are author-asserted. Contractual and capability validation is
pending and involves the accountable dependency owners, finance for financial providers
(Hélène), privacy for identity and data-exchange providers, and product-and-technology
stewardship (Aubert). Vendor selection and procurement are not authorized in Volume 3.
Pending validation blocks only the affected dependency entry.
