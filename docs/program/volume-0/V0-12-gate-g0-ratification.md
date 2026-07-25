# V0-12 - Ratification and Gate G0

Document ID: V0-12
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority; surname to be recorded in REG-001)
Associated Gate: G0
Ratification: Package 4; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable future gate (REG-006 APP-013)
Related Documents: V0-07 (decision classes and gate control), V0-11 (risk and exception governance), V0-I (Volume 0 completion record)

This chapter is normative except where a subsection is marked explanatory. It is
the authoritative record of the Gate G0 disposition for Volume 0. The supporting
evidence package is maintained under evidence/G0/.

## 12.1 Purpose

Gate G0 is the constitutional readiness gate for the Central Registration Platform
program. It establishes whether the program's mandate, authority, scope,
principles, decision rights, source hierarchy, traceability, and governance
controls form a coherent, self-consistent constitutional baseline sufficient to
authorize controlled design, documentation, and implementation work under
governed control.

Gate G0 does not authorize production, funded external expenditure, pilot
operation, or any claim of independent certification. Those are separate, later
gates with their own evidence requirements.

## 12.2 Permitted dispositions

Gate G0 may resolve only to one of the following. No intermediate or informal
state such as "mostly approved" is permitted.

- PASS
- PASS_WITH_TIME_BOUNDED_CONDITIONS
- HOLD
- REJECT

## 12.3 Recorded disposition

```
Disposition: PASS_WITH_TIME_BOUNDED_CONDITIONS
Authority: Aubert Nungisa, Accountable Program Authority
Evidence: SELF-ATTESTED / AUTHOR-VERIFIED
Independent certification: NOT CLAIMED
Executive organizational acceptance: REQUIRED AT MATERIAL COMMITMENT GATE
```

Under the solo-led, institutionally accountable delivery model (V0-07), the
authorities previously treated as unknown are assigned and recorded in REG-001:
Aubert Nungisa is the Accountable Program Authority (and combined program,
product, technology, delivery, data, quality, and documentation authority); Nolan
is the Executive Sponsor Candidate and Executive Acceptance Authority; Rich,
Hélène, and Jen are named domain contributors. The items previously treated as
open blockers are genuine future dependencies, not reasons to withhold controlled
delivery. The rationale and supporting evidence are recorded in
evidence/G0/findings.md.

## 12.4 Basis for PASS_WITH_TIME_BOUNDED_CONDITIONS

The disposition is supported by the completed and frozen constitutional baseline:

- Package 1 (V0-00 to V0-05, annexes V0-A to V0-E) - RATIFIED v1.0.0, frozen:
  mandate, problem and opportunity, vision and outcomes, scope and boundaries,
  and program principles.
- Package 2 (V0-06, V0-07, V0-08) - RATIFIED v1.0.0, frozen: product and
  authority doctrine, governance and decision rights (classes D0-D9, evidence
  labels, gate control), and the stakeholder engagement model.
- Package 3 (V0-09, V0-10, V0-11) - RATIFIED v1.0.0, frozen: delivery and
  assurance doctrine, documentation and traceability, and risk, assumption,
  dependency, and exception governance - made executable by JSON Schemas and Node
  controls that pass `npm run governance:check` with zero errors.

The constitutional control plane is therefore internally consistent, governed,
and machine-validated. That is the specific readiness Gate G0 attests.

## 12.5 Conditions that do not block current work (explanatory)

The following conditions are genuine and recorded, but they do not block
documentation, architecture, requirements, test construction, or controlled
implementation of the affiliation slice. They are tracked in REG-003 and
evidence/G0/conditions.md:

- outcome baselines and targets are not yet established (REG-008 permitted TBD);
- the pilot cohort is not yet finalized;
- future domain validation has not yet been performed;
- production assurance is not yet required.

Design, documentation, and controlled build may proceed while these remain open.

## 12.6 Conditions that block future claims or actions (normative)

Each remaining condition is normative and becomes mandatory at the stated future
blocking point. Until that point, the condition is a recorded dependency, not a
delivery blocker. Each condition carries a named owner. This table is the
authoritative condition-to-gate mapping; it is mirrored operationally in
evidence/G0/conditions.md, evidence/G0/evidence-index.yaml, and REG-003.

| Condition | Owner | Becomes mandatory at (future blocking point) |
| --- | --- | --- |
| Executive organizational acceptance | Nolan (Executive Acceptance Authority, D0) | Material organizational commitment or pilot authorization |
| Funding approval | Nolan (Executive Acceptance Authority, D0) | External expenditure or funded delivery commitment |
| Strategy validation | Rich (Strategy contributor, D7) | Executive strategy presentation |
| Business and financial validation | Hélène (Business and Financial contributor, D4) | Financial model, fees, payments, or sustainability decisions |
| Policy and compliance validation | Jen (Compliance and Policy contributor, D4) | Ratification of affiliation requirements and compliance rules |
| Club/PTSO operational validation | Named pilot PTSO/club (D8) | Pilot workflow acceptance |
| French-language validation | Independent assurance (D9) | Any bilingual release claim |
| Accessibility validation | Independent assurance (D9) | Any WCAG release claim |
| Independent security and privacy assurance | Independent assurance (D9) | Production personal-data exposure |
| Backup, recovery, and operational proof | Aubert Nungisa (Technology and Operations Authority) | Production launch |

## 12.7 Constitutional control

No claim under this gate may be represented as independently approved when it is
authorized by the Accountable Program Authority. Authorization by combined
authority establishes progression only; it never substitutes for executive
acceptance (D0) or independent assurance (D9). Executive acceptance and
independent-assurance records are required before their corresponding future
blocking points in 12.6. Any attempt to satisfy an independence-requiring claim
with author verification is a constitutional violation under V0-07.

## 12.8 Evidence package

The Gate G0 evidence package is maintained under evidence/G0/ and reconciled as
part of Package 4:

- checklist.md - readiness checklist with satisfied and time-bounded items;
- findings.md - disposition basis and positive findings;
- approvals.md - recorded authorizations and pending acceptances;
- conditions.md - the time-bounded conditions and their blocking points;
- evidence-index.yaml - machine-readable index linking Packages 1-3 closures,
  decisions, approvals, validation evidence, baselines, and unresolved conditions.

## 12.9 Ratification

This chapter is ratified as part of Package 4 (Volume 0 constitutional closure).
The disposition PASS_WITH_TIME_BOUNDED_CONDITIONS applies now. Executive
organizational acceptance (Nolan, D0) is recorded as required at the material
commitment gate and is not claimed here. The decision is recorded in REG-002
(DEC-V0-026) and the approval in REG-006 (APP-013).
