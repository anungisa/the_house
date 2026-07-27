# Volume 9 — Defect, Exception, Waiver, Remediation, Retest, and Regression Model

Document ID: V9-08
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G1)

## Purpose

This chapter defines how the program will record and dispose of what future testing
finds: defects, observations, evidence gaps, exceptions, waivers, remediations,
retests, and regressions. The disposition backlog is held in register REG-904.

## Defect model

A defect is a recorded divergence between an obligation and observed behaviour. The
model defines fifteen defect states so that a finding is never mislabelled: defect,
observation, evidence gap, test blocker, environment failure, data failure,
dependency failure, inconclusive result, accepted exception, time-bounded waiver,
remediation, retest, regression, closure, and reopened. An inconclusive result is a
distinct state and is never recorded as a pass.

## Exceptions and waivers

An exception records a deliberate, documented deviation with an owner and a future
blocking gate. A waiver records a time-bounded acceptance of a known gap. Both must
name either an expiry or an approving authority; a waiver without a bound is not a
waiver. The deterministic controls fail closed on any exception or waiver that
carries neither an expiry nor an approval.

## Remediation, retest, and regression

A remediation records the obligation to close a defect. A retest records the
obligation to re-produce evidence once a remediation is applied. A regression
records the obligation to ensure that a previously satisfied obligation is not lost
in a later package. Each carries an owner, a defect state, and a future blocking
gate.

## No unresolved item authorizes work

Every backlog item is a future obligation. No item authorizes implementation,
execution, or acceptance, and every item carries `authorizes_implementation: false`
and a not-implemented status. Unresolved items name a forward gate; they may never
name a gate that has already been dispositioned.
