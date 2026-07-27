# Volume 10 — Integrated Estimate, Cost, Contingency, and Funding Model

Document ID: V10-25
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V10-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED

## 1. Purpose

This chapter records planning estimates by workstream, wave, release unit, and
cost category. Every value is a planning estimate. No value is a budget, a quote,
an approved expenditure, a procurement commitment, or a contract.

## 2. Cost categories

Estimates (register REG-1004, kind `COST_ESTIMATE`) cover internal labour,
external engineering, architecture and assurance, cloud and infrastructure,
software and licensing, security and privacy validation, accessibility and
bilingual validation, testing and independent assurance, migration and
reconciliation, training and adoption, operations and support, contingency, and
ongoing operating cost.

## 3. Per-estimate attributes

Every estimate includes estimate basis; low, expected, and high range; confidence;
assumptions; included scope; excluded scope; dependencies; currency;
tax-treatment status; capital or operating treatment status; contingency basis;
source date; owner; and approval status. For Curling Canada planning the currency
is CAD unless an underlying source explicitly uses another currency. No unsupported
point estimates are recorded.

## 4. Required distinctions

**An estimate is not a budget, a quote, an approved expenditure, a procurement
commitment, or a contract.** Every estimate carries `estimate_status:
PLANNING_ESTIMATE` and `approval_status: NOT_APPROVED`. Representing an estimate as
an approved budget or a target date as a commitment is prohibited.
