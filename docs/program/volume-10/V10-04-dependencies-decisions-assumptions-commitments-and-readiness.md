# Volume 10 — Dependencies, Decisions, Assumptions, Commitments, and Readiness

Document ID: V10-04
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V10-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED

## 1. Purpose

This chapter defines how delivery dependencies, decisions, assumptions,
commitments, and readiness conditions are governed. Each is held as a distinct
kind of planning object so that none is mistaken for another.

## 2. Distinct kinds

The following are governed as distinct kinds and are never conflated:

- Assumption — a stated belief that must be validated.
- Dependency — a reliance on something outside the work package.
- Constraint — a bounding condition on delivery.
- Decision — a governed choice with recorded consequences.
- Commitment — a governed undertaking; a material commitment binds resources.
- Risk — a potential future condition with impact.
- Issue — a present condition requiring action.
- Blocker — a condition preventing progress.
- Readiness condition — a condition that must hold before a phase may begin.

Assumptions, risks, issues, changes, commitments, estimates, funding, and
procurement are recorded in the planning backlog (REG-1004). Decisions are
recorded in the decision register (REG-1003). Dependencies and readiness
conditions are recorded in the delivery and milestone registers (REG-1001,
REG-1002).

## 3. Dependency governance

Every dependency and every readiness condition must name an owner, the required
decision or evidence that resolves it, its impact if unresolved, and the future
gate at which it must be resolved. No dependency or readiness condition may name
a governance gate that has already been dispositioned.

## 4. Decision governance

A decision is recorded with its context, its consequences, its decision
authority, and its status. A decision approved for planning does not authorize
implementation. A decision boundary bounds what a later package may do without
itself authorizing that work.

## 5. Commitment governance

A commitment is recorded with a `commitment_status`. In Package 1 every
commitment carries a `NOT_COMMITTED` status: nothing is committed, procured,
contracted, funded, or staffed. Material commitments remain planning placeholders
pending a governed commitment decision at a future gate.
