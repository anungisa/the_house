# V0-F - Annex F: Package 2 Closure Record

Document ID: V0-F-PACKAGE2-CLOSURE
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: G0

## F.1 Purpose

This annex records the line-level constitutional closure review of Volume 0
Package 2 (Authority and Governance) and its ratification and freeze.

## F.2 Closure record

```
Package:               Volume 0 Package 2 - Authority and Governance
Finding:               ACCEPTED WITH CORRECTIONS
Authority:             Aubert Nungisa, Accountable Program Authority
Evidence label:        SELF-ATTESTED / AUTHOR-VERIFIED
Independent validation: NOT CLAIMED
Executive acceptance:  PENDING AT APPLICABLE GATE
Chapters covered:      V0-06, V0-07, V0-08
Unresolved conditions:
  - executive organizational acceptance
  - funding
  - domain validation
  - independent production assurance
```

## F.3 Review questions and dispositions

1. Every platform has one unambiguous primary authority classification. CONFIRMED
   (V0-06 6.2, 6.6).
2. System-of-record, execution-plane, synchronization, reporting, and transition
   responsibilities are clearly separated. CONFIRMED after correction (V0-06 6.6).
3. The House, The Button, and Base44 are described consistently across V0-06, V0-07,
   REG-002, and REG-005. CONFIRMED.
4. External-system authority and reconciliation boundaries are explicit. CONFIRMED
   after correction (V0-06 6.6, REG-005 SRC-007/SRC-012).
5. Pending consultation blocks only the affected decision or claim. CONFIRMED
   (V0-08 8.5).
6. Rich, Hélène, and Jen are contributors and domain validators, not permanent
   delivery gatekeepers. CONFIRMED (V0-08 8.1, 8.5, 8.8).
7. Nolan's executive decisions are limited to material organizational thresholds.
   CONFIRMED (V0-08 8.2, 8.8; V0-07 7.6.3).
8. Combined roles are valid without being represented as independent validation.
   CONFIRMED (V0-07 7.3, 7.4; V0-08 8.3).
9. Independent assessments are required only where independence is material.
   CONFIRMED (V0-07 7.6.4; V0-08 8.7).
10. V0-06, V0-07, V0-08, and affected registers are internally consistent. CONFIRMED
    after correction.

## F.4 Corrections applied

V0-06 (Authority doctrine):

- Curling I/O bounded domain narrowed to league and competition operational data;
  club and participant master-data authority is explicitly reserved to The House.
- Payment processors clarified to own transaction execution only, not Curling Canada
  fee policy and not accounting truth.
- Analytics platforms explicitly prohibited from becoming a system of record.
- Reconciliation boundary between payment processors, The House, and accounting
  systems made explicit.
- Transition-platform authority expiry bound to an explicit migration-completion
  trigger (a recorded cutover decision in REG-002).

V0-08 (Engagement model):

- Club and PTSO operational validation clarified as not implicitly setting national
  policy, which remains a program-authority decision subject to executive acceptance.
- A recorded `consulted` status clarified as not an endorsement, approval, or
  sign-off.
- Person-name spelling made consistent: the business and financial contributor is
  rendered "Hélène" in narrative chapters (V0-07 and V0-08); machine-readable
  registers retain the ASCII form "Helene" by convention.

V0-07 (Governance and decision rights):

- No substantive correction required; confirmed cross-consistent with V0-06 and
  V0-08 for decision classes D0-D9, authority owners, escalation rules, gate types,
  evidence labels, combined-role controls, executive thresholds, and
  independent-assurance thresholds.

REG-005 updated to mirror the V0-06 corrections.

## F.5 Ratification and freeze

- V0-06, V0-07, and V0-08 are RATIFIED at Version 1.0.0.
- Ratification authority: Aubert Nungisa, Accountable Program Authority.
- Evidence label: SELF-ATTESTED / AUTHOR-VERIFIED. Independent validation not claimed.
- Executive organizational acceptance: pending at the applicable future gate.
- Gate G0 disposition preserved: PASS_WITH_TIME_BOUNDED_CONDITIONS.
- Package 2 is frozen. Changes to ratified Package 2 text require a documented
  constitutional amendment under V0-00 amendment control and REG-002.
- Living controls excepted from freeze: the registers (REG-000..REG-008) and Gate G0
  evidence remain living instruments.
- Recorded as REG-006 APP-006, APP-007, APP-008 and REG-002 DEC-V0-023.

## F.6 Package 3 authorization

Package 3 (Control System) is NOT authorized by this record and MUST NOT begin until
this closure is committed. Package 3 branches from the Package 2 closure commit.
