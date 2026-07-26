# V3-05 - Financial and Reconciliation Operating Model

Document ID: V3-05  
Title: Financial and Reconciliation Operating Model  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 3 Package 1 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-305 APP-V3-006)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V3-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 3 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-3/

## V3-05.1 Purpose

This section is normative.

This chapter defines the financial and reconciliation operating boundary for the
affiliation service: the operating relationships among fee-policy authority, the House
fee obligation, external payment execution, external ledger authority, reconciliation
operations, and the activation dependency. It fabricates no amounts, no costs, and no
commercial commitments.

## V3-05.2 Financial operating boundary

This section is normative.

The financial operating model draws a boundary among the following:

- **Fee-policy authority** - the Compliance and Policy Function and National Operations
  set fee policy; Volume 3 does not set fee amounts.
- **House fee obligation** - the House records the fee obligation for an affiliation.
- **External payment execution** - the External Payment Processor (STK-V3-014) executes
  collection and returns processor results; it holds no affiliation decision authority.
- **External ledger authority** - the External Accounting and Ledger System
  (STK-V3-015) confirms postings and is the ledger authority.
- **Reconciliation operations** - Finance and Reconciliation Operations (STK-V3-008)
  reconciles processor and ledger results and confirms financial readiness.
- **Activation dependency** - activation depends on a confirmed reconciliation result
  (BR-V3-004).

## V3-05.3 Reconciliation operating flow

This section is normative.

- Processor results and ledger confirmations are consumed as inputs to reconciliation
  (DATA-V3-002).
- Reconciliation matches obligation, processor result, and ledger confirmation.
- A confirmed reconciliation result releases the activation dependency (RULE-V3-003).
- Reconciliation records reference their processor and ledger inputs for audit.

## V3-05.4 Financial exceptions and mismatches

This section is normative.

- A mismatch among obligation, processor result, and ledger confirmation is a financial
  exception (FR-V3-003, UC-V3-004).
- Mismatches are routed to Finance and Reconciliation Operations and resolved before
  activation; an unresolved mismatch holds the case in a reconciliation-pending state
  (RULE-V3-003, CTRL-V3-002).
- Provider failures (processor or ledger) are financial exceptions escalated to
  National Operations.

## V3-05.5 Financial controls and boundaries

This section is normative.

- The activation-dependency control (CTRL-V3-002) prevents activation without a
  confirmed reconciliation result.
- Segregation of duties prevents the reviewer of an application from being its finance
  confirmer (BR-V3-003, CTRL-V3-001).
- Volume 3 fabricates no fee amounts, no cost figures, no revenue projections, and no
  commercial or procurement commitments. Any numeric financial figure is out of scope
  and, where needed operationally, is an operating measure marked financial-validation-
  pending (BR-V3-005).

## V3-05.6 Validation status

This section is normative.

The financial and reconciliation operating model is author-asserted and carries
financial validation pending. Reconciliation exception rates and related measures
(MEAS-V3-04) are financial-validation-pending in V3-07. No financial figure is
committed. Unresolved assumptions are recorded in V3-07.
