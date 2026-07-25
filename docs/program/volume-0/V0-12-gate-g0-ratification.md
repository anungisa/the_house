# V0-12 - Ratification and Gate G0

Document ID: V0-12
Status: IN_REVIEW
Version: 0.2.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)

Defines constitutional readiness gate (G0), evidence requirements, and disposition states.

Gate dispositions:

- PASS
- PASS_WITH_TIME_BOUNDED_CONDITIONS
- HOLD
- REJECT

No "mostly approved" state is permitted.

## Current disposition

G0: PASS_WITH_TIME_BOUNDED_CONDITIONS.

Rationale and evidence are recorded in evidence/G0/findings.md. Under the solo-led,
institutionally accountable delivery model (V0-07), the authorities previously
treated as unknown are assigned: Aubert Nungisa is the Accountable Program
Authority (and combined program, product, technology, delivery, and documentation
authority); Nolan is the Executive Sponsor Candidate and Executive Acceptance
Authority; Rich, Hélène, and Jen are named domain contributors. The remaining
items are genuine future dependencies, not reasons to withhold controlled
delivery.

## Time-bounded conditions

Volume 0 records these conditions (tracked in evidence/G0/conditions.md and
REG-003). They MUST be satisfied at their applicable later gate and MUST NOT block
documentation, architecture, test construction, or implementation of the
controlled affiliation slice:

1. Executive acceptance (Nolan, D0) is required before organizational commitment,
   material budget, pilot authorization, or national rollout.
2. Funding authorization is required before material external expenditure or
   production commitment.
3. Domain validation (Rich strategy, Hélène business/financial, Jen
   compliance/policy) is required when the relevant material is review-ready.
4. Independent assurance (D9: privacy, security, accessibility, French-language,
   legal, financial-control, disaster-recovery) is required before the
   corresponding production exposure.
5. Outcome baselines and targets (REG-008) are established as discovery evidence
   becomes available, before the affiliation release gate.
6. Pilot cohort composition (PTSO/club, D8) is defined before pilot authorization.

## Constitutional control

No claim under this gate may be represented as independently approved when it is
authorized by the Accountable Program Authority. Executive acceptance (D0) and
independent assurance (D9) records are required before their corresponding
production exposure.

Evidence package location: evidence/G0/

Ratification target: Package 4 (executive acceptance record); disposition applies now.
