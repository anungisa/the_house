# Volume 9 — Defect, Exception, Waiver, Remediation, Retest, and Regression Standard

Document ID: V9-37
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G4)

## Purpose

This chapter defines the governed lifecycle by which a future defect is recorded,
dispositioned, and closed, and the strict distinctions among defect, exception,
waiver, remediation, retest, regression, closure, and reopening. It is a documentary
definition only and authorizes no execution.

## Controlled defect lifecycle

The defect lifecycle is controlled end to end. A **defect** is a governed shortfall
against a requirement; it carries an owner, a state, and a required retest. An
**exception** is a governed, time-bounded acknowledgement that a requirement is not
yet met; it carries an owner, an expiry, and an approval. A **waiver** is a governed,
time-bounded decision not to require a control now; it carries an owner, an expiry,
and an approval, and it never converts a failure into a success. **Remediation** is
the governed obligation to correct a defect. **Retest** is the governed obligation to
re-exercise the requirement after remediation. **Regression** is the governed
obligation to confirm that a correction did not break previously satisfied
requirements. **Closure** is the governed disposition that a defect is resolved with
accepted retest evidence. **Reopening** is the governed disposition that returns a
closed defect to active state when new evidence contradicts its closure.

## Distinctions preserved

These states remain distinct. An exception is not a passing test. A waiver is not a
passing test. A remediation is not a retest. A retest is not a regression check. A
closure without accepted retest evidence is prohibited. A reopening is always
available when closure evidence is contradicted. No exception or waiver may be
recorded as, or mistaken for, demonstrated conformance.

## Documentary boundary

This standard defines the lifecycle; it exercises none of it. No defect is found, no
exception is granted here beyond those already governed in the backlog, no waiver is
issued here, no remediation is performed, no retest is run, no regression is checked,
and no closure is conferred by this chapter.
