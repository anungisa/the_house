# V3-12 - Financial Reconciliation and Activation Operations

Document ID: V3-12  
Title: Financial Reconciliation and Activation Operations  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 3 Package 2 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-305 APP-V3-017)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V3-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 3 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-3/

## V3-12.1 Purpose

This section is normative.

This chapter defines financial reconciliation and activation operations for the
affiliation season. It preserves the authority boundaries among fee policy, the House,
the payment provider, the accounting system, finance operations, and the affiliation
authority, and it ensures that activation executes an approved lifecycle effect exactly
once (BR-V3-011, CAP-V3-012). It fabricates no fee amounts, transaction rules, or
accounting policy (BR-V3-014). It authorizes no implementation.

## V3-12.2 Operating boundary roles

This section is normative.

Financial operations distinguish the following roles (V3-05 inherited):

- **Policy function** - defines fee policy; does not execute transactions.
- **The House** - records the governed fee obligation and reconciliation status; does not
  own ledger truth.
- **Payment provider** - executes payment transactions; holds no affiliation decision
  authority (STK-V3-014).
- **Accounting system** - owns ledger truth and confirms financial postings (STK-V3-015).
- **Finance operations** - reconciles exceptions between processor results and ledger
  confirmations (STK-V3-008).
- **Affiliation authority** - owns the governed affiliation decision.
- **Authorized activation operation** - executes an approved lifecycle effect exactly
  once.

## V3-12.3 Fee obligation creation

This section is normative.

The House records a governed fee obligation for a case by reference to the confirmed
fee-policy reference (V3-08 Phase 4, FR-V3-013). The obligation references the fee policy;
it does not assert a fee amount that is not supported by the policy (BR-V3-014).

## V3-12.4 Fee-policy reference

This section is normative.

The fee applicable to an obligation is determined by reference to the governing fee policy
owned by the policy function. Fee amounts and fee rules are policy artifacts and are not
created here.

## V3-12.5 Exemption and waiver

This section is normative.

An exemption or waiver is a policy-authority decision applied to a fee obligation. It is
recorded with its authority and evidence. Finance operations and the House record the
disposition; they do not grant waivers on their own authority (V3-11 policy exception).

## V3-12.6 Processor result and accounting confirmation

This section is normative.

The payment provider executes the transaction and returns a processor result; the
accounting system confirms the posting and returns a ledger confirmation (V3-05). The
House records both as inputs to reconciliation; ledger truth remains with the accounting
system.

## V3-12.7 Payment mismatch, partial, and duplicate payment

This section is normative.

A payment mismatch, partial payment, or duplicate payment is a reconciliation exception
handled by finance operations (FR-V3-013, UC-V3-012). The case is held in a
reconciliation-pending operating state until resolved (RULE-V3-003 inherited). Duplicate
payments are recorded and referred to reversal or refund handling.

## V3-12.8 Reversal and refund boundary

This section is normative.

Reversal and refund are executed by the payment provider and confirmed by the accounting
system; the House records the disposition and reconciliation status. The House does not
execute financial transactions and does not own refund policy.

## V3-12.9 Unresolved balance and manual reconciliation

This section is normative.

An unresolved balance is reconciled manually by finance operations. Manual reconciliation
records the resolution and its evidence. An unresolved balance holds activation
(RULE-V3-003 inherited). Financial exceptions escalate to finance operations and, where
material, toward the executive material-commitment authority.

## V3-12.10 Approval awaiting reconciliation

This section is normative.

An affiliation approval may be recorded by the affiliation authority while activation
awaits a confirmed reconciliation result. Approval does not activate the affiliation; the
governed lifecycle distinguishes approval from activation (V3-02).

## V3-12.11 Activation authorization and one-time execution

This section is normative.

Activation is authorized only after a confirmed reconciliation result (BR-V3-004
inherited, RULE-V3-003 inherited). The authorized activation operation executes the
approved lifecycle effect exactly once through the governance kernel (BR-V3-011,
RULE-V3-010, CTRL-V3-012). A repeated activation request for the same affiliation is
rejected as already activated and does not activate it a second time.

## V3-12.12 Activation failure and recovery

This section is normative.

An activation failure is recovered through incident recovery (V3-11) without executing a
second activation effect. Recovery confirms whether the single activation effect occurred
and restores correct operating state (CTRL-V3-012).

## V3-12.13 Season-close reconciliation

This section is normative.

At season close, finance operations perform a season-close reconciliation (V3-08 Phase
11) that resolves outstanding balances and records the season financial disposition. It
asserts no amounts not supported by the accounting system.

## V3-12.14 Validation status

This section is normative.

The financial and activation operations are author-asserted and carry financial
validation pending. Fee amounts, transaction rules, refund policy, and accounting policy
are not created here and require validation with Finance and Reconciliation Operations
(Hélène) and the accounting authority. Pending validation blocks only the affected
financial rule or measure. Unresolved assumptions are recorded in V3-15.
